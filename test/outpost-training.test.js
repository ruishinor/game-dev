import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeChar, makeGame, place } from './helpers.js';
import { interact } from '../server/sim/progress.js';
import { OUTPOST_TRAINING as R, EXPEDITION_OUTPOST as OP, OUTPOST_COLLIDERS } from '../shared/severance-gate.js';
import { inSafeZone, hasLineOfSight } from '../shared/world.js';
import { RANGE_SHOTS, RANGE_COOLDOWN_MS } from '../server/sim/outpost-training.js';
import { createExpeditionOutpost } from '../client/src/severance-outpost.js';
import { makeRangeTarget, makeRangeConsole, makeArmoryAnchor, buildOutpostTraining, nearestPracticeTarget } from '../client/src/outpost-training.js';

function setup() {
  const g = makeGame(), p = g.addPlayer(makeChar('vanguard', { credits: 12 }));
  g.rng = () => .18;
  const obj = type => g.objects.find(o => o.type === type);
  const targets = g.objects.filter(o => o.type === 'outpost_range_target');
  place(p, R.console.x, R.console.z);
  return { g, p, obj, targets };
}

test('shelter training is in the rear corner and shares the server collision map', () => {
  assert.equal(R.lanes.length, 2);
  for (const o of [R.console, R.armory, ...R.lanes, R.backstop]) {
    assert.ok(Math.hypot(o.x - OP.x, o.z - OP.z) < OP.r, 'station is inside the safe camp');
  }
  const backstop = OUTPOST_COLLIDERS.find(c => c.type === 'outpost_training_backstop');
  const rack = OUTPOST_COLLIDERS.find(c => c.type === 'outpost_armory_rack');
  assert.ok(backstop && rack);
  assert.ok(R.lanes.every(l => l.x < backstop.x - backstop.hw));
  const { g, p, targets } = setup();
  p.char.activeWeapon = 'ranged';
  place(p, R.line.x - .7, R.line.z);
  assert.ok(inSafeZone(p));
  assert.ok(targets.every(t => hasLineOfSight(p, t)), 'both firing lanes have clear sightlines');
  assert.equal(g.objects.filter(o => ['outpost_range_console','outpost_armory'].includes(o.type)).length, 2);
});

test('five-shot training is server scored with cooldown, no rewards and no client-provided hit authority', () => {
  const { g, p, obj, targets } = setup();
  const console = obj('outpost_range_console'), target = targets[0];
  assert.equal(interact(g, p, target.id).ok, false, 'must start calibration');
  assert.ok(interact(g, p, console.id).ok);
  place(p, R.line.x - .7, R.line.z);
  assert.equal(interact(g, p, target.id).ok, false, 'ranged mode required');
  p.char.activeWeapon = 'ranged';
  const before = { xp: p.char.xp, credits: p.char.credits, inv: [...p.char.inventory], hp: p.hp };
  assert.ok(interact(g, p, target.id).ok);
  assert.equal(interact(g, p, target.id).ok, false, 'cannot spam interactions during recovery');
  assert.equal(p.outpostTraining.shots, 1);
  for (let i = 1; i < RANGE_SHOTS; i++) {
    g.time += RANGE_COOLDOWN_MS;
    assert.ok(interact(g, p, targets[i % 2].id).ok);
  }
  assert.equal(p.outpostTraining.active, false);
  assert.equal(p.outpostTraining.hits, RANGE_SHOTS);
  assert.equal(p.outbox.filter(e => e.e === 'range_shot').length, RANGE_SHOTS);
  assert.equal(interact(g, p, target.id).ok, false, 'completed sessions cannot be replayed');
  assert.deepEqual({ xp: p.char.xp, credits: p.char.credits, inv: p.char.inventory, hp: p.hp }, before);
  assert.ok(interact(g, p, console.id).ok, 'console resets session');
  assert.equal(p.outpostTraining.shots, 0);
});

test('range and armory reject invalid or unsafe interactions without altering inventory', () => {
  const { g, p, obj, targets } = setup();
  const console = obj('outpost_range_console'), armory = obj('outpost_armory');
  assert.ok(interact(g, p, armory.id).ok);
  assert.equal(p.char.inventory.length, makeChar('vanguard').inventory.length);
  place(p, OP.x - OP.r - 10, OP.z);
  assert.equal(interact(g, p, console.id).ok, false);
  place(p, console.x, console.z);
  p.dead = true;
  assert.equal(interact(g, p, console.id).ok, false);
  p.dead = false;
  assert.ok(interact(g, p, console.id).ok);
  p.char.activeWeapon = 'ranged';
  p.combatUntil = g.time + 1000;
  place(p, R.line.x - .7, R.line.z);
  assert.equal(interact(g, p, targets[0].id).ok, false);
  p.combatUntil = 0;
  place(p, R.line.x + .3, R.line.z);
  assert.equal(interact(g, p, targets[0].id).ok, false, 'cannot shoot past the firing line');
});

test('armory and range models retain interactive geometry and bounded rendering budgets', () => {
  for (const build of [makeRangeTarget, makeRangeConsole, makeArmoryAnchor]) {
    const model = build(THREE);
    assert.ok(model.group.children.length > 0, 'clickable model has actual geometry');
    model.trigger('hit'); model.update(.1);
    model.dispose();
  }
  const group = new THREE.Group();
  const op = createExpeditionOutpost(THREE, { group, ground: () => 0 });
  op.update(.1, 0, { x: OP.x, z: OP.z });
  assert.deepEqual(op.stats().training.lanes, R.lanes.length);
  assert.equal(op.stats().training.lights, 0);
  op.dispose();
});

test('F-key on the marked firing line prioritizes practice targets over closer services', () => {
  const centre = { x: R.line.x - .7, z: R.line.z };
  const self = { id: 1, dead: false };
  const consoleObj = { id: 2, meta: { k: 'o', c: 'outpost_range_console' }, row: { ...R.console } };
  const targets = R.lanes.map((lane, i) => ({ id: i + 3, meta: { k: 'o', c: 'outpost_range_target' }, row: { ...lane } }));
  const entities = new Map([self, consoleObj, ...targets].map(e => [e.id, e]));
  assert.equal(nearestPracticeTarget(entities, 1, centre)?.id, 4, 'closest firing target wins even when the console is nearer');
  assert.equal(nearestPracticeTarget(entities, 1, { ...R.console }), null, 'away from firing line F uses the normal interaction chooser');
  self.dead = true;
  assert.equal(nearestPracticeTarget(entities, 1, centre), null);
});

test('off-origin weapon donors are fitted centrally into every armory slot', async () => {
  const loader = { async loadAsync() {
    const scene = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, .2, .25), new THREE.MeshStandardMaterial());
    mesh.position.set(5, .7, -1);
    scene.add(mesh);
    return { scene };
  } };
  const station = buildOutpostTraining(THREE, { ground: () => 0, loader });
  station.update(.016, 1, { x: OP.x, z: OP.z });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(station.stats().loadedWeapons, 4);
  const rack = station.group.getObjectByName('outpost-training:armory');
  for (const name of ['field-pattern', 'tuned-pattern', 'dense-pattern', 'longpoint']) {
    const donor = rack.getObjectByName('outpost-training:weapon-' + name);
    assert.ok(donor, 'weapon display exists: ' + name);
    const world = new THREE.Box3().setFromObject(donor);
    const centre = world.getCenter(new THREE.Vector3());
    assert.ok(Math.abs(centre.x - R.armory.x) < .0001, 'donor centred despite off-origin source: ' + name);
    assert.ok(Math.abs(centre.z - (R.armory.z - .4)) < .0001, 'donor clear of rack backing');
  }
  station.dispose();
});
