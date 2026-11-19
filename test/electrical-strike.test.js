import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createVfx} from '../client/src/vfx/engine.js';
import {playElectricalStrike} from '../client/src/vfx/electrical-strike.js';

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
