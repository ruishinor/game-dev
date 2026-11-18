import test from 'node:test';import assert from 'node:assert/strict';
import {makeGame,makeChar,place,enemyOf,isolate} from './helpers.js';
import {dealDamage} from '../server/sim/combat.js';
import {openLoot,takeLoot,lootState,tickLoot,clearLoot} from '../server/sim/loot.js';
import {CORPSE_MS} from '../server/sim/game.js';
function fixture(){
 const g=makeGame(),e=enemyOf(g,'sentinel');isolate(g,e);
 const a=g.addPlayer(makeChar('vanguard')),b=g.addPlayer(makeChar('vanguard')),stranger=g.addPlayer(makeChar('vanguard'));
 place(a,e.x,e.z);place(b,e.x,e.z);place(stranger,e.x,e.z);g.rng=()=>0;
 dealDamage(g,b,e,1,'test');dealDamage(g,a,e,99999,'test');
 return {g,e,a,b,stranger,gen:e.lootGeneration};
}
test('personal loot is rolled once, held on corpse, selected individually, and not transferable',()=>{
 const {g,e,a,b,stranger,gen}=fixture();assert.equal(a.char.inventory.length,0);assert.equal(b.char.inventory.length,0);
 assert.ok(!a.char.materials?.sentinel_alloy);assert.equal(lootState(g,stranger).lootable.length,0);
 assert.equal(openLoot(g,stranger,e.id,gen).ok,false);assert.equal(takeLoot(g,a,e.id,gen,'adrenal_shunt').ok,false);
 assert.ok(openLoot(g,a,e.id,gen).ok);assert.equal(lootState(g,a).loot.entries.length,5);
 assert.ok(takeLoot(g,a,e.id,gen,'adrenal_shunt').ok);assert.deepEqual(a.char.inventory,['adrenal_shunt']);
 assert.equal(takeLoot(g,a,e.id,gen,'adrenal_shunt').ok,false);assert.equal(lootState(g,a).loot.entries.length,4);
 clearLoot(a);assert.equal(lootState(g,a).loot,null);assert.equal(a.char.materials?.sentinel_alloy||0,0);
 assert.ok(openLoot(g,a,e.id,gen,true).ok);assert.equal(a.char.materials.sentinel_alloy,1);assert.equal(a.char.goods.spent_contact,1);assert.ok(!b.char.goods?.spent_contact);assert.equal(lootState(g,a).loot,null);
 assert.ok(openLoot(g,b,e.id,gen).ok);assert.equal(lootState(g,b).loot.entries.length,5);
});
test('loot rejects range, stale generation, death, expiry and leaves uncollected entries',()=>{
 const {g,e,a,gen}=fixture();assert.ok(openLoot(g,a,e.id,gen).ok);
 place(a,e.x+20,e.z);tickLoot(g,a);assert.equal(lootState(g,a).loot,null);assert.equal(takeLoot(g,a,e.id,gen,null).ok,false);
 place(a,e.x,e.z);assert.equal(openLoot(g,a,e.id,gen+1).ok,false);a.dead=true;assert.equal(openLoot(g,a,e.id,gen).ok,false);a.dead=false;
 g.time=e.deadAt+CORPSE_MS+1;assert.equal(openLoot(g,a,e.id,gen).ok,false);assert.equal(lootState(g,a).lootable.length,0);
});
test('empty corpses stay unlootable; failed material-cap claims do not consume a stack',()=>{
 const {g,e,a,gen}=fixture();a.char.materials={sentinel_alloy:99};assert.ok(openLoot(g,a,e.id,gen).ok);
 assert.equal(takeLoot(g,a,e.id,gen,'sentinel_alloy').ok,false);assert.ok(lootState(g,a).loot.entries.some(x=>x.id==='sentinel_alloy'));
 const h=makeGame(),p=h.addPlayer(makeChar('vanguard')),f=enemyOf(h,'faultstalker');isolate(h,f);place(p,f.x,f.z);h.rng=()=>.99;dealDamage(h,p,f,99999,'test');assert.equal(lootState(h,p).lootable.length,0);
});
