import test from 'node:test';import assert from 'node:assert/strict';import {makeGame,makeChar,place,travelToAnnex} from './helpers.js';import {gateToWorld} from '../shared/severance-gate.js';import {interact} from '../server/sim/progress.js';import {WORLD,RIFT_ANNEX,PLAYER_RADIUS,resolveCollisions,stepMove,inRiftAnnex,zoneAt,hasLineOfSight,deepLineClear,annexArea,ANNEX_PARTITIONS,ANNEX_FORMATIONS,inSeverancePocket} from '../shared/world.js';
test('rift travel is gated, bounded, shared, and returns without resetting encounters',()=>{
 const g=makeGame(),p=g.addPlayer(makeChar('vanguard',{level:3,attunements:['resonance']})),q=g.addPlayer(makeChar('vanguard',{level:3,attunements:['resonance'],riftCalibration:'completed'}));
 const gate=pl=>{const s=gateToWorld(0,.5);place(pl,s.x,s.z);g.severance.phase='active';assert.ok(interact(g,pl,g.severance.gate.id).ok);};
 const {entry,exit}=g.rift;assert.ok(entry===g.rift.core&&exit);assert.ok(!g.objects.some(o=>o.type==='rift_entry'));let count=g.enemies.length;
 assert.equal(interact(g,p,entry.id).ok,false);place(p,entry.x,entry.z-3.6);assert.ok(interact(g,p,entry.id).ok);assert.ok(!inRiftAnnex(p.x,p.z));
 p.char.riftCalibration='completed';g.rift.phase='unstable';assert.equal(interact(g,p,entry.id).ok,false);g.rift.phase='stabilized';p.combatUntil=g.time+1000;assert.equal(interact(g,p,entry.id).ok,false);p.combatUntil=0;
 assert.ok(interact(g,p,entry.id).ok);assert.ok(inSeverancePocket(p.x,p.z));assert.equal(g.enemies.filter(e=>!e.severancePatrol).length,count,'Expanse patrols are the only new enemies');count=g.enemies.length;gate(p);assert.ok(inRiftAnnex(p.x,p.z));assert.equal(zoneAt(p.x,p.z),'Phase Annex · Arrival Gallery');assert.equal(g.enemies.length,count+11);const encounter=g.enemies.slice(-11);assert.ok(encounter.every(e=>inRiftAnnex(e.x,e.z)));for(const [area,n] of [['Arrival Gallery',3],['Relay Workshop',4],['Null Chamber',4]])assert.equal(encounter.filter(e=>annexArea(e.x,e.z)===area).length,n);
 assert.equal(g.setTarget(p,q.id),false);assert.equal(hasLineOfSight(p,q),false);assert.equal(deepLineClear(q,p),false);
 place(q,entry.x,entry.z-3.6);assert.ok(interact(g,q,entry.id).ok);gate(q);assert.equal(g.enemies.length,count+11);
 encounter[0].hp-=1;place(p,exit.x,exit.z-1.7);p.combatUntil=g.time+1000;assert.equal(interact(g,p,exit.id).ok,false);p.combatUntil=0;assert.ok(interact(g,p,exit.id).ok);assert.ok(!inRiftAnnex(p.x,p.z));assert.ok(inSeverancePocket(p.x,p.z));
 place(p,entry.x,entry.z-3.6);assert.ok(interact(g,p,entry.id).ok);gate(p);assert.equal(g.enemies.slice(-11)[0],encounter[0]);assert.ok(encounter[0].hp<encounter[0].maxHp);
 p.hp=17;g.syncChar(p);assert.deepEqual(p.char.pos,WORLD.spawn);assert.equal(p.char.hp,17);
});
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

test('cache rewards only expedition participants and cannot be replayed',async()=>{
 const {onEnemyKilled}=await import('../server/sim/progress.js');
 const g=makeGame(),p=g.addPlayer(makeChar('vanguard',{level:3,attunements:['resonance'],riftCalibration:'completed'})),q=g.addPlayer(makeChar('vanguard',{level:3,attunements:['resonance'],riftCalibration:'completed'}));
 for(const player of [p,q])assert.ok((await travelToAnnex(g,player)).ok);
 const cache=g.objects.find(o=>o.type==='annex_cache'),mob=g.enemies.find(e=>e.annexEncounter&&e.type==='sentinel'),boss=g.enemies.find(e=>e.annexEncounter&&e.type==='warden');
 place(q,cache.x,cache.z+2);assert.equal(interact(g,q,cache.id).ok,false);
 place(p,mob.x,mob.z);onEnemyKilled(g,mob,[p.id]);assert.equal(p.char.annexProgress,1);
 place(p,boss.x,boss.z);onEnemyKilled(g,boss,[p.id]);assert.equal(p.char.annexProgress,3);
 place(p,cache.x,cache.z+2);assert.ok(interact(g,p,cache.id).ok);assert.equal(p.char.materials.resonance_fragment,3);assert.equal(interact(g,p,cache.id).ok,false);assert.equal(interact(g,q,cache.id).ok,false);
});

test('mineral formations occupy real chamber footprints without obstructing gate or openings',()=>{
 const x=RIFT_ANNEX.x;assert.equal(ANNEX_FORMATIONS.length,10);
 for(const p of ANNEX_FORMATIONS){assert.ok(inRiftAnnex(p.x,p.z));const moved=resolveCollisions({x:p.x+.01,z:p.z},PLAYER_RADIUS);assert.ok(Math.hypot(moved.x-p.x,moved.z-p.z)>=p.r+PLAYER_RADIUS-.001);}
 for(const [dx,z] of [[0,27],[0,30.5],[6,12],[-6,-9],[0,-28]])assert.ok(ANNEX_FORMATIONS.every(p=>Math.hypot(x+dx-p.x,z-p.z)>p.r+PLAYER_RADIUS));
});
