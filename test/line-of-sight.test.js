import test from 'node:test';
import assert from 'node:assert/strict';
import { hasLineOfSight } from '../shared/world.js';
import { useAbility, startAttack, tickPlayerCombat } from '../server/sim/combat.js';
import { makeGame, makeChar, place, enemyOf, isolate } from './helpers.js';

test('cover checks both rectangle and circle, not parallel or grazing non-intersections', () => {
  const box = {x:0,z:0,hw:1,hd:2,h:3};
  const circle = {x:0,z:0,r:1,h:3};
  assert.equal(hasLineOfSight({x:-3,z:0},{x:3,z:0},[box]),false);
  assert.equal(hasLineOfSight({x:-3,z:0},{x:3,z:0},[circle]),false);
  assert.ok(hasLineOfSight({x:-3,z:3},{x:3,z:3},[box,circle]));
  assert.ok(hasLineOfSight({x:-3,z:1},{x:3,z:1},[circle]));
  assert.ok(hasLineOfSight({x:-3,z:0},{x:3,z:0},[{...box,h:0.2}]));
  assert.equal(hasLineOfSight({x:NaN,z:0},{x:3,z:0},[]),false);
});
test('a real Brineworks wall blocks targeted attacks and auto-attack without consumption', () => {
  const game=makeGame(); const p=game.addPlayer(makeChar('surveyor'));
  const e=enemyOf(game,'sentinel'); isolate(game,e);
  place(p,46,-41); place(e,46,-45); game.setTarget(p,e.id);
  const hp=e.hp;
  assert.equal(hasLineOfSight(p,e),false);
  assert.equal(useAbility(game,p,'fault_scan').reason,'Line of sight blocked.');
  assert.equal(p.res,60); assert.deepEqual(p.cds,{});
  assert.equal(game.privateState(p).los,0);
  assert.ok(startAttack(game,p).ok);
  tickPlayerCombat(game,p,0.05);
  assert.equal(e.hp,hp); assert.equal(p.nextAuto,0);
  place(p,46,-46.5);
  assert.ok(hasLineOfSight(p,e));
  tickPlayerCombat(game,p,0.05);
  assert.ok(e.hp<hp);
  assert.equal(game.privateState(p).los,1);
});
