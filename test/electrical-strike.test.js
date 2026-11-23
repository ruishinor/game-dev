import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createVfx} from '../client/src/vfx/engine.js';
import {playElectricalStrike,strikeVisualBudget} from '../client/src/vfx/electrical-strike.js';
import {createElectricalRod,createElectricalRodVfx} from '../client/src/electrical-rod.js';

test('actual shared engine plays directional rod contact, local wake and bounded expiry',()=>{
 const scene=new THREE.Scene(),v=createVfx(THREE,scene,{quality:1,groundHeight:()=>0,seed:31});
 const owned=[];let active=true;
 try{
  const handle=playElectricalStrike(v,{from:[0,1,0],target:[1,1,0],ground:[1,0,0],joined:true,active:()=>active,remember:h=>owned.push(h)});
  assert.ok(handle?.alive);assert.ok(v.root.getObjectByName('rod-strike:primary-sweep'));
  assert.ok(v.root.children.some(x=>x.name==='vfx-ribbon'&&x.visible));
  const before=v.stats().emitted;v.update(.1);assert.ok(v.stats().emitted>before);
  const mid=v.stats().emitted;v.update(.1);v.update(.05);assert.ok(v.stats().emitted>mid);
  for(let i=0;i<40;i++)v.update(.05);
  assert.equal(v.stats().timelines,0);assert.equal(v.stats().items,0);assert.equal(v.stats().particles,0);
  assert.ok(owned.length>=2);
 }finally{v.dispose();}
});

test('comfort and invalid endpoints never start a sequence; cancellation prevents deferred phases',()=>{
 const scene=new THREE.Scene(),v=createVfx(THREE,scene,{quality:1,groundHeight:()=>0,seed:42});
 const params={from:[0,1,0],target:[1,1,0],ground:[1,0,0]};
 try{
  assert.equal(playElectricalStrike(v,{...params,target:[20,0,0]}),null);
  assert.equal(playElectricalStrike(v,{...params,target:[NaN,0,0]}),null);
  v.reducedMotion=true;assert.equal(playElectricalStrike(v,params),null);v.reducedMotion=false;
  const h=playElectricalStrike(v,{...params,blocked:true});assert.ok(h);h.cancel();
  const n=v.stats().emitted;for(let i=0;i<10;i++)v.update(.05);assert.equal(v.stats().emitted,n);
 }finally{v.dispose();}
});

test('equipped idle uses real combat shader channels, tracks moving halves and stops in comfort mode',()=>{
 const scene=new THREE.Scene(),v=createVfx(THREE,scene,{quality:1,groundHeight:()=>0,seed:47});
 const rod=createElectricalRod({independentEmission:true});scene.add(rod.group);
 const fx=createElectricalRodVfx(rod,v);
 const channels=()=>v.root.children.filter(o=>o.name.startsWith('rod-idle:plasma-'));
 try{
  fx.update(.1);v.update(.1);
  assert.equal(channels().length,2);
  assert.ok(channels().every(m=>m.material.isShaderMaterial&&m.material.uniforms.alpha.value>0));
  rod.group.position.set(3,2,-1);rod.group.rotation.z=.3;rod.setMode('rod');rod.update(.25);
  fx.update(.1);v.update(.1);
  assert.ok(channels()[0].material.uniforms.A.value.distanceTo(rod.anchor(0,'Collar'))<1e-6);
  for(let i=0;i<25;i++){fx.update(.1);v.update(.1);assert.ok(channels().length<=4);}
  v.setIntensity(.3,true);fx.update(.1);v.update(.1);assert.equal(channels().length,0);
  v.setIntensity(1,false);
  for(let i=0;i<8;i++){fx.update(.1);v.update(.1);}
  assert.ok(channels().length>0);
  fx.dispose();v.update(.1);assert.equal(channels().length,0);
 }finally{fx.dispose();rod.dispose();v.dispose();}
});

test('medium-quality confirmed contact keeps directional silhouette while reducing overdraw',()=>{
 const joinedMedium=strikeVisualBudget(1,true),joinedHigh=strikeVisualBudget(2,true);
 const dualMedium=strikeVisualBudget(1,false),dualHigh=strikeVisualBudget(2,false);
 assert.equal(joinedHigh.shardCount,30,'preserve the authored high-quality contact budget');
 assert.equal(joinedHigh.sweepRadius,1.75,'preserve high-quality directional arc');
 assert.equal(joinedHigh.channelWidth,.11);
 assert.ok(joinedMedium.shardCount<joinedHigh.shardCount);
 assert.ok(joinedMedium.sweepRadius<joinedHigh.sweepRadius);
 assert.ok(joinedMedium.flareSize<joinedHigh.flareSize);
 assert.ok(joinedMedium.channelWidth<joinedHigh.channelWidth);
 assert.ok(dualMedium.shardCount<dualHigh.shardCount);
 assert.ok(dualMedium.sweepRadius<dualHigh.sweepRadius);
 assert.ok(dualMedium.shardAlpha<dualHigh.shardAlpha);
 assert.ok(joinedMedium.shardCount>dualMedium.shardCount);
 assert.ok(joinedMedium.emberCount>dualMedium.emberCount);
 for(const b of [joinedMedium,joinedHigh,dualMedium,dualHigh]){
  assert.ok(b.channelWidth>.04&&b.sweepRadius>=1&&b.shardCount>=12,'visible, nonzero medium/high core');
  assert.ok(b.shardAlpha>.5&&b.shardAlpha<=1);
 }
});
