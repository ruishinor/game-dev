import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { SALVAGE_CAMP as C, SALVAGE_CAMP_PIECES, SALVAGE_CAMP_COLLIDERS, SEVERANCE_EXPANSE as E, SEVERANCE_VEINS } from '../shared/severance-gate.js';
import { COLLIDERS, travelRegionAt, resolveCollisions, PLAYER_RADIUS } from '../shared/world.js';
import { ENEMIES } from '../shared/content.js';
import { makeGame, makeChar, place } from './helpers.js';
import { dealDamage, useAbility } from '../server/sim/combat.js';
import { SALVAGE_GARRISON } from '../server/sim/severance-camps.js';
import { SEVERANCE_PATROLS } from '../server/sim/severance-patrols.js';
import { levelHpMul } from '../server/sim/enemy-levels.js';
import { SALVAGE_CAMP_URL, createSalvageCamp } from '../client/src/salvage-camp.js';

function opened() {
  const g = makeGame();
  const p = g.addPlayer(makeChar('vanguard', { level: 5 }));
  g.openExpanse();
  return { g, p, camp: g.enemies.filter((e) => e.severanceCamp) };
}

test('the scrapyard stands in the Expanse, walled with an east entrance, clear of routes, veins and the outpost', () => {
  assert.equal(travelRegionAt(C.x, C.z), 'severance_expanse');
  assert.ok(Math.hypot(C.x - E.outpost.x, C.z - E.outpost.z) > E.outpost.r + 30);
  for (const v of SEVERANCE_VEINS) assert.ok(Math.hypot(v.x - C.x, v.z - C.z) > C.r + 8, v.key);
  for (const r of SEVERANCE_PATROLS) for (const q of r.route) assert.ok(Math.hypot(q.x - C.x, q.z - C.z) > C.r + 10);
  const walls = SALVAGE_CAMP_PIECES.filter((p) => p.piece === 'CK_Wall');
  assert.ok(walls.length >= 16);
  // every camp collider is part of the shared static set
  for (const c of SALVAGE_CAMP_COLLIDERS) assert.ok(COLLIDERS.some((x) => x.x === c.x && x.z === c.z), c.type);
  // the entrance is open: a player walks in from the east to the forge front
  const p = { x: C.x + 16, z: C.z, jy: 0, vy: 0 };
  for (let i = 0; i < 400; i++) {
    const dx = C.x - 2.6 - p.x, dz = C.z + 0.5 - p.z, d = Math.hypot(dx, dz);
    if (d < 0.2) break;
    p.x += dx / d * 0.1; p.z += dz / d * 0.1;
    resolveCollisions(p, PLAYER_RADIUS);
  }
  assert.ok(Math.hypot(p.x - (C.x - 2.6), p.z - (C.z + 0.5)) < 0.6, 'reached the forge through the entrance');
  // ...but not through the palisade from the west
  const q = { x: C.x - 16, z: C.z, jy: 0, vy: 0 };
  for (let i = 0; i < 400; i++) { q.x += 0.1; resolveCollisions(q, PLAYER_RADIUS); }
  assert.ok(q.x < C.x - C.wall + 1.2, 'the palisade blocks the west side');
});

test('the garrison spawns once with the Expanse, holds posts and is led by a server-defined elite', () => {
  const { g, camp } = opened();
  assert.equal(camp.length, SALVAGE_GARRISON.length);
  g.openExpanse();
  assert.equal(g.enemies.filter((e) => e.severanceCamp).length, SALVAGE_GARRISON.length, 'no duplicate spawn');
  const elite = camp.find((e) => e.elite);
  assert.ok(elite && elite.name === 'Forge Overseer');
  assert.equal(elite.maxHp, Math.round(ENEMIES.sentinel.hp * levelHpMul(elite) * elite.elite.hp));
  assert.equal(elite.hp, elite.maxHp);
  for (const e of camp) assert.ok(Math.hypot(e.x - C.x, e.z - C.z) < C.wall - 1, e.name + ' inside the palisade');
  // the snapshot marks it elite and tags its look; multipliers stay server-side
  const meta = g.metaFor(elite);
  assert.equal(meta.el, 1);
  assert.equal(meta.vx, 'salvage_elite');
  assert.equal(JSON.stringify(meta).includes('"dmg"'), false);
  assert.equal(JSON.stringify(meta).includes('3.4'), false);
});

test('the elite hits harder by its multiplier and cannot be rooted', () => {
  const { g, p, camp } = opened();
  const elite = camp.find((e) => e.elite), grunt = camp.find((e) => !e.elite && e.type === 'sentinel');
  place(p, elite.x + 2, elite.z);
  const hp = p.maxHp ?? p.hp;
  p.hp = hp; dealDamage(g, grunt, p, 10, 'auto', { kind: 'bolt' });
  const normal = hp - p.hp;
  p.hp = hp; dealDamage(g, elite, p, 10, 'auto', { kind: 'bolt' });
  const heavy = hp - p.hp;
  assert.ok(heavy > normal * 1.4, `elite ${heavy} vs regular ${normal}`);
  p.hp = hp;
  // the root rule (Symbiotech spore snare) refuses the elite but not its garrison
  const s = g.addPlayer(makeChar('symbiotech', { level: 5 }));
  place(s, elite.x + 3, elite.z);
  s.target = elite.id; s.res = 100; s.gcdUntil = 0; s.cds = {};
  const snare = useAbility(g, s, 'spore_snare');
  assert.equal(snare.ok, false);
  assert.match(snare.reason, /too massive to root/);
  s.target = grunt.id; s.gcdUntil = 0; s.cds = {};
  place(s, grunt.x + 3, grunt.z);
  assert.doesNotMatch(useAbility(g, s, 'spore_snare').reason ?? '', /too massive/, 'regular garrison can be rooted');
});

test('salvage_camp.glb is versioned, valid, carries every piece, and the client falls back without it', async () => {
  const bytes = readFileSync(new URL('../tools/asset-pipeline/assets/salvage_camp/outputs/salvage_camp.glb', import.meta.url));
  assert.equal(SALVAGE_CAMP_URL, '/client/assets/salvage_camp.glb?v=' + createHash('sha256').update(bytes).digest('hex').slice(0, 12));
  assert.ok(bytes.length < 2.5e6);
  const validator = (await import('gltf-validator')).default;
  const report = await validator.validateBytes(new Uint8Array(bytes), { externalResourceFunction: () => Promise.reject(new Error('external')) });
  assert.equal(report.issues.numErrors, 0);
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const { MeshoptDecoder } = await import('meshoptimizer');
  await MeshoptDecoder.ready;
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).readBinary(new Uint8Array(bytes));
  const nodes = new Set(doc.getRoot().listNodes().map((n) => n.getName()));
  for (const piece of new Set(SALVAGE_CAMP_PIECES.map((p) => p.piece))) assert.ok(nodes.has(piece), piece);
  const mats = new Set(doc.getRoot().listMaterials().map((m) => m.getName()));
  assert.ok(mats.has('CK_Coals') && mats.has('CK_Lamp'));
  const warn = console.warn; console.warn = () => {};
  try {
    const group = new THREE.Group();
    const camp = createSalvageCamp(THREE, { group, ground: () => 0, loader: { loadAsync: async () => { throw new Error('404'); } } });
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(camp.status, 'fallback');
    camp.update(0.1, 1, { x: C.x, z: C.z }, { night: true, quality: 2 });
    assert.ok(group.getObjectByName('salvage-camp:forge-light').intensity > 0);
    camp.update(0.1, 1, { x: C.x + 500, z: C.z }, {});
    assert.equal(camp.root.visible, false, 'hidden far away');
    camp.dispose();
  } finally { console.warn = warn; }
  const { startServer } = await import('../server/index.js');
  const srv = await startServer({ port: 0, dataFile: null });
  try { assert.equal((await fetch('http://127.0.0.1:' + srv.port + SALVAGE_CAMP_URL)).status, 200); } finally { await srv.close(); }
});

test('placed kit pieces keep their node transform (quantised GLBs store an offset and scale there)', async () => {
  const scene = new THREE.Group();
  for (const name of new Set(SALVAGE_CAMP_PIECES.map((p) => p.piece))) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    m.name = name; m.position.set(0, 1.9, -0.02); m.scale.setScalar(2.28);
    scene.add(m);
  }
  const group = new THREE.Group();
  const camp = createSalvageCamp(THREE, { group, ground: () => 5, loader: { loadAsync: async () => ({ scene }) } });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(camp.status, 'ready');
  const holder = camp.root.getObjectByName('salvage-camp:CK_Gantry');
  assert.ok(holder, 'placed under a holder');
  const inner = holder.children[0];
  assert.equal(inner.position.y, 1.9);
  assert.equal(inner.scale.x, 2.28);
  assert.equal(holder.position.y, 5, 'holder sits on the ground');
  camp.dispose();
});
