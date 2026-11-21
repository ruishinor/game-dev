import test from 'node:test';
import assert from 'node:assert/strict';
import {regionFor,project,daylightDisplay,atlasClockDisplay,formatMinutes,pointInsideRegion,waypointRelative,pixelToWorld} from '../client/src/world-atlas.js';
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
test('live Expanse world clock is authoritative and not labelled a preview',()=>{
 assert.deepEqual(daylightDisplay({applied:true,t:.25,mode:'live'}),{minutes:1080,phase:'night',preview:false});
 assert.deepEqual(daylightDisplay({applied:true,t:.25,mode:'hold'}),{minutes:1080,phase:'night',preview:true});
});
test('world clock uses authoritative snapshots in every region, not static environment lighting',()=>{
 for(const inExpanse of [false,true]){
  assert.deepEqual(atlasClockDisplay({worldClock:5000},inExpanse),{minutes:0,phase:'night',preview:false});
  for(const worldClock of [undefined,null,NaN,-1,10001])assert.equal(atlasClockDisplay({worldClock},inExpanse),null);
 }
 assert.deepEqual(atlasClockDisplay({worldClock:10000},false),{minutes:720,phase:'day',preview:false});
 const snapshot={worldClock:0,daylight:{applied:true,t:.5,mode:'hold'}};
 assert.deepEqual(atlasClockDisplay(snapshot,true),{minutes:0,phase:'night',preview:true});
 assert.deepEqual(atlasClockDisplay(snapshot,false),{minutes:720,phase:'day',preview:false});
});
test('digital clock formatting distinguishes midnight and noon',()=>{
 assert.equal(formatMinutes(0,'12'),'12:00 AM');assert.equal(formatMinutes(720,'12'),'12:00 PM');
 assert.equal(formatMinutes(5),'00:05');assert.equal(formatMinutes(1439),'23:59');
});

test('personal map coordinates round-trip through north-up pan and zoom',()=>{
 const r=regionFor({x:0,z:0}),pan={x:10,z:-7},p=project(r,800,600,2,pan);
 const point={x:-17.5,z:23.25};
 assert.deepEqual(pixelToWorld(r,p,800,600,p.X(point.x),p.Z(point.z),pan),point);
 assert.ok(pointInsideRegion(r,point.x,point.z));
 assert.equal(pointInsideRegion(r,999,0),false);
 assert.equal(pointInsideRegion(r,Infinity,1),false);
 const pocket=regionFor(SEVERANCE_POCKET);
 assert.ok(pointInsideRegion(pocket,pocket.x,pocket.z));
 assert.equal(pointInsideRegion(pocket,pocket.x+pocket.hw+1,pocket.z),false);
});
test('waypoint distance and bearing are straight-line only',()=>{
 const pos={x:0,z:0};
 assert.deepEqual(waypointRelative(pos,{x:0,z:-30}),{distance:30,bearing:0});
 assert.deepEqual(waypointRelative(pos,{x:5,z:0}),{distance:5,bearing:90});
 assert.equal(waypointRelative(pos,{x:0,z:5}).bearing,180);
 assert.equal(waypointRelative(pos,{x:-5,z:0}).bearing,270);
 assert.equal(waypointRelative(pos,null),null);
});
