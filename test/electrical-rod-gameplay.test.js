import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {makeGame,makeChar,place} from './helpers.js';
import {openVendor,tradeVendor,vendorState} from '../server/sim/vendor.js';
import {equipItem,unequipSlot,setElectricalRodMode} from '../server/sim/progress.js';
import {weaponBonus,weaponReach} from '../shared/condition.js';
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
 const other=g.addPlayer(makeChar('surveyor',{credits:50}));place(other,npc.x,npc.z+2);assert.ok(openVendor(g,other,npc.id).ok);
 // The rod is no longer class-locked: any class can buy, equip and configure it.
 assert.equal(vendorState(g,other).buy.find(row=>row.id===ID).max,1);
 assert.ok(tradeVendor(g,other,{op:'buy',id:ID,qty:1,ticket:other.vendor.ticket,rev:other.vendor.rev}).ok);assert.equal(other.char.credits,26);
 assert.ok(equipItem(g,other,ID).ok);assert.equal(g.buildRows().find(r=>r.i===other.id).er,1);assert.ok(setElectricalRodMode(g,other,'dual').ok);
 // A unique weapon cannot be bought twice.
 assert.equal(tradeVendor(g,other,{op:'buy',id:ID,qty:1,ticket:other.vendor.ticket,rev:other.vendor.rev}).ok,false);assert.equal(other.char.credits,26);
});
test('purchased rod persists as ordinary condition-bearing equipment',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'attune-rod-')),file=path.join(dir,'characters.json');
 try{const store=new CharacterStore(file),{char,token}=store.create('Rod Tester','vanguard');char.inventory=[ID];char.equipped.weapon=ID;char.condition={[ID]:70};char.electricalRodMode='dual';store.markDirty();store.flush();
 const loaded=new CharacterStore(file).authenticate(token);assert.equal(loaded.equipped.weapon,ID);assert.equal(loaded.condition[ID],70);assert.equal(loaded.electricalRodMode,'dual');assert.ok(loaded.inventory.includes(ID));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
