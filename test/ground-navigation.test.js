import test from 'node:test';
import assert from 'node:assert/strict';
import { groundSegmentClear,findGroundRoute,advanceGroundCompanion } from '../server/sim/ground-navigation.js';
import { COLLIDERS } from '../shared/world.js';
const pt=(x,z)=>({x,z}),r=.45;
const length=(a,route)=>route.reduce((s,b,i)=>s+Math.hypot(b.x-(i?route[i-1]:a).x,b.z-(i?route[i-1]:a).z),0);
test('direct route and finite, bounded validation',()=>{
 assert.deepEqual(findGroundRoute(pt(0,0),pt(8,0),r,[]),[pt(8,0)]);
 for(const bad of [pt(NaN,1),pt(Infinity,0),pt(89,0),pt(33,0)])assert.equal(findGroundRoute(pt(0,0),bad,r,[]),null);
 assert.equal(findGroundRoute(pt(0,0),pt(1,0),0,[]),null);
});
test('swept body avoids low circles and box corners, not just sight lines',()=>{
 const obstacles=[{x:4,z:0,r:1.4,h:.2},{x:7,z:1,hw:.4,hd:1.4}];
 const start=pt(0,0),end=pt(10,0);
 assert.equal(groundSegmentClear(start,end,r,obstacles),false);
 const route=findGroundRoute(start,end,r,obstacles);assert.ok(route&&route.length>1);
 assert.deepEqual(route,findGroundRoute(start,end,r,obstacles));
 assert.deepEqual(route.at(-1),end);assert.ok(length(start,route)>10);
 for(let i=0;i<route.length;i++)assert.ok(groundSegmentClear(i?route[i-1]:start,route[i],r,obstacles));
 assert.equal(groundSegmentClear(pt(6,2.8),pt(8,2.8),r,obstacles),false);
});
test('actual Kestrel wall blocks a direct route but eastern entrance remains reachable',()=>{
 const walls=COLLIDERS.filter(o=>o.type==='deep_wall');
 const start=pt(-55,-16),goal=pt(-55,-8);
 assert.equal(groundSegmentClear(start,goal,r,walls),false);
 const route=findGroundRoute(start,goal,r,walls);assert.ok(route);assert.ok(route.some(p=>p.x>-49.5));
 for(let i=0;i<route.length;i++)assert.ok(groundSegmentClear(i?route[i-1]:start,route[i],r,walls));
});
test('impassable or invalid endpoints fail closed; no teleport or unbounded retry',()=>{
 const blocked=[{x:2,z:0,r:1}];
 assert.equal(findGroundRoute(pt(0,0),pt(2,0),r,blocked),null);
 const actor=pt(0,0),nav={};assert.equal(advanceGroundCompanion(actor,nav,pt(2,0),{now:0,dt:.05,speed:4,radius:r},blocked),0);
 const next=nav.nextPlan;assert.equal(advanceGroundCompanion(actor,nav,pt(2,0),{now:100,dt:.05,speed:4,radius:r},blocked),0);
 assert.equal(nav.nextPlan,next);assert.deepEqual(actor,pt(0,0));
});
test('movement follows route at bounded speed and never crosses obstacle',()=>{
 const actor=pt(0,0),nav={},goal=pt(10,0),obstacles=[{x:5,z:0,hw:1,hd:2}];
 for(let i=0;i<250&&Math.hypot(actor.x-goal.x,actor.z-goal.z)>.05;i++){
   const before={...actor},m=advanceGroundCompanion(actor,nav,goal,{now:i*50,dt:.05,speed:4,radius:r},obstacles);
   assert.ok(m<=.2+1e-9);assert.ok(groundSegmentClear(before,actor,r,obstacles));
 }
 assert.ok(Math.hypot(actor.x-goal.x,actor.z-goal.z)<.05);
});
