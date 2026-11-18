import test from 'node:test';import assert from 'node:assert/strict';
import {makeGame,makeChar,place} from './helpers.js';
import {craftRecipe} from '../server/sim/progress.js';
import {useUtility} from '../server/sim/utility.js';
import {openVendor,tradeVendor,vendorState} from '../server/sim/vendor.js';
import {previewRecipe} from '../shared/crafting.js';
import {inventoryView} from '../client/src/inventory-view.js';
import {conditionOf} from '../shared/condition.js';
import {CharacterStore} from '../server/store.js';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const id='field_maintenance_kit';
function setup(){
 const g=makeGame(),p=g.addPlayer(makeChar('vanguard',{credits:60,goods:{[id]:1,mire_husk:2},materials:{mire_fibre:2,sentinel_alloy:2},inventory:['field_emitter'],equipped:{weapon:'field_emitter',device:null,implant:null,glyph:null},condition:{field_emitter:55}}));
 return {g,p};
}
test('field maintenance is atomic, owner-scoped, capped and replay-resistant',()=>{
 const {g,p}=setup(),q=g.addPlayer(makeChar('vanguard'));
 const rev=p.utilityRev,before=JSON.stringify(p.char),hp=p.hp,res=p.res;
 assert.equal(useUtility(g,q,id,'field_emitter',q.utilityRev).ok,false);
 for(const [item,weapon,r] of [[id,'tuned_emitter',rev],[id,'field_emitter',rev+1],['__proto__','field_emitter',rev],[id,'field_emitter',null]])assert.equal(useUtility(g,p,item,weapon,r).ok,false);
 p.dead=true;assert.equal(useUtility(g,p,id,'field_emitter',rev).ok,false);p.dead=false;
 p.combatUntil=g.time+1000;assert.equal(useUtility(g,p,id,'field_emitter',rev).ok,false);p.combatUntil=0;
 assert.equal(JSON.stringify(p.char),before);
 assert.ok(useUtility(g,p,id,'field_emitter',rev).ok);
 assert.equal(conditionOf(p.char,'field_emitter'),80);assert.equal(p.char.goods[id],undefined);assert.equal(p.hp,hp);assert.equal(p.res,res);
 assert.equal(g.events.filter(e=>e.k==='field_maintenance').length,1);
 assert.equal(useUtility(g,p,id,'field_emitter',rev).ok,false);
 p.char.goods[id]=2;const r=p.utilityRev;
 assert.ok(useUtility(g,p,id,'field_emitter',r).ok);assert.equal(conditionOf(p.char,'field_emitter'),100);
 assert.equal(useUtility(g,p,id,'field_emitter',p.utilityRev).ok,false);assert.equal(p.char.goods[id],1);
});
test('utility fabrication previews without mutation, rejects remote, stale, combat and full storage',()=>{
 const {g,p}=setup(),snapshot=JSON.stringify(p.char),rev=p.utilityRev;
 assert.ok(previewRecipe(p.char,id).ok);assert.equal(JSON.stringify(p.char),snapshot);
 place(p,25,25);assert.equal(craftRecipe(g,p,id,rev).ok,false);
 place(p,0,0);p.combatUntil=g.time+1000;assert.equal(craftRecipe(g,p,id,rev).ok,false);p.combatUntil=0;
 assert.equal(craftRecipe(g,p,id,undefined).ok,false);
 p.char.goods[id]=98;assert.equal(craftRecipe(g,p,id,rev).ok,false);assert.deepEqual(p.char.materials,{mire_fibre:2,sentinel_alloy:2});p.char.goods[id]=1;
 assert.ok(craftRecipe(g,p,id,rev).ok);assert.equal(p.char.goods[id],3);
 assert.deepEqual(p.char.materials,{mire_fibre:1,sentinel_alloy:1});assert.equal(craftRecipe(g,p,id,rev).ok,false);
 assert.equal(inventoryView(g.sheet(p),'utility').entries[0].quantity,3);
});
test('vendor uses scoped quote and utility cap without selling utility as junk',()=>{
 const {g,p}=setup(),vendor=g.objects.find(o=>o.type==='quartermaster');place(p,vendor.x,vendor.z+2);assert.ok(openVendor(g,p,vendor.id).ok);
 const request=(op,item,qty)=>({op,id:item,qty,rev:p.vendor.rev,ticket:p.vendor.ticket});
 const row=vendorState(g,p).buy.find(x=>x.id===id);assert.equal(row.price,12);
 const buy=request('buy',id,2);assert.ok(tradeVendor(g,p,buy).ok);assert.equal(p.char.goods[id],3);assert.equal(p.char.credits,36);assert.equal(tradeVendor(g,p,buy).ok,false);
 assert.equal(tradeVendor(g,p,request('sell',id,1)).ok,false);assert.ok(tradeVendor(g,p,request('sell_junk','',1)).ok);assert.equal(p.char.goods[id],3);assert.equal(p.char.credits,40);
 p.char.goods[id]=99;assert.equal(tradeVendor(g,p,request('buy',id,1)).ok,false);assert.equal(p.char.credits,40);
});
test('utility stacks survive existing save hydration',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'attune-kit-')),file=path.join(dir,'characters.json');
 try{const store=new CharacterStore(file),{char,token}=store.create('Kit Tester','vanguard');char.goods={[id]:3};store.markDirty();store.flush();
 assert.deepEqual(new CharacterStore(file).authenticate(token).goods,{[id]:3});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
