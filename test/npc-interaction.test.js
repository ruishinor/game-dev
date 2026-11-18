import test from 'node:test';
import assert from 'node:assert/strict';
import {npcAccess,npcProfile,starterFabrication} from '../client/src/npc-interaction.js';
const npc=(x=0,z=0,c='archivist',k='o')=>({meta:{c,k},row:{x,z},pos:{x:999,z:999}});
const self={dead:false};
test('only implemented NPCs advertise their actual capabilities',()=>{
 assert.deepEqual(npcProfile(npc()).services,['talk','codex','workshop']);
 for(const e of [null,npc(0,0,'constructor'),npc(0,0,'survey_signal'),npc(0,0,'archivist','e')])assert.equal(npcProfile(e),null);
});
test('interaction checks authoritative positions, not interpolated render state',()=>{
 assert.equal(npcAccess(npc(),self,{x:0,z:5}),null);
 assert.equal(npcAccess(npc(),self,{x:0,z:5.01}),'Move closer.');
 assert.equal(npcAccess(npc(),{dead:true},{x:0,z:0}),'You are defeated.');
});
test('invalid, stale or absent state fails closed',()=>{
 for(const args of [[null,self,{x:0,z:0}],[npc(),null,{x:0,z:0}],[npc(),self,null],[npc(NaN),self,{x:0,z:0}],[npc(),self,{x:Infinity,z:0}],[npc(),self,{x:0,z:0},-1]])assert.equal(npcAccess(...args),'NPC is unavailable.');
});

test('starter fabrication guidance avoids recommending a duplicate weapon',()=>{
 assert.equal(starterFabrication({inventory:['servo_harness'],equipped:{}}),'field_emitter');
 assert.equal(starterFabrication({inventory:['tuned_emitter'],equipped:{}}),'field_maintenance_kit');
 assert.equal(starterFabrication({inventory:[],equipped:{weapon:'field_emitter'}}),'field_maintenance_kit');
 assert.equal(starterFabrication({inventory:['constructor'],equipped:{}}),'field_emitter');
 assert.equal(starterFabrication(null),'field_emitter');
});
