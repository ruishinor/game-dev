import test from 'node:test';
import assert from 'node:assert/strict';
import {regionFor,project,daylightDisplay,formatMinutes} from '../client/src/world-atlas.js';
import {WORLD,RIFT_ANNEX,SEVERANCE_POCKET} from '../shared/world.js';
test('region projection centers existing independent travel regions',()=>{
 for(const pos of [{x:0,z:0},RIFT_ANNEX,SEVERANCE_POCKET]){
  const r=regionFor(pos),p=project(r,800,600);
  assert.equal(p.X(r.x),400);assert.equal(p.Z(r.z),300);
  assert.ok(p.X(r.x+1)>400);assert.ok(p.Z(r.z-1)<300);
 }
 assert.equal(regionFor({x:0,z:0}).name,WORLD.name);
});
test('pan and zoom preserve north-up orientation',()=>{
 const r=regionFor({x:0,z:0}),p=project(r,800,600,2,{x:10,z:-5});
 assert.equal(p.X(10),400);assert.equal(p.Z(-5),300);
 assert.equal(p.k,2*project(r,800,600).k);
});
test('preview clock reports no invented time outside applied preview',()=>{
 for(const s of [null,{}, {applied:false,t:.5},{applied:true,t:NaN}])assert.equal(daylightDisplay(s),null);
 for(const [t,minutes,phase] of [[0,720,'day'],[.25,1080,'night'],[.5,0,'night'],[.75,360,'day']]){
  assert.deepEqual(daylightDisplay({applied:true,t}),{minutes,phase,preview:true});
 }
});
test('digital clock formatting distinguishes midnight and noon',()=>{
 assert.equal(formatMinutes(0,'12'),'12:00 AM');assert.equal(formatMinutes(720,'12'),'12:00 PM');
 assert.equal(formatMinutes(5),'00:05');assert.equal(formatMinutes(1439),'23:59');
});
