import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, ITEMS } from '../shared/content.js';
import { RECIPES, productionTime } from '../shared/crafting.js';
import { effectiveAuto } from '../shared/condition.js';
import { publicWeaponVisual } from '../shared/weapon-visual.js';
import { makeGame, makeChar, place, isolate, run } from './helpers.js';
import { equipItem, selectWeapon } from '../server/sim/progress.js';
import { beginProduction } from '../server/sim/production.js';
import { openVendor, tradeVendor, vendorState } from '../server/sim/vendor.js';
import { rifleTrace, rifleFamily } from '../client/src/rifle-families.js';

test('rifle families are distinct, universally eligible with requirements and let a rod remain equipped',()=>{
 for(const cls of Object.keys(CLASSES)){
  const g=makeGame(),p=g.addPlayer(makeChar(cls,{level:8,attunements:['resonance'],inventory:['electrical_combat_rod','relay_carbine','bastion_rifle','longpoint_emitter']}));
  // Equipment boosts are not needed for the base carbine; heavy rifle must pass ordinary rules.
  assert.equal(equipItem(g,p,'electrical_combat_rod').ok,true);
  assert.equal(equipItem(g,p,'relay_carbine').ok,true);
  assert.equal(p.char.equipped.weapon,'electrical_combat_rod');
  if(p.char.activeWeapon!=='ranged')assert.equal(selectWeapon(g,p,'ranged').ok,true);
  assert.equal(effectiveAuto(p.char).range,18);assert.equal(effectiveAuto(p.char).interval,480);
  assert.equal(publicWeaponVisual(p.char),'relay-carbine');
  const without={...p.char,inventory:p.char.inventory.filter(i=>i!=='relay_carbine')};
  assert.equal(publicWeaponVisual(without),null);
  g.time+=600;assert.equal(selectWeapon(g,p,'weapon').ok,true);assert.equal(publicWeaponVisual(p.char),'relay-carbine-stowed');
  assert.equal(rifleTrace(publicWeaponVisual(p.char)),null);
  assert.equal(p.char.cls,cls);
 }
 assert.equal(rifleFamily('unknown-stowed'),null);
 assert.notEqual(rifleTrace('relay-carbine').color,rifleTrace('bastion-rifle').color);
 assert.ok(ITEMS.relay_carbine.auto.interval<ITEMS.field_emitter.auto.interval);
 assert.ok(ITEMS.bastion_rifle.auto.dmg>ITEMS.dense_pulse_core.auto.dmg);
});
test('ordinary purchase of carbine preserves credits, uniqueness and stale quote protection',()=>{
 const g=makeGame(),p=g.addPlayer(makeChar('keeper',{credits:50}));
 const npc=g.objects.find(o=>o.type==='quartermaster');place(p,npc.x,npc.z+2);
 assert.ok(openVendor(g,p,npc.id).ok);
 const q=vendorState(g,p).buy.find(x=>x.id==='relay_carbine');assert.equal(q.max,1);
 const msg={op:'buy',id:'relay_carbine',qty:1,ticket:p.vendor.ticket,rev:p.vendor.rev};
 assert.equal(tradeVendor(g,p,msg).ok,true);assert.equal(p.char.credits,50-q.price);
 assert.equal(tradeVendor(g,p,msg).ok,false);
 assert.equal(vendorState(g,p).buy.find(x=>x.id==='relay_carbine').max,0);
 assert.equal(equipItem(g,p,'relay_carbine').ok,true);
});
test('independent rifle assembly consumes materials, never a prior emitter, and honors station requirements',()=>{
 for(const id of ['relay_carbine','bastion_rifle']){
  const g=makeGame();isolate(g,null);
  const p=g.addPlayer(makeChar('vanguard',{level:4,brineStage:3,survey:'ledger_done',attunements:['resonance'],inventory:['tuned_emitter'],materials:{...RECIPES[id].inputs}}));
  if(id==='bastion_rifle'){
   assert.equal(beginProduction(g,p,id,1,p.inventoryRev).ok,false);
   place(p,49,-36.5);
  }
  assert.equal(beginProduction(g,p,id,1,p.inventoryRev).ok,true,id);
  run(g,productionTime(RECIPES[id])+100);
  assert.ok(p.char.inventory.includes(id));assert.ok(p.char.inventory.includes('tuned_emitter'));
  assert.deepEqual(p.char.materials,{});
  assert.equal(beginProduction(g,p,id,1,p.inventoryRev).ok,false);
  assert.equal(equipItem(g,p,id).ok,true);
  assert.equal(effectiveAuto(p.char).weapon,id);
 }
 const g=makeGame(),p=g.addPlayer(makeChar('keeper',{inventory:['bastion_rifle']}));
 assert.equal(equipItem(g,p,'bastion_rifle').ok,false);
});
