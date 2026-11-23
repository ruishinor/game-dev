import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ThirdPersonCamera } from '../client/src/camera.js';
import { ANNEX_ROOMS, ANNEX_SHELL_HEIGHT } from '../client/src/annex-interior.js';
import { RIFT_ANNEX } from '../shared/world.js';

test('high-angle third-person camera cannot pass through any Annex chamber roof', () => {
  for (const room of ANNEX_ROOMS) {
    const camera = new THREE.PerspectiveCamera();
    const orbit = new ThirdPersonCamera(camera);
    orbit.pitch = 1.25;
    orbit.yaw = 0;
    orbit.want = 14;
    orbit.dist = 14;
    orbit.update({ x: RIFT_ANNEX.x, y: 0, z: room.center }, 1 / 60);
    assert.ok(orbit.dist < orbit.want, room.name + ': roof collision should shorten orbit');
    assert.ok(camera.position.y < ANNEX_SHELL_HEIGHT - 0.6,
      room.name + ': camera must remain beneath the ceiling fixtures (y=' + camera.position.y + ')');
  }
});

test('low-angle interior camera is not forced into a ceiling-distance clamp', () => {
  const camera = new THREE.PerspectiveCamera();
  const orbit = new ThirdPersonCamera(camera);
  orbit.pitch = 0.12;
  orbit.yaw = Math.PI / 2;
  orbit.want = 5;
  orbit.dist = 5;
  orbit.update({ x: RIFT_ANNEX.x, y: 0, z: ANNEX_ROOMS[1].center }, 1 / 60);
  assert.ok(camera.position.y < ANNEX_SHELL_HEIGHT - 1);
  assert.ok(orbit.dist > 3, 'ordinary over-shoulder framing remains usable');
});
