import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAnnexChamberDetail } from '../client/src/annex-chamber-detail.js';
import { createAnnexInterior, ANNEX_ROOMS, ANNEX_SHELL_HEIGHT } from '../client/src/annex-interior.js';
import { RIFT_ANNEX, ANNEX_PARTITIONS, COLLIDERS } from '../shared/world.js';

test('Annex instrument clusters are distinct and kept above or outside the walkable shell', () => {
  const colliders = COLLIDERS.length, partitions = ANNEX_PARTITIONS.length;
  const details = createAnnexChamberDetail(THREE, RIFT_ANNEX, ANNEX_ROOMS);
  assert.equal(details.stats.distinctRooms, 3);
  assert.ok(details.stats.batches <= 26, 'instrument details must be instanced rather than hundreds of draw calls');
  assert.ok(details.stats.instances >= 150, 'all chamber fixture variants should be populated');
  for (const name of [
    'annex:arrival-survey-rails', 'annex:arrival-survey-paddles',
    'annex:relay-power-distribution', 'annex:relay-live-busbars',
    'annex:null-oculus-outer', 'annex:null-oculus-sensor',
    'annex:route-recessed-waymarks',
  ]) assert.ok(details.group.getObjectByName(name), name + ' missing');

  const local = new THREE.Matrix4();
  const translation = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  details.group.traverse((node) => {
    if (!node.isInstancedMesh) return;
    for (let i = 0; i < node.count; i++) {
      node.getMatrixAt(i, local);
      local.decompose(translation, rotation, scale);
      assert.ok([...translation.toArray(), ...scale.toArray()].every(Number.isFinite),
        node.name + ': finite instance transform');
      assert.ok(translation.y + scale.y / 2 < ANNEX_SHELL_HEIGHT + 0.1,
        node.name + ': details stay below Annex roof');
      if (node.name === 'annex:route-recessed-waymarks') {
        assert.ok(translation.y + scale.y / 2 < 0.11, 'floor guidance is flush');
      } else {
        assert.ok(translation.y - scale.y / 2 > 2.2,
          node.name + ': decorative machinery does not introduce a false waist-high obstacle');
      }
    }
  });
  details.update(3, false);
  details.update(3, true);
  assert.equal(COLLIDERS.length, colliders);
  assert.equal(ANNEX_PARTITIONS.length, partitions);
  details.dispose();
});

test('integrated Annex detail has bounded costs and a safe disposal path', () => {
  const interior = createAnnexInterior(THREE, RIFT_ANNEX);
  assert.ok(interior.stats.detail.instances >= 150);
  assert.ok(interior.stats.detail.batches <= 26);
  interior.update({ x: RIFT_ANNEX.x, y: 2, z: RIFT_ANNEX.arrivalZ }, 8.2, false);
  interior.update({ x: RIFT_ANNEX.x, y: 2, z: RIFT_ANNEX.arrivalZ }, 8.2, true);
  assert.ok(interior.group.getObjectByName('annex:architectural-detail'));
  interior.dispose();
});
