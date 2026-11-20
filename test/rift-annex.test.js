import test from 'node:test';import assert from 'node:assert/strict';import {makeGame,makeChar,place} from './helpers.js';import {gateToWorld} from '../shared/severance-gate.js';import {interact} from '../server/sim/progress.js';import {WORLD,RIFT_ANNEX,PLAYER_RADIUS,resolveCollisions,stepMove,inRiftAnnex,zoneAt,hasLineOfSight,deepLineClear,annexArea,ANNEX_PARTITIONS,ANNEX_FORMATIONS,inSeverancePocket} from '../shared/world.js';

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
