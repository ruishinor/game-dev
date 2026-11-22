import test from 'node:test';import assert from 'node:assert/strict';import {makeGame,makeChar,place} from './helpers.js';import {gateToWorld} from '../shared/severance-gate.js';import {interact} from '../server/sim/progress.js';import {WORLD,RIFT_ANNEX,PLAYER_RADIUS,PHASE_RIFT_RADIUS,OBJECTS,groundHeight,resolveCollisions,stepMove,inRiftAnnex,zoneAt,hasLineOfSight,deepLineClear,annexArea,ANNEX_PARTITIONS,ANNEX_FORMATIONS,inSeverancePocket} from '../shared/world.js';

test('normal movement cannot walk across the disconnected boundary',()=>{const s={x:WORLD.radius-6,z:0,jy:0,vy:0};for(let i=0;i<600;i++)stepMove(s,{f:1,s:0,yaw:Math.PI/2,j:false},1);assert.ok(s.x<=WORLD.radius-6+.001);const a={x:RIFT_ANNEX.x-RIFT_ANNEX.hw+PLAYER_RADIUS,z:0,jy:0,vy:0};for(let i=0;i<600;i++)stepMove(a,{f:1,s:0,yaw:-Math.PI/2,j:false},1);assert.ok(inRiftAnnex(a.x,a.z));assert.ok(a.x>=RIFT_ANNEX.x-RIFT_ANNEX.hw+PLAYER_RADIUS-.001);assert.ok(!inRiftAnnex(resolveCollisions({x:140,z:0},PLAYER_RADIUS).x,0));});

test('three areas are separated by tangible walls, with traversable offset openings',()=>{
 const x=RIFT_ANNEX.x;
 assert.equal(annexArea(x,27),'Arrival Gallery');assert.equal(annexArea(x,0),'Relay Workshop');assert.equal(annexArea(x,-25),'Null Chamber');
 assert.equal(ANNEX_PARTITIONS.length,4);
 assert.equal(hasLineOfSight({x,z:15},{x,z:8}),false);assert.equal(deepLineClear({x,z:15},{x,z:8}),false);
 assert.equal(hasLineOfSight({x:x+6,z:15},{x:x+6,z:8}),true);
 const p={x:x+6,z:16,jy:0,vy:0};for(let i=0;i<85;i++)stepMove(p,{f:1,s:0,yaw:Math.PI,j:false},1);
 assert.ok(p.z<12,'first opening is walkable');
 const blocked={x,z:16,jy:0,vy:0};for(let i=0;i<85;i++)stepMove(blocked,{f:1,s:0,yaw:Math.PI,j:false},1);
 assert.ok(blocked.z>12,'solid first bulkhead stops player');
 assert.equal(deepLineClear({x:x-6,z:-6},{x:x-6,z:-12}),true);
 assert.equal(deepLineClear({x:x+6,z:-6},{x:x+6,z:-12}),false);
});



test('mineral formations occupy real chamber footprints without obstructing gate or openings',()=>{
 const x=RIFT_ANNEX.x;assert.equal(ANNEX_FORMATIONS.length,10);
 for(const p of ANNEX_FORMATIONS){assert.ok(inRiftAnnex(p.x,p.z));const moved=resolveCollisions({x:p.x+.01,z:p.z},PLAYER_RADIUS);assert.ok(Math.hypot(moved.x-p.x,moved.z-p.z)>=p.r+PLAYER_RADIUS-.001);}
 for(const [dx,z] of [[0,27],[0,30.5],[6,12],[-6,-9],[0,-28]])assert.ok(ANNEX_FORMATIONS.every(p=>Math.hypot(x+dx-p.x,z-p.z)>p.r+PLAYER_RADIUS));
});


test('Null Annex return foundation and authoritative approach fit the arrival gallery',()=>{
 const o=OBJECTS.find(x=>x.key==='rift_return');
 assert.ok(o);assert.equal(o.r,PHASE_RIFT_RADIUS);assert.equal(o.yaw,Math.PI);
 const arrival={x:RIFT_ANNEX.x,z:RIFT_ANNEX.arrivalZ},clearance=o.r+PLAYER_RADIUS;
 assert.ok(Math.hypot(arrival.x-o.x,arrival.z-o.z)>clearance);
 const pos={...arrival};resolveCollisions(pos,PLAYER_RADIUS);assert.deepEqual(pos,arrival);
 assert.ok(hasLineOfSight(arrival,o));
 for(let i=0;i<24;i++){
  const angle=i*Math.PI/12,at={x:o.x+Math.cos(angle)*clearance,z:o.z+Math.sin(angle)*clearance};
  const p={...at};resolveCollisions(p,PLAYER_RADIUS);
  assert.ok(Math.hypot(p.x-at.x,p.z-at.z)<1e-6,'foundation has unobstructed clearance');
  assert.ok(Math.abs(groundHeight(at.x,at.z)-groundHeight(o.x,o.z))<.1);
 }
 const p={...arrival,jy:0,vy:0};for(let i=0;i<90;i++)stepMove(p,{f:1,s:0,yaw:0,j:false},1);
 assert.ok(Math.hypot(p.x-o.x,p.z-o.z)>=clearance-1e-6);
 assert.ok(Math.hypot(p.x-o.x,p.z-o.z)<clearance+.05);
 const g=makeGame(),player=g.addPlayer(makeChar('keeper',{level:15}));
 const exit=g.rift.exit;place(player,arrival.x,arrival.z);
 player.combatUntil=g.time+1000;assert.equal(interact(g,player,exit.id).ok,false);
 player.combatUntil=0;assert.equal(interact(g,player,exit.id).ok,true);
 assert.equal(inRiftAnnex(player.x,player.z),false);
});
