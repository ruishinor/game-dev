import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createArtEffect,validateFrame } from '../client/src/artfx/common.js';
import { aegisSampler } from '../client/src/artfx/aegis.js';
test('Aegis visual variants finite and bounded, including vertical or sloped anchors',()=>{
 for(const variant of ['base','hinge','span','lattice','relay'])for(const reducedMotion of [false,true])for(const anchor of [[4,0,2],[0,3,0],[2,1,4]]){
  const sample=aegisSampler({variant,anchor,reducedMotion});
  for(const t of [-1,0,.3,1,2.9,3,4])assert.doesNotThrow(()=>validateFrame(sample(t)));
  assert.equal(sample(-1).length,0);assert.equal(sample(3).length,0);assert.ok(sample(1).length>0);
 }
 assert.throws(()=>aegisSampler({variant:'span',anchor:[0,0,0]}));
 assert.throws(()=>aegisSampler({radius:NaN}));
});
test('Aegis renderer reuses and disposes Three resources, including hidden frames',()=>{
 const effect=createArtEffect(THREE,aegisSampler({variant:'base'}));
 effect.update(.2);const n=effect.allocated,meshes=[...effect.group.children];assert.ok(n>0);
 for(let i=0;i<20;i++)effect.update(.2+i*.1);
 assert.equal(effect.allocated,n);assert.deepEqual(effect.group.children,meshes);
 let disposed=0;for(const m of meshes){m.geometry.addEventListener('dispose',()=>disposed++);m.material.addEventListener('dispose',()=>disposed++);}
 effect.update(4);assert.ok(meshes.every(m=>!m.visible));effect.dispose();effect.dispose();assert.equal(disposed,n*2);assert.equal(effect.allocated,0);assert.throws(()=>effect.update(1));
});

test('Aegis field surfaces use shader resources and respect reduced motion',()=>{
 const effect=createArtEffect(THREE,aegisSampler({variant:'span',anchor:[2,0,0],reducedMotion:true}));effect.update(1);const material=effect.group.children.find(m=>m.material.isShaderMaterial).material;assert.equal(material.uniforms.motion.value,0);assert.ok(material.uniforms.alpha.value>0);assert.equal(material.uniforms.extent.value.x,2);const count=effect.allocated;effect.update(1.2);assert.equal(effect.allocated,count);effect.dispose();assert.equal(effect.allocated,0);
});
