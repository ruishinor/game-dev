import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { buildRift, PHASE_SCAR_URL } from '../client/src/rift-visual.js';
import { PHASE_RIFT_RADIUS } from '../shared/world.js';

const bytes = readFileSync(new URL('../tools/asset-pipeline/assets/phase_scar/outputs/phase_scar.glb', import.meta.url));

test('phase_scar.glb is versioned by content, valid glTF and within budget', async () => {
  assert.equal(PHASE_SCAR_URL, '/client/assets/phase_scar.glb?v=' + createHash('sha256').update(bytes).digest('hex').slice(0, 12));
  assert.ok(bytes.length < 3e6, 'GLB stays under 3 MB');
  const validator = (await import('gltf-validator')).default;
  const report = await validator.validateBytes(new Uint8Array(bytes), { externalResourceFunction: () => Promise.reject(new Error('external')) });
  assert.equal(report.issues.numErrors, 0);
});

test('the sculpted foundation fits the shared footprint and carries its emissive inserts', async () => {
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const { MeshoptDecoder } = await import('meshoptimizer');
  const { getBounds } = await import('@gltf-transform/core');
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.readBinary(new Uint8Array(bytes));
  const { min, max } = getBounds(doc.getRoot().listScenes()[0]);
  // footprint: inside the 2.45 m collision radius (anchor blocks may reach its rim)
  assert.ok(Math.max(-min[0], max[0]) < PHASE_RIFT_RADIUS + 0.2, 'width ' + min + ' ' + max);
  assert.ok(Math.max(-min[2], max[2]) < PHASE_RIFT_RADIUS + 0.2, 'depth ' + min + ' ' + max);
  assert.ok(max[1] < 5.6 && max[1] > 4.6, 'height ' + max[1]);
  const names = new Set(doc.getRoot().listMaterials().map((m) => m.getName()));
  for (const n of ['PS_Body', 'PS_Seam', 'PS_Rail', 'PS_Lens']) assert.ok(names.has(n), n);
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  assert.ok(tris < 40000, 'triangles ' + tris);
});

test('a loaded foundation replaces the stand-in and its inserts follow phase and flares', async () => {
  const scene = new THREE.Group();
  for (const n of ['PS_Body', 'PS_Seam', 'PS_Rail', 'PS_Lens']) {
    const mat = new THREE.MeshStandardMaterial(); mat.name = n;
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), mat));
  }
  const m = buildRift(THREE, null, null, { loader: { loadAsync: async () => ({ scene }) } });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(m.assetStatus, 'ready');
  assert.equal(m.group.getObjectByName('rift:fallback-frame').visible, false);
  let seam = null;
  m.group.traverse((n) => { if (n.material?.name === 'PS_Seam') seam = n.material; });
  m.update(0.1, { riftPhase: 'dormant', effectsQuality: 2, cameraDistance: 6 });
  const dormant = seam.emissiveIntensity;
  m.update(0.1, { riftPhase: 'unstable', riftWarning: 1, effectsQuality: 2, cameraDistance: 6 });
  const unstable = seam.emissiveIntensity;
  assert.ok(unstable > dormant, 'seams brighten as the rift destabilises');
  m.flare('rift_pulse');
  m.update(0.016, { riftPhase: 'unstable', riftWarning: 1, effectsQuality: 2, cameraDistance: 6 });
  assert.ok(seam.emissiveIntensity > unstable, 'a discharge flare brightens the seams');
  const uni = m.group.getObjectByName('rift:interference-membrane').material.uniforms;
  for (let i = 0; i < 20; i++) m.update(0.1, { riftPhase: 'unstable', riftWarning: 1, effectsQuality: 2, cameraDistance: 6 });
  const settled = uni.uFlare.value;
  m.charge(2000);
  for (let i = 0; i < 17; i++) m.update(0.1, { riftPhase: 'unstable', riftWarning: 1, effectsQuality: 2, cameraDistance: 6 });
  assert.ok(uni.uFlare.value > settled + 0.25, 'a discharge warning visibly builds up');
  m.dispose();
});

test('a failed foundation load keeps the procedural frame', async () => {
  const warn = console.warn; console.warn = () => {};
  try {
    const m = buildRift(THREE, null, null, { loader: { loadAsync: async () => { throw new Error('404'); } } });
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(m.assetStatus, 'fallback');
    assert.equal(m.group.getObjectByName('rift:fallback-frame').visible, true);
    m.dispose();
  } finally { console.warn = warn; }
});

test('the server serves the foundation as an immutable asset', async () => {
  const { startServer } = await import('../server/index.js');
  const srv = await startServer({ port: 0, dataFile: null });
  try {
    const res = await fetch('http://127.0.0.1:' + srv.port + PHASE_SCAR_URL);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control'), /immutable/);
  } finally { await srv.close(); }
});
