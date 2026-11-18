import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, makeChar, place, run } from './helpers.js';
import { dealDamage } from '../server/sim/combat.js';
import { petCommand } from '../server/sim/companion.js';
import { ENEMIES, SPAWNS } from '../shared/content.js';
import { itemDrops } from '../server/sim/loot-tables.js';
import { dist, resolveCollisions, ZONES } from '../shared/world.js';

test('Sinter circuits move continuously, stay in the biome and avoid colliders', () => {
  const game = makeGame();
  const fauna = game.enemies.filter(e => e.type === 'sinter_grazer' || e.type === 'faultstalker');
  assert.equal(fauna.length, 4);
  // Preserve the prior migration-only regression, independently of hunts.
  fauna[3].huntReadyAt=Infinity;
  const initial = fauna.map(e => ({ x:e.x, z:e.z }));
  const visited = fauna.map(() => new Set());
  const modes=fauna.map(()=>new Set());
  let gathered=0,dispersed=0,minSpacing=Infinity;
  for (let i=0; i<7200; i++) {
    game.tick(50);
    for (const [j,e] of fauna.entries()) {
      assert.ok(dist(e,ZONES.sinter) < ZONES.sinter.r);
      const safe = resolveCollisions({ x:e.x,z:e.z },e.radius);
      assert.ok(dist(safe,e)<1e-5);
      visited[j].add(e.routeIndex);
      modes[j].add(e.ecologyMode);
    }
    const [a,b,c]=fauna;
    const spans=[dist(a,b),dist(a,c),dist(b,c)];
    if(Math.max(...spans)<6)gathered++;
    if(Math.max(...spans)>9)dispersed++;
    minSpacing=Math.min(minSpacing,...spans);
    if (i===99) fauna.forEach((e,j)=>assert.ok(dist(e,initial[j])>2));
    game.endTick();
  }
  fauna.forEach((e,j)=>assert.equal(visited[j].size,e.route.length));
  assert.ok(gathered>0&&dispersed>0,'herd must both converge and disperse');
  assert.ok(minSpacing>1.1,'grazers should not stack in routine migration');
  assert.ok(modes.slice(0,3).every(m=>m.has('forage')));
  assert.ok(modes[3].has('watch')&&modes[3].has('stalk'));
  assert.equal(new Set(fauna.slice(0,3).map(e=>e.x+':'+e.z)).size,3);
});

test('neutral grazer selection and Harry do not initiate combat; isolated damage provokes only the victim', () => {
  const game = makeGame();
  const herd = game.enemies.filter(e=>e.type==='sinter_grazer');
  const e = herd[0];
  const p = game.addPlayer(makeChar('symbiotech'));
  place(herd[1],6,65);
  place(herd[2],8,65);
  place(p,e.x,e.z);
  game.setTarget(p,e.id);
  petCommand(game,p,'assist');
  run(game,800);
  assert.equal(e.state,'idle');
  assert.equal(e.hp,e.maxHp);
  assert.equal(e.threat.size,0);
  assert.equal(game.metaFor(e).neu,1);
  dealDamage(game,p,e,5,'test');
  run(game,100);
  assert.equal(e.state,'combat');
  assert.equal(e.target,p.id);
  assert.ok(herd.slice(1).every(o=>o.threat.size===0));
  dealDamage(game,p,e,9999,'test');
  assert.equal(p.char.xp,0);
  assert.deepEqual(p.char.inventory,[]);
});

test('faultstalker independently initiates combat and telegraphs a hostile shear', () => {
  const game=makeGame();
  const e=game.enemies.find(e=>e.type==='faultstalker');
  const p=game.addPlayer(makeChar('vanguard'));
  place(p,e.x,e.z-2);
  const ev=[];
  run(game,3100,ev);
  assert.equal(e.state,'combat');
  assert.ok(ev.some(x=>x.e==='tele' && x.k==='fault_shear' && x.g===1));
  assert.equal(itemDrops('faultstalker')[0].item,'sinter_laminate');
  assert.equal(SPAWNS.filter(s=>s.type==='sinter_grazer').length,3);
});


test('nearby shieldback defends attacked juvenile while an unengaged adult scatters',()=>{
  const g=makeGame(),herd=g.enemies.filter(e=>e.type==='sinter_grazer');
  const [juvenile,adult,defender]=herd;
  place(juvenile,4,51);place(adult,1,51);place(defender,6.8,51);
  const p=g.addPlayer(makeChar('vanguard'));place(p,4,49);
  run(g,100);
  assert.ok(herd.every(e=>e.threat.size===0));
  dealDamage(g,p,juvenile,5,'test');
  assert.ok(defender.threat.has(p.id));
  assert.equal(adult.threat.size,0);
  assert.ok(adult.alarmUntil>g.time);
  run(g,100);
  assert.equal(adult.ecologyMode,'scatter');
  assert.equal(defender.ecologyMode,'defend');
  assert.equal(g.metaFor(defender).form,'shieldback');
});

test('long-lived grazers develop additional mineral growth without changing stats or loot',()=>{
  const g=makeGame(),herd=g.enemies.filter(e=>e.form);
  g.enemies.find(e=>e.type==='faultstalker').huntReadyAt=Infinity;
  run(g,360000);
  assert.ok(herd.every(e=>e.grown&&e.routeLaps>=2));
  assert.ok(herd.every(e=>e.hp===ENEMIES.sinter_grazer.hp&&e.radius===ENEMIES.sinter_grazer.radius));
});


test('a nearby idle Faultstalker causes nonlethal natural flight and shieldback bracing',()=>{
  const g=makeGame(),[juvenile,adult,shieldback]=g.enemies.filter(e=>e.form);
  const predator=g.enemies.find(e=>e.type==='faultstalker');
  place(predator,8,51);place(juvenile,5,51);place(adult,5,49);place(shieldback,8,54);
  // Ensure the stimulus stays at the fixture location throughout the first tick.
  predator.wanderAt=5000;
  run(g,250);
  assert.equal(juvenile.ecologyMode,'scatter');
  assert.equal(adult.ecologyMode,'scatter');
  assert.equal(shieldback.ecologyMode,'brace');
  assert.ok([juvenile,adult,shieldback,predator].every(e=>e.hp===e.maxHp&&e.threat.size===0));
});
