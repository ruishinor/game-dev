import test from 'node:test';
import assert from 'node:assert/strict';
import {inventoryView} from '../client/src/inventory-view.js';
import {inventoryPage,INVENTORY_PAGE_SIZE,MAX_VISIBLE_VACANCIES,visibleVacancies} from '../client/src/inventory-blueprint-page.js';

test('compact bag keeps nine-column paging without unused theoretical capacity',()=>{
 const s={inventory:['electrical_combat_rod','longpoint_emitter','field_chest'],
   equipped:{weapon:'electrical_combat_rod',ranged:null,chest:null},materials:{},goods:{}};
 const gear=inventoryView(s,'gear');
 assert.deepEqual(gear.entries.map(e=>e.id).sort(),['field_chest','longpoint_emitter']);
 assert.equal(INVENTORY_PAGE_SIZE,36);
 const stacks=Array.from({length:100},(_,id)=>({id}));
 const first=inventoryPage(stacks,0),second=inventoryPage(stacks,1),third=inventoryPage(stacks,2);
 assert.equal(first.entries.length,36);
 assert.equal(second.entries.length,36);
 assert.equal(third.entries.length,28);
 assert.deepEqual([...first.entries,...second.entries,...third.entries],stacks);
 assert.equal(inventoryPage(stacks,999).page,2);
 assert.equal(inventoryPage([],0).pages,1);
 assert.equal(MAX_VISIBLE_VACANCIES,5);
 for(const [used,expected] of [[0,5],[1,5],[20,5],[30,5],[31,5],[32,4],[35,1],[36,0],[100,0]]){
   assert.equal(visibleVacancies(used),expected,'vacancies with '+used+' items');
 }
});
