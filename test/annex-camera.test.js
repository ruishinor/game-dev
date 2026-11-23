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

test('Annex outer visual walls prevent orbiting into opaque room exteriors', () => {
  const cases = [
    { label: 'east', x: RIFT_ANNEX.x + RIFT_ANNEX.hw - 2.5, z: 0, yaw: -Math.PI / 2 },
    { label: 'west', x: RIFT_ANNEX.x - RIFT_ANNEX.hw + 2.5, z: 0, yaw: Math.PI / 2 },
    { label: 'north', x: RIFT_ANNEX.x - 8, z: RIFT_ANNEX.hd - 2.5, yaw: Math.PI },
    { label: 'south', x: RIFT_ANNEX.x + 8, z: -RIFT_ANNEX.hd + 2.5, yaw: 0 },
  ];
  for (const { label, x, z, yaw } of cases) {
    const camera = new THREE.PerspectiveCamera();
    const orbit = new ThirdPersonCamera(camera);
    orbit.pitch = .15;
    orbit.yaw = yaw;
    orbit.want = orbit.dist = 12;
    orbit.update({ x, z, y: 0 }, 1 / 60);
    assert.ok(orbit.dist < 4, label + ': wall must shorten camera orbit');
    assert.ok(Math.abs(camera.position.x - RIFT_ANNEX.x) < RIFT_ANNEX.hw - .3);
    assert.ok(Math.abs(camera.position.z - RIFT_ANNEX.z) < RIFT_ANNEX.hd - .3);
  }
});

test('outside the Annex the camera retains its normal free orbit', () => {
  const camera = new THREE.PerspectiveCamera();
  const orbit = new ThirdPersonCamera(camera);
  orbit.yaw = Math.PI / 2;
  orbit.pitch = .15;
  orbit.dist = orbit.want = 8;
  orbit.update({ x: 0, y: 0, z: 120 }, 1 / 60);
  assert.ok(orbit.dist > 7.5);
});

test('Annex camera still remains inside when the player presses the outer collision margin', () => {
  const camera = new THREE.PerspectiveCamera();
  const orbit = new ThirdPersonCamera(camera);
  orbit.pitch = .12;
  orbit.yaw = -Math.PI / 2;
  orbit.want = orbit.dist = 10;
  orbit.update({ x: RIFT_ANNEX.x + RIFT_ANNEX.hw - .5, y: 0, z: 0 }, .016);
  assert.ok(camera.position.x <= RIFT_ANNEX.x + RIFT_ANNEX.hw - .54);
  assert.ok(orbit.dist < 1, 'tight wall camera falls back to close framing');
});
