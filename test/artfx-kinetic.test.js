import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { kineticSampler } from '../client/src/artfx/kinetic.js';
import { createArtEffect,validateFrame } from '../client/src/artfx/common.js';
test('kinetic/resonance variants finite, deterministic and respect reduced motion',()=>{
 for(const variant of ['charge','impact','resonance','survey'])for(const direction of [[0,1,0],[2,0,-1],[0,0,1]])for(const reducedMotion of [true,false])for(const charge of [0,1]){
  const s=kineticSampler({variant,direction,reducedMotion,charge});
  for(const t of [-.1,0,.12,.7,1.39,1.4,2]){assert.doesNotThrow(()=>validateFrame(s(t)));assert.deepEqual(s(t),s(t));}
  assert.equal(s(1.4).length,0);assert.ok(s(.7).length);
 }
 assert.throws(()=>kineticSampler({direction:[0,0,0]}));assert.throws(()=>kineticSampler({charge:1.01}));
});
test('kinetic effects allocate stable Three objects and dispose',()=>{
 for(const variant of ['charge','impact','resonance','survey']){
  const f=createArtEffect(THREE,kineticSampler({variant}));f.update(.1);const count=f.allocated;
  for(let i=1;i<14;i++)f.update(i/10);assert.equal(f.allocated,count);f.update(3);assert.ok(f.group.children.every(x=>!x.visible));f.dispose();assert.equal(f.allocated,0);
 }
});

test('kinetic presentation geometry has stable visual markers and bounded pool',()=>{
 for(const variant of ['charge','impact','resonance','survey'])for(const reducedMotion of [true,false]){const s=kineticSampler({variant,reducedMotion});const a=s(.2),b=s(.8);assert.deepEqual(a.map(x=>x.id),b.map(x=>x.id));assert.ok(a.length<=16);}
 const normal=kineticSampler({variant:'survey'})(.6),reduced=kineticSampler({variant:'survey',reducedMotion:true})(.6);assert.ok(normal.some(x=>x.id==='slice'));assert.ok(!reduced.some(x=>x.id==='slice'));
});
