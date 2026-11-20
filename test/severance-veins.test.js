import test from 'node:test';
import assert from 'node:assert/strict';
import { SEVERANCE_VEINS, SEVERANCE_EXPANSE as E } from '../shared/severance-gate.js';
import { OBJECTS, travelRegionAt } from '../shared/world.js';
import { MATERIAL_CAP } from '../shared/crafting.js';
import { makeGame, makeChar, place, run } from './helpers.js';
import { interact } from '../server/sim/progress.js';
import { startVeinHarvest, sanitizeVeinReady } from '../server/sim/severance-veins.js';
import { SEVERANCE_PATROLS } from '../server/sim/severance-patrols.js';

function setup() {
  const g = makeGame();
  let wall = 1_000_000;
  g.wallNow = () => wall;
  const p = g.addPlayer(makeChar('surveyor', { level: 3 }));
  for (const e of g.enemies) { e.state = 'dead'; e.deadAt = -1e9; e.respawnAt = Infinity; }
  const vein = g.objects.find((o) => o.key === 'vein_pass');
  g.transferPlayer(p, { x: vein.x + 2.2, z: vein.z });
  return { g, p, vein, advanceWall: (ms) => { wall += ms; } };
}
const fragments = (p) => p.char.materials?.resonance_fragment || 0;

test('veins stand in the Expanse on clear ground, away from patrol routes and the outpost', () => {
  assert.equal(SEVERANCE_VEINS.length, 5);
  for (const v of SEVERANCE_VEINS) {
    assert.equal(travelRegionAt(v.x, v.z), 'severance_expanse', v.key);
    assert.ok(Math.hypot(v.x - E.outpost.x, v.z - E.outpost.z) > E.outpost.r + 8, v.key + ' outside the outpost');
    const o = OBJECTS.find((x) => x.key === v.key);
    assert.equal(o.type, 'resonant_vein');
    for (const other of OBJECTS) if (other !== o && Number.isFinite(other.r) && other.r > 0) assert.ok(Math.hypot(other.x - o.x, other.z - o.z) > other.r + o.r + 2, v.key + ' clear of ' + other.key);
    for (const r of SEVERANCE_PATROLS) for (const q of r.route) assert.ok(Math.hypot(q.x - v.x, q.z - v.z) > 5, v.key + ' off patrol waypoints');
  }
});

test('a channelled extraction grants one fragment, then the vein replenishes for that character only', () => {
  const { g, p, vein, advanceWall } = setup();
  const sink = [];
  assert.ok(interact(g, p, vein.id).ok);
  assert.equal(interact(g, p, vein.id).ok, false, 'one extraction at a time');
  run(g, 1500, sink);
  assert.equal(fragments(p), 0, 'nothing before the channel completes');
  run(g, 1700, sink);
  assert.equal(fragments(p), 1);
  assert.ok(sink.some((e) => e.e === 'fx' && e.k === 'vein_extract') && sink.some((e) => e.e === 'fx' && e.k === 'vein_harvest'));
  const again = interact(g, p, vein.id);
  assert.equal(again.ok, false);
  assert.match(again.reason, /regrowing/);
  // another character can still work the same vein
  const q = g.addPlayer(makeChar('keeper', { level: 3 }));
  g.transferPlayer(q, { x: vein.x - 2.2, z: vein.z });
  assert.ok(interact(g, q, vein.id).ok);
  // private state reports only the player's own depleted veins
  const y = g.privateState?.(p) ?? null;
  assert.ok(y?.veins.depleted.some((d) => d.id === vein.id), 'own depleted vein reported');
  assert.equal(g.privateState(q).veins.depleted.length, 0, 'not another character\'s');
  advanceWall(8 * 60 * 1000 + 1);
  assert.ok(interact(g, p, vein.id).ok, 'replenished after the wait');
});

test('extraction breaks on movement, combat or death and grants nothing', () => {
  for (const breakIt of [
    (g, p) => { p.x += 1.2; },
    (g, p) => { p.combatUntil = g.time + 5000; },
    (g, p) => { p.dead = true; },
  ]) {
    const { g, p, vein } = setup();
    assert.ok(interact(g, p, vein.id).ok);
    run(g, 500);
    breakIt(g, p);
    run(g, 3500);
    assert.equal(fragments(p), 0);
    assert.equal(p.veinChannel, null);
    assert.equal(sanitizeVeinReady(p.char.veinReadyAt, g.wallNow()).vein_pass, undefined, 'an interrupted channel does not deplete the vein');
  }
});

test('ineligible or forged extraction attempts are refused', () => {
  const { g, p, vein } = setup();
  place(p, vein.x + 6, vein.z);
  assert.match(interact(g, p, vein.id).reason, /closer/);
  place(p, vein.x + 2.2, vein.z);
  p.combatUntil = g.time + 1000;
  assert.match(interact(g, p, vein.id).reason, /Disengage/);
  p.combatUntil = 0;
  p.autoOn = true;
  assert.match(interact(g, p, vein.id).reason, /Disengage/, 'auto-attack engaged');
  p.autoOn = false;
  p.char.materials = { resonance_fragment: MATERIAL_CAP };
  assert.match(interact(g, p, vein.id).reason, /full/);
  p.char.materials = {};
  const fake = { ...vein, id: 999999 };
  assert.equal(startVeinHarvest(g, p, fake).ok, false, 'an object not in the world is refused');
  const notVein = g.objects.find((o) => o.type === 'severance_return');
  assert.equal(startVeinHarvest(g, p, notVein).ok, false);
});

test('persisted replenishment is sanitized: unknown keys, expired and inflated values', () => {
  const now = 5_000_000;
  const out = sanitizeVeinReady({ vein_pass: now + 60_000, vein_flats_east: now - 1, bogus: now + 1000, vein_canyon_west: now + 9e12, __proto__: { vein_pass: 1 } }, now);
  assert.deepEqual(Object.keys(out).sort(), ['vein_canyon_west', 'vein_pass']);
  assert.equal(out.vein_canyon_west, now + 8 * 60 * 1000);
  assert.deepEqual(sanitizeVeinReady('x', now), {});
  assert.deepEqual(sanitizeVeinReady([1, 2], now), {});
});

test('resonant_vein.glb is versioned, valid, served, and the model follows the player\'s own state', async () => {
  const { readFileSync } = await import('node:fs');
  const { createHash } = await import('node:crypto');
  const THREE = await import('three');
  const { RESONANT_VEIN_URL, buildResonantVein } = await import('../client/src/resonant-vein.js');
  const bytes = readFileSync(new URL('../tools/asset-pipeline/assets/resonant_vein/outputs/resonant_vein.glb', import.meta.url));
  assert.equal(RESONANT_VEIN_URL, '/client/assets/resonant_vein.glb?v=' + createHash('sha256').update(bytes).digest('hex').slice(0, 12));
  assert.ok(bytes.length < 1.5e6);
  const validator = (await import('gltf-validator')).default;
  const report = await validator.validateBytes(new Uint8Array(bytes), { externalResourceFunction: () => Promise.reject(new Error('external')) });
  assert.equal(report.issues.numErrors, 0);
  // model: a synthetic scene with the GLB's material names exercises the load path
  const scene = new THREE.Group();
  for (const n of ['RV_Rock', 'RV_Crystal']) { const m = new THREE.MeshStandardMaterial(); m.name = n; scene.add(new THREE.Mesh(new THREE.BoxGeometry(), m)); }
  const v = buildResonantVein(THREE, { loader: { loadAsync: async () => ({ scene }) } });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(v.assetStatus, 'ready');
  let crystal = null;
  v.group.traverse((n) => { if (n.material?.name === 'vein:crystal' && n.parent?.name !== 'vein:fallback-crystals') crystal = n.material; });
  assert.ok(crystal, 'GLB crystals use the resonance shader');
  for (let i = 0; i < 30; i++) v.update(0.1, { veinMs: 0, effectsQuality: 2, cameraDistance: 8 });
  const charged = crystal.uniforms.uCharge.value;
  for (let i = 0; i < 30; i++) v.update(0.1, { veinMs: 7 * 60 * 1000, effectsQuality: 2, cameraDistance: 8 });
  assert.ok(crystal.uniforms.uCharge.value < charged * 0.5, 'a depleted vein dims for its gatherer');
  v.extract(3000); v.update(1.5, { veinMs: 0, effectsQuality: 2 });
  assert.ok(crystal.uniforms.uExtract.value > 0.3, 'extraction intensifies the crystals');
  v.harvest(); v.update(0.016, { veinMs: 0, effectsQuality: 2 });
  assert.ok(crystal.uniforms.uFlash.value > 0.5 && crystal.uniforms.uExtract.value === 0);
  v.dispose();
  const warn = console.warn; console.warn = () => {};
  try {
    const f = buildResonantVein(THREE, { loader: { loadAsync: async () => { throw new Error('404'); } } });
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(f.assetStatus, 'fallback');
    f.dispose();
  } finally { console.warn = warn; }
  const { startServer } = await import('../server/index.js');
  const srv = await startServer({ port: 0, dataFile: null });
  try {
    const res = await fetch('http://127.0.0.1:' + srv.port + RESONANT_VEIN_URL);
    assert.equal(res.status, 200);
  } finally { await srv.close(); }
});
