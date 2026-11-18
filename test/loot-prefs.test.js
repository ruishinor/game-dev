import test from 'node:test';
import assert from 'node:assert/strict';
import {AUTO_LOOT_KEY,readAutoLoot,writeAutoLoot,autoForInteraction} from '../client/src/loot-prefs.js';
test('auto-loot preference defaults safely, round-trips, and tolerates blocked storage',()=>{
 const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
 assert.equal(readAutoLoot(storage),false);
 assert.equal(writeAutoLoot(storage,true),true);
 assert.equal(map.get(AUTO_LOOT_KEY),'1');assert.equal(readAutoLoot(storage),true);
 assert.equal(writeAutoLoot(storage,false),false);assert.equal(readAutoLoot(storage),false);
 map.set(AUTO_LOOT_KEY,'true');assert.equal(readAutoLoot(storage),false);
 const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};
 assert.equal(readAutoLoot(blocked),false);assert.equal(writeAutoLoot(blocked,true),true);
});
test('explicit manual mode overrides auto only for the current interaction',()=>{
 for(const enabled of [true,false,undefined,'1'])for(const manual of [true,false])
  assert.equal(autoForInteraction(enabled,manual),enabled===true&&!manual);
});
