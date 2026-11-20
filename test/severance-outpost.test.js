import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeGame, makeChar, place } from './helpers.js';
import { openVendor, tradeVendor, vendorState } from '../server/sim/vendor.js';
import { useUtility, RESTORATIVE } from '../server/sim/utility.js';
import { dealDamage, tickPlayerCombat } from '../server/sim/combat.js';
import { interact } from '../server/sim/progress.js';
import { EXPEDITION_OUTPOST as OP, OUTPOST_COLLIDERS } from '../shared/severance-gate.js';
import { inSafeZone, hasLineOfSight, resolveCollisions, PLAYER_RADIUS, travelRegionAt, zoneAt } from '../shared/world.js';
import { createExpeditionOutpost, OUTPOST_LIMITS } from '../client/src/severance-outpost.js';

function atOutpost(cls = 'vanguard', extra = {}) {
  const g = makeGame(), p = g.addPlayer(makeChar(cls, { credits: 100, goods: {}, materials: {}, ...extra }));
  const qm = g.objects.find((o) => o.type === 'expedition_quartermaster');
  assert.ok(qm, 'the outpost quartermaster is a world object');
  place(p, qm.x - 3, qm.z);
  return { g, p, qm };
}

test('the outpost is a safe zone in the Expanse: no damage, outside it combat applies', () => {
  const { g, p } = atOutpost();
  assert.equal(travelRegionAt(p.x, p.z), 'severance_expanse');
  assert.equal(zoneAt(OP.x, OP.z), 'Severance Expanse · Expedition Outpost');
  assert.ok(inSafeZone(p));
  const hp = p.hp;
  assert.equal(dealDamage(g, null, p, 50, null), 0);
  assert.equal(p.hp, hp);
  place(p, OP.x - OP.r - 3, OP.z);
  assert.equal(inSafeZone(p), false);
  // the camp is walkable from the arrival side and its quartermaster is visible across the counter
  const qm = g.objects.find((o) => o.type === 'expedition_quartermaster');
  const front = { x: OP.counter.x - 1.6, z: OP.counter.z, jy: 0, vy: 0 };
  resolveCollisions(front, PLAYER_RADIUS);
  assert.ok(Math.abs(front.x - (OP.counter.x - 1.6)) < 1e-9, 'standing at the counter is open ground');
  assert.ok(hasLineOfSight(front, qm));
  assert.ok(OUTPOST_COLLIDERS.length >= 10);
});

test('expedition quartermaster sells field supplies only at the outpost; the Sanctum stock is unchanged', () => {
  const { g, p, qm } = atOutpost();
  assert.ok(interact(g, p, qm.id).ok);
  const st = vendorState(g, p);
  const ids = st.buy.map((b) => b.id).sort();
  assert.deepEqual(ids, ['field_maintenance_kit', 'field_restorative']);
  const req = (op, id, qty) => ({ op, id, qty, ticket: p.vendor.ticket, rev: p.vendor.rev });
  assert.equal(tradeVendor(g, p, req('buy', 'electrical_combat_rod', 1)).ok, false, 'no Sanctum equipment here');
  const price = st.buy.find((b) => b.id === 'field_restorative').price;
  assert.ok(tradeVendor(g, p, req('buy', 'field_restorative', 3)).ok);
  assert.equal(p.char.goods.field_restorative, 3);
  assert.equal(p.char.credits, 100 - price * 3);
  // replaying the same quote fails
  assert.equal(tradeVendor(g, p, { op: 'buy', id: 'field_restorative', qty: 3, ticket: p.vendor.ticket, rev: p.vendor.rev - 1 }).ok, false);
  // remote / outside the camp
  place(p, OP.x - OP.r - 2, OP.z);
  assert.equal(openVendor(g, p, qm.id).ok, false);
  // the Sanctum quartermaster still carries its catalogue
  const g2 = makeGame(), q2 = g2.objects.find((o) => o.type === 'quartermaster'), p2 = g2.addPlayer(makeChar('vanguard', { credits: 50 }));
  place(p2, q2.x, q2.z + 2);
  assert.ok(interact(g2, p2, q2.id).ok);
  const sanctum = vendorState(g2, p2).buy.map((b) => b.id);
  assert.ok(sanctum.includes('electrical_combat_rod') && sanctum.includes('mire_fibre') && !sanctum.includes('field_restorative'));
});

test('Field Restorative: server-owned heal over time, single use, recovery, forged and invalid uses rejected', () => {
  const { g, p } = atOutpost('keeper', { goods: { field_restorative: 2 } });
  place(p, OP.x - OP.r - 10, OP.z);                     // out in the field
  p.hp = Math.round(p.maxHp * 0.4);
  const start = p.hp;
  assert.equal(useUtility(g, p, 'field_restorative', '', p.utilityRev + 1).ok, false, 'stale revision');
  assert.ok(useUtility(g, p, 'field_restorative', '', p.utilityRev).ok);
  assert.equal(p.char.goods.field_restorative, 1);
  assert.equal(useUtility(g, p, 'field_restorative', '', p.utilityRev).ok, false, 'recovery between doses');
  p.combatUntil = g.time + 60000;                          // in combat: no passive regeneration, the dose still works
  for (let i = 0; i < RESTORATIVE.ticks + 2; i++) { g.time += 1000; tickPlayerCombat(g, p, 1); }
  const healed = p.hp - start;
  const expected = Math.ceil(p.maxHp * RESTORATIVE.fraction / RESTORATIVE.ticks) * RESTORATIVE.ticks;
  assert.ok(Math.abs(healed - expected) <= 1, `healed ${healed} of ${expected}`);
  g.time += RESTORATIVE.recoveryMs;
  p.dead = true;
  assert.equal(useUtility(g, p, 'field_restorative', '', p.utilityRev).ok, false);
  p.dead = false;
  assert.ok(useUtility(g, p, 'field_restorative', '', p.utilityRev).ok);
  assert.equal(p.char.goods.field_restorative, undefined);
  g.time += RESTORATIVE.recoveryMs;
  assert.equal(useUtility(g, p, 'field_restorative', '', p.utilityRev).ok, false, 'none left');
});

test('outpost presentation: bounded lights and halos, hidden far away, disposable', () => {
  const group = new THREE.Group();
  const op = createExpeditionOutpost(THREE, { group, ground: () => 0 });
  op.update(0.1, 1, { x: OP.x, z: OP.z + 20 }, { night: 1 });
  assert.equal(op.root.visible, true);
  let lights = 0;
  group.traverse((o) => { if (o.isLight) lights++; });
  assert.equal(lights, OUTPOST_LIMITS.lights);
  assert.equal(op.stats().halos, OUTPOST_LIMITS.halos);
  op.update(0.1, 1, { x: OP.x, z: OP.z + 400 });
  assert.equal(op.root.visible, false);
  op.dispose();
  assert.equal(op.root.parent, null);
});
