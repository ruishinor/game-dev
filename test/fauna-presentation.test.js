import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {enemyTargetStatus} from '../client/src/target-status.js';
import {faunaImpactSampler} from '../client/src/artfx/fauna.js';
import {createArtEffect,validateFrame} from '../client/src/artfx/common.js';

test('defeated and retreating wildlife are never labelled neutral',()=>{
 const meta={neu:1};
 for(const row of [{f:1,h:0},{f:0,h:0},{f:9,h:0}])assert.match(enemyTargetStatus(meta,row).label,/Defeated/);
 assert.match(enemyTargetStatus(meta,{f:0,h:45},true).label,/Defeated/);
 assert.equal(enemyTargetStatus(meta,{f:2,h:45}).label,'Retreating');
 assert.equal(enemyTargetStatus(meta,{f:0,h:45}).tone,'neutral');
 assert.equal(enemyTargetStatus(meta,{f:8,h:45}).tone,'hostile');
});
test('fauna VFX samples stay bounded, deterministic and accessible',()=>{
 for(const variant of ['contact','shear','wild'])for(const direction of [[0,1,0],[1,0,1],[0,0,-1]])for(const reducedMotion of [true,false]){
  const sample=faunaImpactSampler({variant,direction,reducedMotion});
  for(const t of [0,.01,.1,.3,.47,.48]){
   const f=validateFrame(sample(t));assert.deepEqual(f,sample(t));assert.ok(f.length<8);
   if(reducedMotion)assert.ok(f.every(o=>o.type==='ring'));
  }
  const e=createArtEffect(THREE,sample);e.update(.12);const n=e.allocated;e.update(.24);assert.equal(e.allocated,n);e.update(.48);assert.ok(e.group.children.every(x=>!x.visible));e.dispose();assert.equal(e.allocated,0);
 }
});
