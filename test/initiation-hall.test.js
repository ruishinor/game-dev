import test from 'node:test';import assert from 'node:assert/strict';
import {makeGame,makeChar,place} from './helpers.js';
import {interact,changeInitiationAppearance} from '../server/sim/progress.js';
import {WORLD,INITIATION_SITE,PLAYER_RADIUS,resolveCollisions,stepMove} from '../shared/world.js';
test('arrival hall uses the existing spawn and optional local orientation without altering quest or equipment',()=>{
 const g=makeGame(),p=g.addPlayer(makeChar('vanguard'));const t=g.objects.find(o=>o.type==='initiation_terminal');
 assert.ok(t);assert.ok(Math.hypot(p.x-WORLD.spawn.x,p.z-WORLD.spawn.z)<.01);
 const initial=JSON.stringify({quest:p.char.quest,inventory:p.char.inventory,level:p.char.level});
 place(p,20,20);assert.equal(interact(g,p,t.id).ok,false);
 place(p,t.x+1.5,t.z);assert.ok(interact(g,p,t.id).ok);assert.equal(g.sheet(p).initiationSeen,true);
 assert.ok(p.outbox.some(e=>e.e==='field_record'&&e.key==='initiation_terminal'));
 assert.ok(interact(g,p,t.id).ok);assert.equal(JSON.stringify({quest:p.char.quest,inventory:p.char.inventory,level:p.char.level}),initial);
 const pos={...WORLD.spawn,jy:0,vy:0};for(let i=0;i<60;i++)stepMove(pos,{f:1,s:0,yaw:Math.PI,j:false},1);
 assert.ok(pos.z<5.8,'north exit remains passable');
});

test('in-world appearance updates are location-gated, validated, cosmetic and replicated',()=>{
 const g=makeGame(),p=g.addPlayer(makeChar('vanguard')),t=g.objects.find(o=>o.type==='initiation_terminal');
 const appearance='f.human.2.swept.3',initial=JSON.stringify({stats:p.stats,inventory:p.char.inventory,quest:p.char.quest,look:p.char.look});
 place(p,20,20);assert.equal(changeInitiationAppearance(g,p,appearance).ok,false);
 place(p,t.x+1.5,t.z);assert.equal(changeInitiationAppearance(g,p,'f.veyran.2.swept.3').ok,false);
 const ver=p.metaVer;assert.ok(changeInitiationAppearance(g,p,appearance).ok);
 assert.equal(g.metaFor(p).ap,appearance);assert.equal(g.sheet(p).appearance,appearance);assert.equal(p.metaVer,ver+1);
 assert.equal(JSON.stringify({stats:p.stats,inventory:p.char.inventory,quest:p.char.quest,look:p.char.look}),initial);
 assert.ok(p.outbox.some(e=>e.e==='appearance_applied'&&e.appearance===appearance));
 assert.equal(changeInitiationAppearance(g,p,'m.human.1.none.0').ok,false);
 g.time+=1000;p.combatUntil=g.time+1000;assert.equal(changeInitiationAppearance(g,p,'m.human.1.none.0').ok,false);
});
