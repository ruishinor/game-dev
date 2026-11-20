import test from 'node:test';import assert from 'node:assert/strict';
import {ITEMS,CLASSES,AUTO_REFERENCE_MS} from '../shared/content.js';
import {conditionOf,sanitizeCondition,weaponBonus} from '../shared/condition.js';
import {dealDamage,tickPlayerCombat} from '../server/sim/combat.js';
import {equipItem,unequipSlot,craftRecipe} from '../server/sim/progress.js';
import {openVendor,tradeVendor,vendorState} from '../server/sim/vendor.js';
import {makeGame,makeChar,place,enemyOf,isolate} from './helpers.js';
import {CharacterStore} from '../server/store.js';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
test('condition is bounded, owned, opt-in, and alters only added weapon damage',()=>{
 const c=makeChar('vanguard',{inventory:['field_emitter','servo_harness'],equipped:{ranged:'field_emitter'},condition:{field_emitter:40,servo_harness:1,tuned_emitter:10}});
 assert.deepEqual(sanitizeCondition(c.condition,c.inventory),{field_emitter:40});
 assert.equal(conditionOf(c,'servo_harness'),null);assert.equal(conditionOf(c,'constructor'),null);
 assert.equal(weaponBonus(c),.8);c.condition.field_emitter=0;assert.equal(weaponBonus(c),0);
 c.condition.field_emitter=-1;assert.equal(conditionOf(c,'field_emitter'),100);
 for(const cls of Object.keys(CLASSES))assert.equal(weaponBonus(makeChar(cls)),0);
});
test('starter weapon acquisition, equipment, defeat wear, paid repair and QL upgrade are authoritative',()=>{
 const g=makeGame(),p=g.addPlayer(makeChar('vanguard',{credits:50,materials:{mire_fibre:2,sentinel_alloy:3}}));
 const npc=g.objects.find(o=>o.type==='quartermaster');place(p,npc.x,npc.z+2);assert.ok(openVendor(g,p,npc.id).ok);
 const req=(op,id,qty=1)=>({op,id,qty,ticket:p.vendor.ticket,rev:p.vendor.rev});
 const order=req('buy','field_emitter');assert.ok(tradeVendor(g,p,order).ok);assert.equal(p.char.credits,38);assert.equal(tradeVendor(g,p,order).ok,false);
 assert.equal(tradeVendor(g,p,req('buy','field_emitter')).ok,false);assert.ok(equipItem(g,p,'field_emitter').ok);
 assert.equal(craftRecipe(g,p,'tune_emitter').ok,false);
 const e=enemyOf(g,'skitter');isolate(g,e);place(p,e.x+1,e.z);dealDamage(g,e,p,99999,'test');assert.ok(p.dead);assert.equal(conditionOf(p.char,'field_emitter'),90);
 dealDamage(g,e,p,99999,'test');assert.equal(conditionOf(p.char,'field_emitter'),90);
 g.time+=4000;assert.ok(g.respawn(p));place(p,npc.x,npc.z+2);assert.ok(openVendor(g,p,npc.id).ok);
 assert.equal(vendorState(g,p).repair[0].price,2);
 const repair=req('repair','field_emitter');assert.ok(tradeVendor(g,p,repair).ok);assert.equal(p.char.credits,36);assert.equal(conditionOf(p.char,'field_emitter'),100);assert.equal(tradeVendor(g,p,repair).ok,false);
 assert.equal(tradeVendor(g,p,req('repair','field_emitter')).ok,false);
 assert.equal(tradeVendor(g,p,req('repair','wardstone_shard')).ok,false);
 const station=g.objects.find(o=>o.type==='sanctum_fabricator');place(p,station.x,station.z+2);assert.ok(unequipSlot(g,p,'ranged').ok);assert.ok(craftRecipe(g,p,'tune_emitter').ok);
 assert.ok(!p.char.inventory.includes('field_emitter'));assert.ok(p.char.inventory.includes('tuned_emitter'));assert.equal(ITEMS.tuned_emitter.ql,3);
 assert.ok(equipItem(g,p,'tuned_emitter').ok);assert.equal(weaponBonus(p.char),4);
});
test('base auto-attacks are preserved; equipped weapon adds only its condition-scaled damage',()=>{
 // A bolt class keeps its own class attack; the emitter adds only its bonus.
 const g=makeGame(),p=g.addPlayer(makeChar('surveyor',{inventory:['field_emitter'],equipped:{device:null,implant:null,glyph:null,ranged:'field_emitter'},condition:{field_emitter:50}}));
 const e=enemyOf(g,'skitter');isolate(g,e);place(p,e.x+1,e.z);p.target=e.id;p.autoOn=true;
 const before=e.hp;tickPlayerCombat(g,p,0);assert.equal(before-e.hp,Math.round((CLASSES.surveyor.auto.dmg+1*CLASSES.surveyor.auto.interval/AUTO_REFERENCE_MS)*p.stats.power*p.stats.dmgMul));
 assert.equal(g.events.find(x=>x.e==='dmg'&&x.s===p.id).k,'bolt');
 // Unarmed Vanguard keeps the unchanged class melee attack.
 const g2=makeGame(),v=g2.addPlayer(makeChar('vanguard'));
 const e2=enemyOf(g2,'skitter');isolate(g2,e2);place(v,e2.x+1,e2.z);v.target=e2.id;v.autoOn=true;
 const hp2=e2.hp;tickPlayerCombat(g2,v,0);assert.equal(hp2-e2.hp,Math.round(CLASSES.vanguard.auto.dmg*v.stats.power*v.stats.dmgMul));
 assert.equal(g2.events.find(x=>x.e==='dmg'&&x.s===v.id).k,'melee');
});
test('save hydration preserves valid weapon and condition, old loadout is unchanged',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'attune-weapon-')),file=path.join(dir,'characters.json');
 try{const store=new CharacterStore(file),{char,token}=store.create('Weapon Tester','vanguard');
  assert.deepEqual(char.equipped,{device:null,implant:null,glyph:null});char.inventory=['field_emitter'];char.equipped.weapon='field_emitter';char.condition={field_emitter:30};store.markDirty();store.flush();
  // A legacy single-slot save migrates the emitter to the ranged slot.
  const saved=new CharacterStore(file).authenticate(token);assert.equal(saved.equipped.ranged,'field_emitter');assert.equal(saved.equipped.weapon,undefined);assert.deepEqual(saved.condition,{field_emitter:30});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
