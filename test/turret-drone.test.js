import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import { ENEMIES, SPAWNS } from '../shared/content.js';
import { resolveCollisions } from '../shared/world.js';
import { createTurretDrone } from '../client/src/turret-drone.js';

const free = (x, z, r) => {
  const p = resolveCollisions({ x, z }, r);
  return Math.hypot(p.x - x, p.z - z) < 1e-6;
};

test('Turret Drone content is registered and spawned on valid terrain', () => {
  const def = ENEMIES.turret_drone;
  assert.equal(def.name, 'Turret Drone');
  assert.ok(def.attack.range >= 16);
  assert.equal(def.specials[0].id, 'turret_drone_barrage');
  assert.equal(def.attack.kind, 'bolt');
  const spawns = SPAWNS.filter(s => s.type === 'turret_drone');
  assert.equal(spawns.length, 8);
  for (const spawn of spawns) assert.ok(free(spawn.x, spawn.z, def.radius), 'spawn is collision-free');
});

test('TurretDrone presentation builds without GLB and tracks a target', () => {
  const model = createTurretDrone(null, () => {});
  assert.equal(model.kind, 'procedural');
  assert.ok(model.group instanceof THREE.Group);
  model.group.updateMatrixWorld(true);
  model.update(0.016, { speed: 2.5, lookAt: new THREE.Vector3(4, 1.3, 6), attack: 0.8, act: 'attack' });
  const yaw = model.group.getObjectByName('TurretYaw');
  const pitch = model.group.getObjectByName('TurretPitch');
  const spin = model.group.getObjectByName('BarrelSpin');
  assert.ok(Math.abs(yaw.rotation.y) > 0.001, 'turret yaws');
  assert.ok(Math.abs(pitch.rotation.x) > 0.001, 'turret pitches');
  assert.ok(Math.abs(spin.rotation.z) > 0.001, 'barrels spin');
  model.dispose();
});

// Exercise the actual exported named pivots, not only the fallback.
test('Turret Drone GLB retains the full articulated presentation hierarchy', () => {
  const glb = readFileSync(new URL('../client/assets/turret_drone.glb', import.meta.url));
  const doc = JSON.parse(glb.toString('utf8', 20, 20 + glb.readUInt32LE(12)));
  const nodes = doc.nodes.map(n => {
    const g = new THREE.Group(); g.name = n.name || '';
    if (n.translation) g.position.fromArray(n.translation);
    if (n.rotation) g.quaternion.fromArray(n.rotation);
    if (n.scale) g.scale.fromArray(n.scale);
    return g;
  });
  doc.nodes.forEach((n, i) => n.children?.forEach(c => nodes[i].add(nodes[c])));
  const root = new THREE.Group(); doc.scenes[doc.scene].nodes.forEach(i => root.add(nodes[i]));
  const rig = createTurretDrone(root);
  assert.equal(rig.kind, 'glb');
  for (const state of [{speed:3.2}, {attack:1}, {dead:true}]) {
    rig.update(.05, state);
    root.updateMatrixWorld(true);
    root.traverse(o => assert.ok(o.matrixWorld.elements.every(Number.isFinite)));
  }
  rig.dispose();
});
