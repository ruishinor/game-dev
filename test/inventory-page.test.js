import test from 'node:test';
import assert from 'node:assert/strict';
import {inventoryPage,INVENTORY_PAGE_SIZE} from '../client/src/inventory-page.js';
test('inventory pagination never loses carried stacks and clamps stale page preferences',()=>{
 const items=Array.from({length:63},(_,id)=>({id,quantity:id+1}));
 const first=inventoryPage(items);assert.equal(first.entries.length,17);assert.equal(first.pages,4);
 const seen=Array.from({length:first.pages},(_,page)=>inventoryPage(items,page).entries).flat();
 assert.deepEqual(seen,items);
 assert.equal(inventoryPage(items,999).page,3);assert.equal(inventoryPage(items,-20).page,0);
 assert.equal(inventoryPage(items,NaN).page,0);assert.equal(inventoryPage([],9).pages,1);
 assert.equal(INVENTORY_PAGE_SIZE,17);
});