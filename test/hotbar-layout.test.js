import test from 'node:test';
import assert from 'node:assert/strict';
import {HOTBAR_SIZE,COMPANION_ACTION,companionIndex,defaultHotbar,normalizeHotbar,editHotbar,loadHotbar,storeHotbar} from '../client/src/hotbar-layout.js';
const abilities=['arc','tether','barrier','survey'];
const ownerA='12345678-1234-4234-8234-123456789abc';
const ownerB='22345678-1234-4234-8234-123456789abc';
function storage(){const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};}
test('companion action stays fixed while learned abilities can swap across 9 slots',()=>{
 const start=defaultHotbar(abilities);
 assert.equal(start.length,HOTBAR_SIZE);
 assert.equal(companionIndex(abilities),4);
 assert.equal(start[4],COMPANION_ACTION);
 const moved=editHotbar(abilities,start,{type:'move',from:0,to:1});
 assert.equal(moved.ok,true);
 assert.equal(moved.layout[0],'tether');assert.equal(moved.layout[1],'arc');
 assert.deepEqual(editHotbar(abilities,start,{type:'move',from:0,to:4}),{ok:false,layout:start});
});
test('removed abilities remain learned, recoverable, and cannot silently displace assignments',()=>{
 const start=defaultHotbar(abilities);
 const out=editHotbar(abilities,start,{type:'remove',from:2});
 assert.equal(out.ok,true);assert.equal(out.layout[2],null);
 assert.ok(abilities.includes('barrier'));
 const back=editHotbar(abilities,out.layout,{type:'assign',id:'barrier',to:0});
 assert.equal(back.ok,true);
 assert.equal(back.layout[0],'barrier');assert.equal(back.layout[2],'arc');
 assert.equal(back.layout.filter(x=>x==='arc').length,1);
});
test('cancelled or invalid edits change nothing',()=>{
 const start=defaultHotbar(abilities);
 for(const change of [{type:'cancel'},{type:'remove',from:4},{type:'move',from:88,to:2},{type:'assign',id:'unknown',to:6}]){
  const next=editHotbar(abilities,start,change);
  assert.equal(next.ok,false);assert.deepEqual(next.layout,start);
 }
});
test('malformed persistence cannot inject unknown abilities, duplicates or move companion',()=>{
 const altered=['fake','arc','arc','tether','barrier','survey',null,null,null];
 const normalized=normalizeHotbar(abilities,altered);
 assert.equal(normalized[0],null);
 assert.equal(normalized[2],null);
 assert.equal(normalized[4],COMPANION_ACTION);
 assert.equal(normalized.includes('fake'),false);
});
test('character-specific assignments survive refresh and do not leak across characters',()=>{
 const s=storage();
 const configured=editHotbar(abilities,defaultHotbar(abilities),{type:'move',from:0,to:8}).layout;
 assert.equal(storeHotbar(s,ownerA,abilities,configured),true);
 assert.deepEqual(loadHotbar(s,ownerA,abilities),configured);
 assert.deepEqual(loadHotbar(s,ownerB,abilities),defaultHotbar(abilities));
 assert.equal(storeHotbar(s,'invalid',abilities,configured),false);
});
