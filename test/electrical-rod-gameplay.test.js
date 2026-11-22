import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {makeGame,makeChar,place,isolate} from './helpers.js';
import {CLASSES,ITEMS} from '../shared/content.js';
import {tickPlayerCombat,useAbility} from '../server/sim/combat.js';
import {clearCombatSpot} from './cover-setup.js';
import {openVendor,tradeVendor,vendorState} from '../server/sim/vendor.js';
import {equipItem,unequipSlot,setElectricalRodMode} from '../server/sim/progress.js';
import {weaponAutoProfile,weaponBonus,weaponReach} from '../shared/condition.js';
import {CharacterStore} from '../server/store.js';
const ID='electrical_combat_rod';
test('electrical rod acquisition, class and public presentation are server authoritative',()=>{
 const g=makeGame(),npc=g.objects.find(o=>o.type==='quartermaster'),p=g.addPlayer(makeChar('vanguard',{credits:23}));
 place(p,npc.x,npc.z+2);assert.ok(openVendor(g,p,npc.id).ok);
 const req=(op,id=ID,qty=1)=>({op,id,qty,ticket:p.vendor.ticket,rev:p.vendor.rev});
 const quote=()=>vendorState(g,p).buy.find(row=>row.id===ID),row=()=>g.buildRows().find(row=>row.i===p.id);
 const originalReach=weaponReach(p.char);
 assert.equal(setElectricalRodMode(g,p,'dual').ok,false);
 assert.equal(quote().price,24);assert.equal(quote().max,0);assert.equal(tradeVendor(g,p,req('buy')).ok,false);assert.equal(p.char.credits,23);
 assert.equal(equipItem(g,p,ID).ok,false);assert.equal(row().er,undefined);
 p.char.credits=50;assert.equal(quote().max,1);assert.equal(tradeVendor(g,p,req('buy',ID,2)).ok,false);
 const order=req('buy');assert.ok(tradeVendor(g,p,order).ok);assert.equal(p.char.credits,26);assert.equal(tradeVendor(g,p,order).ok,false);
 assert.equal(tradeVendor(g,p,req('buy')).ok,false);assert.equal(quote().max,0);assert.equal(row().er,undefined);
 assert.ok(equipItem(g,p,ID).ok);assert.equal(row().er,1);assert.equal(weaponBonus(p.char),3);assert.equal(weaponReach(p.char),originalReach);
 assert.equal(setElectricalRodMode(g,p,'bogus').ok,false);
 assert.ok(setElectricalRodMode(g,p,'dual').ok);assert.equal(row().er,2);
 assert.equal(g.sheet(p).electricalRodMode,'dual');assert.equal(weaponBonus(p.char),3);
 assert.ok(setElectricalRodMode(g,p,'dual').ok);assert.equal(row().er,2);
 p.combatUntil=g.time+1000;assert.equal(setElectricalRodMode(g,p,'rod').ok,false);
 p.combatUntil=g.time;assert.ok(setElectricalRodMode(g,p,'rod').ok);assert.equal(row().er,1);
 p.char.condition={[ID]:50};assert.equal(weaponBonus(p.char),1.5);assert.ok(tradeVendor(g,p,req('repair')).ok);assert.equal(weaponBonus(p.char),3);assert.equal(p.char.credits,16);
 assert.ok(unequipSlot(g,p,'weapon').ok);assert.equal(row().er,undefined);assert.equal(weaponBonus(p.char),0);
});
for(const cls of ['symbiotech','surveyor','keeper']){
 test(cls+' can purchase, equip, configure and attack with the universal rod, preserving class abilities',()=>{
  const g=makeGame(),npc=g.objects.find(o=>o.type==='quartermaster'),p=g.addPlayer(makeChar(cls,{credits:50}));
  const row=()=>g.buildRows().find(row=>row.i===p.id);
  const original=weaponAutoProfile(p.char);
  assert.equal(setElectricalRodMode(g,p,'dual').ok,false);
  assert.equal(equipItem(g,p,ID).ok,false);
  place(p,npc.x,npc.z+2);assert.ok(openVendor(g,p,npc.id).ok);
  assert.equal(vendorState(g,p).buy.find(r=>r.id===ID).max,1);
  const order={op:'buy',id:ID,qty:1,ticket:p.vendor.ticket,rev:p.vendor.rev};
  assert.equal(tradeVendor(g,p,order).ok,true);assert.equal(p.char.credits,26);
  assert.equal(tradeVendor(g,p,order).ok,false);
  assert.equal(equipItem(g,p,ID).ok,true);assert.equal(row().er,1);
  assert.equal(weaponAutoProfile(p.char).kind,'melee');
  assert.equal(weaponReach(p.char),3.6);
  assert.equal(setElectricalRodMode(g,p,'dual').ok,true);assert.equal(row().er,2);
  assert.equal(setElectricalRodMode(g,p,'rod').ok,true);assert.equal(row().er,1);
  assert.equal(p.char.cls,cls);
  assert.equal(useAbility(g,p,'rending_arc').ok,false,'foreign class ability unavailable');
  const enemy=g.enemies.find(e=>e.type==='skitter');isolate(g,enemy);
  const far=clearCombatSpot(enemy,7,8);place(p,far.x,far.z);
  p.target=enemy.id;p.autoOn=true;p.nextAuto=0;
  const hp=enemy.hp;tickPlayerCombat(g,p,0);assert.equal(enemy.hp,hp,'rod may not attack from beyond melee range');
  const near=clearCombatSpot(enemy,1.5,1.7);place(p,near.x,near.z);
  tickPlayerCombat(g,p,0);assert.ok(enemy.hp<hp,'authoritative auto-attack dealt damage');
  assert.ok(g.events.some(e=>e.e==='dmg'&&e.ab==='auto'&&e.s===p.id&&e.k==='melee'));
  assert.equal(p.nextAuto,g.time+CLASSES.vanguard.auto.interval);
  assert.equal(setElectricalRodMode(g,p,'dual').ok,false,'combat mode restriction remains');
  p.autoOn=false;p.combatUntil=g.time;
  assert.equal(setElectricalRodMode(g,p,'dual').ok,true);
  p.char.inventory.push('field_emitter');
  assert.equal(equipItem(g,p,'field_emitter').ok,true);assert.equal(row().er,undefined);
  assert.equal(weaponAutoProfile(p.char),original,'swapping restores innate ranged profile');
  assert.equal(setElectricalRodMode(g,p,'rod').ok,false,'stowed or unequipped rod cannot configure');
  assert.equal(equipItem(g,p,ID).ok,true);assert.equal(row().er,2,'configuration retained after swap');
  assert.equal(ITEMS[ID].cls,undefined);
 });
}
test('rod has no class restriction, but existing non-class restrictions remain',()=>{
 const g=makeGame(),p=g.addPlayer(makeChar('keeper',{inventory:['dense_pulse_core','glyph_hinge']}));
 assert.equal(equipItem(g,p,'dense_pulse_core').ok,false);
 assert.equal(equipItem(g,p,'glyph_hinge').ok,false);

});
test('purchased rod persists as ordinary condition-bearing equipment',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'attune-rod-')),file=path.join(dir,'characters.json');
 try{const store=new CharacterStore(file);const tokens=[];
 for(const [index,cls] of Object.keys(CLASSES).entries()){const {char,token}=store.create('Rod Tester '+String.fromCharCode(65+index),cls);char.inventory=[ID];char.equipped.weapon=ID;char.condition={[ID]:70};char.electricalRodMode='dual';tokens.push([token,cls]);}
 store.markDirty();store.flush();const reopened=new CharacterStore(file);
 for(const [token,cls] of tokens){const loaded=reopened.authenticate(token);assert.equal(loaded.cls,cls);assert.equal(loaded.equipped.weapon,ID);assert.equal(loaded.condition[ID],70);assert.equal(loaded.electricalRodMode,'dual');assert.ok(loaded.inventory.includes(ID));}
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
