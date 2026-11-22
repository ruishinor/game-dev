import test from 'node:test';
import assert from 'node:assert/strict';
import {ENEMIES,ITEMS} from '../shared/content.js';
import {MATERIALS} from '../shared/crafting.js';
import {ENEMY_ITEM_DROPS,SALVAGE,itemDrops} from '../server/sim/loot-tables.js';
import {ENTRIES} from '../client/src/journal.js';
import {NO_ITEM_REWARD_TYPES} from '../server/sim/loot.js';
test('server-only reward definitions cover existing enemies and reference valid items',()=>{
 // Every archetype must be explicitly classified: table-backed or no items.
 // Disallow duplicate classification and accidental unclassified enemies.
 const classified=[...Object.keys(ENEMY_ITEM_DROPS),...NO_ITEM_REWARD_TYPES];
 assert.equal(new Set(classified).size,classified.length);
 assert.deepEqual(classified.sort(),Object.keys(ENEMIES).sort());
 for(const type of NO_ITEM_REWARD_TYPES){
  assert.ok(Object.hasOwn(ENEMIES,type));
  assert.equal(Object.hasOwn(ENEMY_ITEM_DROPS,type),false);
  assert.equal(Object.hasOwn(ENEMIES[type],'loot'),false);
  assert.deepEqual(itemDrops(type),[]);
 }
 for(const [type,drops] of Object.entries(ENEMY_ITEM_DROPS)){
  assert.equal(Object.hasOwn(ENEMIES[type],'loot'),false);
  assert.equal(new Set(drops.map(d=>d.item)).size,drops.length);
  for(const d of drops){assert.ok(Object.hasOwn(ITEMS,d.item));assert.ok(Number.isFinite(d.chance)&&d.chance>0&&d.chance<=1);}
 }
 for(const [type,id] of Object.entries(SALVAGE)){assert.ok(Object.hasOwn(ENEMIES,type));assert.ok(Object.hasOwn(MATERIALS,id));}
 assert.deepEqual(itemDrops('constructor'),[]);
 assert.deepEqual(itemDrops('__proto__'),[]);
});
test('browser Codex contains no unpublished drop probabilities',()=>{
 assert.ok(ENTRIES.filter(e=>e.group==='Creatures').every(e=>e.facts.every(f=>!/drop chance/i.test(f))));
});
