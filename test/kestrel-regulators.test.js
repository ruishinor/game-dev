import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { DEEP, PROPS, hasLineOfSight } from '../shared/world.js';
import { buildKestrelRegulatorGallery, KESTREL_REGULATOR_LIMITS } from '../client/src/kestrel-regulator-gallery.js';
import { buildKestrelPressurePlant } from '../client/src/kestrel-pressure-plant.js';

test('Kestrel regulation bays couple to both vessel feeds without entering the player route', () => {
  const before = PROPS.filter(p => p.type.startsWith('deep_')).map(p => ({ ...p }));
  const model = buildKestrelRegulatorGallery(T);
  const meshes = [];
  model.group.traverse(o => { if (o.isMesh) meshes.push(o); });
  assert.equal(model.stats.bays, 2);
  assert.equal(model.stats.newLights, 0);
  assert.equal(model.stats.colliderChanges, 0);
  assert.equal(meshes.length, KESTREL_REGULATOR_LIMITS.pipeMeshes + KESTREL_REGULATOR_LIMITS.batchMeshes);
  for (const name of ['kestrel:regulator-pressure-inlet', 'kestrel:regulator-roof-relief']) {
    assert.equal(model.group.children.filter(o => o.name === name).length, 2);
  }
  const gauges = model.group.getObjectByName('kestrel:regulator-dial-rims');
  const indicators = model.group.getObjectByName('kestrel:regulator-status-indicators');
  assert.ok(gauges.isInstancedMesh && gauges.count === 2);
  assert.ok(indicators.isInstancedMesh && indicators.count === 6);
  const bounds = new T.Box3().setFromObject(model.group);
  assert.ok(bounds.min.x > -DEEP.hw && bounds.max.x < -5, 'equipment must remain on the western wall');
  assert.ok(bounds.min.y > 3.5 && bounds.max.y < DEEP.roofBottom-DEEP.floor, 'keep clear of player and roof');
  assert.ok(bounds.min.z > -DEEP.hd && bounds.max.z < DEEP.hd);
  assert.deepEqual(PROPS.filter(p => p.type.startsWith('deep_')), before);
  assert.equal(hasLineOfSight({ x: DEEP.x, z: DEEP.z },
    { x: DEEP.x + DEEP.hw + 2, z: DEEP.z }), true);
  for (const mesh of meshes) {
    const positions = mesh.geometry.getAttribute('position');
    assert.ok(positions && positions.array.every(Number.isFinite));
  }
  model.dispose();
});
test('regulator machinery remains integrated with the existing pressure plant', () => {
  const model = buildKestrelPressurePlant(T);
  assert.equal(model.stats.regulatorBays, 2);
  assert.ok(model.group.getObjectByName('kestrel:pressure-regulator-gallery'));
  assert.ok(model.group.getObjectByName('kestrel:regulator-isolation-wheels'));
  assert.equal(model.stats.colliderChanges, 0);
  assert.equal(model.stats.newLights, 0);
  model.update(3, { reducedMotion: true });
  model.dispose();
});
