import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildSurveyTerminal } from '../client/src/survey-terminal.js';
import { createVfx } from '../client/src/vfx/engine.js';

test('Brineworks terminals fit the existing footprint and own bounded resources',()=>{
  for(const ledger of [false,true]){
    const m=buildSurveyTerminal(THREE,ledger);
    assert.equal(m.height,ledger?1.65:2);
    assert.equal(m.radius,.8);
    const box=new THREE.Box3().setFromObject(m.group);
    assert.ok(box.min.y>=-1e-5&&box.min.y<1e-5&&box.max.y<=m.height+1e-5);
    assert.ok(box.min.x>=-.7-1e-5&&box.max.x<=.7+1e-5);
    assert.ok(box.min.z>=-.50-1e-5&&box.max.z<=.50+1e-5);
    assert.equal(m.group.children.length,5);
    let vertices=0,disposed=0;
    for(const mesh of m.group.children){
      const pos=mesh.geometry.getAttribute('position');
      vertices+=pos.count;
      assert.ok(pos.array.every(Number.isFinite));
      mesh.geometry.addEventListener('dispose',()=>disposed++);
      mesh.material.addEventListener('dispose',()=>disposed++);
    }
    assert.ok(vertices<16000);
    m.dispose();m.dispose();assert.equal(disposed,10);
  }
});
test('terminal and deployed-style VFX can coexist without owning each other',()=>{
  const scene=new THREE.Scene(), model=buildSurveyTerminal(THREE,false);
  scene.add(model.group);
  const v=createVfx(THREE,scene,{groundHeight:()=>0});
  const handle=v.area({at:[2,0,0],radius:2,style:'survey'});
  assert.ok(handle?.alive);
  v.update(.1);handle.dispose();v.dispose();
  assert.equal(model.group.parent,scene);model.dispose();
});
