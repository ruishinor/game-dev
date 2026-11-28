import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildBrineworksDetail,BRINEWORKS_MODULES,BRINEWORKS_GAUGES} from '../client/src/brineworks-detail.js';

test('Brineworks GLB tabletop mounts and detailed gauges remain decorative',async()=>{
  const paths=[];
  const loader={loadAsync:async url=>{
    paths.push(url);
    const scene=new THREE.Group();
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(.7,.5,.35),new THREE.MeshStandardMaterial({color:0x888888,roughness:1}));
    // An off-origin model must still fit, rather than translating its centre outside the workstation.
    mesh.position.set(4.2,2.6,-3.3);scene.add(mesh);
    return {scene};
  }};
  const b=buildBrineworksDetail(THREE,loader,()=>0);
  await b.ready;
  assert.deepEqual(paths.sort(),BRINEWORKS_MODULES.map(s=>'/client/asset-derivatives/brineworks/'+s.file).sort());
  assert.deepEqual(b.stats().modules,{research:'ready',engineering:'ready'});
  assert.deepEqual(b.stats().sources,{research:'remeshed',engineering:'remeshed'});
  assert.equal(b.stats().gauges,2);
  assert.ok(b.stats().detailMeshes>25);
  for(const s of BRINEWORKS_MODULES){
    const holder=b.group.getObjectByName('brineworks:refined-glb:'+s.id);
    assert.ok(holder,'missing mounted '+s.id+' GLB');
    assert.equal(holder.position.x,s.x);
    assert.equal(holder.position.z,s.z-.04);
    const box=new THREE.Box3().setFromObject(holder);
    const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
    assert.ok(Math.abs(center.x-s.x)<.001);
    assert.ok(Math.abs(center.z-(s.z-.04))<.001);
    assert.ok(Math.abs(box.min.y-1.12)<.001);
    assert.ok(size.x<=s.w+.001 && size.y<=s.h+.001 && size.z<=s.d+.001);
    holder.traverse(obj=>{if(obj.isMesh){assert.ok(obj.material.isMeshPhysicalMaterial);assert.ok(obj.castShadow);}});
  }
  for(const s of BRINEWORKS_GAUGES)assert.ok(b.group.getObjectByName('brineworks:gauge:'+s.id));
  assert.ok(b.group.children.every(obj=>!obj.userData?.collider));
  const bursts=[];b.attachVfx({burst:request=>bursts.push(request)});
  b.update(.016,17,{x:43,z:-36});b.update(.016,17.4,{x:43,z:-36});
  assert.equal(bursts.length,1,'VFX rate-limited near the workstation');
  b.update(.016,20,{x:43,z:-36});assert.equal(bursts.length,2);
  b.update(.016,24,{x:143,z:136});assert.equal(bursts.length,2,'VFX culled at range');
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

test('refined model load failure retains original GLB rather than only procedural fallback',async()=>{
  const attempts=[];
  const loader={loadAsync:async url=>{
    attempts.push(url);
    if(url.endsWith('_refined.glb'))throw Error('refined unavailable');
    const scene=new THREE.Group();scene.add(new THREE.Mesh(new THREE.BoxGeometry(.5,.4,.3),new THREE.MeshStandardMaterial()));
    return {scene};
  }};
  const b=buildBrineworksDetail(THREE,loader,()=>0);await b.ready;
  assert.equal(attempts.length,4);
  assert.deepEqual(b.stats().modules,{research:'ready',engineering:'ready'});
  assert.deepEqual(b.stats().sources,{research:'original-fallback',engineering:'original-fallback'});
  b.dispose();
});

test('proximity streaming defers refined GLBs until Brineworks approach',async()=>{
  const paths=[];
  const loader={loadAsync:async url=>{
    paths.push(url);
    const scene=new THREE.Group();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(.5,.35,.25),new THREE.MeshStandardMaterial()));
    return {scene};
  }};
  const b=buildBrineworksDetail(THREE,loader,()=>0,{streamModels:true});
  assert.deepEqual(b.stats().modules,{research:'dormant',engineering:'dormant'});
  b.update(.016,1,{x:0,z:0});
  await b.ready;
  assert.equal(paths.length,0,'Sanctum startup must not preload remote Brineworks models');
  b.update(.016,2,{x:44,z:-36});
  await b.ready;
  assert.equal(paths.length,2);
  assert.deepEqual(b.stats().sources,{research:'remeshed',engineering:'remeshed'});
  b.update(.016,3,{x:44,z:-36});
  await b.ready;
  assert.equal(paths.length,2,'streaming should load each model only once');
  b.dispose();
});
