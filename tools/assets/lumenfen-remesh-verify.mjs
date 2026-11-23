// Validate actual Blender-produced static donor GLBs, not a source-only list.
// Refuse empty/unchanged geometry and oversized or malformed exports.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readGltf, triangleCount } from './lib/gltf.mjs';
import { getBounds } from '@gltf-transform/functions';

export const STATIC_DONORS = Object.freeze([
  'rootglass_oak', 'cage_bloom', 'stone_guild',
  'tidal_boardwalk', 'weir_mechanism',
]);

export async function verifyLumenfenRemesh(dir) {
  const report = JSON.parse(fs.readFileSync(path.join(dir, 'remesh-report.json'), 'utf8'));
  assert.equal(report.kind, 'actual-blender-static-donor-remesh');
  assert.equal(report.assetCount, STATIC_DONORS.length);
  assert.equal(report.publishedToGame, false, 'artifact is not implicitly runtime-accepted');
  assert.equal(report.noRigOrAnimationRetopology, true);
  assert.deepEqual(report.assets.map(x => x.id), [...STATIC_DONORS]);
  let total = 0;
  for (const asset of report.assets) {
    assert.equal(asset.file, asset.id + '_refined.glb');
    assert.ok(asset.changedDonorMeshes >= 1, 'source mesh must actually change topology');
    assert.ok(asset.authoredDetailPieces >= 6, 'must add specific worked structural/organic detail');
    assert.ok(asset.refinedTriangles > asset.originalTriangles, 'refined mesh must not be the raw low-poly donor');
    assert.ok(asset.originalTriangles > 100 && asset.refinedTriangles < 120_000,
      'preserve a bounded desktop/TV poly count');
    const buffer = fs.readFileSync(path.join(dir, asset.file));
    assert.equal(buffer.toString('ascii', 0, 4), 'glTF');
    assert.ok(buffer.length > 1000 && buffer.length < 25_000_000);
    assert.equal(crypto.createHash('sha256').update(buffer).digest('hex'), asset.sha256);
    assert.equal(buffer.length, asset.bytes);
    const document = await readGltf(path.join(dir, asset.file));
    assert.equal(document.getRoot().listAnimations().length, 0, 'static scene should not ship animation data');
    const scene = document.getRoot().getDefaultScene();
    assert.ok(scene, 'GLB must have a playable scene');
    const tris = triangleCount(scene);
    assert.equal(tris, asset.refinedTriangles, 'actual GLB topology must match Blender output report');
    const bounds = getBounds(scene);
    assert.ok([...bounds.min, ...bounds.max].every(Number.isFinite), 'finite exported bounds');
    assert.ok(bounds.max.some((x, i) => x - bounds.min[i] > 0.2));
    assert.ok(document.getRoot().listMaterials().length >= 2, 'surface and detailed PBR materials survive export');
    total += tris;
  }
  assert.equal(report.totalTriangles, total);
  assert.ok(total <= 360_000);
  return { assets: report.assets.length, totalTriangles: total };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const dir = path.resolve(process.argv[2] || '.asset-cache/pipeline/lumenfen/remeshed');
  console.log('Validated real Blender GLB remesh geometry:', await verifyLumenfenRemesh(dir));
}
