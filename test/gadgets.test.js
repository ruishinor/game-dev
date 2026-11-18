import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS } from '../shared/content.js';
import { itemDrops } from '../server/sim/loot-tables.js';
import { deriveStats, tryEquip, tryUnequip } from '../shared/build.js';
import { openLoot,takeLoot } from '../server/sim/loot.js';
import { useAbility,dealDamage } from '../server/sim/combat.js';
import { makeGame, makeChar, place, enemyOf } from './helpers.js';

test('sentinel gadgets are server-awarded unique loot, not guaranteed or global rewards', () => {
  const game = makeGame();
  const enemy = enemyOf(game, 'sentinel');
  const near = game.addPlayer(makeChar('vanguard'));
  const far = game.addPlayer(makeChar('symbiotech'));
  place(near, enemy.x, enemy.z);
  place(far, enemy.x + 100, enemy.z);
  game.rng = () => 0;
  enemy.threat.set(far.id,1);
  dealDamage(game,near,enemy,9999,'test');
  assert.deepEqual(near.char.inventory,[]);
  assert.ok(openLoot(game,near,enemy.id,enemy.lootGeneration,true).ok);
  assert.deepEqual([...near.char.inventory].sort(), ['adrenal_shunt','conductive_membrane','field_vector_array']);
  assert.deepEqual(far.char.inventory, []);
  assert.equal(takeLoot(game,near,enemy.id,enemy.lootGeneration,null).ok,false);
  assert.equal(near.char.inventory.length, 3);
  const unlucky = game.addPlayer(makeChar('vanguard'));
  place(unlucky, enemy.x, enemy.z);
  game.rng = () => 0.99;
  const another=enemyOf(game,'sentinel',1);place(unlucky,another.x,another.z);
  dealDamage(game,unlucky,another,9999,'test');
  assert.ok(openLoot(game,unlucky,another.id,another.lootGeneration,true).ok);
  assert.deepEqual(unlucky.char.inventory, []);
  assert.deepEqual(itemDrops('skitter'), []);
  assert.deepEqual(itemDrops('warden'), [{item:'wardstone_shard',chance:1}]);
  for (const drop of itemDrops('sentinel')) assert.ok(Object.hasOwn(ITEMS,drop.item));
});

test('gadget sidegrades preserve class, ownership and dependent implant restrictions', () => {
  const char = makeChar('vanguard', {level:2,inventory:['conductive_membrane','field_vector_array','kinetic_capacitor']});
  assert.equal(tryEquip(makeChar('vanguard'),'conductive_membrane').ok,false);
  assert.equal(tryEquip(makeChar('symbiotech',{inventory:['field_vector_array']}),'field_vector_array').ok,false);
  char.equipped = tryEquip(char,'conductive_membrane').equipped;
  const stats = deriveStats(char);
  assert.deepEqual(stats.skills,{kinetics:13,biotech:6,instrumentation:4});
  assert.equal(stats.dmgMul,0.9);
  const implant = tryEquip(char,'kinetic_capacitor');
  assert.ok(implant.ok);
  char.equipped = implant.equipped;
  assert.deepEqual(tryUnequip(char,'device').alsoRemoved,['kinetic_capacitor']);
  assert.equal(tryEquip(char,'field_vector_array').ok,false);
});

test('vector array extends actual Aegis recipient radius with a Charge tradeoff', () => {
  const game = makeGame();
  const p = game.addPlayer(makeChar('vanguard',{inventory:['field_vector_array','glyph_resonant_aegis'],attunements:['resonance'],equipped:{device:'field_vector_array',implant:null,glyph:'glyph_resonant_aegis'}}));
  const inside = game.addPlayer(makeChar('symbiotech'));
  const outside = game.addPlayer(makeChar('symbiotech'));
  place(p,0,25); place(inside,8.5,25); place(outside,10.5,25);
  assert.equal(p.stats.chargeMul,0.8);
  assert.equal(p.stats.dischargeRadius,2);
  p.res=100;
  assert.ok(useAbility(game,p,'discharge').ok);
  assert.ok(p.buffs.some(b=>b.k==='shield'));
  assert.ok(inside.buffs.some(b=>b.k==='shield'));
  assert.ok(!outside.buffs.some(b=>b.k==='shield'));
  assert.ok(game.events.some(e=>e.e==='fx'&&e.k==='aegis'&&e.r===9));
});
