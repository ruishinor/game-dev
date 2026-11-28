import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ThirdPersonCamera } from '../client/src/camera.js';
import { FOUNDRY_CEILING_HEIGHT } from '../client/src/silent-foundry.js';
import { SILENT_FOUNDRY as F, FOUNDRY_AREAS, foundryHeight } from '../shared/silent-foundry.js';
import { WORLD, groundHeight } from '../shared/world.js';

test('Foundry third-person camera stays below overhead structure throughout all four rooms', () => {
  for (const room of FOUNDRY_AREAS) {
    const x = room.name === 'Harmonic Chamber' ? 8 : F.x;
    const z = F.z + (room.v0 + room.v1) / 2;
    const camera = new THREE.PerspectiveCamera();
    const orbit = new ThirdPersonCamera(camera);
    orbit.pitch = 1.25;
    orbit.yaw = 0;
    orbit.want = 24;
    orbit.dist = 24;
    orbit.update({ x, y: foundryHeight(x, z), z }, 1 / 60);
    assert.ok(orbit.dist < orbit.want, room.name + ': roof/trusses must shorten high-angle orbit');
    assert.ok(camera.position.y < FOUNDRY_CEILING_HEIGHT - 2,
      room.name + ': orbit must remain under overhead trusses; got y=' + camera.position.y);
  }
});

test('normal over-shoulder Foundry framing does not acquire a ceiling clamp', () => {
  const camera = new THREE.PerspectiveCamera();
  const orbit = new ThirdPersonCamera(camera);
  orbit.pitch = 0.12;
  orbit.yaw = 0;
  orbit.want = 6;
  orbit.dist = 6;
  const z = F.z + 76;
  orbit.update({ x: F.x, y: foundryHeight(F.x, z), z }, 1 / 60);
  assert.ok(orbit.dist > 5, 'normal travel camera retains useful distance');
  assert.ok(camera.position.y < FOUNDRY_CEILING_HEIGHT - 2);
});

test('Foundry camera clearance does not impose a ceiling outside the region', () => {
  const camera = new THREE.PerspectiveCamera();
  const orbit = new ThirdPersonCamera(camera);
  orbit.pitch = 1.25;
  orbit.yaw = 0;
  orbit.want = 20;
  orbit.dist = 20;
  // Use a real traversable Reach position, not (400,400) far outside the
  // world radius, where the authored rim rises several kilometres and
  // correctly makes any camera ray collide with terrain.
  const x = 60, z = 55;
  assert.ok(Math.hypot(x,z) < WORLD.radius, 'test fixture must be within playable Reach terrain');
  orbit.update({ x, y: groundHeight(x,z), z }, 1 / 60);
  assert.ok(orbit.dist > 19, 'normal Reach terrain must not inherit the Foundry ceiling clamp');
});
