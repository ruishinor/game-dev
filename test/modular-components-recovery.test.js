import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame,makeChar,place,enemyOf,isolate } from './helpers.js';
import { dealDamage } from '../server/sim/combat.js';
import { openLoot,takeLoot,lootState } from '../server/sim/loot.js';
import { openVendor,tradeVendor,vendorState } from '../server/sim/vendor.js';
import { craftRecipe,equipItem,unequipSlot } from '../server/sim/progress.js';
import { previewRecipe,previewProduction,productionQuantities,productionTime,RECIPES } from '../shared/crafting.js';
import { beginProduction,tickProduction } from '../server/sim/production.js';
import { effectiveAuto } from '../shared/condition.js';
import { ITEMS } from '../shared/content.js';
import { cataloguePortrait } from '../client/src/catalogue-portraits.js';

test('non-reserved Sentinel part, vendor housing and module fabrication produce the established weapon',()=>{
 const g=makeGame(),enemy=enemyOf(g,'sentinel'),vendor=g.objects.find(o=>o.type==='quartermaster');
 isolate(g,enemy);
 const p=g.addPlayer(makeChar('vanguard',{credits:100,level:4,survey:'ledger_done',brineStage:3,
  attunements:['resonance'],materials:{sentinel_alloy:1,mire_fibre:2,kinetic_coupler:2,resonance_fragment:1}}));
 place(p,vendor.x,vendor.z+2);
 assert.ok(openVendor(g,p,vendor.id).ok);
 assert.ok(vendorState(g,p).buy.some(x=>x.id==='pulse_housing'&&x.price===14));
 const quote={op:'buy',id:'pulse_housing',qty:1,ticket:p.vendor.ticket,rev:p.vendor.rev};
 assert.ok(tradeVendor(g,p,quote).ok);
 assert.equal(p.char.materials.pulse_housing,1);
 assert.equal(p.char.credits,86);
 assert.equal(tradeVendor(g,p,quote).ok,false,'quoted purchase cannot replay');
 assert.equal(tradeVendor(g,p,{...quote,id:'vector_matrix',rev:p.vendor.rev}).ok,false,'special recovery is not sold');

 place(p,enemy.x,enemy.z);
 g.rng=()=>0; // Existing special-Sentinel equipment draw; no new loot roll or disclosed odds.
 dealDamage(g,p,enemy,99999,'test');
 const gen=enemy.lootGeneration;
 assert.ok(lootState(g,p).lootable.some(x=>x.id===enemy.id));
 assert.equal(takeLoot(g,p,enemy.id,gen,'field_vector_array').ok,false,'corpse must be opened first');
 assert.ok(openLoot(g,p,enemy.id,gen).ok);
 assert.ok(lootState(g,p).loot.entries.some(x=>x.id==='field_vector_array'));
 assert.ok(takeLoot(g,p,enemy.id,gen,'field_vector_array').ok);
 assert.equal(takeLoot(g,p,enemy.id,gen,'field_vector_array').ok,false,'claim cannot replay');
 assert.ok(p.char.inventory.includes('field_vector_array'));
 place(p,0,7.5);
 // The server correctly keeps the killer in combat briefly after the kill.
 // Advancing the authoritative clock is required before workshop actions.
 g.time=p.combatUntil+1;
 assert.equal(previewRecipe(p.char,'extract_vector_matrix').ok,true);
 const before=structuredClone(p.char);
 assert.ok(previewProduction(p.char,'extract_vector_matrix',1).ok);
 assert.deepEqual(p.char,before,'preview does not commit parts');
 assert.ok(craftRecipe(g,p,'extract_vector_matrix').ok);
 assert.ok(!p.char.inventory.includes('field_vector_array'),'unique part is explicitly consumed');
 assert.equal(p.char.materials.vector_matrix,1);
 assert.ok(craftRecipe(g,p,'prepare_pulse_cell').ok);
 assert.ok(craftRecipe(g,p,'combine_pulse_module').ok);
 assert.ok(!p.char.materials.vector_matrix&&!p.char.materials.pulse_cell);
 assert.equal(p.char.materials.pulse_module,1);

 place(p,49,-36.5);
 assert.ok(beginProduction(g,p,'assemble_dense_core_modular',1,p.inventoryRev).ok);
 g.productionRoll=()=>99;
 g.time=p.production.until;tickProduction(g,p);
 assert.ok(p.char.inventory.includes('dense_pulse_core'));
 assert.ok(!p.char.materials.pulse_module&&!p.char.materials.pulse_housing);
 assert.equal(craftRecipe(g,p,'assemble_dense_core_modular').ok,false,'cannot recreate unique owned output');
 assert.ok(equipItem(g,p,'dense_pulse_core').ok);
 assert.equal(effectiveAuto(p.char).dmg,ITEMS.dense_pulse_core.auto.dmg);
 assert.deepEqual(RECIPES.longpoint_emitter.inputs,{resonance_fragment:1,sentinel_alloy:4,mire_fibre:2});
});

test('missing, installed and forged parts fail atomically and the original upgrade remains available',()=>{
 const g=makeGame(),p=g.addPlayer(makeChar('vanguard',{materials:{sentinel_alloy:2,mire_fibre:2},inventory:['field_vector_array']}));
 place(p,0,7.5);
 assert.ok(equipItem(g,p,'field_vector_array').ok);
 const materialBefore=structuredClone(p.char.materials);
 const ownedBefore=[...p.char.inventory];
 assert.equal(craftRecipe(g,p,'extract_vector_matrix').ok,false,'cannot destroy equipped device');
 assert.deepEqual(p.char.materials,materialBefore);
 assert.deepEqual(p.char.inventory,ownedBefore);
 assert.ok(unequipSlot(g,p,'device').ok);
 assert.ok(craftRecipe(g,p,'extract_vector_matrix').ok);
 assert.equal(craftRecipe(g,p,'extract_vector_matrix').ok,false,'component extraction cannot be duplicated');
 assert.equal(previewRecipe({...p.char,materials:{vector_matrix:1}},'combine_pulse_module').ok,false);
 assert.equal(previewRecipe({...p.char,materials:{pulse_housing:1,pulse_module:1,kinetic_coupler:2,resonance_fragment:1}},'assemble_dense_core_modular').ok,false,'late recipe still requires progression');
 assert.equal(previewRecipe({...p.char,materials:{__proto__:{vector_matrix:99}}},'combine_pulse_module').ok,false);
 assert.deepEqual(productionQuantities(RECIPES.extract_vector_matrix),[1],'unique donor extraction never advertises impossible batch sizes');
 assert.equal(RECIPES.dense_pulse_core.target,'tuned_emitter');
 assert.equal(RECIPES.assemble_dense_core_modular.output.item,'dense_pulse_core');
 assert.ok(productionTime(RECIPES.assemble_dense_core_modular)>0);
});

test('each recovered component has original, distinct catalogue artwork',()=>{
 const ids=['pulse_housing','vector_matrix','pulse_cell','pulse_module'];
 const art=ids.map(id=>cataloguePortrait(id));
 for(const [i,fragment] of art.entries()){
  assert.ok(fragment?.includes('<path'),ids[i]);
  assert.ok(!/<(?:script|image|foreignObject)|\\bon\\w+=|href\\s*=/i.test(fragment),ids[i]);
 }
 assert.equal(new Set(art).size,ids.length);
});
