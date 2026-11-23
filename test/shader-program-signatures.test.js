import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotShaderPrograms, describeNewShaderPrograms } from '../client/src/shader-program-signatures.js';

test('identifies new program objects even when program count stays constant', () => {
  const old = { name: 'MeshStandardMaterial', cacheKey: 'old-secret' };
  const fresh = { name: 'MeshBasicMaterial', cacheKey: 'shader-variant-key' };
  const observed = describeNewShaderPrograms([old], [fresh]);
  assert.equal(observed.count, 1);
  assert.deepEqual(observed.families, [{ name: 'MeshBasicMaterial', count: 1 }]);
  assert.equal(observed.signatures[0].length, 8);
  assert.ok(!JSON.stringify(observed).includes('shader-variant-key'));
});

test('snapshot copies the array so later append is attributed to the next stage', () => {
  const renderer = { info: { programs: [{}] } };
  const before = snapshotShaderPrograms(renderer);
  renderer.info.programs.push({ name: 'MeshStandardMaterial' });
  assert.equal(before.length, 1);
  assert.equal(describeNewShaderPrograms(before, renderer.info.programs).count, 1);
});

test('families and fingerprints are capped; raw keys never leave the probe', () => {
  const added = Array.from({ length: 50 }, (_, i) => ({
    name: `Effect!${i}`, cacheKey: `private raw shader source ${i}`,
  }));
  const result = describeNewShaderPrograms([], added, 3);
  assert.equal(result.count, 50);
  assert.equal(result.families.length, 3);
  assert.equal(result.omittedFamilies, 47);
  assert.equal(result.signatures.length, 16);
  assert.equal(result.signaturesOmitted, 34);
  assert.ok(!JSON.stringify(result).includes('private raw'));
});

test('renderer without program introspection returns null instead of throwing', () => {
  assert.equal(snapshotShaderPrograms({}), null);
  assert.equal(describeNewShaderPrograms(null, []), null);
  assert.equal(describeNewShaderPrograms([], []).count, 0);
});
