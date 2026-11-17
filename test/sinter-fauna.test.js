import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, makeChar, place, run } from './helpers.js';
import { dealDamage } from '../server/sim/combat.js';
import { petCommand } from '../server/sim/companion.js';
import { ENEMIES, SPAWNS } from '../shared/content.js';
import { dist, resolveCollisions, ZONES } from '../shared/world.js';

test('Sinter circuits move continuously, stay in the biome and avoid colliders', () => {
  const game = makeGame();
  const fauna = game.enemies.filter(e => e.type === 'sinter_grazer' || e.type === 'faultstalker');
  assert.equal(fauna.length, 4);
  const initial = fauna.map(e => ({ x:e.x, z:e.z }));
  const visited = fauna.map(() => new Set());
  for (let i=0; i<2400; i++) {
    game.tick(50);
    for (const [j,e] of fauna.entries()) {
      assert.ok(dist(e,ZONES.sinter) < ZONES.sinter.r);
      const safe = resolveCollisions({ x:e.x,z:e.z },e.radius);
      assert.ok(dist(safe,e)<1e-5);
      visited[j].add(e.routeIndex);
    }
    if (i===99) fauna.forEach((e,j)=>assert.ok(dist(e,initial[j])>3));
    game.endTick();
  }
  fauna.forEach((e,j)=>assert.equal(visited[j].size,e.route.length));
  assert.equal(new Set(fauna.slice(0,3).map(e=>e.x+':'+e.z)).size,3);
});

test('neutral grazer selection and Harry do not initiate combat; damage provokes only the victim', () => {
  const game = makeGame();
  const herd = game.enemies.filter(e=>e.type==='sinter_grazer');
  const e = herd[0];
  const p = game.addPlayer(makeChar('symbiotech'));
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
  assert.equal(ENEMIES.faultstalker.loot[0].item,'sinter_laminate');
  assert.equal(SPAWNS.filter(s=>s.type==='sinter_grazer').length,3);
});
