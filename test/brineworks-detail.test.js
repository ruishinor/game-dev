import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildBrineworksDetail,BRINEWORKS_MODULES,BRINEWORKS_GAUGES} from '../client/src/brineworks-detail.js';

test('Brineworks GLB tabletop mounts and detailed gauges remain decorative',async()=>{
  const paths=[];
  const loader={loadAsync:async url=>{
    paths.push(url);
    const scene=new THREE.Group();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(.7,.5,.35),new THREE.MeshStandardMaterial({color:0x888888,roughness:1})));
    return {scene};
  }};
  const b=buildBrineworksDetail(THREE,loader,()=>0);
  await b.ready;
  assert.deepEqual(paths.sort(),BRINEWORKS_MODULES.map(s=>'/client/art-assets/'+s.file).sort());
  assert.deepEqual(b.stats().modules,{research:'ready',engineering:'ready'});
  assert.equal(b.stats().gauges,2);
  assert.ok(b.stats().detailMeshes>25);
  for(const s of BRINEWORKS_MODULES){
    const holder=b.group.getObjectByName('brineworks:refined-glb:'+s.id);
    assert.ok(holder,'missing mounted '+s.id+' GLB');
    assert.equal(holder.position.x,s.x);
    assert.equal(holder.position.z,s.z-.04);
    holder.traverse(obj=>{if(obj.isMesh){assert.ok(obj.material.isMeshPhysicalMaterial);assert.ok(obj.castShadow);}});
  }
  for(const s of BRINEWORKS_GAUGES)assert.ok(b.group.getObjectByName('brineworks:gauge:'+s.id));
  assert.ok(b.group.children.every(obj=>!obj.userData?.collider));
  b.update(.016,17);
  b.dispose();b.dispose();assert.equal(b.group.parent,null);
});
test('Brineworks keeps base stations if tabletop GLBs are missing',async()=>{
  const b=buildBrineworksDetail(THREE,{loadAsync:()=>Promise.reject(Error('missing'))},()=>0,{reducedMotion:()=>true});
  await b.ready;
  assert.deepEqual(b.stats().modules,{research:'fallback',engineering:'fallback'});
  assert.ok(b.group.getObjectByName('brineworks:worktop:research'));
  b.update(.1,20);b.dispose();
});
test('reduced-detail preference introduces no GLB download or decorative meshes',async()=>{
  const b=buildBrineworksDetail(THREE,{loadAsync:()=>{throw Error('should not be requested')}},()=>0,{enabled:false});
  await b.ready;assert.equal(b.stats().detailMeshes,0);
  assert.deepEqual(b.stats().modules,{});
  b.dispose();
});
