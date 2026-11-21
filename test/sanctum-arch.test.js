import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const bytes = readFileSync(new URL('../tools/asset-pipeline/assets/sanctum_arch/outputs/sanctum_arch.glb', import.meta.url));
const scene = readFileSync(new URL('../client/src/scene.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../client/src/main.js', import.meta.url), 'utf8');
const URL_RE = /SANCTUM_ARCH_URL = '([^']+)'/;

test('sanctum_arch.glb is versioned by content, valid glTF, carries every piece and its emissive inserts', async () => {
  const url = URL_RE.exec(scene)?.[1];
  assert.equal(url, '/client/assets/sanctum_arch.glb?v=' + createHash('sha256').update(bytes).digest('hex').slice(0, 12));
  assert.ok(bytes.length < 3e6);
  const validator = (await import('gltf-validator')).default;
  const report = await validator.validateBytes(new Uint8Array(bytes), { externalResourceFunction: () => Promise.reject(new Error('external')) });
  assert.equal(report.issues.numErrors, 0);
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const { MeshoptDecoder } = await import('meshoptimizer');
  await MeshoptDecoder.ready;
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).readBinary(new Uint8Array(bytes));
  const top = doc.getRoot().listScenes()[0].listChildren().map((n) => n.getName());
  for (const p of ['SA_Deck', 'SA_Pylon', 'SA_Arch', 'SA_Beacon', 'SA_Span', 'SA_HallWall', 'SA_HallPillar', 'SA_HallLintel', 'SA_HallCanopy']) assert.ok(top.includes(p), p);
  const mats = new Set(doc.getRoot().listMaterials().map((m) => m.getName()));
  assert.ok(mats.has('SA_Channel') && mats.has('SA_Lamp'));
});

test('the kit is optional: a failed load falls back to the generic Sanctum kit', () => {
  assert.match(main, /assets\.sanctumArch=await assets\.loader\.loadAsync\(SANCTUM_ARCH_URL\)\.catch\(/);
  // every swap keeps the generic piece as its fallback path
  for (const generic of ['Door_Frame_Square', 'Column_Hollow', 'Column_Large_Straight', 'Column_MetalSupport', 'Platform_X']) assert.ok(scene.includes(generic), generic);
  for (const piece of ['SA_Deck', 'SA_Pylon', 'SA_Arch', 'SA_Beacon', 'SA_Span']) assert.ok(scene.includes(`'${piece}'`), piece);
  // kit pieces are placed under a holder, never by overwriting the node transform
  assert.match(scene, /holder\.applyMatrix4\(matrix\);\s*const inst = src\.clone\(true\);/);
});

test('the server serves the kit as an immutable asset', async () => {
  const { startServer } = await import('../server/index.js');
  const srv = await startServer({ port: 0, dataFile: null });
  try {
    const res = await fetch('http://127.0.0.1:' + srv.port + URL_RE.exec(scene)[1]);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control'), /immutable/);
  } finally { await srv.close(); }
});
