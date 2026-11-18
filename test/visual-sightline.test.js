import assert from 'node:assert/strict';
import test from 'node:test';
import { intersectsOccluder } from '../client/src/occlusion.js';

const at = (x, y, z) => ({ x, y, z });

test('foreground sightlines detect narrow stems and caps without fading beside or under them', () => {
  const eye = at(0, 2, 0);
  const target = at(20, 2, 0);
  const stem = { x: 3.25, z: 0, r2: 0.1 ** 2, y0: 0, y1: 3 };
  assert.ok(intersectsOccluder(eye, target, stem));
  assert.ok(!intersectsOccluder(eye, target, { ...stem, z: 0.11 }));
  assert.ok(!intersectsOccluder(eye, target, { ...stem, x: 20.4 }));
  const cap = { ...stem, x: 5, r2: 1, y0: 3, y1: 4 };
  assert.ok(!intersectsOccluder(eye, target, cap));
  assert.ok(intersectsOccluder(at(0, 5, 0), at(10, 2, 0), cap));
  assert.ok(intersectsOccluder(at(5, 7, 0), at(5, 0, 0), cap));
  assert.ok(!intersectsOccluder(at(5, 7, 0), at(5, 5, 0), cap));
});
