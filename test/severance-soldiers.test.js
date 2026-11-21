import { ELITE } from '../server/sim/enemy-levels.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, makeChar, place } from './helpers.js';
import { SEVERANCE_PATROLS, squadSlot } from '../server/sim/severance-patrols.js';
import { ENEMIES } from '../shared/content.js';
import { travelRegionAt } from '../shared/world.js';

const squads = () => {
  const g = makeGame();
  g.openExpanse();
  const soldiers = g.enemies.filter((e) => e.severancePatrol && e.type === 'severance_soldier');
  const bySquad = new Map();
  for (const e of soldiers) {
    const lead = e.lead ? e.lead : e.id;
    if (!bySquad.has(lead)) bySquad.set(lead, []);
    bySquad.get(lead).push(e);
  }
  const groups = [...bySquad.values()].map((grp) => ({ all: grp, point: grp.find((e) => !e.lead), sergeant: grp.find((e) => e.rearguard) }));
  return { g, soldiers, groups };
};
const routeLength = (r) => r.reduce((n, a, i) => n + Math.hypot(r[(i + 1) % r.length].x - a.x, r[(i + 1) % r.length].z - a.z), 0);

test('five Severance squads roam long loops: a soldier on point, a soldier and the sergeant behind', () => {
  const defs = SEVERANCE_PATROLS.filter((p) => p.type === 'severance_soldier');
  assert.equal(defs.length, 15, 'five squads of three');
  const loops = [...new Map(defs.map((p) => [p.squad, p.route])).values()];
  assert.equal(loops.length, 5, 'each squad has its own loop');
  for (const r of loops) assert.ok(routeLength(r) > 300, `a roaming loop, not a short beat (${Math.round(routeLength(r))} m)`);
  const { soldiers, groups } = squads();
  assert.equal(soldiers.length, 15);
  assert.equal(groups.length, 5);
  for (const { all, point, sergeant } of groups) {
    assert.equal(all.length, 3);
    assert.equal(point.name, 'Severance Soldier', 'a soldier walks point');
    assert.ok(sergeant && sergeant !== point, 'the sergeant is not the route leader');
    assert.equal(sergeant.name, 'Severance Sergeant');
    // squads hold levels 7-11; the sergeant is one level above and the squad's elite
    assert.ok(point.level >= 7 && point.level <= 11, `squad level ${point.level}`);
    assert.ok(all.every((e) => e === sergeant || e.level === point.level));
    assert.equal(sergeant.level, Math.min(12, point.level + 1));
    assert.deepEqual(sergeant.elite, { hp: ELITE.hp, dmg: ELITE.dmg });
    assert.ok(all.filter((e) => e.elite).length === 1);
    assert.equal(all.filter((e) => e.rearguard).length, 1);
    for (const f of all.filter((e) => e.lead)) assert.ok(Math.hypot(f.x - point.x, f.z - point.z) < 6, 'starts in formation');
    // the squad does not vent its reactors in unison
    const firsts = all.map((e) => (e.specials || ENEMIES.severance_soldier.specials)[0].first);
    assert.equal(new Set(firsts).size, 3);
  }
  for (const e of soldiers) assert.equal(e.vx, undefined, 'soldiers are their own models, not the ash look');
});

test('the squad holds formation on the move, sergeant at the rear', () => {
  const { g, groups } = squads();
  const start = groups.map(({ point }) => ({ x: point.x, z: point.z }));
  let rearChecks = 0, behind = 0;
  for (let i = 0; i < 900; i++) {
    g.tick(50);
    if (i % 50 === 49) for (const { point, sergeant, all } of groups) {
      const fwd = { x: Math.sin(point.yaw), z: Math.cos(point.yaw) };
      const back = (o) => (o.x - point.x) * fwd.x + (o.z - point.z) * fwd.z;
      rearChecks++;
      if (back(sergeant) < Math.min(...all.filter((e) => e !== sergeant).map(back)) - 1) behind++;
    }
  }
  assert.ok(behind / rearChecks > 0.9, `the sergeant walks behind its soldiers (${behind}/${rearChecks})`);
  groups.forEach(({ point, all }, k) => {
    assert.ok(Math.hypot(point.x - start[k].x, point.z - start[k].z) > 8, 'the point soldier moves along the loop');
    for (const f of all.filter((e) => e.lead)) {
      const slot = squadSlot(point, f.slot);
      assert.ok(Math.hypot(f.x - slot.x, f.z - slot.z) < 3.5, `follower near its slot (${Math.hypot(f.x - slot.x, f.z - slot.z).toFixed(2)})`);
      assert.equal(travelRegionAt(f.x, f.z), 'severance_expanse');
    }
  });
});

test('the whole squad answers an attack; the sergeant hangs back while its soldiers fight', () => {
  const { g, groups } = squads();
  for (let i = 0; i < 100; i++) g.tick(50);
  const { point, sergeant, all } = groups[0];
  const p = g.addPlayer(makeChar('vanguard', { level: 5 }));
  p.hp = p.maxHp = 1e6; // a punching bag that does not die or fight back
  place(p, point.x + Math.sin(point.yaw) * 6, point.z + Math.cos(point.yaw) * 6);
  g.tick(50);
  for (const e of all) assert.ok(e.threat.has(p.id), `${e.name} engages`);
  for (let i = 0; i < 120; i++) g.tick(50);
  const d = (e) => Math.hypot(e.x - p.x, e.z - p.z) - p.radius;
  for (const e of all.filter((x) => x !== sergeant)) assert.ok(d(e) < 2.6, `${e.name} closes to melee (${d(e).toFixed(2)})`);
  assert.ok(d(sergeant) > 3.4, `the sergeant holds back behind them (${d(sergeant).toFixed(2)})`);
  // with its soldiers down, the sergeant closes in
  for (const e of all.filter((x) => x !== sergeant)) { e.state = 'dead'; e.hp = 0; e.respawnAt = Infinity; e.threat.clear(); }
  for (let i = 0; i < 80; i++) g.tick(50);
  assert.ok(d(sergeant) < 2.6, `alone, the sergeant engages in melee (${d(sergeant).toFixed(2)})`);
});

test('after a fight the squad leashes back and re-forms', () => {
  const { g, groups } = squads();
  for (let i = 0; i < 100; i++) g.tick(50);
  const { point, all } = groups[1];
  const p = g.addPlayer(makeChar('vanguard', { level: 5 }));
  place(p, point.x + 5, point.z);
  g.tick(50);
  place(p, point.x + ENEMIES.severance_soldier.leash + 40, point.z);
  for (let i = 0; i < 800 && all.some((e) => e.state !== 'idle'); i++) g.tick(50);
  for (const e of all) assert.equal(e.state, 'idle');
  for (let i = 0; i < 300; i++) g.tick(50);
  for (const f of all.filter((e) => e.lead)) {
    const slot = squadSlot(point, f.slot);
    assert.ok(Math.hypot(f.x - slot.x, f.z - slot.z) < 3.5, 'back in formation');
  }
});

test('clients learn only what they see: no route, slot or squad link; sergeants flagged for Tab order', () => {
  const { g, soldiers } = squads();
  for (const e of soldiers) {
    const meta = g.metaFor(e);
    assert.equal(meta.c, 'severance_soldier');
    assert.ok(['Severance Soldier', 'Severance Sergeant'].includes(meta.n));
    assert.equal(meta.rg, e.rearguard ? 1 : undefined);
    for (const k of ['route', 'slot', 'lead', 'squad', 'home', 'post', 'specials', 'threat']) assert.equal(meta[k], undefined, k);
    assert.ok(!JSON.stringify(meta).includes('route'));
  }
});

test('squad sergeants are elites that drop no items; XP scales with squad level', async () => {
  const { makeGame, makeChar, place } = await import('./helpers.js');
  const { dealDamage } = await import('../server/sim/combat.js');
  const { openLoot, lootState } = await import('../server/sim/loot.js');
  const { killXp } = await import('../server/sim/enemy-levels.js');
  const g = makeGame();
  const p = g.addPlayer(makeChar('vanguard', { level: 12 }));
  g.openExpanse();
  const sergeant = g.enemies.find((e) => e.name === 'Severance Sergeant');
  g.rng = () => 0; g.eliteRng = () => 0; // every item roll would succeed
  place(p, sergeant.x + 1, sergeant.z);
  dealDamage(g, p, sergeant, 1e7, 'test');
  assert.equal(sergeant.state, 'dead');
  const opened = openLoot(g, p, sergeant.id, sergeant.lootGeneration);
  const entries = opened.ok ? lootState(g, p).loot?.entries || [] : [];
  assert.equal(entries.filter((x) => x.kind === 'item').length, 0, 'no items from a squad sergeant');
  const soldier = { type: 'severance_soldier', level: sergeant.level - 1 };
  assert.ok(killXp(sergeant, sergeant.level) > killXp(soldier, sergeant.level) * 2, 'the elite sergeant pays more');
  assert.ok(killXp(soldier, 7) > ENEMIES.severance_soldier.xp, 'level-scaled above the type base');
});
