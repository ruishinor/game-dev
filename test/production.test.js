import test from 'node:test';
import assert from 'node:assert/strict';
import { beginProduction, stopProduction } from '../server/sim/production.js';
import { RECIPES, productionTime } from '../shared/crafting.js';
import { createProductionClock, productionEstimate } from '../client/src/production-presentation.js';
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
  run(g, 1050);
  assert.equal(g.sheet(p).craftingDisciplines.Engineering,0);
  assert.equal(p.char.goods, undefined);
  run(g, 50);
  assert.equal(p.char.goods.field_maintenance_kit, 2);
  assert.deepEqual(p.char.materials, { mire_fibre: 4, sentinel_alloy: 4 });
  assert.equal(g.sheet(p).craftingDisciplines.Engineering,14);
  assert.equal(g.sheet(p).craftingDisciplines.Research,0);
  stopProduction(g, p);
  assert.equal(beginProduction(g, p, 'field_maintenance_kit', 2, rev).ok, false);
  assert.ok(start(2).ok);
  place(p, 0, 40);
  run(g, 1500);
  assert.equal(p.char.goods.field_maintenance_kit, 2);
  assert.equal(g.sheet(p).craftingDisciplines.Engineering,14);
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
  run(g, 1150);
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
  run(g, 1150);
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
  assert.equal(g.sheet(p).craftingDisciplines.Engineering,0);
  assert.deepEqual(p.char.materials, { kinetic_coupler: 2, resonance_fragment: 1 });
  g.productionRoll = () => 99;
  assert.ok(begin().ok);
  run(g, productionTime(RECIPES.dense_pulse_core));
  assert.deepEqual(p.char.inventory, ['dense_pulse_core']);
  assert.deepEqual(p.char.materials, {});
  assert.equal(g.privateState(p).production, null);
});

test('sustained fabrication preserves Longpoint and maintenance timing, with longer equipment and component cycles',()=>{
  assert.equal(productionTime(RECIPES.longpoint_emitter),1900);
  assert.equal(productionTime(RECIPES.field_maintenance_kit),1100);
  assert.ok(productionTime(RECIPES.coupler)>=3000);
  assert.ok(productionTime(RECIPES.field_chest)>=4000);
  assert.ok(productionTime(RECIPES.dense_pulse_core)>productionTime(RECIPES.field_chest));
  assert.ok(productionTime(RECIPES.bloom_relay)>productionTime(RECIPES.dense_pulse_core));
});

test('fabrication progress interpolates within a confirmed cycle and never claims completion',()=>{
  const clock=createProductionClock();
  const job={id:'coupler',quantity:5,cycles:5,complete:0,total:3000,ms:3000};
  assert.equal(clock.sample(job,100).cycle,0);
  assert.ok(clock.sample(job,200).cycle>0);
  assert.equal(clock.sample(job,10000).cycle,250/3000);
  const next={...job,ms:2250};
  assert.equal(clock.sample(next,10100).stage,'Working');
  const inspect={...job,ms:150};
  assert.equal(clock.sample(inspect,11000).stage,'Inspecting result');
  assert.equal(clock.sample(inspect,12000).cycle,.995);
  const second={...job,complete:1};
  assert.deepEqual(clock.sample(second,12200),{cycle:0,overall:1,stage:'Preparing components'});
  assert.equal(clock.sample(null,12300),null);
  assert.equal(clock.sample(job,12400).overall,0);
  assert.equal(productionEstimate({...job,total:0}),null);
});
