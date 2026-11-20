import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildSanctumCrown, CROWN } from '../client/src/sanctum-crown.js';
import { PROPS, COLLIDERS, groundHeight, WORLD } from '../shared/world.js';

test('the Lattice Crown rests on the existing pylons, stays above head height, adds no colliders, few draws', () => {
  const before = COLLIDERS.length;
  const scene = new THREE.Scene();
  const pylons = PROPS.filter((p) => p.type === 'pylon');
  assert.equal(pylons.length, 6);
  const crown = buildSanctumCrown(THREE, scene, { pylons, ground: groundHeight });
  assert.equal(COLLIDERS.length, before);
  let meshes = 0, lights = 0;
  const box = new THREE.Box3();
  crown.group.updateMatrixWorld(true);
  crown.group.traverse((n) => {
    if (n.isLight) lights++;
    if (!n.isMesh) return;
    meshes++;
    n.geometry.computeBoundingBox();
    box.copy(n.geometry.boundingBox).applyMatrix4(n.matrixWorld);
    // anything inside the walkable Sanctum disc must be above head height, except the pylon-head roots
    if (Math.hypot((box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2) < WORLD.sanctum.r - 2.5) assert.ok(box.min.y > 4.5 || n.name === 'sanctum:crown-merged', n.name);
  });
  assert.equal(lights, CROWN.lights);
  assert.ok(meshes <= 14, 'merged static parts: ' + meshes);
  crown.update(0.5);
  crown.dispose();
  assert.equal(crown.group.parent, null);
});
