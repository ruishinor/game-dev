import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {previewRecipe,missingRecipeKnowledge,RECIPES} from '../shared/crafting.js';
import {blueprintDrop,itemDrops} from '../server/sim/loot-tables.js';
import {distributeCorpseLoot,openLoot,takeLoot,lootState} from '../server/sim/loot.js';
import {equipItem,unequipSlot,craftRecipe} from '../server/sim/progress.js';
import {makeChar,makeGame,place,enemyOf,isolate} from './helpers.js';
import {dealDamage} from '../server/sim/combat.js';
import {CharacterStore} from '../server/store.js';
import {inventoryView} from '../client/src/inventory-view.js';
test('chest equipment is independent, owned and persisted; blueprints gate direct crafting',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'attune-chest-'));
 try{
 const file=path.join(dir,'chars.json'),store=new CharacterStore(file),{char,token}=store.create('Chest Tester','vanguard');
 char.materials={mire_fibre:9,sentinel_alloy:9};char.inventory=['servo_harness'];
 const g=makeGame(),p=g.addPlayer(char);const npc=g.objects.find(o=>o.type==='quartermaster');place(p,npc.x,npc.z+2);
 assert.ok(equipItem(g,p,'servo_harness').ok);const hp=p.maxHp;
 assert.ok(craftRecipe(g,p,'field_chest').ok);
 assert.ok(inventoryView(g.sheet(p),'device').entries.some(e=>e.id==='field_chest'));
 assert.ok(equipItem(g,p,'field_chest').ok);assert.equal(p.maxHp,hp+10);assert.equal(char.equipped.device,'servo_harness');
 assert.equal(craftRecipe(g,p,'reinforced_chest').ok,false);assert.ok(unequipSlot(g,p,'chest').ok);
 assert.equal(previewRecipe(char,'reinforced_chest').ok,false);assert.ok(missingRecipeKnowledge(char,RECIPES.reinforced_chest));
 char.goods={blueprint_relay_vest:1};assert.ok(craftRecipe(g,p,'reinforced_chest').ok);
 assert.equal(char.goods.blueprint_relay_vest,1);assert.ok(!char.inventory.includes('field_chest'));
 assert.ok(equipItem(g,p,'reinforced_chest').ok);assert.equal(p.maxHp,hp+18);assert.equal(equipItem(g,p,'resonant_chest').ok,false);
 g.removePlayer(p.id);store.markDirty();store.flush();
 const restored=new CharacterStore(file).authenticate(token);assert.equal(restored.equipped.chest,'reinforced_chest');assert.equal(restored.goods.blueprint_relay_vest,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('equipment is not guaranteed and blueprint knowledge is personal, one-time and non-rerollable',()=>{
 assert.ok(itemDrops('warden').every(d=>d.chance>0&&d.chance<1));
 assert.equal(blueprintDrop('sentinel',()=>0),'blueprint_relay_vest');assert.equal(blueprintDrop('warden',()=>0),'blueprint_resonant_vest');assert.equal(blueprintDrop('warden',()=>.02),null);assert.equal(blueprintDrop('sentinel',()=>.02),'blueprint_relay_vest');
 const g=makeGame(),e=enemyOf(g,'sentinel');isolate(g,e);
 const p=g.addPlayer(makeChar('vanguard')),other=g.addPlayer(makeChar('keeper'));
 place(p,e.x,e.z);place(other,e.x,e.z);g.rng=()=>.999;g.blueprintRng=()=>0;
 dealDamage(g,p,e,99999,'test');const gen=e.lootGeneration;assert.ok(openLoot(g,p,e.id,gen).ok);
 assert.ok(!lootState(g,p).loot.entries.some(x=>x.kind==='item'));assert.ok(lootState(g,p).loot.entries.some(x=>x.id==='blueprint_relay_vest'));
 assert.equal(openLoot(g,other,e.id,gen).ok,false);assert.ok(takeLoot(g,p,e.id,gen,'blueprint_relay_vest').ok);
 assert.equal(takeLoot(g,p,e.id,gen,'blueprint_relay_vest').ok,false);distributeCorpseLoot(g,e,[p.id]);
 assert.equal(p.char.goods.blueprint_relay_vest,1);assert.equal(other.char.goods?.blueprint_relay_vest,undefined);
});
