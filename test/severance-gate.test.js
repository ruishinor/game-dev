import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import validator from 'gltf-validator';
import * as THREE from 'three';
import { makeGame, makeChar, place } from './helpers.js';
import { interact } from '../server/sim/progress.js';
import { tickSeveranceGate, GATE_TIMING } from '../server/sim/severance-gate.js';
import {
  GATE_FRAME, SEVERANCE_GATE, SEVERANCE_POCKET, GATE_COLLIDERS, SEVERANCE_RUINS, GATE_THRESHOLD, GATE_FRONT,
  gateToWorld, worldToGate, gateGroundHeight, gateCameraBlocked, inSeverancePocket,
} from '../shared/severance-gate.js';
import { WORLD, PLAYER_RADIUS, COLLIDERS, OBJECTS, stepMove, resolveCollisions, groundHeight, hasLineOfSight, travelRegionAt, zoneAt, inRiftAnnex } from '../shared/world.js';
import { createSeveranceGateLandmark, SEVERANCE_GATE_URL, PHASE_LEVEL, BANDS, LIMITS, severanceLink } from '../client/src/severance-gate.js';

const bytes = readFileSync(new URL('../tools/asset-pipeline/assets/severance_gate/outputs/severance_gate.glb', import.meta.url));
const metrics = JSON.parse(readFileSync(new URL('../tools/asset-pipeline/assets/severance_gate/outputs/gate-metrics.json', import.meta.url), 'utf8'));

async function readDoc() {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  return { io, doc: await io.readBinary(bytes) };
}

test('runtime GLB: versioned URL, valid, three detail scenes, named parts, bounded budgets', async () => {
  const hash = createHash('sha256').update(bytes).digest('hex');
  assert.equal(SEVERANCE_GATE_URL, '/client/assets/severance_gate.glb?v=' + hash.slice(0, 12));
  const report = await validator.validateBytes(new Uint8Array(bytes), { maxIssues: 20 });
  assert.equal(report.issues.numErrors, 0);
  const { doc } = await readDoc();
  const root = doc.getRoot();
  const scenes = Object.fromEntries(root.listScenes().map((s) => [s.getName(), s]));
  for (const name of ['Near', 'Mid', 'Far', 'Ruins']) assert.ok(scenes[name], name);
  assert.equal(root.getDefaultScene()?.getName(), 'Near');
  const tris = (scene) => {
    let n = 0;
    scene.traverse((node) => { for (const p of node.getMesh()?.listPrimitives() ?? []) n += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3; });
    return n;
  };
  const near = tris(scenes.Near), mid = tris(scenes.Mid), far = tris(scenes.Far);
  assert.ok(near > 15000 && near < 60000, 'near ' + near);
  assert.ok(mid < near * 0.7, 'mid ' + mid);
  assert.ok(far < near * 0.2 && far < 6000, 'far ' + far);
  const names = new Set(root.listNodes().map((n) => n.getName()));
  for (const n of ['Body', 'Base', 'Runes', 'RunesDim', 'Channels', 'Lamps', 'Far_Channels', 'Far_Runes']) assert.ok(names.has(n), n);
  for (let i = 0; i < 10; i++) assert.ok(names.has('Fragment_' + String(i).padStart(2, '0')));
  for (const v of new Set(SEVERANCE_RUINS.map((r) => r.variant))) assert.ok(names.has(v), v);
  const mats = new Set(root.listMaterials().map((m) => m.getName()));
  for (const m of ['SG_Stone_Body', 'SG_Stone_Base', 'SG_Rune', 'SG_RuneDim', 'SG_Channel', 'SG_Lamp']) assert.ok(mats.has(m), m);
  for (const t of root.listTextures()) {
    assert.equal(t.getMimeType(), 'image/webp');
    assert.ok(Math.max(...t.getSize()) <= 2048);
  }
  // stone carries the unique atlas (UV0) and the world-scale detail set (UV1)
  const body = root.listMeshes().find((m) => m.getName() === 'Body');
  assert.ok(body.listPrimitives()[0].getAttribute('TEXCOORD_1'));
  assert.ok(body.listPrimitives()[0].getAttribute('TANGENT'));
  assert.ok(bytes.length < 8 * 1024 * 1024, 'GLB size ' + bytes.length);
});

test('runtime GLB geometry matches the gameplay frame: scale, facing, passage and stairs', async () => {
  const { doc } = await readDoc();
  const scene = doc.getRoot().listScenes().find((s) => s.getName() === 'Near');
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const band = { lo: [Infinity, Infinity], hi: [-Infinity, -Infinity] }; // x, z of the plinth course 2-3.2 m up (above any debris)
  scene.traverse((node) => {
    if (/^Fragment_/.test(node.getName())) return; // levitating pieces sit outside the footprint
    const mesh = node.getMesh();
    if (!mesh) return;
    const m = node.getWorldMatrix();
    for (const p of mesh.listPrimitives()) {
      const a = p.getAttribute('POSITION'), v = [0, 0, 0];
      for (let i = 0; i < a.getCount(); i++) {
        a.getElement(i, v);
        const w = [0, 1, 2].map((k) => m[k] * v[0] + m[4 + k] * v[1] + m[8 + k] * v[2] + m[12 + k]);
        for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], w[k]); hi[k] = Math.max(hi[k], w[k]); }
        if (w[1] > 2 && w[1] < 3.2) for (const [j, k] of [[0, 0], [1, 2]]) { band.lo[j] = Math.min(band.lo[j], w[k]); band.hi[j] = Math.max(band.hi[j], w[k]); }
      }
    }
  });
  // glTF: +Y up, front (stairs) toward +Z, asset frame by = -z
  assert.ok(Math.abs(hi[1] - GATE_FRAME.height) < 0.25, 'height ' + hi[1]);
  assert.ok(Math.abs(band.hi[0] - GATE_FRAME.plinth.hw) < 0.1 && Math.abs(band.lo[0] + GATE_FRAME.plinth.hw) < 0.1, 'plinth width');
  assert.ok(Math.abs(-hi[2] - (GATE_FRAME.stairs.front - 0.25)) < 0.4, 'stair front ' + hi[2]);
  assert.ok(Math.abs(-band.lo[1] - GATE_FRAME.plinth.rear) < 0.1, 'plinth rear ' + band.lo[1]);
  // the build metrics and the shared footprint agree
  assert.equal(metrics.floor, GATE_FRAME.floor);
  assert.equal(metrics.height, GATE_FRAME.height);
  assert.ok(Math.abs(metrics.stairs.front - GATE_FRAME.stairs.front) < 1e-6);
  assert.equal(metrics.stairs.hw, GATE_FRAME.stairs.hw);
  assert.ok(GATE_FRAME.passage.hw <= metrics.passage.min_rib_hw + 1e-6, 'collision corridor inside the narrowest rib');
  assert.ok(metrics.passage.clear_height >= 8, 'entrance clearance');
  assert.ok(metrics.passage.hw * 2 >= 4 && metrics.passage.hw * 2 <= 5, 'entrance width');
  assert.equal(metrics.body.hw0, GATE_FRAME.body.hw0);
  assert.equal(metrics.plinth.lower.x, GATE_FRAME.plinth.hw);
});

test('anchor transform round-trips and keeps colliders axis-aligned', () => {
  for (const [bx, by] of [[0, 0], [3, -10], [-8, 7.5], [1.5, 1.0]]) {
    const w = gateToWorld(bx, by), b = worldToGate(w.x, w.z);
    assert.ok(Math.abs(b.bx - bx) < 1e-9 && Math.abs(b.by - by) < 1e-9);
  }
  // the gate faces the arrival: its front is closer to the arrival than its rear
  const front = gateToWorld(0, -16), rear = gateToWorld(0, 7);
  const arr = SEVERANCE_POCKET.arrival;
  assert.ok(Math.hypot(front.x - arr.x, front.z - arr.z) < Math.hypot(rear.x - arr.x, rear.z - arr.z));
  for (const c of GATE_COLLIDERS) { assert.ok(COLLIDERS.includes(c)); assert.ok(c.hw > 0 && c.hd > 0 && c.h > 0); assert.ok(inSeverancePocket(c.x, c.z)); }
});

test('the approach is physically traversable: arrival -> stairs -> passage -> portal, nothing else', () => {
  const s = { ...SEVERANCE_POCKET.arrival, jy: 0, vy: 0 };
  let maxStep = 0, prev = groundHeight(s.x, s.z);
  for (let i = 0; i < 60 * 20; i++) {
    stepMove(s, { f: 1, s: 0, yaw: SEVERANCE_GATE.yaw + Math.PI, j: false }, 1);
    const h = groundHeight(s.x, s.z);
    maxStep = Math.max(maxStep, Math.abs(h - prev));
    prev = h;
  }
  const end = worldToGate(s.x, s.z);
  assert.ok(Math.abs(end.by - (GATE_FRAME.passage.back - PLAYER_RADIUS)) < 0.02, 'walks to the back of the passage, by ' + end.by);
  assert.equal(groundHeight(s.x, s.z), GATE_FRAME.floor);
  assert.ok(maxStep < 0.25, 'no cliff on the route ' + maxStep);
  assert.ok(Math.hypot(s.x - GATE_THRESHOLD.x, s.z - GATE_THRESHOLD.z) <= GATE_THRESHOLD.range);
  assert.ok(hasLineOfSight(s, GATE_THRESHOLD));
  // stairs: the walking surface stays within 0.11 m of every tread top
  const S = GATE_FRAME.stairs, rise = GATE_FRAME.floor / S.steps;
  for (let k = 1; k <= S.steps; k++) {
    for (const t of [0.05, 0.5, 0.95]) {
      const by = S.front + (k - 1) * S.tread + t * S.tread;
      const w = gateToWorld(0, by);
      assert.ok(Math.abs(gateGroundHeight(w.x, w.z) - rise * k) <= 0.11, `step ${k}`);
    }
  }
  // beside the stairs the plinth is solid; the passage walls bound the corridor
  const beside = { ...gateToWorld(6, -20), jy: 0, vy: 0 };
  for (let i = 0; i < 600; i++) stepMove(beside, { f: 1, s: 0, yaw: SEVERANCE_GATE.yaw + Math.PI, j: false }, 1);
  assert.ok(worldToGate(beside.x, beside.z).by <= GATE_FRAME.plinth.front - PLAYER_RADIUS + 1e-6);
  const inside = { ...gateToWorld(0, -3), jy: 0, vy: 0 };
  for (let i = 0; i < 300; i++) stepMove(inside, { f: 0, s: 1, yaw: 0, j: false }, 1);
  assert.ok(Math.abs(worldToGate(inside.x, inside.z).bx) <= GATE_FRAME.passage.hw - PLAYER_RADIUS + 1e-6);
  // no route around the back into the portal
  const back = resolveCollisions({ ...gateToWorld(0, 3) }, PLAYER_RADIUS);
  assert.ok(worldToGate(back.x, back.z).by >= 7.8 + PLAYER_RADIUS - 1e-6 || Math.abs(worldToGate(back.x, back.z).bx) >= GATE_FRAME.passage.hw);
  // camera roof above the passage, open sky above the stairs
  const mid = gateToWorld(0, -3);
  assert.equal(gateCameraBlocked(mid.x, GATE_FRAME.floor + 2, mid.z), false);
  assert.equal(gateCameraBlocked(mid.x, GATE_FRAME.floor + 12, mid.z), true);
  const stairs = gateToWorld(0, -12);
  assert.equal(gateCameraBlocked(stairs.x, 9, stairs.z), false);
});

test('pocket is a bounded, disconnected travel region with its own zone labels', () => {
  const P = SEVERANCE_POCKET;
  assert.equal(travelRegionAt(P.x, P.z), 'severance_expanse');
  assert.equal(travelRegionAt(0, 0), 'reach');
  assert.match(zoneAt(GATE_FRONT.x, GATE_FRONT.z + 6), /^Severance Expanse · Severance Gate$/);
  assert.match(zoneAt(P.arrival.x, P.arrival.z), /Arrival Terrace/);
  const s = { x: P.x, z: P.z, jy: 0, vy: 0 };
  for (let i = 0; i < 1200; i++) stepMove(s, { f: 1, s: 0, yaw: -Math.PI / 2, j: false }, 1);
  assert.ok(inSeverancePocket(s.x, s.z) && Math.abs(s.x - P.x) <= P.hw - P.rim);
  assert.ok(Math.hypot(s.x, s.z) > WORLD.radius * 2, 'far outside the Reach');
  assert.equal(hasLineOfSight({ x: P.x, z: P.z }, { x: 0, z: 0 }), false);
  // ruins and outcrops do not block the causeway or the arrival
  for (const c of COLLIDERS.filter((o) => o.type === 'severance_ruin' || o.type === 'severance_outcrop')) {
    const clear = c.r ?? Math.max(c.hw, c.hd);
    assert.ok(Math.abs(c.x - P.x) - clear > 2.5, c.variant || c.type);
    assert.ok(Math.hypot(c.x - P.arrival.x, c.z - P.arrival.z) > clear + 4);
  }
});

function gameWith(over = {}) {
  const g = makeGame();
  const p = g.addPlayer(makeChar('keeper', { level: 3, attunements: ['resonance'], riftCalibration: 'completed', ...over }));
  return { g, p };
}
const tick = (g, ms) => { g.time += ms; tickSeveranceGate(g); };

test('gate phase is server-owned: presence wakes it, absence returns it to dormant; only the gate row carries it', () => {
  const { g, p } = gameWith();
  const s = g.severance;
  assert.equal(s.phase, 'dormant');
  tick(g, 100);
  assert.equal(s.phase, 'dormant', 'nobody in the region');
  place(p, SEVERANCE_POCKET.arrival.x, SEVERANCE_POCKET.arrival.z);
  tick(g, 100);
  assert.equal(s.phase, 'resonating');
  tick(g, GATE_TIMING.resonateMs - 200);
  assert.equal(s.phase, 'resonating');
  tick(g, 300);
  assert.equal(s.phase, 'active');
  const rows = g.buildRows();
  assert.equal(rows.find((r) => r.i === s.gate.id).gp, 'active');
  assert.ok(rows.filter((r) => r.gp !== undefined).length === 1);
  place(p, 0, 7.5);
  tick(g, GATE_TIMING.idleMs - 100);
  assert.equal(s.phase, 'active');
  tick(g, 200);
  assert.equal(s.phase, 'dormant');
  // a dead player is not presence
  place(p, SEVERANCE_POCKET.arrival.x, SEVERANCE_POCKET.arrival.z);
  p.dead = true;
  tick(g, GATE_TIMING.idleMs + 1);
  assert.equal(s.phase, 'dormant');
});

test('gate travel: only through the passage, active, calibrated, alive, out of combat; throttled full response', () => {
  const { g, p } = gameWith();
  const s = g.severance;
  const stand = gateToWorld(0, 0.5);
  // forged: from the Reach, and from outside the passage
  place(p, 0, 7.5);
  assert.equal(interact(g, p, s.gate.id).ok, false);
  const plinthTop = gateToWorld(5, 0);
  place(p, plinthTop.x, plinthTop.z);
  s.phase = 'active';
  assert.equal(interact(g, p, s.gate.id).ok, false, 'no line through the stone');
  place(p, stand.x, stand.z);
  s.phase = 'resonating';
  assert.match(interact(g, p, s.gate.id).reason, /resonating/);
  s.phase = 'active';
  p.combatUntil = g.time + 1000;
  assert.equal(interact(g, p, s.gate.id).ok, false);
  p.combatUntil = 0;
  p.char.riftCalibration = 'recorded';
  assert.equal(interact(g, p, s.gate.id).ok, false);
  p.char.riftCalibration = 'completed';
  const before = g.enemies.length;
  g.events.length = 0;
  assert.ok(interact(g, p, s.gate.id).ok);
  assert.ok(inRiftAnnex(p.x, p.z));
  assert.equal(g.enemies.length, before + 11, 'the Annex encounter opens once');
  const ev = g.events.filter((e) => e.k === 'severance_traverse');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].m, 0);
  assert.equal(g.eventRegions.get(ev[0]), 'severance_expanse', 'cue delivered to the gate region');
  // a second traveller within the window gets the minor response only
  const q = g.addPlayer(makeChar('vanguard', { level: 3, attunements: ['resonance'], riftCalibration: 'completed' }));
  place(q, stand.x, stand.z);
  g.time += 1000;
  assert.ok(interact(g, q, s.gate.id).ok);
  assert.equal(g.events.filter((e) => e.k === 'severance_traverse').at(-1).m, 1);
  assert.equal(g.enemies.length, before + 11, 'no reset-on-entry');
  // the Annex arrival gate returns to the foot of the Severance Gate
  const exit = g.rift.exit;
  place(p, exit.x, exit.z - 1.7);
  assert.ok(interact(g, p, exit.id).ok);
  assert.ok(Math.hypot(p.x - GATE_FRONT.x, p.z - GATE_FRONT.z) < 1e-6);
  // the arrival beacon returns to the Reach beside the Phase Scar
  const beacon = s.beacon;
  place(p, beacon.x, beacon.z + 1.6);
  assert.ok(interact(g, p, beacon.id).ok);
  assert.equal(travelRegionAt(p.x, p.z), 'reach');
  assert.ok(Math.hypot(p.x - g.rift.entry.x, p.z - (g.rift.entry.z - 3.6)) < 1e-6);
});

test('Phase Scar leads to the pocket; reconnect from the pocket is safe; objects stay region-scoped', () => {
  const { g, p } = gameWith();
  place(p, g.rift.entry.x, g.rift.entry.z - 3.6);
  g.rift.phase = 'stabilized';
  assert.ok(interact(g, p, g.rift.entry.id).ok);
  assert.ok(inSeverancePocket(p.x, p.z));
  assert.ok(Math.hypot(p.x - SEVERANCE_POCKET.arrival.x, p.z - SEVERANCE_POCKET.arrival.z) < 1e-6);
  g.syncChar(p);
  assert.deepEqual(p.char.pos, WORLD.spawn, 'reconnect returns to the Reach');
  const fresh = makeGame().addPlayer(makeChar('vanguard', { pos: { x: SEVERANCE_POCKET.arrival.x, z: SEVERANCE_POCKET.arrival.z }, hp: 50 }));
  assert.equal(travelRegionAt(fresh.x, fresh.z), 'reach');
  for (const key of ['severance_gate', 'severance_return']) {
    const o = OBJECTS.find((x) => x.key === key);
    assert.equal(travelRegionAt(o.x, o.z), 'severance_expanse', key);
  }
  assert.equal(g.setTarget(p, g.severance.gate.id), false, 'objects are not targets');
});

test('landmark: hidden outside the region, bands with hysteresis, phase-driven levels, bounded and disposable', () => {
  const scene = new THREE.Scene();
  const lm = createSeveranceGateLandmark(THREE, { scene, loader: null, groundHeight: () => 0 });
  assert.equal(severanceLink.controller, lm);
  lm.update(0.1, 0, { x: 0, y: 2, z: 0 });
  assert.equal(lm.root.visible, false);
  assert.equal(lm.status, 'idle', 'nothing is loaded from the Reach');
  const G = SEVERANCE_GATE;
  lm.update(0.1, 0, { x: G.x, y: 3, z: G.z - 300 });
  assert.equal(lm.root.visible, false, 'outside the pocket even when far south of it');
  const at = (d) => ({ x: G.x, y: 3, z: G.z - d });
  lm.update(0.1, 0, at(120));
  assert.equal(lm.root.visible, true);
  assert.equal(lm.status, 'fallback', 'no loader: procedural silhouette');
  assert.equal(lm.band, 'mid');
  lm.update(0.1, 0, at(BANDS.near - 2)); assert.equal(lm.band, 'mid', 'hysteresis');
  lm.update(0.1, 0, at(BANDS.near - BANDS.hysteresis - 1)); assert.equal(lm.band, 'near');
  lm.update(0.1, 0, at(BANDS.near + 2)); assert.equal(lm.band, 'near');
  // dormant -> resonating witnessed: the activation sequence restarts once
  assert.ok(Math.abs(lm.level - PHASE_LEVEL.dormant) < 0.05);
  lm.setPhase('resonating');
  assert.equal(lm.state.seq, 0);
  for (let i = 0; i < 80; i++) lm.update(0.1, 0, at(30));
  lm.setPhase('active');
  for (let i = 0; i < 120; i++) lm.update(0.1, 0, at(30));
  assert.ok(lm.level > 0.95);
  lm.setPhase('bogus');
  assert.equal(lm.phase, 'active');
  lm.traverse({ m: 0 });
  assert.equal(lm.state.flare, 1);
  for (let i = 0; i < 40; i++) lm.update(0.1, 0, at(30));
  assert.equal(lm.state.flare, 0, 'stabilizes back to the active state');
  assert.ok(lm.level > 0.95, 'traversal does not reset the active state');
  const st = lm.stats();
  assert.ok(st.particles <= LIMITS.embers + LIMITS.motes);
  let lights = 0;
  scene.traverse((o) => { if (o.isLight) lights++; });
  assert.equal(lights, LIMITS.lights);
  lm.dispose(); lm.dispose();
  assert.equal(lm.root.parent, null);
  assert.equal(severanceLink.controller, null);
});

test('HTTP serves the gate GLB with immutable caching and not its authoring sources', async () => {
  const { startServer } = await import('../server/index.js');
  const srv = await startServer({ port: 0, dataFile: null });
  try {
    const base = 'http://127.0.0.1:' + srv.port;
    const res = await fetch(base + SEVERANCE_GATE_URL);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'model/gltf-binary');
    assert.match(res.headers.get('cache-control'), /immutable/);
    assert.equal(Buffer.from(await res.arrayBuffer()).length, bytes.length);
    for (const url of ['/tools/asset-pipeline/assets/severance_gate/outputs/gate-metrics.json', '/client/assets/gate-metrics.json', '/client/assets/severance_gate_raw.glb', '/art-source/severance-gate/source/severance_gate_concept_sheet.png']) assert.equal((await fetch(base + url)).status, 404, url);
  } finally { await srv.close(); }
});
