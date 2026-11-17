import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, ENEMIES } from '../shared/content.js';
import { deriveStats, tryEquip, tryUnequip } from '../shared/build.js';
import { onEnemyKilled } from '../server/sim/progress.js';
import { useAbility } from '../server/sim/combat.js';
import { makeGame, makeChar, place, enemyOf } from './helpers.js';

test('sentinel gadgets are server-awarded unique loot, not guaranteed or global rewards', () => {
  const game = makeGame();
  const enemy = enemyOf(game, 'sentinel');
  const near = game.addPlayer(makeChar('vanguard'));
  const far = game.addPlayer(makeChar('symbiotech'));
  place(near, enemy.x, enemy.z);
  place(far, enemy.x + 100, enemy.z);
  game.rng = () => 0;
  onEnemyKilled(game, enemy, [near.id, far.id]);
  assert.deepEqual([...near.char.inventory].sort(), ['adrenal_shunt','conductive_membrane','field_vector_array']);
  assert.deepEqual(far.char.inventory, []);
  onEnemyKilled(game, enemy, [near.id]);
  assert.equal(near.char.inventory.length, 3);
  const unlucky = game.addPlayer(makeChar('vanguard'));
  place(unlucky, enemy.x, enemy.z);
  game.rng = () => 0.99;
  onEnemyKilled(game, enemy, [unlucky.id]);
  assert.deepEqual(unlucky.char.inventory, []);
  assert.deepEqual(ENEMIES.skitter.loot, []);
  assert.deepEqual(ENEMIES.warden.loot, [{item:'wardstone_shard',chance:1}]);
  for (const drop of ENEMIES.sentinel.loot) assert.ok(Object.hasOwn(ITEMS,drop.item));
});

test('gadget sidegrades preserve class, ownership and dependent implant restrictions', () => {
  const char = makeChar('vanguard', {level:2,inventory:['conductive_membrane','field_vector_array','kinetic_capacitor']});
  assert.equal(tryEquip(makeChar('vanguard'),'conductive_membrane').ok,false);
  assert.equal(tryEquip(makeChar('symbiotech',{inventory:['field_vector_array']}),'field_vector_array').ok,false);
  char.equipped = tryEquip(char,'conductive_membrane').equipped;
  const stats = deriveStats(char);
  assert.deepEqual(stats.skills,{kinetics:13,biotech:6});
  assert.equal(stats.dmgMul,0.9);
  const implant = tryEquip(char,'kinetic_capacitor');
  assert.ok(implant.ok);
  char.equipped = implant.equipped;
  assert.equal(tryUnequip(char,'device').ok,false);
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
