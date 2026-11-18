import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DEEP } from '../shared/world.js';
import { buildDeepServicePipes } from '../client/src/service-pipes.js';
import { createVfx } from '../client/src/vfx/engine.js';
test('service pipework stays inside the wall-side envelope and uses five batches',()=>{
 const model=buildDeepServicePipes(THREE,DEEP),g=model.group;assert.equal(g.children.length,5);let count=0,disposed=0;
 for(const mesh of g.children){const p=mesh.geometry.getAttribute('position');count+=p.count;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);assert.ok(Number.isFinite(x+y+z));assert.ok(Math.abs(x)<=DEEP.hw);assert.ok(y>2.9&&y<DEEP.roofBottom-DEEP.floor);assert.ok(Math.abs(z)>=5.55&&Math.abs(z)<=DEEP.hd);}mesh.geometry.addEventListener('dispose',()=>disposed++);mesh.material.addEventListener('dispose',()=>disposed++);}
 assert.ok(count<80000);model.dispose();model.dispose();assert.equal(disposed,10);
});
test('service network coexists with VFX',()=>{const scene=new THREE.Scene(),model=buildDeepServicePipes(THREE,DEEP);scene.add(model.group);const v=createVfx(THREE,scene,{groundHeight:()=>DEEP.floor});const h=v.area({at:[DEEP.x,DEEP.floor,DEEP.z],radius:1,style:'survey'});assert.ok(h?.alive);v.update(.1);h.dispose();v.dispose();assert.equal(model.group.parent,scene);model.dispose();});
