import test from 'node:test';
import assert from 'node:assert/strict';
import {inventoryView} from '../client/src/inventory-view.js';
import {inventoryPage,INVENTORY_PAGE_SIZE} from '../client/src/inventory-blueprint-page.js';

test('blueprint bag groups gear and provides a nine by eight paged grid',()=>{
 const s={inventory:['electrical_combat_rod','longpoint_emitter','field_chest'],
   equipped:{weapon:'electrical_combat_rod',ranged:null,chest:null},materials:{},goods:{}};
 const gear=inventoryView(s,'gear');
 assert.deepEqual(gear.entries.map(e=>e.id).sort(),['field_chest','longpoint_emitter']);
 assert.equal(INVENTORY_PAGE_SIZE,72);
 const stacks=Array.from({length:100},(_,id)=>({id}));
 const first=inventoryPage(stacks,0),second=inventoryPage(stacks,1);
 assert.equal(first.entries.length,72);
 assert.equal(second.entries.length,28);
 assert.deepEqual([...first.entries,...second.entries],stacks);
 assert.equal(inventoryPage(stacks,999).page,1);
 assert.equal(inventoryPage([],0).pages,1);
});
