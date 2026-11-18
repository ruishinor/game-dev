// Built assets: every file the manifest promises exists, is what the manifest
// says it is, traces back to a recorded source, is structurally valid glTF,
// and contains every model piece and animation clip the client asks for.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import validator from 'gltf-validator';
import { LOOKS } from '../shared/content.js';
import { APPROVED_RADIO_ASSETS } from '../client/src/radio-assets.js';
import { HUMANOID_BASE, HUMANOID_ACTIONS, CREATURES, MENDER_CLIPS } from '../client/src/anim-tables.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'client', 'assets');
const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sources.json'), 'utf8'));
const assets = manifest.assets;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('assets: every manifest entry is on disk with the recorded size and hash, and nothing unlisted is shipped', () => {
  const listed = new Set(['manifest.json']);
  for (const [id, a] of Object.entries(assets)) {
    const file = path.join(DIR, a.url);
    assert.ok(fs.existsSync(file), `${id}: ${a.url} is missing`);
    const buf = fs.readFileSync(file);
    assert.equal(buf.length, a.bytes, `${id}: size differs from the manifest (rebuild with npm run assets:build)`);
    assert.equal(crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12), a.hash, `${id}: content hash differs from the manifest`);
    listed.add(a.url);
  }
  // Reviewed audio has a separate authored manifest and provenance gate.
  // Account for exact listed paths and full hashes, never exempt a directory.
  for (const [id,a] of Object.entries(APPROVED_RADIO_ASSETS)) {
    assert.match(id,/^[a-z0-9_]+(?:\.[a-z0-9_]+)+$/);
    const rel='voice/'+id+'.mp3';
    assert.ok(!listed.has(rel),`${rel}: duplicate asset path`);
    const buf=fs.readFileSync(path.join(DIR,rel));
    assert.equal(crypto.createHash('sha256').update(buf).digest('hex'),a.sha256,`${rel}: voice hash mismatch`);
    listed.add(rel);
  }
  const onDisk = fs.readdirSync(DIR, { recursive: true }).filter((f) => fs.statSync(path.join(DIR, f)).isFile()).map((f) => f.split(path.sep).join('/'));
  assert.deepEqual(onDisk.filter((f) => !listed.has(f)), [], 'files under client/assets/ that the manifest does not describe');
});

test('assets: every asset has recorded provenance under a licence that allows redistribution', () => {
  const sources = new Map(ledger.sources.map((s) => [s.id, s]));
  for (const s of ledger.sources) {
    assert.equal(s.license, 'CC0-1.0', `${s.id}: only CC0 sources are in use; anything else needs a deliberate decision`);
    assert.ok(s.creator && s.page && s.acquired, `${s.id}: creator, page and acquisition date are recorded`);
    for (const f of s.files || [s]) assert.match(f.sha256, /^[0-9a-f]{64}$/, `${s.id}: pinned by SHA-256`);
  }
  for (const [id, a] of Object.entries(assets)) {
    assert.ok(Array.isArray(a.sources) && a.sources.length, `${id}: no source recorded`);
    for (const src of a.sources) assert.ok(src === 'original' || sources.has(src), `${id}: source "${src}" is not in assets/sources.json`);
  }
});

test('assets: every GLB is valid glTF 2.0 (Khronos validator reports no errors)', async () => {
  for (const [id, a] of Object.entries(assets)) {
    if (!a.url.endsWith('.glb')) continue;
    const report = await validator.validateBytes(new Uint8Array(fs.readFileSync(path.join(DIR, a.url))), { maxIssues: 100000 });
    const errors = report.issues.messages.filter((m) => m.severity === 0).map((m) => `${m.code} ${m.pointer || ''}`);
    assert.deepEqual(errors, [], `${id}: validator errors`);
    assert.ok((report.info.extensionsUsed || []).includes('EXT_meshopt_compression'), `${id}: geometry is Meshopt-compressed`);
  }
});

test('assets: every animation clip and model piece the client names exists in the bundles', () => {
  const humanClips = new Set(Object.keys(assets.humanoid_m.clips));
  for (const [state, clip] of Object.entries(HUMANOID_BASE)) assert.ok(humanClips.has(clip), `humanoid ${state}: clip ${clip} is not in humanoid_m`);
  for (const [id, a] of Object.entries(HUMANOID_ACTIONS)) assert.ok(humanClips.has(a.clip), `ability ${id}: clip ${a.clip} is not in humanoid_m`);
  assert.equal(Object.keys(assets.humanoid_f.clips).length, 0, 'humanoid_f carries no clips of its own (it plays humanoid_m’s)');
  for (const [type, spec] of Object.entries(CREATURES)) {
    const piece = assets.creatures.pieces[spec.piece];
    assert.ok(piece && piece.skinned, `${type}: piece ${spec.piece} is not a rigged piece of creatures.glb`);
    for (const [state, clip] of Object.entries(spec.clips)) assert.ok(piece.clips.includes(clip), `${type} ${state}: clip ${clip} is not on ${spec.piece}`);
  }
  for (const [state, clip] of Object.entries(MENDER_CLIPS)) assert.ok(assets.creatures.pieces.drone.clips.includes(clip), `mender ${state}: clip ${clip} is not on drone`);

  // Rig compatibility: humanoid_f plays humanoid_m's clips and wears gear by
  // bone name, so every animated bone and every attachment bone must exist on
  // both bodies under the same parent. A missing bone would freeze a limb or
  // drop gear silently at runtime.
  const glbJson = (id) => {
    const b = fs.readFileSync(path.join(DIR, assets[id].url));
    return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
  };
  const rig = (g) => {
    const parent = new Map();
    g.nodes.forEach((n) => (n.children || []).forEach((c) => parent.set(g.nodes[c].name, n.name)));
    return { names: new Set(g.nodes.map((n) => n.name)), parent };
  };
  const male = glbJson('humanoid_m');
  const rigs = { humanoid_m: rig(male), humanoid_f: rig(glbJson('humanoid_f')) };
  const animated = new Set(male.animations.flatMap((a) => a.channels.map((c) => male.nodes[c.target.node].name)));
  assert.ok(animated.size > 20, 'humanoid_m clips animate a skeleton');
  const attached = new Set(['looks.js', 'gear-kit.js', 'gear-recipes.js'].flatMap((f) => [...read(`client/src/${f}`).matchAll(/attach\('([A-Za-z0-9_]+)'/g)].map((m) => m[1])));
  assert.ok(attached.size > 0, 'gear attaches to named bones');
  for (const [body, r] of Object.entries(rigs)) {
    for (const bone of animated) {
      assert.ok(r.names.has(bone), `${body}: animated bone ${bone} is missing`);
      assert.equal(r.parent.get(bone), rigs.humanoid_m.parent.get(bone), `${body}: ${bone} has a different parent`);
    }
    for (const bone of attached) assert.ok(r.names.has(bone), `${body}: attachment bone ${bone} is missing`);
  }

  // Looks: every look the server may hand out is drawn by the client, uses
  // shells that exist on both bodies, and textures that exist.
  const looks = read('client/src/looks.js');
  const shells = new Set(Object.keys(assets.humanoid_m.shells));
  assert.deepEqual(Object.keys(assets.humanoid_f.shells).sort(), [...shells].sort(), 'both bodies carry the same shells');
  for (const list of Object.values(LOOKS)) for (const look of list) assert.match(looks, new RegExp(`\\n  ${look.id}: \\{`), `look ${look.id} has no definition in client/src/looks.js`);
  for (const m of looks.matchAll(/(?:map|emissiveMap): '([a-z_0-9]+)'/g)) assert.ok(assets[m[1]] && assets[m[1]].kind === 'texture', `looks.js names texture ${m[1]}, which is not built`);
  for (const block of looks.matchAll(/shells: \{([\s\S]*?)\n    \},/g)) for (const m of block[1].matchAll(/\n      ([a-z]+): \{/g)) assert.ok(shells.has(m[1]), `looks.js uses shell "${m[1]}", which the bodies do not have`);

  // Scene: every kit piece named literally in scene.js exists.
  const scene = read('client/src/scene.js');
  let checked = 0;
  for (const m of scene.matchAll(/c\.(?:piece|single|animated)\('(sanctum|nature)', '([A-Za-z0-9_]+)'/g)) {
    assert.ok(assets[m[1]].pieces[m[2]], `scene.js uses ${m[1]}:${m[2]}, which is not in the bundle`);
    checked++;
  }
  assert.ok(checked > 25, 'the scene check found the piece references it expects');
  for (const n of [1, 2, 3]) assert.ok(assets.nature.pieces[`Rock_Medium_${n}`], 'rock variants used by template name');
});
