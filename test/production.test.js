import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPES,productionTime } from '../shared/crafting.js';
import { beginProduction, stopProduction,productionVisualState } from '../server/sim/production.js';
import { equipItem, grantSalvage } from '../server/sim/progress.js';
import { isolate, makeChar, makeGame, place, run } from './helpers.js';

test('a batch commits only finished cycles and rejects obsolete requests after cancellation', () => {
  const g = makeGame();
  isolate(g, null);
  const p = g.addPlayer(makeChar('vanguard', { materials: { mire_fibre: 5, sentinel_alloy: 5 } }));
  const start = count => beginProduction(g, p, 'field_maintenance_kit', count, p.inventoryRev);
  assert.equal(start(5).ok, false, 'kit recipes produce in pairs');
  assert.equal(start(10).ok, true);
  assert.equal(start(2).ok, false);
  const rev = p.inventoryRev;
  const duration=productionTime(RECIPES.field_maintenance_kit);
  assert.ok(duration>=4000&&duration<=6000);
  assert.deepEqual(productionVisualState(g,p),{m:'assemble',q:0});
  assert.deepEqual(g.buildRows().find(row=>row.i===p.id).work,{m:'assemble',q:0});
  run(g, duration-50);
  assert.equal(p.char.goods, undefined);
  run(g, 50);
  assert.equal(p.char.goods.field_maintenance_kit, 2);
  assert.deepEqual(p.char.materials, { mire_fibre: 4, sentinel_alloy: 4 });
  stopProduction(g, p);
  assert.equal(productionVisualState(g,p),null);
  assert.equal(g.buildRows().find(row=>row.i===p.id).work,undefined);
  assert.equal(beginProduction(g, p, 'field_maintenance_kit', 2, rev).ok, false);
  assert.ok(start(2).ok);
  place(p, 0, 40);
  run(g, 1500);
  assert.equal(p.char.goods.field_maintenance_kit, 2);
  assert.equal(g.privateState(p).production, null);
});

test('work is revalidated at commit and session removal leaves unspent inputs intact', () => {
  const g = makeGame();
  isolate(g, null);
  const p = g.addPlayer(makeChar('vanguard', { inventory: ['servo_harness'], materials: { mire_fibre: 1, sentinel_alloy: 1 } }));
  const begin = () => beginProduction(g, p, 'field_maintenance_kit', 2, p.inventoryRev);
  assert.ok(begin().ok);
  assert.match(equipItem(g, p, 'servo_harness').reason, /production/);
  delete p.char.materials.mire_fibre;
  g.markDirty(p);
  run(g, productionTime(RECIPES.field_maintenance_kit)+50);
  assert.equal(p.char.goods, undefined);
  assert.equal(p.char.materials.sentinel_alloy, 1);
  grantSalvage(g, p, 'mire_fibre');
  assert.ok(begin().ok);
  p.combatUntil = g.time + 500;
  run(g, 500);
  assert.equal(g.privateState(p).production, null);
  assert.ok(begin().ok);
  g.removePlayer(p.id);
  const returned = g.addPlayer(p.char);
  run(g, productionTime(RECIPES.field_maintenance_kit)+50);
  assert.equal(g.privateState(returned).production, null);
  assert.deepEqual(returned.char.materials, { mire_fibre: 1, sentinel_alloy: 1 });
});

test('advanced failure preserves equipment and consumes only its disclosed material', () => {
  const g = makeGame();
  isolate(g, null);
  const p = g.addPlayer(makeChar('vanguard', {
    level: 4, survey: 'ledger_done', brineStage: 3, attunements: ['resonance'],
    inventory: ['tuned_emitter'], condition: { tuned_emitter: 40 },
    materials: { kinetic_coupler: 3, resonance_fragment: 1 },
  }));
  place(p, 49, -36.5);
  const begin = () => beginProduction(g, p, 'dense_pulse_core', 1, p.inventoryRev);
  g.productionRoll = () => 0;
  assert.ok(begin().ok);
  run(g, productionTime(RECIPES.dense_pulse_core));
  assert.deepEqual(p.char.inventory, ['tuned_emitter']);
  assert.equal(p.char.condition.tuned_emitter, 40);
  assert.deepEqual(p.char.materials, { kinetic_coupler: 2, resonance_fragment: 1 });
  g.productionRoll = () => 99;
  assert.ok(begin().ok);
  run(g, productionTime(RECIPES.dense_pulse_core));
  assert.deepEqual(p.char.inventory, ['dense_pulse_core']);
  assert.deepEqual(p.char.materials, {});
  assert.equal(g.privateState(p).production, null);
});
