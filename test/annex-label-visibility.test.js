import test from 'node:test';
import assert from 'node:assert/strict';
import { RIFT_ANNEX } from '../shared/world.js';
import { annexPlateUnobstructed } from '../client/src/annex-label-visibility.js';

const at = (x, z) => ({ x: RIFT_ANNEX.x + x, z });

test('Null Chamber cache nameplate cannot be seen through both Annex bulkheads', () => {
  const cache = at(0, -30);
  assert.equal(annexPlateUnobstructed(at(0, 27), cache, 'o'), false);
  assert.equal(annexPlateUnobstructed(at(0, 0), cache, 'o'), false);
  assert.equal(annexPlateUnobstructed(at(0, -26), cache, 'o'), true);
});

test('enemy plates respect offset sightlines but valid nearby return remains discoverable', () => {
  assert.equal(annexPlateUnobstructed(at(0, 16), at(0, 7), 'e'), false);
  assert.equal(annexPlateUnobstructed(at(6, 16), at(6, 7), 'e'), true);
  assert.equal(annexPlateUnobstructed(at(0, 27), at(0, 30.5), 'o'), true);
});

test('party and companion labels remain visible across Annex partitions', () => {
  assert.equal(annexPlateUnobstructed(at(0, 27), at(0, -30), 'p'), true);
  assert.equal(annexPlateUnobstructed(at(0, 27), at(0, -30), 'c'), true);
  assert.equal(annexPlateUnobstructed(null, at(0, -30), 'o'), true);
});
