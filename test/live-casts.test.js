import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LiveCasts } from '../client/src/live-casts.js';
test('authored combat effect instances are bounded, named, expire and dispose',()=>{
 const scene=new THREE.Scene(),live=new LiveCasts(THREE,scene,2);
 assert.ok(live.spawn('impact','kinetic',{variant:'impact',radius:1,duration:1},0));
 const first=scene.children[0],g=first.children[0].geometry;let disposed=0;g.addEventListener('dispose',()=>disposed++);
 assert.ok(live.spawn('hinge','aegis',{variant:'hinge',radius:1,duration:1},0));
 assert.ok(live.spawn('restore','restorative',{variant:'restore',radius:1,duration:1},0));
 assert.equal(disposed,1);assert.equal(scene.children.length,2);
 assert.equal(live.spawn('bad','restorative',{variant:'transfer',source:[0,0,0],target:[0,0,0]},0),false);
 live.update(1000);assert.equal(scene.children.length,0);
 assert.ok(live.spawn('charge','kinetic',{variant:'charge',reducedMotion:true,duration:1},1000));
 live.clear();assert.equal(scene.children.length,0);
});
