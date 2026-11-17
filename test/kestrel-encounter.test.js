import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, makeChar, place, run } from './helpers.js';
import { dealDamage, useAbility } from '../server/sim/combat.js';
import { interact } from '../server/sim/progress.js';
import { deepLineClear, dist, resolveCollisions, ZONES } from '../shared/world.js';

test('custodian patrol traverses all waypoints without wall penetration',()=>{
  const g=makeGame();const e=g.enemies.find(e=>e.type==='quarantine_custodian');const seen=new Set();
  const start={x:e.x,z:e.z};
  for(let i=0;i<1800;i++){
    g.tick(50);seen.add(e.routeIndex);
    assert.ok(dist(resolveCollisions({x:e.x,z:e.z},e.radius),e)<1e-6);
    assert.ok(dist(e,ZONES.deep)<ZONES.deep.r);
    if(i===99)assert.ok(dist(e,start)>3);
    g.endTick();
  }
  assert.equal(seen.size,e.route.length);
});

test('containment walls block both ability initiation and damage, open portal stays clear',()=>{
  const g=makeGame(),e=g.enemies.find(e=>e.type==='quarantine_custodian'),p=g.addPlayer(makeChar('symbiotech'));
  place(e,-56,-8);place(p,-56,-16);
  assert.equal(deepLineClear(p,e),false);
  assert.equal(deepLineClear(e,p),false);
  assert.equal(deepLineClear({x:-44,z:-8},e),true);
  g.setTarget(p,e.id);
  assert.match(useAbility(g,p,'neural_lash').reason,/Line of sight blocked/);
  assert.equal(p.cds.neural_lash,undefined);
  const hp=e.hp,ph=p.hp;
  assert.equal(dealDamage(g,p,e,50,'test'),0);
  assert.equal(dealDamage(g,e,p,50,'test'),0);
  assert.equal(e.hp,hp);assert.equal(p.hp,ph);
  assert.equal(e.threat.size,0);
  place(p,-54,-8);
  assert.ok(useAbility(g,p,'neural_lash').ok);
  assert.ok(e.hp<hp);
});

test('custodian engages inside the chamber and telegraphs the containment sweep',()=>{
  const g=makeGame(),e=g.enemies.find(e=>e.type==='quarantine_custodian'),p=g.addPlayer(makeChar('vanguard'));
  place(p,-54,-8);
  const ev=[];run(g,3900,ev);
  assert.equal(e.state,'combat');
  assert.ok(ev.some(x=>x.e==='tele'&&x.k==='containment_sweep'&&x.g===1));
});

test('recorder requires an existing field sample and attunement, refuses combat and never consumes the reference',()=>{
  const g=makeGame(),p=g.addPlayer(makeChar('vanguard')),o=g.objects.find(o=>o.type==='deep_console');
  place(p,-59,-8);
  assert.ok(interact(g,p,o.id).ok);
  assert.ok(!p.char.inventory.includes('phase_damper'));
  p.char.inventory.push('sinter_laminate');
  assert.ok(interact(g,p,o.id).ok);
  assert.ok(!p.char.inventory.includes('phase_damper'));
  p.char.attunements.push('resonance');
  p.combatUntil=5000;
  assert.equal(interact(g,p,o.id).ok,false);
  p.combatUntil=0;
  place(p,-66,-8);
  assert.equal(interact(g,p,o.id).ok,false);
  place(p,-59,-8);
  assert.ok(interact(g,p,o.id).ok);
  assert.ok(p.char.inventory.includes('sinter_laminate'));
  assert.ok(p.char.inventory.includes('phase_damper'));
  assert.ok(interact(g,p,o.id).ok);
  assert.equal(p.char.inventory.filter(x=>x==='phase_damper').length,1);
  assert.equal(p.char.xp,0);
});
