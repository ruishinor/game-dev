import test from 'node:test';
import assert from 'node:assert/strict';
import {makeGame,makeChar,place,run} from './helpers.js';
import {dist,resolveCollisions,ZONES} from '../shared/world.js';
function fixture(){
 const g=makeGame(),[j,a,b]=g.enemies.filter(e=>e.form),f=g.enemies.find(e=>e.type==='faultstalker');
 place(f,8,51);place(j,5,51);place(a,1,63);place(b,3,65);f.huntReadyAt=0;
 return {g,j,a,b,f};
}
test('isolated juvenile can be wounded by a predator, recovers, no player threat',()=>{
 const {g,j,f}=fixture(),events=[];run(g,8500,events);
 assert.ok(events.some(e=>e.e==='fx'&&e.k==='sinter_pounce'));
 assert.ok(events.some(e=>e.e==='dmg'&&e.s===f.id&&e.d===j.id&&e.ab==='wild_bite'));
 assert.ok(j.hp>0&&j.hp<j.maxHp);assert.equal(j.state,'idle');
 assert.equal(f.threat.size,0);assert.equal(j.threat.size,0);assert.equal(f.hp,f.maxHp);
 run(g,18000);assert.equal(j.hp,j.maxHp);
});
test('shieldback interposes and repels the predator',()=>{
 const {g,j,b,f}=fixture(),events=[];place(b,6.6,51);run(g,6000,events);
 assert.ok(events.some(e=>e.e==='fx'&&e.k==='sinter_repel'&&e.s===b.id));
 assert.equal(j.hp,j.maxHp);assert.equal(b.hp,b.maxHp);assert.equal(b.threat.size,0);assert.equal(f.threat.size,0);
});
test('player aggro interrupts natural hunt without credit or wild damage',()=>{
 const {g,j,f}=fixture();run(g,100);assert.ok(f.wildPhase);
 const p=g.addPlayer(makeChar('vanguard'));place(p,f.x,f.z-1);
 const events=[];run(g,200,events);
 assert.equal(f.state,'combat');assert.equal(f.wildPhase,null);assert.equal(f.wildPrey,0);assert.ok(f.threat.has(p.id));
 assert.equal(j.hp,j.maxHp);assert.equal(p.char.xp,0);assert.deepEqual(p.char.inventory,[]);assert.ok(!events.some(e=>e.ab==='wild_bite'));
});
test('six minutes of unobserved ecology remains bounded and resumes migration',()=>{
 const g=makeGame(),fauna=g.enemies.filter(e=>e.form||e.type==='faultstalker'),modes=new Set();
 for(let i=0;i<7200;i++){
  g.tick(50);
  for(const e of fauna){
   assert.ok(dist(e,ZONES.sinter)<ZONES.sinter.r);
   assert.ok(dist(e,resolveCollisions({x:e.x,z:e.z},e.radius))<1e-5);
   assert.ok(e.hp>0&&e.hp<=e.maxHp);assert.equal(e.threat.size,0);
  }
  modes.add(fauna[3].ecologyMode);g.endTick();
 }
 assert.ok(modes.has('lunge')&&modes.has('withdraw')&&modes.has('stalk'));
 assert.ok(fauna.slice(0,3).every(e=>e.routeLaps>=2));
});
