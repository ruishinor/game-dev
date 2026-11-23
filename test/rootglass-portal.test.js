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
 // Each entrance sits against the same mountain-wall contour, with its
 // outward/back side almost touching the rising rim. No open corridor remains
 // behind the portal; the playable approach is toward the Reach's centre.
 for(const portal of [OBJECTS.find(o=>o.type==='phase_scar'),entry]){
  const r=Math.hypot(portal.x,portal.z);
  assert.ok(r>=78.5&&r<=80.6,'portal foundation belongs to the cliff toe');
  assert.ok(Math.hypot(Math.sin(portal.yaw)+portal.x/r,Math.cos(portal.yaw)+portal.z/r)<.001,
    'the entrance must face inward, with its back against the wall');
  const rearClearance=83-(r+2.45);
  assert.ok(rearClearance>=-.2&&rearClearance<=2.1,'almost no space behind the portal');
 }
 const separation=Math.hypot(entry.x-RIFT_SITE.x,entry.z-RIFT_SITE.z);
 assert.ok(separation>13.3,'thresholds must not overlap');
 assert.ok(Math.abs(Math.hypot(entry.x,entry.z)-Math.hypot(RIFT_SITE.x,RIFT_SITE.z))<0.5,
   'the two rifts follow the mountain contour, not a plaza grid');
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

test('entry, return, spring and crown show distinct destination architecture',()=>{
 const signature={
  lumenfen_entry:'lumenfen:entry-fissure-root',
  lumenfen_return:'lumenfen:return-woven-root',
  lumenfen_spring:'lumenfen:spring-calibration-gauge',
  lumenfen_crown:'lumenfen:crown-high-branch',
 };
 for(const [kind,feature] of Object.entries(signature)){
   const model=makeLumenfenRift(T,kind);
   assert.ok(model.group.getObjectByName(feature),kind+' must carry its own physical signature');
   for(const [other,otherFeature] of Object.entries(signature))if(other!==kind)
     assert.equal(model.group.getObjectByName(otherFeature),undefined,
       kind+' should not reuse '+other+' threshold identity');
   assert.ok(model.group.getObjectByName('lumenfen:membrane'));
   if(kind==='lumenfen_crown')assert.ok(model.height>6.4,'high crown must fit camera/label bounds');
   model.dispose();
 }
});
