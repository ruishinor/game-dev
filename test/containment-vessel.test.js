import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PROPS } from '../shared/world.js';
import { buildContainmentVessel } from '../client/src/containment-vessel.js';

test('Kestrel containment models preserve the collision envelope and have bounded geometry',()=>{
  const vessels=PROPS.filter(p=>p.type==='deep_vessel');
  assert.equal(vessels.length,2);
  for(const p of vessels){
    const g=buildContainmentVessel(THREE,p);g.updateMatrixWorld(true);
    assert.equal(g.name,'kestrel:vessel:'+p.seed);
    let windows=0,meshes=0,vertices=0;
    g.traverse(n=>{
      if(!n.isMesh)return;
      meshes++;
      if(n.name==='containment-window'){windows++;assert.equal(n.material.transparent,true);assert.equal(n.material.depthWrite,false);}
      const attr=n.geometry.getAttribute('position'),v=new THREE.Vector3();
      vertices+=attr.count;
      for(let i=0;i<attr.count;i++){
        v.fromBufferAttribute(attr,i).applyMatrix4(n.matrixWorld);
        assert.ok([v.x,v.y,v.z].every(Number.isFinite));
        assert.ok(Math.hypot(v.x,v.z)<=p.r+1e-5,'outside cylinder');
        assert.ok(v.y>=-1e-5&&v.y<=p.h+1e-5,'outside height');
      }
    });
    assert.equal(windows,2);
    assert.ok(meshes<=8&&vertices<50000);
  }
});
