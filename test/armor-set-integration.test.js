import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CharacterStore } from '../server/store.js';
import { deriveStats, tryEquip, tryUnequip } from '../shared/build.js';
import { ARMOR_SETS, ITEMS } from '../shared/content.js';
import { ARMOR_SET_SLOTS } from '../shared/armor-set-bonuses.js';
import { makeChar } from './helpers.js';

for (const [setId, set] of Object.entries(ARMOR_SETS)) {
  test(set.name + ' applies cumulative effects from owned equipment', () => {
    const ids = ARMOR_SET_SLOTS.map(slot => setId+'_'+slot);
    const char = makeChar(set.cls, {inventory:ids});
    const base = deriveStats(char);
    for (let i=0;i<ids.length;i++) {
      const equip = tryEquip(char,ids[i]);
      assert.equal(equip.ok,true);
      char.equipped=equip.equipped;
      const stat=deriveStats(char);
      const hp=ids.slice(0,i+1).reduce((sum,id)=>sum+(ITEMS[id].mods?.hpAdd??0),0);
      let expectedHp=base.maxHp+hp;
      for (const key of ['healMul','shieldMul','dmgMul','chargeMul','barrierMul']) {
        let expected=base[key];
        for(const n of [2,3,4]) if(i+1>=n) expected*=set.bonuses[n][key]??1;
        assert.ok(Math.abs(stat[key]-expected)<1e-10);
      }
      for(const n of [2,3,4]) if(i+1>=n) expectedHp+=set.bonuses[n].hpAdd??0;
      assert.equal(stat.maxHp,expectedHp);
    }
    const before=deriveStats(char);
    const removed=tryUnequip(char,'boots');
    assert.equal(removed.ok,true);
    char.equipped=removed.equipped;
    assert.ok(deriveStats(char).maxHp<before.maxHp);
    const foreign=makeChar(set.cls==='keeper'?'vanguard':'keeper',{inventory:ids});
    assert.equal(tryEquip(foreign,ids[0]).ok,false);
    assert.equal(tryEquip(makeChar(set.cls),ids[0]).ok,false);
  });
}

test('unowned or wrong-class set pieces cannot contribute individual modifiers either',()=>{
 const char=makeChar('vanguard');const baseline=deriveStats(char);
 for(const id of ['vanguard_field_set_chest','keeper_field_set_chest']){
  const inventory=id.startsWith('keeper')?[id]:[];
  const bad={...char,inventory,equipped:{...char.equipped,chest:id}};
  assert.equal(deriveStats(bad).maxHp,baseline.maxHp);
 }
});

test('set loadout derivation does not project a rejected glyph',()=>{
 const id='vanguard_field_set_chest';
 const char=makeChar('vanguard',{inventory:[id],equipped:{device:null,implant:null,glyph:'glyph_hinge',chest:id}});
 assert.equal(deriveStats(char).glyph,null);
});

test('anatomical slots survive disk hydration; invalid slots do not grant bonuses',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'attunement-armor-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'characters.json'),store=new CharacterStore(file);
 const {char,token}=store.create('Armor Tester','vanguard');
 assert.ok(char&&token);
 const ids=ARMOR_SET_SLOTS.map(slot=>'vanguard_field_set_'+slot);
 char.inventory=ids.slice();
 for(const id of ids){
  const result=tryEquip(char,id);assert.ok(result.ok);char.equipped=result.equipped;
 }
 const legacy=store.create('Legacy Tester','keeper');
 assert.ok(legacy.char);
 store.markDirty();assert.ok(store.flush());
 let restored=new CharacterStore(file),loaded=restored.authenticate(token);
 assert.ok(loaded);
 for(const slot of ARMOR_SET_SLOTS)assert.equal(loaded.equipped[slot],'vanguard_field_set_'+slot);
 assert.deepEqual(deriveStats(loaded),deriveStats(char));
 assert.deepEqual(restored.authenticate(legacy.token).equipped,{device:null,implant:null,glyph:null});
 // A carried foreign item must not survive as installed or count towards a set.
 loaded.inventory.push('keeper_field_set_boots');loaded.equipped.boots='keeper_field_set_boots';
 restored.markDirty();assert.ok(restored.flush());
 loaded=new CharacterStore(file).authenticate(token);
 assert.ok(!loaded.equipped.boots);
 assert.ok(loaded.inventory.includes('keeper_field_set_boots'));
 assert.ok(deriveStats(loaded).maxHp<deriveStats(char).maxHp);
});
