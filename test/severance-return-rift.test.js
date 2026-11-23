import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildRift } from '../client/src/rift-visual.js';
import { SEVERANCE_POCKET, clampToPocket } from '../shared/severance-gate.js';
import { PHASE_RIFT_RADIUS, PLAYER_RADIUS, OBJECTS, groundHeight, resolveCollisions, stepMove, hasLineOfSight, travelRegionAt } from '../shared/world.js';
import { makeGame, makeChar, place } from './helpers.js';
import { interact } from '../server/sim/progress.js';

test('return rift reuses the Reach geometry with a stable membrane and no hazard ring',()=>{
 const reach=buildRift(THREE,null,null),ret=buildRift(THREE,null,null,{returning:true});
 try{
  assert.equal(ret.group.name,'rift:severance-return');
  assert.equal(ret.radius,reach.radius);assert.equal(ret.radius,PHASE_RIFT_RADIUS);
  const membrane=ret.group.getObjectByName('rift:interference-membrane');
  assert.deepEqual(membrane.geometry.attributes.position.array,reach.group.getObjectByName('rift:interference-membrane').geometry.attributes.position.array);
  assert.equal(ret.group.getObjectByName('rift:persistent-warning'),undefined);
  assert.ok(reach.group.getObjectByName('rift:persistent-warning'));
  ret.update(.05,{riftPhase:'unstable',riftWarning:1,reducedMotion:false});
  assert.equal(membrane.material.uniforms.uStable.value,1);assert.equal(membrane.material.uniforms.uPhase.value,.8);
  ret.update(.05,{reducedMotion:true});assert.equal(membrane.material.uniforms.uTime.value,0);
  reach.update(.05,{riftPhase:'unstable',riftWarning:1});assert.equal(reach.group.getObjectByName('rift:persistent-warning').visible,true);
 }finally{reach.dispose();ret.dispose();}
});

test('arrival rift foundation, collision and real approach fit the walkable terrace',()=>{
 const {arrival,beacon}=SEVERANCE_POCKET;
 const o=OBJECTS.find(x=>x.key==='severance_return');
 assert.equal(o.r,PHASE_RIFT_RADIUS);assert.equal(o.x,beacon.x);assert.equal(o.z,beacon.z);
 const dx=arrival.x-beacon.x,dz=arrival.z-beacon.z,d=Math.hypot(dx,dz),min=PHASE_RIFT_RADIUS+PLAYER_RADIUS;
 assert.ok(d>min&&d<8);
 assert.ok(Math.abs(Math.sin(o.yaw)-dx/d)<1e-9&&Math.abs(Math.cos(o.yaw)-dz/d)<1e-9);
 const h=groundHeight(o.x,o.z);
 for(let i=0;i<24;i++){
  const angle=i*Math.PI/12,at={x:o.x+Math.cos(angle)*min,z:o.z+Math.sin(angle)*min};
  const p={...at};clampToPocket(p,PLAYER_RADIUS);
  assert.ok(Math.hypot(p.x-at.x,p.z-at.z)<1e-7,'entire footprint is inside walkable bounds');
  assert.ok(Math.abs(groundHeight(at.x,at.z)-h)<.1,'level foundation');
 }
 const p={...arrival,jy:0,vy:0};resolveCollisions(p,PLAYER_RADIUS);
 assert.ok(Math.hypot(p.x-arrival.x,p.z-arrival.z)<1e-7,'arrival does not intersect collision');
 assert.ok(hasLineOfSight(p,o));
 for(let i=0;i<90;i++)stepMove(p,{f:1,s:0,yaw:o.yaw+Math.PI,j:false},1);
 assert.ok(Math.hypot(p.x-o.x,p.z-o.z)>=min-1e-6);
 assert.ok(Math.hypot(p.x-o.x,p.z-o.z)<min+.05,'same collision footprint stops walking at the foundation');
 assert.ok(hasLineOfSight(p,o));
});

test('return rift keeps the server travel contract and rejects invalid remote/locked use',()=>{
 const g=makeGame(),p=g.addPlayer(makeChar('keeper',{level:3,attunements:['resonance'],riftCalibration:'completed'}));
 const o=g.severance.beacon,arrival=SEVERANCE_POCKET.arrival;
 assert.equal(interact(g,p,o.id).ok,false);
 place(p,arrival.x,arrival.z);
 const dx=arrival.x-o.x,dz=arrival.z-o.z,len=Math.hypot(dx,dz);
 place(p,o.x+dx/len*7,o.z+dz/len*7);
 assert.equal(interact(g,p,o.id).ok,false,'out of range');
 place(p,o.x+dx/len*3.6,o.z+dz/len*3.6);
 p.combatUntil=g.time+1000;assert.equal(interact(g,p,o.id).ok,false);
 p.combatUntil=0;p.autoOn=true;assert.equal(interact(g,p,o.id).ok,false);
 p.autoOn=false;p.dead=true;assert.equal(interact(g,p,o.id).ok,false);
 p.dead=false;assert.equal(interact(g,p,o.id).ok,true);
 assert.equal(travelRegionAt(p.x,p.z),'reach');
 assert.ok(Math.hypot(p.x-(g.rift.entry.x-g.rift.entry.x/Math.hypot(g.rift.entry.x,g.rift.entry.z)*3.6),p.z-(g.rift.entry.z-g.rift.entry.z/Math.hypot(g.rift.entry.x,g.rift.entry.z)*3.6))<1e-6);
});


test('paired rift effects retain authored layers, quality budgets and phase-driven light',()=>{
 const reach=buildRift(THREE,null,null),returning=buildRift(THREE,null,null,{returning:true});
 try{
  for(const model of [reach,returning]){
   const root=model.group;
   for(const name of ['rift:depth-veil','rift:filaments','rift:field-motes','rift:footprint-halo','rift:ambient-light'])
    assert.ok(root.getObjectByName(name),name);
   const motes=root.getObjectByName('rift:field-motes');
   const filaments=root.getObjectByName('rift:filaments');
   const depth=root.getObjectByName('rift:depth-veil');
   assert.equal(motes.instanceMatrix.count,32);
   model.update(.1,{riftPhase:'unstable',riftWarning:1,effectsQuality:2,cameraDistance:7});
   assert.equal(motes.count,32);
   assert.ok(filaments.visible&&depth.visible);
   assert.ok(root.getObjectByName('rift:ambient-light').intensity>0);
   model.update(.1,{riftPhase:'dormant',effectsQuality:0,cameraDistance:4,reducedMotion:true});
   assert.equal(motes.count,0);assert.equal(filaments.visible,false);assert.equal(depth.visible,false);
   assert.equal(root.getObjectByName('rift:ambient-light').intensity,0);
   model.update(.1,{riftPhase:'stabilized',effectsQuality:1,cameraDistance:8,reducedMotion:true});
   assert.equal(motes.count,14);
   assert.equal(root.getObjectByName('rift:ambient-light').intensity,0);
   assert.equal(root.getObjectByName('rift:interference-membrane').material.uniforms.uTime.value,0);
  }
  assert.equal(returning.group.getObjectByName('rift:persistent-warning'),undefined);
  assert.ok(reach.group.getObjectByName('rift:persistent-warning'));
  const m=returning.group.getObjectByName('rift:interference-membrane');
  returning.update(.1,{riftPhase:'unstable',riftWarning:1,effectsQuality:2,cameraDistance:10});
  assert.equal(m.material.uniforms.uStable.value,1);
  assert.equal(m.material.uniforms.uPhase.value,.8);
 }finally{reach.dispose();returning.dispose();}
});
