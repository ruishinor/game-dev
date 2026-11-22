import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildRiftControl } from '../client/src/rift-visual.js';

function inspect(regulator) {
  const model = buildRiftControl(THREE, regulator);
  const meshes = [], lights = [];
  model.group.traverse(o => {
    if (o.isMesh) meshes.push(o);
    if (o.isLight) lights.push(o);
  });
  const box = new THREE.Box3().setFromObject(model.group);
  return { model, meshes, lights, box };
}

test('both Phase Scar instruments have detailed, grounded, bounded, distinct sculptures', () => {
  for (const regulator of [false, true]) {
    const { model, meshes, lights, box } = inspect(regulator);
    try {
      assert.equal(model.group.name, regulator ? 'rift:regulator' : 'rift:indexer');
      assert.equal(model.radius, 0.65, 'existing interaction footprint is unchanged');
      assert.ok(meshes.length >= 45 && meshes.length <= 90, 'bounded geometry detail; no primitive six-part fallback');
      assert.equal(lights.length, 0, 'existing rift lighting is shared; no per-station point lights');
      assert.ok(box.min.y >= -0.001 && box.min.y < 0.03, 'plinth touches ground');
      assert.ok(box.max.y <= 1.72, 'no uncontrolled vertical overhang');
      assert.ok(Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z)) <= 0.65,
        'geometry stays inside the existing interaction radius');
      assert.ok(model.group.getObjectByName('rift:instrument-glass'));
      assert.ok(model.group.getObjectByName('rift:instrument-etched-readout'));
      assert.ok(model.group.getObjectByName('rift:instrument-ground-bolt'));
      assert.ok(meshes.every(m => m.material.isMeshStandardMaterial), 'material layers preserve PBR response');
      assert.ok(meshes.every(m => m.geometry.attributes.position.count < 1500), 'bounded per-mesh geometry');
      const specific = regulator ? 'rift:regulator-counterphase-rotor' : 'rift:indexer-crystal-needle';
      assert.ok(model.group.getObjectByName(specific), 'distinct functional instrument silhouette');
    } finally { model.dispose(); }
  }
});

test('instruments respond to phase without affecting reduced-motion or low-detail modes', () => {
  for (const regulator of [false, true]) {
    const { model } = inspect(regulator);
    try {
      const rotor = model.group.getObjectByName(regulator ? 'rift:regulator-counterphase-rotor' : 'rift:indexer-calibration-ring');
      assert.ok(rotor);
      const material = model.group.getObjectByName('rift:instrument-glass').material;
      model.update(0.05, { riftPhase: 'dormant', effectsQuality: 2 });
      const idle = material.emissiveIntensity;
      const before = regulator ? rotor.rotation.z : rotor.rotation.y;
      model.update(0.05, { riftPhase: 'unstable', effectsQuality: 2 });
      assert.ok(material.emissiveIntensity > idle, 'unstable phase raises emissive feedback');
      const moved = regulator ? rotor.rotation.z : rotor.rotation.y;
      assert.notEqual(moved, before, 'rotation integrates continuously with delta time');
      model.update(1, { riftPhase: 'unstable', effectsQuality: 2, reducedMotion: true });
      assert.equal(regulator ? rotor.rotation.z : rotor.rotation.y, moved, 'reduced motion freezes rotation');
      model.update(1, { riftPhase: 'stabilized', effectsQuality: 0 });
      assert.equal(regulator ? rotor.rotation.z : rotor.rotation.y, moved, 'low quality freezes costly motion');
      assert.ok(material.emissiveIntensity > 0, 'static phase feedback remains legible');
    } finally { model.dispose(); }
  }
});
