// Halo Construct NPCs: shared placement, server behaviour, asset contract and
// provenance. Browser integration is test/e2e/halo-npcs.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORLD, ZONES, OBJECTS, COLLIDERS, SANCTUM_GUARDS, groundHeight, resolveCollisions } from '../shared/world.js';
import { Game } from '../server/sim/game.js';
import { interact } from '../server/sim/progress.js';
import { makeChar } from './helpers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel));

function glbJson(rel) {
  const b = read(rel);
  const len = b.readUInt32LE(12);
  return JSON.parse(b.subarray(20, 20 + len).toString('utf8'));
}

test('halo: exactly four wardens, outside the Sanctum, facing outward', () => {
  const guards = OBJECTS.filter((o) => o.type === 'sanctum_guard');
  assert.equal(guards.length, 4);
  assert.deepEqual(guards, [...SANCTUM_GUARDS]);
  const S = WORLD.sanctum;
  for (const g of guards) {
    const r = Math.hypot(g.x - S.x, g.z - S.z);
    assert.ok(r > S.r + 1, `${g.key} stands outside the perimeter (r=${r.toFixed(2)})`);
    // game yaw: 0 faces +Z, forward = (sin yaw, cos yaw)
    const cos = (Math.sin(g.yaw) * (g.x - S.x) + Math.cos(g.yaw) * (g.z - S.z)) / r;
    assert.ok(cos > 0.9999, `${g.key} faces away from the centre`);
  }
  const bearings = guards.map((g) => Math.atan2(g.x, g.z)).sort((a, b) => a - b);
  const gaps = bearings.map((b, i) => (i + 1 < bearings.length ? bearings[i + 1] - b : bearings[0] + 2 * Math.PI - b));
  assert.ok(Math.min(...gaps) > (70 * Math.PI) / 180, 'the four cover different exterior sectors');
});

test('halo: wardens keep roads and gateways clear and stand on open, flat ground', () => {
  for (const g of SANCTUM_GUARDS) {
    for (const key of ['sporefield', 'relay', 'vault']) {
      const z = ZONES[key];
      const d = Math.hypot(z.x, z.z);
      const along = (g.x * z.x + g.z * z.z) / d;
      const off = Math.abs(g.x * z.z - g.z * z.x) / d;
      assert.ok(along < 0 || off > 5, `${g.key} is ${off.toFixed(2)} m from the ${key} road`);
    }
    for (const c of COLLIDERS) {
      const rr = c.r ?? Math.hypot(c.hw, c.hd);
      assert.ok(Math.hypot(g.x - c.x, g.z - c.z) > rr + g.r + 0.5, `${g.key} clear of ${c.type}`);
    }
    for (const o of OBJECTS) if (o !== g) assert.ok(Math.hypot(g.x - o.x, g.z - o.z) > 2, `${g.key} clear of ${o.key}`);
    const h = groundHeight(g.x, g.z);
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      assert.ok(Math.abs(groundHeight(g.x + Math.cos(a) * 0.6, g.z + Math.sin(a) * 0.6) - h) < 0.12, `${g.key} on flat ground`);
    }
  }
});

test('halo: wardens are movement colliders like other NPCs (a player cannot walk through one)', () => {
  const g = SANCTUM_GUARDS[0];
  const p = { x: g.x + 0.05, z: g.z };
  resolveCollisions(p, 0.45);
  assert.ok(Math.hypot(p.x - g.x, p.z - g.z) >= g.r + 0.45 - 1e-6);
});

test('halo: the quartermaster keeps its identity, position and vendor service', () => {
  const qm = OBJECTS.filter((o) => o.type === 'quartermaster');
  assert.equal(qm.length, 1, 'no duplicate vendor');
  assert.deepEqual({ key: qm[0].key, name: qm[0].name, x: qm[0].x, z: qm[0].z }, { key: 'quartermaster', name: 'Sanctum Quartermaster', x: -5.6, z: -1.8 });
  assert.equal(OBJECTS.find((o) => o.key === 'archivist').name, 'Archivist Venn', 'Venn is unchanged');
});

test('halo: server sends the wardens fixed facing and offers no service or new interaction', () => {
  const game = new Game();
  const guards = game.objects.filter((o) => o.type === 'sanctum_guard');
  assert.equal(guards.length, 4);
  for (const g of guards) {
    const meta = game.metaFor(g);
    assert.equal(meta.c, 'sanctum_guard');
    assert.equal(meta.y, SANCTUM_GUARDS.find((d) => d.key === g.key).yaw);
    assert.ok(Number.isInteger(meta.v));
  }
  const qm = game.objects.find((o) => o.type === 'quartermaster');
  assert.equal(game.metaFor(qm).y, undefined, 'other objects keep their existing presentation');
  const g = guards[0];
  const p = game.addPlayer(makeChar('vanguard'));
  p.x = g.x + 1;
  p.z = g.z;
  const before = JSON.stringify(p.char);
  const res = interact(game, p, g.id);
  assert.equal(res.ok, false);
  assert.equal(JSON.stringify(p.char), before, 'no state change');
  assert.ok(!p.vendor, 'no vendor session');
});

test('halo: the runtime bundle has every mesh and clip the client roles use', () => {
  const manifest = JSON.parse(read('client/assets/manifest.json'));
  const entry = manifest.assets.halo_construct;
  assert.equal(entry.kind, 'skinned');
  const j = glbJson('client/assets/' + entry.url);
  const meshes = new Set(j.meshes.map((m) => m.name));
  const clips = new Set(j.animations.map((a) => a.name));
  const src = read('client/src/halo-construct.js').toString();
  const named = [...src.matchAll(/'((?:body|ring_[a-z]+|security|vendor|stave|equip_[a-z]+))'/g)].map((m) => m[1]);
  assert.ok(named.length >= 8);
  for (const n of named) assert.ok(meshes.has(n), `mesh ${n}`);
  for (const c of ['Guard_Watch_Loop', 'Idle_Loop', 'Idle_Talking_Loop', 'Interact']) assert.ok(clips.has(c), `clip ${c}`);
  assert.deepEqual(Object.keys(entry.clips).sort(), [...clips].sort());
  // The optimiser's quantisation gives each skinned mesh its own skin (inverse
  // bind matrices absorb that mesh's dequantisation); every skin must still
  // bind the same joints: the project's humanoid joint names, so clips bind by name.
  const humanoid = glbJson('client/assets/humanoid_m.glb');
  const names = (g, k) => g.skins[k].joints.map((i) => g.nodes[i].name);
  for (let k = 0; k < j.skins.length; k++) assert.deepEqual(names(j, k), names(humanoid, 0), `skin ${k}`);
});

test('halo: the accepted source is untouched and the derivative records its provenance', () => {
  const owner = JSON.parse(read('assets/owner-sources.json'));
  const src = owner.sources.find((s) => s.id === 'halo_construct_owner');
  assert.equal(crypto.createHash('sha256').update(read(src.file)).digest('hex'), '02853bfd536a53135225fc9353463feeed07fb4745ef2d261dbaeaa7d9a32036');
  const manifest = JSON.parse(read('client/assets/manifest.json'));
  assert.ok(manifest.assets.halo_construct.sources.includes('halo_construct_owner'));
  const exp = JSON.parse(read('tools/asset-pipeline/assets/halo_construct/outputs/export.json'));
  assert.equal(crypto.createHash('sha256').update(read('client/assets/halo_construct.glb')).digest('hex'), exp.sha256, 'runtime GLB is the pipeline output');
});
