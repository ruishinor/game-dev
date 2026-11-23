import test from 'node:test';
import assert from 'node:assert/strict';
import { materialFinish, rankOutpostDonors } from '../tools/assets/outpost-refine-pack.mjs';

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

test('bounded remesh shortlist prioritises actual range and weapon donors over unrelated tiny kits', () => {
  const rows = [
    {path: 'modelpack - Zombie Quarantine Streets.glb', bytes: 1200, triangles: 1512},
    {path: 'modelpack - Targeting rune ring (Sunfall Rift).glb', bytes: 800, triangles: 1440},
    {path: 'modelpack - FPS Guns and Shooting Range.glb', bytes: 85000, triangles: 21356},
    {path: 'glb-low-poly-models-building-blocks/longpoint.glb', bytes: 95000, triangles: 18468},
    {path: 'modelpack - Modular Survival Base Builder.glb', bytes: 50000, triangles: 7496},
    {path: 'model - Chain Link Fence Bay 4 m.glb', bytes: 2000, triangles: 400},
  ];
  const selected = rankOutpostDonors(rows).map(x => x.path);
  assert.ok(selected[0].endsWith('/longpoint.glb'));
  assert.ok(selected[1].includes('FPS Guns and Shooting Range'));
  const position = (fragment) => selected.findIndex(name => name.includes(fragment));
  assert.ok(position('Modular Survival Base Builder.glb') >= 0);
  assert.ok(position('Zombie Quarantine Streets.glb') >= 0);
  assert.ok(position('Chain Link Fence Bay 4 m.glb') >= 0);
  assert.ok(position('Targeting rune ring') >= 0);
  assert.ok(position('Modular Survival Base Builder.glb') < position('Zombie Quarantine Streets.glb'));
  assert.ok(position('Chain Link Fence Bay 4 m.glb') < position('Targeting rune ring'));
  assert.equal(rows[0].path, 'modelpack - Zombie Quarantine Streets.glb', 'input order unchanged');
});
