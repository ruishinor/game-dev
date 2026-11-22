import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {RIFT_SITE,LUMENFEN_ENTRY_SITE,OBJECTS,PLAYER_RADIUS,resolveCollisions} from '../shared/world.js';
import {makeLumenfenRift,ROOTGLASS_LIMITS} from '../client/src/lumenfen-rift.js';

test('Reach rootglass threshold shares Phase Scar portal axis without colliding with the Indexer',()=>{
 assert.ok(RIFT_SITE && LUMENFEN_ENTRY_SITE);
 const entry=OBJECTS.find(o=>o.type==='lumenfen_entry');
 assert.ok(entry);
 assert.equal(entry.x,LUMENFEN_ENTRY_SITE.x);
 assert.equal(entry.z,LUMENFEN_ENTRY_SITE.z);
 // Aligned plaza placement is preferable to arbitrary separated clearings.
 assert.ok(Math.abs(entry.z-RIFT_SITE.z)<.001,'portal faces share one alignment');
 assert.ok(Math.abs(entry.x-RIFT_SITE.x) >=16.9,'separate collision and interaction footprints');
 for(const x of [entry.x-3.5,entry.x+3.5]){
  const at={x,z:entry.z-3.5};
  resolveCollisions(at,PLAYER_RADIUS);
  assert.ok(Number.isFinite(at.x)&&Number.isFinite(at.z));
 }
});
test('all four rootglass portals contain curved layered membranes and physical root architecture',()=>{
 assert.equal(ROOTGLASS_LIMITS.layers,3);
 for(const kind of ['lumenfen_entry','lumenfen_return','lumenfen_spring','lumenfen_crown']){
  const r=makeLumenfenRift(T,kind),names=new Set(),membranes=[],roots=[];
  r.group.traverse(o=>{
   names.add(o.name);
   if(o.name?.startsWith('lumenfen:membrane'))membranes.push(o);
   if(o.name==='lumenfen:structural-root'||o.name==='lumenfen:branch-root')roots.push(o);
  });
  assert.equal(membranes.length,3);
  assert.ok(roots.length>=18,'roots must form a physically significant portal frame');
  assert.ok(names.has('lumenfen:rootglass-footing'));
  assert.ok(names.has('lumenfen:embedded-glass'));
  assert.ok(names.has('lumenfen:rootglass-conductor'));
  const front=r.group.getObjectByName('lumenfen:membrane');
  const pos=front.geometry.attributes.position;
  let first=pos.getZ(0),curved=false;
  for(let i=1;i<pos.count;i++)if(Math.abs(first-pos.getZ(i))>.015){curved=true;break;}
  assert.ok(curved,'portal cannot remain a flat rectangle');
  const before=front.material.uniforms.uTime.value;
  r.update(.2,{reducedMotion:false});
  assert.ok(front.material.uniforms.uTime.value>before);
  r.update(.2,{reducedMotion:true});
  assert.equal(front.material.uniforms.uTime.value,0);
  r.dispose();
 }
});
