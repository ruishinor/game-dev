import test from 'node:test';
import assert from 'node:assert/strict';
import { placePartyMarker } from '../client/src/minimap-party.js';

test('clustered party markers remain separated at the center and edge of the minimap', () => {
  for (const origin of [{ x: 0, z: 0 }, { x: 74, z: 0 }, { x: 54, z: 52 }]) {
    const occupied = [origin];
    for (let i = 0; i < 3; i++) {
      const marker = placePartyMarker(origin.x, origin.z, 75, occupied);
      assert.ok(Math.hypot(marker.x, marker.z) <= 75 + 1e-7);
      assert.ok(occupied.every(other => Math.hypot(marker.x - other.x, marker.z - other.z) >= 14));
      occupied.push(marker);
    }
  }
});
