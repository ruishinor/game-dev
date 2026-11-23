import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import validator from 'gltf-validator';
import { refineFoundryGlb } from '../tools/assets/refine-foundry-glb.mjs';

const file = new URL('../tools/asset-pipeline/assets/foundry_kit/outputs/foundry_kit.glb', import.meta.url);
const bytes = readFileSync(file);
const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const jsonLength = view.getUint32(12, true);
const doc = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
const refs = ['Wall_Bay', 'Press', 'Vat_Frame', 'Resonator_Base', 'Pylon', 'Door_Frame', 'Truss'];

test('actual Foundry GLB contains seven independently authored topology refinements, without deleting the eleven original meshes', () => {
  assert.equal(bytes.toString('utf8', 0, 4), 'glTF');
  assert.equal(view.getUint32(4, true), 2);
  assert.equal(view.getUint32(8, true), bytes.byteLength);
  assert.equal(doc.extras?.attunementFoundryRemesh?.revision, 1);
  assert.equal(doc.extras.attunementFoundryRemesh.preservedBaseMeshes, 11);
  assert.equal(doc.extras.attunementFoundryRemesh.addedMeshes, 7);
  assert.ok(doc.extras.attunementFoundryRemesh.addedTriangles >= 26000);
  assert.equal(doc.meshes.length, 18);
  assert.ok(doc.materials.some((m) => m.name === 'FK_RefinedHardSurface'));
  assert.ok(doc.extensionsRequired?.includes('EXT_meshopt_compression'), 'retain compressed original mesh buffers');
  for (const name of refs) {
    const root = doc.nodes.find((node) => node.name === name);
    const detail = doc.nodes.find((node) => node.name === name + '_HardSurface');
    assert.ok(root && detail, name + ': both original and refined mesh must exist');
    assert.ok(root.children?.includes(doc.nodes.indexOf(detail)), name + ': runtime kit traversal must include detail');
    const prim = doc.meshes[detail.mesh].primitives[0];
    assert.ok(prim.attributes.POSITION !== undefined && prim.attributes.NORMAL !== undefined && prim.attributes.COLOR_0 !== undefined);
    assert.ok(doc.accessors[prim.indices].count % 3 === 0);
    const original = doc.extras.attunementFoundryRemesh.pieces[name];
    assert.equal(doc.accessors[prim.indices].count / 3, original.triangles);
  }
});

test('refinement is stable and never applies repeatedly to the same GLB', () => {
  const output = refineFoundryGlb(bytes.toString('base64'));
  assert.equal(output.report.alreadyRefined, true);
  assert.deepEqual(Buffer.from(output.base64, 'base64'), bytes);
});

test('Khronos glTF validator accepts the actually committed Foundry GLB', async () => {
  const result = await validator.validateBytes(new Uint8Array(bytes), {maxIssues:100});
  assert.equal(result.issues.numErrors, 0, JSON.stringify(result.issues.messages, null, 2));
});
