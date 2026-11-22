// CI-only validation for the quarantine GLB composite. Inspects, never
// publishes, copies to runtime, or loads the unlicensed model in a game client.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function validateLumenfenSourceStudy(directory) {
  const reportFile = path.join(directory, 'lumenfen-source-candidates.json');
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  assert.match(report.warning, /DO NOT INCLUDE IN CLIENT MANIFEST OR GAMEPLAY/);
  assert.equal(report.composedKit, 'lumenfen-unapproved-donor-studies.glb');
  assert.ok(Array.isArray(report.entries) && report.entries.length === 8,
    'all eight shortlisted donor nodes must survive composition');
  const names = report.entries.map(e => e.id);
  assert.equal(new Set(names).size, 8, 'donor IDs must be unique');
  const file = path.join(directory, report.composedKit);
  const bytes = fs.readFileSync(file);
  assert.ok(bytes.length > 100 && bytes.length < 100 * 1024 * 1024,
    'source study must have a finite bounded file size');
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), report.outputSha256,
    'report must bind the exact exported composite');
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', 'GLB magic');
  assert.equal(bytes.readUInt32LE(4), 2, 'glTF 2.0');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB length agrees with file');
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, 'JSON chunk first');
  const jsonLength = bytes.readUInt32LE(12);
  assert.ok(jsonLength >= 20 && jsonLength % 4 === 0);
  const binHeader = 20 + jsonLength;
  assert.ok(binHeader + 8 <= bytes.length, 'binary geometry chunk exists');
  const gltf = JSON.parse(bytes.toString('utf8', 20, binHeader).trim());
  assert.equal(gltf.asset?.version, '2.0');
  assert.equal(bytes.readUInt32LE(binHeader + 4), 0x004e4942, 'BIN chunk follows JSON');
  const binLength = bytes.readUInt32LE(binHeader);
  assert.equal(binHeader + 8 + binLength, bytes.length, 'no missing or trailing GLB data');
  assert.equal(gltf.buffers?.length, 1, 'GLB requires exactly one buffer');
  const declared = gltf.buffers[0].byteLength;
  assert.ok(declared > 0 && declared <= binLength && binLength - declared < 4,
    'declared binary buffer must match its aligned chunk');
  for (const view of gltf.bufferViews || []) {
    assert.equal(view.buffer, 0, 'all geometry belongs to the merged buffer');
    const start = view.byteOffset || 0;
    assert.ok(Number.isInteger(start) && start >= 0 && Number.isInteger(view.byteLength) && view.byteLength > 0);
    assert.ok(start + view.byteLength <= declared, 'no buffer view escapes binary geometry');
  }
  assert.ok((gltf.meshes || []).length >= 8, 'all selected donors contain mesh geometry');
  for (const image of gltf.images || [])
    assert.ok(!image.uri || image.uri.startsWith('data:'),
      'source-study textures must be embedded; never refer to undisclosed external files');
  const nodes = gltf.nodes || [];
  const scene = (gltf.scenes || [])[gltf.scene ?? 0];
  assert.ok(scene && Array.isArray(scene.nodes), 'selected donor roots must be in the default scene');
  const roots = new Set(scene.nodes);
  const visits = new Set();
  function containsMesh(index) {
    assert.ok(Number.isInteger(index) && index >= 0 && index < nodes.length);
    if (visits.has(index)) return false;
    visits.add(index);
    const node = nodes[index];
    if (Number.isInteger(node.mesh)) {
      const mesh = gltf.meshes[node.mesh];
      assert.ok(mesh?.primitives?.some(p =>
        Number.isInteger(p.attributes?.POSITION) && (gltf.accessors?.[p.attributes.POSITION]?.count || 0) >= 3),
      'selected donor must include real triangle-capable geometry');
      return true;
    }
    return (node.children || []).some(containsMesh);
  }
  for (const entry of report.entries) {
    assert.equal(entry.status.startsWith('SOURCE-ONLY.'), true, 'do not imply runtime acceptance');
    const indexes = nodes.flatMap((node, i) => node.name === entry.id ? [i] : []);
    assert.equal(indexes.length, 1, `missing or duplicate donor holder ${entry.id}`);
    assert.ok(roots.has(indexes[0]), `donor ${entry.id} is not present in the actual scene`);
    visits.clear();
    assert.ok(containsMesh(indexes[0]), `donor ${entry.id} was pruned to an empty hierarchy`);
    assert.ok(entry.triangles > 0 && entry.boundingSize.every(v => Number.isFinite(v) && v >= 0));
  }
  return { donorCount: report.entries.length, meshCount: gltf.meshes.length, bytes: bytes.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const directory = path.resolve(process.argv[2] || '.lumenfen-candidates');
  const result = validateLumenfenSourceStudy(directory);
  console.log('Validated quarantined source-only GLB geometry, buffers and report:', result);
}
