import test from 'node:test';
import assert from 'node:assert/strict';
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
      const hp=ids.slice(0,i+1).reduce((sum,id)=>sum+ITEMS[id].mods.hpAdd,0);
      let expectedHp=base.maxHp+hp;
      for (const key of ['healMul','shieldMul','dmgMul']) {
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
