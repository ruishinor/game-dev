import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {FEN_TREES,FEN_SITE_COLLIDERS,inLumenfen,LUMENFEN} from '../shared/lumenfen.js';
import {FEN_PRODUCTION_PLACEMENTS,buildLumenfenFidelityFixtures} from '../client/src/lumenfen-fidelity-fixtures.js';
import {FEN_DONOR_IDS} from '../shared/lumenfen-fidelity.js';

test('archive GLB placements are distinct, inside the safe rim and away from active tree/collider footprints',()=>{
 let count=0;
 for(const [donor,locations]of FEN_PRODUCTION_PLACEMENTS){
  assert.ok(FEN_DONOR_IDS.includes(donor));
  for(const p of locations){
   count++;
   assert.ok(inLumenfen(p.x,p.z,-LUMENFEN.rim),donor+': stays within live wetland rim');
   assert.ok(FEN_TREES.every(tree=>Math.hypot(tree.x-p.x,tree.z-p.z)>tree.r+2),
     'no donor props intersect original tree obstacle');
   assert.ok(FEN_SITE_COLLIDERS.every(c=>Math.hypot(c.x-p.x,c.z-p.z)>(c.r??1.2)+1),
     'no fitted GLB begins within built landmark collider');
  }
 }
 assert.ok(count>=25&&count<=90,'bounded GLB landscape population');
});

test('real GLB geometry is fitted and instanced; rain changes only physical surface parameters',async()=>{
 const loaded=[];
 const loader={async loadAsync(url){
   assert.ok(url.startsWith('/client/assets/lumenfen-')&&url.endsWith('.glb'));
   loaded.push(url);
   const scene=new T.Group();
   scene.add(new T.Mesh(new T.BoxGeometry(1,3,1),new T.MeshPhysicalMaterial({
     color:0x52705a,metalness:.14,roughness:.6,
   })));
   return {scene};
 }};
 const result=buildLumenfenFidelityFixtures(T,loader,{quality:2});
 await result.ready;
 const stats=result.stats();
 assert.ok(stats.ready.length>=6);
 assert.deepEqual(stats.missing,{});
 assert.ok(stats.batches>=6);
 assert.ok(stats.instances>=25);
 assert.ok(result.group.children.every(o=>o.isInstancedMesh&&o.count>0));
 const first=result.group.children[0],origRough=first.material.roughness;
 result.update({rain:.9});
 assert.ok(first.material.roughness<origRough);
 assert.ok(first.material.clearcoat>.18);
 result.update({rain:0});
 assert.ok(Math.abs(first.material.roughness-origRough)<1e-8,'weather material restores in clear season');
 result.dispose();
 assert.equal(result.group.parent,null);
 assert.ok(loaded.length>=6);
});

test('quality zero leaves original fallback intact, no GLB download or extra geometry',async()=>{
 let calls=0;
 const r=buildLumenfenFidelityFixtures(T,{loadAsync(){calls++;throw Error('must not load');}},{quality:0});
 await r.ready;
 assert.equal(calls,0);
 assert.equal(r.group.children.length,0);
 r.dispose();
});
