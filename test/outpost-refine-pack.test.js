import test from 'node:test';
import assert from 'node:assert/strict';
import { materialFinish } from '../tools/assets/outpost-refine-pack.mjs';

test('source donor PBR finishing is materially differentiated without graphite default', () => {
  assert.equal(materialFinish('Inner_BronzeRail').family, 'aged-bronze');
  assert.equal(materialFinish('GripRubber').family, 'ebony-polymer');
  assert.equal(materialFinish('Ceramic_OuterShell').family, 'warm-ceramic');
  assert.equal(materialFinish('OpticEmitter').family, 'instrument');
  assert.notDeepEqual(materialFinish('Inner_BronzeRail').color, materialFinish('Ceramic_OuterShell').color);
  for (const name of ['Frame', 'Ceramic', 'Rubber', 'Optic']) {
    const f = materialFinish(name);
    assert.ok([f.metallic, f.roughness, ...f.color.slice(0,3)].every(Number.isFinite));
    assert.ok(f.metallic >= 0 && f.metallic <= 1);
    assert.ok(f.roughness >= 0 && f.roughness <= 1);
  }
});
