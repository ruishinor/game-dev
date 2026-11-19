import test from 'node:test';
import assert from 'node:assert/strict';
import { armorSetBonuses, ARMOR_SET_SLOTS } from '../shared/armor-set-bonuses.js';

const items = Object.fromEntries(ARMOR_SET_SLOTS.map(slot => [slot, {slot, cls:'keeper', setId:'a'}]));
items.other = {slot:'boots', cls:'keeper', setId:'b'};
items.foreign = {slot:'boots', cls:'vanguard', setId:'a'};
const sets = {a:{cls:'keeper', bonuses:{2:{hpAdd:4},3:{shieldMul:1.02},4:{hpAdd:8}}}, b:{cls:'keeper',bonuses:{2:{hpAdd:3}}}};
const loadout = Object.fromEntries(ARMOR_SET_SLOTS.map(slot => [slot,slot]));
const thresholds = e => armorSetBonuses('keeper',e,items,sets).find(s=>s.setId==='a')?.active.map(b=>b.threshold) ?? [];
test('thresholds accumulate and disappear when pieces are removed',()=>{
  for(let n=0;n<=4;n++) assert.deepEqual(thresholds(Object.fromEntries(Object.entries(loadout).slice(0,n))),[2,3,4].filter(t=>t<=n));
});
test('wrong class, duplicate, unknown, wrong slot and mixed sets do not count',()=>{
  for(const boots of ['foreign','chest','unknown','other','greaves','toString']) assert.deepEqual(thresholds({...loadout,boots}),[2,3]);
  assert.deepEqual(armorSetBonuses('vanguard',loadout,items,sets),[]);
});
test('result does not mutate definition or equipment',()=>{
  const result=armorSetBonuses('keeper',loadout,items,sets);
  result[0].active[0].mods.hpAdd=99;
  assert.equal(sets.a.bonuses[2].hpAdd,4);
  assert.equal(loadout.chest,'chest');
});
