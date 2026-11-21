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
  return { g, soldiers, groups: [...bySquad.values()] };
};

test('Severance Soldiers patrol in squads of a sergeant and two soldiers', () => {
  const defs = SEVERANCE_PATROLS.filter((p) => p.type === 'severance_soldier');
  assert.ok(defs.length >= 6 && defs.length % 3 === 0, 'whole squads');
  const { soldiers, groups } = squads();
  assert.equal(soldiers.length, defs.length);
  assert.equal(groups.length, defs.length / 3);
  for (const grp of groups) {
    const lead = grp.find((e) => !e.lead);
    assert.ok(lead, 'one sergeant per squad');
    assert.equal(lead.name, 'Severance Sergeant');
    assert.equal(lead.level, ENEMIES.severance_soldier.level + 1);
    const followers = grp.filter((e) => e.lead === lead.id);
    assert.equal(followers.length, 2);
    for (const f of followers) {
      assert.equal(f.name, 'Severance Soldier');
      assert.ok(Math.hypot(f.x - lead.x, f.z - lead.z) < 4, 'starts in formation');
    }
    // the squad does not vent its reactors in unison
    const firsts = grp.map((e) => (e.specials || ENEMIES.severance_soldier.specials)[0].first);
    assert.equal(new Set(firsts).size, 3);
  }
  // soldiers are their own models, not the reused-rig ash look
  for (const e of soldiers) assert.equal(e.vx, undefined);
});

test('followers hold their wedge while the sergeant walks the route', () => {
  const { g, groups } = squads();
  const start = groups.map((grp) => grp.map((e) => ({ x: e.x, z: e.z })));
  for (let i = 0; i < 600; i++) g.tick(50);
  groups.forEach((grp, k) => {
    const lead = grp.find((e) => !e.lead);
    assert.ok(Math.hypot(lead.x - start[k][0].x, lead.z - start[k][0].z) > 8, 'the sergeant moves along its route');
    for (const f of grp.filter((e) => e.lead)) {
      const slot = squadSlot(lead, f.slot);
      assert.ok(Math.hypot(f.x - slot.x, f.z - slot.z) < 3, `follower within 3 m of its slot (${Math.hypot(f.x - slot.x, f.z - slot.z).toFixed(2)})`);
      assert.equal(travelRegionAt(f.x, f.z), 'severance_expanse');
    }
  });
});

test('the whole squad answers an attack on any member, then leashes back', () => {
  const { g, groups } = squads();
  for (let i = 0; i < 100; i++) g.tick(50);
  const grp = groups[0];
  const lead = grp.find((e) => !e.lead);
  const p = g.addPlayer(makeChar('vanguard', { level: 5 }));
  place(p, lead.x + 5, lead.z);
  g.tick(50);
  for (const e of grp) assert.ok(e.threat.has(p.id), `${e.name} engages`);
  // run far past the leash: everyone gives up, then the wedge re-forms on the route
  place(p, lead.x + ENEMIES.severance_soldier.leash + 40, lead.z);
  for (let i = 0; i < 800 && grp.some((e) => e.state !== 'idle'); i++) g.tick(50);
  for (const e of grp) assert.equal(e.state, 'idle');
  for (let i = 0; i < 300; i++) g.tick(50);
  for (const f of grp.filter((e) => e.lead)) {
    const slot = squadSlot(lead, f.slot);
    assert.ok(Math.hypot(f.x - slot.x, f.z - slot.z) < 3, 'back in formation');
  }
});

test('clients learn only what they see: no route, slot or squad link in metadata', () => {
  const { g, soldiers } = squads();
  for (const e of soldiers) {
    const meta = g.metaFor(e);
    assert.equal(meta.c, 'severance_soldier');
    assert.ok(['Severance Soldier', 'Severance Sergeant'].includes(meta.n));
    for (const k of ['route', 'slot', 'lead', 'home', 'post', 'specials', 'threat']) assert.equal(meta[k], undefined, k);
    assert.ok(!JSON.stringify(meta).includes('route'));
  }
});
