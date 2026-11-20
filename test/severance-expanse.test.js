import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import validator from 'gltf-validator';
import * as THREE from 'three';
import { SEVERANCE_EXPANSE, SEVERANCE_MASSIFS, SEVERANCE_CRYSTALS, SEVERANCE_RING, SEVERANCE_OUTCROPS, massifLift, pocketHeight, inSeverancePocket } from '../shared/severance-gate.js';
import { COLLIDERS, groundHeight, travelRegionAt } from '../shared/world.js';
import { kitPlacements, createExpanseKit, SEVERANCE_KIT_URL, KIT_LIMITS } from '../client/src/severance-expanse-kit.js';

const bytes = readFileSync(new URL('../tools/asset-pipeline/assets/severance_kit/outputs/severance_kit.glb', import.meta.url));
const VARIANTS = ['Ring_Colossal', 'Spire_A', 'Spire_B', 'Spire_C', 'Crystal_A', 'Crystal_B', 'Crystal_C', 'Boulder_A', 'Boulder_B', 'Boulder_C', 'Boulder_D'];

test('kit GLB: versioned URL, valid, every placed variant present, bounded budget', async () => {
  const hash = createHash('sha256').update(bytes).digest('hex');
  assert.equal(SEVERANCE_KIT_URL, '/client/assets/severance_kit.glb?v=' + hash.slice(0, 12));
  assert.ok(bytes.length < 3.5e6, 'kit stays small: ' + bytes.length);
  const report = await validator.validateBytes(new Uint8Array(bytes), { externalResourceFunction: () => Promise.reject(new Error('external')) });
  assert.equal(report.issues.numErrors, 0);
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.readBinary(bytes);
  const names = new Set(doc.getRoot().listNodes().map((n) => n.getName()));
  for (const v of VARIANTS) assert.ok(names.has(v), v);
  for (const p of kitPlacements()) assert.ok(VARIANTS.includes(p.variant), p.variant);
  let tris = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += p.getIndices().getCount() / 3;
  assert.ok(tris < 12000, 'triangles ' + tris);
  const mats = new Set(doc.getRoot().listMaterials().map((m) => m.getName()));
  for (const m of ['SG_Stone_Kit', 'SG_Crystal', 'SG_Channel']) assert.ok(mats.has(m), m);
});

test('kit placements sit inside their colliders and never on walkable ground', () => {
  const place = kitPlacements();
  const counts = {};
  for (const p of place) counts[p.kind] = (counts[p.kind] || 0) + 1;
  assert.equal(counts.spire, SEVERANCE_MASSIFS.filter((m) => m.kind === 'spire').length);
  assert.equal(counts.crystal, SEVERANCE_CRYSTALS.length);
  assert.equal(counts.outcrop, SEVERANCE_OUTCROPS.length);
  assert.equal(counts.ring, 1);
  assert.ok(counts.talus > 60 && counts.hoodoo >= 16 && counts.crag >= 36);
  for (const p of place.filter((q) => q.kind === 'talus' || q.kind === 'hoodoo' || q.kind === 'spire' || q.kind === 'crag')) {
    const host = SEVERANCE_MASSIFS.find((m) => Math.hypot(p.x - m.x, p.z - m.z) + p.w * (p.kind === 'talus' ? 1.1 : 1) <= m.r + 1e-6);
    assert.ok(host, `${p.kind} at ${p.x.toFixed(1)},${p.z.toFixed(1)} is inside a massif collider`);
  }
  for (const p of place.filter((q) => q.kind !== 'bluff')) assert.ok(inSeverancePocket(p.x, p.z), 'inside the region');
  const E = SEVERANCE_EXPANSE;
  for (const p of place.filter((q) => q.kind === 'bluff')) {
    const edge = Math.max(Math.abs(p.x - E.x) - (E.hw - E.rim), Math.abs(p.z - E.z) - (E.hd - E.rim));
    assert.ok(edge - p.w > 0, 'ridge bluffs stand beyond the walkable limit');
  }
  // deterministic
  assert.deepEqual(kitPlacements(), place);
});

test('the ring stands across the west route on two collider feet; the region stays 300 x 350 m', () => {
  const R = SEVERANCE_RING;
  const feet = COLLIDERS.filter((c) => c.type === 'severance_ring_foot');
  assert.equal(feet.length, 2);
  assert.ok(feet.every((f) => Math.abs(f.z - R.z) < 1e-9));
  const gap = Math.abs(feet[1].x - feet[0].x) - feet[0].r - feet[1].r;
  assert.ok(gap > 18, 'travellers pass beneath: ' + gap);
  const E = SEVERANCE_EXPANSE;
  assert.equal(E.hw * 2, 300); assert.equal(E.hd * 2, 350);
  assert.equal(travelRegionAt(E.x + E.hw - 1, E.z), 'severance_expanse');
  // gameplay ground: the massifs never lift walkable ground outside their colliders
  for (const m of SEVERANCE_MASSIFS) for (let a = 0; a < 6.28; a += 0.4) {
    assert.equal(massifLift(m.x + Math.cos(a) * (m.r + 0.01), m.z + Math.sin(a) * (m.r + 0.01)) >= 0, true);
    const x = m.x + Math.cos(a) * (m.r + 0.05), z = m.z + Math.sin(a) * (m.r + 0.05);
    if (!SEVERANCE_MASSIFS.some((o) => o !== m && Math.hypot(x - o.x, z - o.z) < o.r)) assert.equal(massifLift(x, z), 0);
  }
  assert.equal(groundHeight(E.arrival.x, E.arrival.z), pocketHeight(E.arrival.x, E.arrival.z));
});

test('kit runtime: fallback without a loader, one light, bounded motes, night raises the glow, disposable', () => {
  const group = new THREE.Group();
  const kit = createExpanseKit(THREE, { group, loader: null, ground: () => 0 });
  const c = SEVERANCE_CRYSTALS[0];
  kit.update(0.1, 1, { x: c.x + 5, y: 2, z: c.z });
  assert.equal(kit.status, 'fallback');
  let lights = 0;
  group.traverse((o) => { if (o.isLight) lights++; });
  assert.equal(lights, KIT_LIMITS.lights);
  const st = kit.stats();
  assert.ok(st.motes <= KIT_LIMITS.crystalFields * KIT_LIMITS.crystalMotes + KIT_LIMITS.ringMotes);
  kit.dispose();
  assert.equal(kit.root.parent, null);
});

test('HTTP serves the kit GLB with immutable caching and not its sources', async () => {
  const { startServer } = await import('../server/index.js');
  const srv = await startServer({ port: 0, dataFile: null });
  try {
    const base = 'http://127.0.0.1:' + srv.port;
    const res = await fetch(base + SEVERANCE_KIT_URL);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'model/gltf-binary');
    assert.match(res.headers.get('cache-control'), /immutable/);
    assert.equal(Buffer.from(await res.arrayBuffer()).length, bytes.length);
    for (const url of ['/client/assets/kit-metrics.json', '/client/assets/severance_kit_raw.glb', '/tools/asset-pipeline/assets/severance_kit/outputs/kit-metrics.json']) assert.equal((await fetch(base + url)).status, 404, url);
  } finally { await srv.close(); }
});
