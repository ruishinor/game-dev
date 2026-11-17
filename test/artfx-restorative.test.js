import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { restorativeSampler } from '../client/src/artfx/restorative.js';
import { createArtEffect,validateFrame,linkPoint } from '../client/src/artfx/common.js';
test('restoration and link samples are bounded and deterministic',()=>{
 for(const variant of ['restore','bond','transfer','stabilize'])for(const target of [[2,0,0],[0,2,0],[-2,1,4]])for(const reducedMotion of [false,true]){
  const s=restorativeSampler({variant,target,reducedMotion});for(const t of [-1,0,.22,1,2.19,2.2,3]){assert.doesNotThrow(()=>validateFrame(s(t)));assert.deepEqual(s(t),s(t));}
  assert.equal(s(2.2).length,0);assert.ok(s(1).length);
 }
 assert.throws(()=>restorativeSampler({variant:'bond',target:[0,0,0]}));
 assert.throws(()=>restorativeSampler({target:[Infinity,0,0]}));
});
test('restorative renderer hides and disposes expired effects',()=>{
 for(const variant of ['restore','bond','transfer','stabilize']){const e=createArtEffect(THREE,restorativeSampler({variant}));e.update(.3);const n=e.allocated;for(let i=1;i<=20;i++)e.update(i/10);assert.equal(e.allocated,n);e.update(3);assert.ok(e.group.children.every(m=>!m.visible));e.dispose();assert.equal(e.group.children.length,0);}
});

test('reciprocal links, directed transfers and reduced motion use bounded curve geometry',()=>{
 for(const target of [[2,0,0],[0,2,0],[-2,1,4]])for(const reducedMotion of [false,true]){
  const b=restorativeSampler({variant:'bond',target,reducedMotion})(1),t=restorativeSampler({variant:'transfer',target,reducedMotion})(1);
  assert.equal(b.filter(x=>x.type==='linkCurve').length,2);assert.equal(t.filter(x=>x.type==='linkCurve').length,1);
  for(const q of b.filter(x=>x.type==='linkCurve')){assert.deepEqual(linkPoint(q.a,q.b,q.bend,0),q.a);assert.deepEqual(linkPoint(q.a,q.b,q.bend,1),q.b);}
  if(reducedMotion){const q=b.find(x=>x.id==='link0');assert.deepEqual(b.find(x=>x.id==='signal0_0').at,linkPoint(q.a,q.b,q.bend,.5));}
 }
 const e=createArtEffect(THREE,restorativeSampler({variant:'bond'}));e.update(.3);
 const tubes=e.group.children.filter(x=>x.geometry.type==='TubeGeometry');assert.equal(tubes.length,2);
 const n=e.allocated;e.update(1);assert.equal(e.allocated,n);e.dispose();
});
