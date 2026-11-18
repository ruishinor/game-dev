import test from 'node:test';import assert from 'node:assert/strict';
import {makeGame,makeChar,place,enemyOf,isolate} from './helpers.js';
import {dealDamage} from '../server/sim/combat.js';
import {relicDrop} from '../server/sim/loot-tables.js';
import {distributeCorpseLoot,openLoot,takeLoot,lootState} from '../server/sim/loot.js';
import {grantGoods} from '../server/sim/goods.js';
import {goodsCap,sanitizeGoods} from '../shared/goods.js';
import {inventoryView} from '../client/src/inventory-view.js';
import {ENTRIES} from '../client/src/journal.js';
import {openVendor,tradeVendor} from '../server/sim/vendor.js';
const rare='vault_memory_foil',seal='vault_witness_seal';
test('exclusive rare reward brackets do not draw for unrelated enemies and never affect gear RNG',()=>{
 let calls=0;const fn=n=>()=>{calls++;return n;};
 assert.equal(relicDrop('skitter',fn(0)),null);assert.equal(calls,0);
 for(const [n,id] of [[0,seal],[.004999,seal],[.005,rare],[.079999,rare],[.08,null],[.999999,null],[NaN,null],[-1,null],[1,null]])assert.equal(relicDrop('warden',fn(n)),id);
 const g=makeGame(),w=enemyOf(g,'warden'),p=g.addPlayer(makeChar('keeper'));place(p,w.x,w.z);isolate(g,w);
 let legacy=0;g.rng=()=>{legacy++;return .5;};g.relicRng=()=>0;dealDamage(g,p,w,99999,'test');
 assert.equal(legacy,1,'one equipment roll remains independent of relic RNG');assert.ok(w.lootByPlayer.get(p.id).some(e=>e.id===seal));
});
test('eligible recipients roll separately; no replay, remote claim, ownership duplication or disclosure',()=>{
 const g=makeGame(),w=enemyOf(g,'warden'),a=g.addPlayer(makeChar('vanguard')),b=g.addPlayer(makeChar('keeper')),stranger=g.addPlayer(makeChar('keeper'));isolate(g,w);
 for(const p of [a,b,stranger])place(p,w.x,w.z);let rolls=0;g.relicRng=()=>[0,.02][rolls++];g.rng=()=>0;
 dealDamage(g,b,w,1,'test');dealDamage(g,a,w,99999,'test');const gen=w.lootGeneration;
 assert.equal(rolls,2);distributeCorpseLoot(g,w,[a.id,b.id,stranger.id]);assert.equal(rolls,2);
 const owner=[a,b].find(p=>w.lootByPlayer.get(p.id).some(e=>e.id===seal)),other=owner===a?b:a;
 assert.ok(owner&&w.lootByPlayer.get(other.id).some(e=>e.id===rare));
 assert.equal(lootState(g,stranger).lootable.length,0);assert.equal(openLoot(g,stranger,w.id,gen).ok,false);
 assert.ok(openLoot(g,owner,w.id,gen).ok);assert.equal(takeLoot(g,owner,w.id,gen,rare).ok,false);
 assert.ok(takeLoot(g,owner,w.id,gen,seal).ok);assert.equal(takeLoot(g,owner,w.id,gen,seal).ok,false);
 assert.equal(grantGoods(g,owner,seal,1),false);assert.equal(owner.char.goods[seal],1);assert.ok(!other.char.goods?.[seal]);
 assert.equal(inventoryView(g.sheet(owner),'relic').entries[0].id,seal);
 assert.ok(!g.events.some(e=>e.item===seal||e.id===seal));assert.ok(!other.outbox.some(e=>e.m?.includes('Lattice Witness Seal')));
});
test('relics are cap-one, never purchaseable or saleable and disclose no source odds in Codex',()=>{
 const g=makeGame(),p=g.addPlayer(makeChar('keeper',{goods:{[seal]:1,[rare]:1,mire_husk:1},credits:100})),npc=g.objects.find(o=>o.type==='quartermaster');
 assert.equal(goodsCap(seal),1);assert.deepEqual(sanitizeGoods({[seal]:99,[rare]:5,mire_husk:7}),{[seal]:1,[rare]:1,mire_husk:7});
 place(p,npc.x,npc.z+2);assert.ok(openVendor(g,p,npc.id).ok);
 const req=(op,id,qty=1)=>({op,id,qty,ticket:p.vendor.ticket,rev:p.vendor.rev});
 assert.equal(tradeVendor(g,p,req('sell',rare)).ok,false);assert.equal(tradeVendor(g,p,req('buy',seal)).ok,false);
 assert.ok(tradeVendor(g,p,req('sell_junk','')).ok);assert.equal(p.char.goods[seal],1);assert.equal(p.char.goods[rare],1);
 for(const id of [seal,rare]){const e=ENTRIES.find(x=>x.id===id);assert.ok(e);assert.doesNotMatch(JSON.stringify(e),/\b(?:probability|drop chance|warden)\b/i);}
});
