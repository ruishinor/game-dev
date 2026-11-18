import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PROPS } from '../shared/world.js';
import { buildPressurePlant } from '../client/src/pressure-plant.js';
import { createVfx } from '../client/src/vfx/engine.js';
test('pressure plant fits the existing collider and uses bounded material batches',()=>{
  const p=PROPS.find(p=>p.type==='survey_pump');assert.ok(p);
  const g=buildPressurePlant(THREE,p),b=new THREE.Box3().setFromObject(g);
  assert.ok(b.min.y>=-1e-5&&b.min.y<1e-5&&b.max.y<=p.h+1e-5);
  assert.ok(Math.max(Math.abs(b.min.x),Math.abs(b.max.x))<=p.hw+1e-5);
  assert.ok(Math.max(Math.abs(b.min.z),Math.abs(b.max.z))<=p.hd+1e-5);
  assert.equal(g.children.length,6);
  let vertices=0;
  for(const m of g.children){const pos=m.geometry.getAttribute('position');vertices+=pos.count;assert.ok(pos.array.every(Number.isFinite));}
  assert.ok(vertices<22000,vertices);
  const scene=new THREE.Scene();scene.add(g);
  const v=createVfx(THREE,scene,{groundHeight:()=>0});
  const area=v.area({at:[3,0,2],radius:2,style:'survey'});assert.ok(area?.alive);
  v.update(.1);v.dispose();assert.equal(g.parent,scene);
  for(const m of g.children){m.geometry.dispose();m.material.dispose();}
});
