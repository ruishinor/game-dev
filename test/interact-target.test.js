import test from 'node:test';
import assert from 'node:assert/strict';
import {nearestInteractable} from '../client/src/interact-target.js';
const ent=(id,k,x,z,dead=false)=>({id,meta:{k},row:{x,z},pos:{x:100,z:100},dead});
test('interaction uses latest authoritative position and personal loot, not stale rendered position',()=>{
 const self=ent(1,'p',0,8),corpse=ent(2,'e',0,8.5,true),unowned=ent(3,'e',0,8,true),npc=ent(4,'o',1,8);
 const map=new Map([self,corpse,unowned,npc].map(e=>[e.id,e]));
 assert.equal(nearestInteractable(map,1,{x:0,z:8,lootable:[{id:2}]}),corpse);
 assert.equal(nearestInteractable(map,1,{x:0,z:8,lootable:[]}),npc);
 corpse.dead=false;
 assert.equal(nearestInteractable(map,1,{x:0,z:8,lootable:[{id:2}]}),npc);
});
test('interaction includes the range boundary, ignores missing rows, and rejects defeated players',()=>{
 const self=ent(1,'p',0,0),obj=ent(2,'o',5,0),missing={id:3,meta:{k:'o'},pos:{x:0,z:0}};
 const map=new Map([self,obj,missing].map(e=>[e.id,e]));
 assert.equal(nearestInteractable(map,1,{x:0,z:0}),obj);
 assert.equal(nearestInteractable(map,1,{x:-.01,z:0}),null);
 self.dead=true;
 assert.equal(nearestInteractable(map,1,{x:0,z:0}),null);
});
