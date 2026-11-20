import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as THREE from 'three';
import { makeGame, makeChar, place, travelToFoundry } from './helpers.js';
import { interact, onEnemyKilled } from '../server/sim/progress.js';
import { SILENT_FOUNDRY as F, FOUNDRY_COLLIDERS, FOUNDRY_AREAS, foundryArea, inSilentFoundry } from '../shared/silent-foundry.js';
import { WORLD, PLAYER_RADIUS, stepMove, resolveCollisions, hasLineOfSight, travelRegionAt, zoneAt, groundHeight, inSeverancePocket, COLLIDERS } from '../shared/world.js';
import { buildSilentFoundry, FOUNDRY_LIMITS } from '../client/src/silent-foundry.js';

const ready = (g) => g.addPlayer(makeChar('vanguard', { level: 3, attunements: ['resonance'], riftCalibration: 'completed' }));

test('the Severance Gate leads into the Silent Foundry; the encounter is shared and persists', async () => {
  const g = makeGame(), p = ready(g), q = ready(g);
  assert.ok((await travelToFoundry(g, p)).ok);
  assert.ok(inSilentFoundry(p.x, p.z));
  assert.equal(travelRegionAt(p.x, p.z), 'silent_foundry');
  assert.equal(zoneAt(p.x, p.z), 'Silent Foundry · Fabrication Hall');
  const encounter = g.enemies.filter((e) => e.foundryEncounter);
  assert.ok(encounter.length >= 12);
  for (const a of FOUNDRY_AREAS) assert.ok(encounter.some((e) => foundryArea(e.x, e.z) === a.name), a.name + ' is populated');
  assert.equal(encounter.filter((e) => e.overseer).length, 1);
  assert.equal(foundryArea(encounter.find((e) => e.overseer).x, encounter.find((e) => e.overseer).z), 'Excavation Depths');
  encounter[0].hp -= 1;
  assert.ok((await travelToFoundry(g, q)).ok);
  assert.equal(g.enemies.filter((e) => e.foundryEncounter).length, encounter.length, 'no reset-on-entry');
  assert.ok(encounter[0].hp < encounter[0].maxHp);
  // the return portal: out of combat only, to the gate's foot; reconnect inside returns to the Reach spawn
  const exit = g.objects.find((o) => o.type === 'foundry_return');
  place(p, exit.x, exit.z - 3.6);
  p.combatUntil = g.time + 1000;
  assert.equal(interact(g, p, exit.id).ok, false);
  p.combatUntil = 0;
  assert.ok(interact(g, p, exit.id).ok);
  assert.ok(inSeverancePocket(p.x, p.z));
  place(q, F.arrival.x, F.arrival.z);
  g.syncChar(q);
  assert.deepEqual(q.char.pos, WORLD.spawn);
});

test('four chambers in a line, joined by doorways; walls are solid; the Depths descend', () => {
  const x = F.x;
  assert.deepEqual(FOUNDRY_AREAS.map((a) => foundryArea(x, F.z + (a.v0 + a.v1) / 2)), ['Fabrication Hall', 'Cultivation Vault', 'Harmonic Chamber', 'Excavation Depths']);
  // a route on foot links the arrival to the cache through every doorway
  const R = PLAYER_RADIUS, cell = 0.75, key = (i, j) => i * 10000 + j;
  const open = (px, pz) => inSilentFoundry(px, pz) && Math.abs(px - F.x) <= F.hw - R && Math.abs(pz - F.z) <= F.hd - R
    && !COLLIDERS.some((c) => c.r !== undefined ? Math.hypot(px - c.x, pz - c.z) < c.r + R : Math.abs(px - c.x) < c.hw + R && Math.abs(pz - c.z) < c.hd + R);
  const start = [Math.round((F.arrival.x - F.x) / cell), Math.round((F.arrival.z - F.z) / cell)];
  const q = [start], seen = new Set([key(...start)]);
  let found = false;
  while (q.length && !found) {
    const [i, j] = q.shift();
    if (Math.hypot(F.x + i * cell - F.cache.x, F.z + j * cell - F.cache.z) < 2.5) found = true;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = key(i + di, j + dj);
      if (seen.has(k) || !open(F.x + (i + di) * cell, F.z + (j + dj) * cell)) continue;
      seen.add(k); q.push([i + di, j + dj]);
    }
  }
  assert.ok(found, 'the arrival reaches the Depths cache on foot');
  // beside a doorway the partition blocks movement and sight
  const blocked = { x: x + 10, z: F.z + 56, jy: 0, vy: 0 };
  for (let i = 0; i < 300; i++) stepMove(blocked, { f: 1, s: 0, yaw: Math.PI, j: false }, 1);
  assert.ok(blocked.z > F.z + 52, 'partition stops the player');
  assert.equal(hasLineOfSight({ x: x + 10, z: F.z + 56 }, { x: x + 10, z: F.z + 46 }), false);
  assert.ok(groundHeight(x, F.z - 90) < -3.5 && groundHeight(x, F.z + 60) === 0);
  for (const c of FOUNDRY_COLLIDERS) assert.ok(inSilentFoundry(c.x, c.z), c.type);
  // never reachable on foot from the Reach or the Expanse
  const out = resolveCollisions({ x: F.x + F.hw + 3, z: F.z }, PLAYER_RADIUS);
  assert.ok(inSilentFoundry(out.x, out.z));
});

test('the Depths cache rewards only those who fought through, once, and never in combat', () => {
  const g = makeGame(), p = ready(g), q = ready(g);
  for (const pl of [p, q]) place(pl, F.arrival.x, F.arrival.z);
  g.openExpanse?.();
  const { openFoundry } = g;
  // spawn through the real gate path
  return travelToFoundry(g, p).then(() => {
    const cache = g.objects.find((o) => o.type === 'foundry_cache');
    const mob = g.enemies.find((e) => e.foundryEncounter && !e.overseer), boss = g.enemies.find((e) => e.overseer);
    place(q, cache.x, cache.z + 2);
    assert.equal(interact(g, q, cache.id).ok, false, 'no participation');
    place(p, mob.x, mob.z); onEnemyKilled(g, mob, [p.id]);
    assert.equal(p.char.foundryProgress, 1);
    place(p, boss.x, boss.z); onEnemyKilled(g, boss, [p.id]);
    assert.equal(p.char.foundryProgress, 3);
    place(p, cache.x, cache.z + 2);
    p.combatUntil = g.time + 1000;
    assert.equal(interact(g, p, cache.id).ok, false);
    p.combatUntil = 0;
    assert.ok(interact(g, p, cache.id).ok);
    assert.equal(p.char.materials.resonance_fragment, 4);
    assert.equal(interact(g, p, cache.id).ok, false, 'no replay');
    assert.equal(interact(g, q, cache.id).ok, false);
    assert.equal(openFoundry, undefined);
  });
});

test('Foundry encounter data stays server-only', async () => {
  for (const f of readdirSync('client/src', { recursive: true }).filter((n) => String(n).endsWith('.js'))) {
    const src = readFileSync('client/src/' + f, 'utf8');
    assert.ok(!src.includes('server/sim/silent-foundry') && !src.includes('Foundry Overseer'), f);
  }
  assert.ok(!readFileSync('shared/silent-foundry.js', 'utf8').includes('Overseer'));
  const { startServer } = await import('../server/index.js');
  const srv = await startServer({ port: 0, dataFile: null });
  try {
    for (const url of ['/server/sim/silent-foundry.js', '/client/../server/sim/silent-foundry.js']) assert.notEqual((await fetch('http://127.0.0.1:' + srv.port + url)).status, 200, url);
    assert.equal((await fetch('http://127.0.0.1:' + srv.port + '/shared/silent-foundry.js')).status, 200, 'shared geometry is public by design');
  } finally { await srv.close(); }
});

test('Foundry presentation: hidden outside, bounded lights, restores lighting on leaving', () => {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x123456, 10, 300);
  const sun = new THREE.DirectionalLight(0xffffff, 3), ambient = new THREE.HemisphereLight(0xffffff, 0x000000, 1.7), sky = new THREE.Group();
  const f = buildSilentFoundry(THREE, scene, { lighting: { sun, ambient, sky } });
  f.update(0.1, 0, { x: 0, y: 2, z: 0 });
  assert.equal(f.group.visible, false);
  f.update(0.1, 0, { x: F.arrival.x, y: 2, z: F.arrival.z });
  assert.equal(f.group.visible, true);
  assert.equal(sky.visible, false);
  assert.ok(sun.intensity < 1 && scene.fog.far < 200);
  let lights = 0;
  f.group.traverse((o) => { if (o.isLight) lights++; });
  assert.equal(lights, FOUNDRY_LIMITS.lights);
  f.update(0.1, 0, { x: 0, y: 2, z: 0 });
  assert.equal(sun.intensity, 3); assert.equal(ambient.intensity, 1.7); assert.equal(sky.visible, true);
  assert.equal(scene.fog.far, 300); assert.equal(scene.fog.color.getHex(), 0x123456);
  f.dispose();
  assert.equal(f.group.parent, null);
  assert.ok(COLLIDERS.length > 0);
});
