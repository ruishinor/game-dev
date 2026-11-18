import test from 'node:test';import assert from 'node:assert/strict';import {makeGame,makeChar,place} from './helpers.js';import {interact} from '../server/sim/progress.js';import {WORLD,RIFT_ANNEX,PLAYER_RADIUS,resolveCollisions,stepMove,inRiftAnnex,zoneAt,hasLineOfSight,deepLineClear} from '../shared/world.js';
test('rift travel is gated, bounded, shared, and returns without resetting encounters',()=>{
 const g=makeGame(),p=g.addPlayer(makeChar('vanguard',{level:3,attunements:['resonance']})),q=g.addPlayer(makeChar('vanguard',{level:3,attunements:['resonance'],riftCalibration:'completed'}));
 const {entry,exit}=g.rift;assert.ok(entry&&exit);const count=g.enemies.length;
 assert.equal(interact(g,p,entry.id).ok,false);place(p,entry.x,entry.z-1.7);assert.equal(interact(g,p,entry.id).ok,false);
 p.char.riftCalibration='completed';g.rift.phase='unstable';assert.equal(interact(g,p,entry.id).ok,false);g.rift.phase='stabilized';p.combatUntil=g.time+1000;assert.equal(interact(g,p,entry.id).ok,false);p.combatUntil=0;
 assert.ok(interact(g,p,entry.id).ok);assert.ok(inRiftAnnex(p.x,p.z));assert.equal(zoneAt(p.x,p.z),'Phase Annex');assert.equal(g.enemies.length,count+2);const encounter=g.enemies.slice(-2);assert.ok(encounter.every(e=>inRiftAnnex(e.x,e.z)));
 assert.equal(g.setTarget(p,q.id),false);assert.equal(hasLineOfSight(p,q),false);assert.equal(deepLineClear(q,p),false);
 place(q,entry.x,entry.z-1.7);assert.ok(interact(g,q,entry.id).ok);assert.equal(g.enemies.length,count+2);
 encounter[0].hp-=1;place(p,exit.x,exit.z-1.7);p.combatUntil=g.time+1000;assert.equal(interact(g,p,exit.id).ok,false);p.combatUntil=0;assert.ok(interact(g,p,exit.id).ok);assert.ok(!inRiftAnnex(p.x,p.z));
 place(p,entry.x,entry.z-1.7);assert.ok(interact(g,p,entry.id).ok);assert.equal(g.enemies.slice(-2)[0],encounter[0]);assert.ok(encounter[0].hp<encounter[0].maxHp);
 p.hp=17;g.syncChar(p);assert.deepEqual(p.char.pos,WORLD.spawn);assert.equal(p.char.hp,17);
});
test('normal movement cannot walk across the disconnected boundary',()=>{const s={x:WORLD.radius-6,z:0,jy:0,vy:0};for(let i=0;i<600;i++)stepMove(s,{f:1,s:0,yaw:Math.PI/2,j:false},1);assert.ok(s.x<=WORLD.radius-6+.001);const a={x:RIFT_ANNEX.x-RIFT_ANNEX.hw+PLAYER_RADIUS,z:0,jy:0,vy:0};for(let i=0;i<600;i++)stepMove(a,{f:1,s:0,yaw:-Math.PI/2,j:false},1);assert.ok(inRiftAnnex(a.x,a.z));assert.ok(a.x>=RIFT_ANNEX.x-RIFT_ANNEX.hw+PLAYER_RADIUS-.001);assert.ok(!inRiftAnnex(resolveCollisions({x:140,z:0},PLAYER_RADIUS).x,0));});
