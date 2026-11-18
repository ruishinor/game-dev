import test from 'node:test';
import assert from 'node:assert/strict';
import {makeGame,makeChar,place} from './helpers.js';
import {openVendor,tradeVendor,vendorState,closeVendor,tickVendor} from '../server/sim/vendor.js';
import {CREDIT_CAP} from '../server/sim/wallet.js';
import {interact} from '../server/sim/progress.js';
function setup(){
 const g=makeGame(),vendor=g.objects.find(o=>o.type==='quartermaster'),p=g.addPlayer(makeChar('vanguard',{credits:0,goods:{spent_contact:4,mire_husk:3},materials:{}}));
 assert.ok(vendor);place(p,vendor.x,vendor.z+2);assert.ok(interact(g,p,vendor.id).ok);
 const req=(op,id,qty)=>({op,id,qty,ticket:p.vendor.ticket,rev:p.vendor.rev});
 return {g,vendor,p,req};
}
test('buy, sell and buyback commit wallet and inventory once from server quotes',()=>{
 const {g,p,req}=setup();
 assert.equal(vendorState(g,p).credits,0);assert.equal(tradeVendor(g,p,req('buy','mire_fibre',1)).ok,false);
 const sell=req('sell','spent_contact',2);assert.ok(tradeVendor(g,p,sell).ok);assert.equal(p.char.credits,6);assert.equal(p.char.goods.spent_contact,2);
 assert.equal(tradeVendor(g,p,sell).ok,false);
 assert.ok(tradeVendor(g,p,req('sell_junk','',1)).ok);assert.deepEqual(p.char.goods,{});assert.equal(p.char.credits,18);
 assert.ok(tradeVendor(g,p,req('buy','mire_fibre',1)).ok);assert.equal(p.char.credits,10);assert.equal(p.char.materials.mire_fibre,1);
 const r=vendorState(g,p).buyback[0];assert.ok(tradeVendor(g,p,req('buyback',r.receipt,r.quantity)).ok);
 assert.equal(p.char.goods.spent_contact,2);assert.equal(p.char.credits,4);
});
test('vendor rejects forged, stale, remote, cross-player, combat and invalid operations atomically',()=>{
 const {g,vendor,p,req}=setup(),stranger=g.addPlayer(makeChar('keeper',{credits:500,goods:{}}));
 place(stranger,p.x,p.z);assert.ok(openVendor(g,stranger,vendor.id).ok);
 assert.equal(tradeVendor(g,stranger,req('sell_junk','',1)).ok,false);
 for(const q of [req('sell','__proto__',1),req('sell','spent_contact',0),req('sell','spent_contact',5),req('buy','wardstone_shard',1),req('buy','mire_fibre',1.1),{...req('sell_junk','',1),ticket:'forged'}])assert.equal(tradeVendor(g,p,q).ok,false);
 assert.equal(p.char.credits,0);assert.equal(p.char.goods.spent_contact,4);
 p.char.credits=CREDIT_CAP;assert.equal(tradeVendor(g,p,req('sell_junk','',1)).ok,false);assert.equal(p.char.goods.spent_contact,4);
 p.char.credits=200;p.char.materials.mire_fibre=99;assert.equal(tradeVendor(g,p,req('buy','mire_fibre',1)).ok,false);assert.equal(p.char.credits,200);
 const old=req('sell','spent_contact',1);place(p,20,20);tickVendor(g,p);assert.equal(vendorState(g,p),null);assert.equal(tradeVendor(g,p,old).ok,false);
 place(p,vendor.x,vendor.z+2);assert.ok(openVendor(g,p,vendor.id).ok);assert.notEqual(p.vendor.ticket,old.ticket);
 p.combatUntil=g.time+1000;assert.equal(tradeVendor(g,p,req('sell_junk','',1)).ok,false);
 p.combatUntil=0;p.dead=true;assert.equal(openVendor(g,p,vendor.id).ok,false);closeVendor(p);
 assert.equal(vendorState(g,p),null);
});
