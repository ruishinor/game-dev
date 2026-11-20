import test from 'node:test';
import assert from 'node:assert/strict';
import { ENEMIES } from '../shared/content.js';
import { SEVERANCE_EXPANSE as E, SALVAGE_CAMP as C } from '../shared/severance-gate.js';
import { COLLIDERS, OBJECTS, travelRegionAt, inSafeZone } from '../shared/world.js';
import { makeGame, makeChar, place } from './helpers.js';
import { dealDamage, addBuff } from '../server/sim/combat.js';
import { tickEnemy } from '../server/sim/ai.js';
import { SEVERANCE_SQUADS } from '../server/sim/severance-soldiers.js';

const TYPES = ['severance_vanguard', 'severance_keeper', 'severance_symbiote', 'severance_surveyor'];
const cols = [...COLLIDERS, ...OBJECTS.filter((o) => !o.embedded && Number.isFinite(o.r))];
const clearance = (x, z) => Math.min(...cols.map((c) => (c.r !== undefined ? Math.hypot(x - c.x, z - c.z) - c.r : Math.max(Math.abs(x - c.x) - c.hw, Math.abs(z - c.z) - c.hd))));

function opened() {
  const g = makeGame();
  g.openExpanse();
  for (const e of g.enemies) if (!e.severanceSoldier) { e.state = 'dead'; e.deadAt = -1e9; e.respawnAt = Infinity; }
  return { g, soldiers: g.enemies.filter((e) => e.severanceSoldier) };
}

test('five squads of 4-7 armoured soldiers, each led by a 1.8x/1.25x Severance Overseer', () => {
  assert.equal(SEVERANCE_SQUADS.length, 5);
  for (const sq of SEVERANCE_SQUADS) {
    assert.ok(sq.members.length >= 4 && sq.members.length <= 7, sq.key + ' size ' + sq.members.length);
    const overseers = sq.members.filter((m) => m.elite);
    assert.ok(overseers.length >= 1, sq.key + ' has an Overseer');
    for (const o of overseers) { assert.equal(o.name, 'Severance Overseer'); assert.equal(o.elite.hp, 1.8); assert.equal(o.elite.dmg, 1.25); }
    for (const m of sq.members) assert.ok(TYPES.includes(m.type));
  }
  // every Cinderlock variant / class kit is fielded
  const fams = new Set(SEVERANCE_SQUADS.flatMap((s) => s.members.map((m) => ENEMIES[m.type].humanoid.family)));
  assert.deepEqual([...fams].sort(), ['CL', 'MY', 'SW', 'VG']);
});

test('patrol loops run on clear ground outside the safe shelters, the Scrapyard and the arrival', () => {
  for (const sq of SEVERANCE_SQUADS) for (const m of sq.members) {
    const r = m.route;
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      assert.equal(travelRegionAt(a.x, a.z), 'severance_expanse');
      assert.ok(!inSafeZone(a), sq.key + ' waypoint outside safe zones');
      assert.ok(Math.hypot(a.x - E.outpost.x, a.z - E.outpost.z) > E.outpost.r + 15, sq.key + ' clear of the outpost');
      assert.ok(Math.hypot(a.x - C.x, a.z - C.z) > C.r + 8, sq.key + ' clear of the Scrapyard');
      assert.ok(Math.hypot(a.x - E.arrival.x, a.z - E.arrival.z) > 26, sq.key + ' clear of the arrival');
      for (let k = 0; k <= 20; k++) {
        const x = a.x + (b.x - a.x) * k / 20, z = a.z + (b.z - a.z) * k / 20;
        assert.ok(clearance(x, z) > 0.6, `${sq.key} segment ${i} blocked at ${x.toFixed(1)},${z.toFixed(1)}`);
      }
    }
  }
});

test('soldiers spawn once, with elite Overseers at their multipliers', () => {
  const { g, soldiers } = opened();
  assert.equal(soldiers.length, SEVERANCE_SQUADS.reduce((n, s) => n + s.members.length, 0));
  g.openExpanse();
  assert.equal(g.enemies.filter((e) => e.severanceSoldier).length, soldiers.length);
  for (const o of soldiers.filter((e) => e.elite)) assert.equal(o.maxHp, Math.round(ENEMIES[o.type].hp * 1.8));
  const p = g.addPlayer(makeChar('vanguard', { level: 5 }));
  const o = soldiers.find((e) => e.elite), grunt = soldiers.find((e) => !e.elite && e.type === o.type);
  place(p, o.x + 1, o.z);
  p.hp = 999; dealDamage(g, grunt, p, 10, 'auto'); const n = 999 - p.hp;
  p.hp = 999; dealDamage(g, o, p, 10, 'auto'); const h = 999 - p.hp;
  assert.ok(Math.abs(h / n - 1.25) < 0.08, `elite ${h} vs ${n}`);
});

test('extremely hostile below level 4: a far wider aggro radius than for level 4 and above', () => {
  for (const [level, dist, expect] of [[2, 20, true], [3, 22, true], [4, 20, false], [5, 20, false], [4, 10, true]]) {
    const { g, soldiers } = opened();
    const e = soldiers.find((x) => x.squad === 'lakebed' && !x.elite);
    for (const x of soldiers) if (x !== e) { x.state = 'dead'; x.deadAt = -1e9; x.respawnAt = Infinity; }
    const p = g.addPlayer(makeChar('keeper', { level }));
    // stand on the patrol's own open ground, offset along its route
    const a = e.route[0], b = e.route[1], len = Math.hypot(b.x - a.x, b.z - a.z);
    place(e, a.x, a.z);
    place(p, a.x + (b.x - a.x) / len * dist, a.z + (b.z - a.z) / len * dist);
    tickEnemy(g, e, 0.05);
    assert.equal(e.threat.has(p.id), expect, `level ${level} at ${dist} m`);
  }
});

test('a pull engages the squad, and support kits act on the squad only', () => {
  const { g, soldiers } = opened();
  const squad = soldiers.filter((x) => x.squad === 'north_west');
  const p = g.addPlayer(makeChar('vanguard', { level: 5 }));
  const lead = squad[0];
  place(p, lead.x + 6, lead.z);
  tickEnemy(g, lead, 0.05);
  assert.ok(lead.threat.has(p.id));
  const pulled = squad.filter((x) => x.threat.has(p.id)).length;
  assert.ok(pulled >= squad.length - 1, `squad engaged (${pulled}/${squad.length})`);
  assert.ok(!soldiers.filter((x) => x.squad === 'lakebed').some((x) => x.threat.has(p.id)), 'other squads are not pulled');
  // ward reduces damage taken by warded allies
  const ally = squad.find((x) => !x.elite);
  ally.hp = ally.maxHp;
  dealDamage(g, p, ally, 40, 'test', { flat: true });
  const plain = ally.maxHp - ally.hp;
  ally.hp = ally.maxHp;
  addBuff(ally, { k: 'ward', mul: 0.65, until: g.time + 5000 });
  dealDamage(g, p, ally, 40, 'test', { flat: true });
  assert.ok(ally.maxHp - ally.hp < plain * 0.8, 'warded ally takes less damage');
});

test('the spore lash snares (a server movement multiplier the client also predicts) and expires', () => {
  const { g } = opened();
  const p = g.addPlayer(makeChar('keeper', { level: 5 }));
  assert.equal(g.moveSpeedMul(p), 1);
  addBuff(p, { k: 'snare', mul: 0.55, until: g.time + 3500 });
  assert.equal(g.moveSpeedMul(p), 0.55);
  assert.equal(g.privateState(p).sp, 0.55, 'prediction receives the same multiplier');
  g.time += 3600;
  assert.equal(g.moveSpeedMul(p), 1);
});

test('soldier snapshots carry only allowlisted armour visuals, family and size', () => {
  const { g, soldiers } = opened();
  for (const e of soldiers) {
    const m = g.metaFor(e);
    assert.deepEqual(Object.keys(m.av).sort(), ['boots', 'chest', 'gloves', 'greaves']);
    for (const id of Object.values(m.av)) assert.match(id, /^vanguard_field_set_/);
    assert.ok(['CL', 'VG', 'MY', 'SW'].includes(m.af));
    if (e.elite) { assert.equal(m.el, 1); assert.equal(m.sz, 1.15); } else assert.equal(m.sz, undefined);
    const json = JSON.stringify(m);
    assert.ok(!json.includes('"dmg"') && !json.includes('route') && !json.includes('squad'), 'no rules, routes or squads');
  }
});
