import test from 'node:test';
import assert from 'node:assert/strict';
import { SPINDLE_LIGHT, activeSpindleLights } from '../client/src/spindle-light.js';

const point = { x: 0, y: 0, z: 0 };
function companion(id, x, opts = {}) {
  return {
    id, meta: { k: 'c', c: opts.type || 'spindle' },
    placed: opts.placed ?? true,
    row: { li: opts.on === false ? 0 : 1, a: opts.act || 'idle' },
    pos: { x, y: 0, z: 0 },
  };
}

test('Spindle field light is exactly 10m and constrained to a fixed local light pool', () => {
  assert.equal(SPINDLE_LIGHT.range, 10);
  assert.equal(SPINDLE_LIGHT.maxSources, 3);
  const others = [
    companion(5, 2), companion(7, 7), companion(1, 4),
    companion(3, 1, { on: false }), companion(4, 1, { act: 'dormant' }),
    companion(9, 1, { type: 'mender' }), companion(10, 1, { placed: false }),
    companion(6, 100), companion(8, 8),
  ];
  assert.deepEqual(activeSpindleLights(others, point).map(ent => ent.id), [5, 1, 7]);
  assert.deepEqual(activeSpindleLights([], point), []);
  assert.deepEqual(activeSpindleLights([companion(3, 80)], point).map(e => e.id), [3]);
  assert.deepEqual(activeSpindleLights([companion(3, 80.001)], point), []);
});

test('light source eligibility is based on server state, not a locally selected mode', () => {
  const c = companion(42, 5);
  c.row.md = 'stay';
  assert.deepEqual(activeSpindleLights([c], point), [c]);
  c.row.md = 'inspect';
  assert.deepEqual(activeSpindleLights([c], point), [c]);
  c.row.li = 0;
  assert.deepEqual(activeSpindleLights([c], point), []);
});
