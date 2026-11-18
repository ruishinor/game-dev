import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PROPS } from '../shared/world.js';
import { buildStorageCase } from '../client/src/storage-case.js';
import { createVfx } from '../client/src/vfx/engine.js';
test('every cargo case conforms to its existing prop envelope',()=>{
  const props=PROPS.filter(p=>p.type==='crate');assert.ok(props.length>=3);
  for(const p of props){
    const g=buildStorageCase(THREE,p),b=new THREE.Box3().setFromObject(g);
    assert.ok(b.min.y>=-1e-5&&b.min.y<1e-5&&b.max.y<=p.h+1e-5);
    assert.ok(Math.max(Math.abs(b.min.x),Math.abs(b.max.x))<=p.hw+1e-5);
    assert.ok(Math.max(Math.abs(b.min.z),Math.abs(b.max.z))<=p.hd+1e-5);
    assert.equal(g.children.length,4);
    const total=g.children.reduce((n,m)=>n+m.geometry.getAttribute('position').count,0);
    assert.ok(total<4000);
    for(const m of g.children){assert.ok(m.geometry.getAttribute('position').array.every(Number.isFinite));m.geometry.dispose();m.material.dispose();}
  }
});
test('cargo case and survey sigil do not manage one another',()=>{
  const scene=new THREE.Scene(),g=buildStorageCase(THREE,PROPS.find(p=>p.type==='crate'));
  scene.add(g);const v=createVfx(THREE,scene,{groundHeight:()=>0});
  const effect=v.area({at:[2,0,2],radius:2,style:'survey'});
  assert.ok(effect?.alive);v.update(.1);v.dispose();assert.equal(g.parent,scene);
  for(const m of g.children){m.geometry.dispose();m.material.dispose();}
});
