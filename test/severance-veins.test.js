import test from 'node:test';
import assert from 'node:assert/strict';
import { SEVERANCE_VEINS, SEVERANCE_EXPANSE as E, SEVERANCE_PROPS, pocketHeight } from '../shared/severance-gate.js';
import { OBJECTS, COLLIDERS, travelRegionAt, resolveCollisions, hasLineOfSight } from '../shared/world.js';
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
  assert.equal(SEVERANCE_VEINS.length, 15);
  for (const v of SEVERANCE_VEINS) {
    assert.equal(travelRegionAt(v.x, v.z), 'severance_expanse', v.key);
    assert.ok(Math.hypot(v.x - E.outpost.x, v.z - E.outpost.z) > E.outpost.r + 8, v.key + ' outside the outpost');
    const o = OBJECTS.find((x) => x.key === v.key);
    assert.equal(o.type, 'resonant_vein');
    for (const other of OBJECTS) if (other !== o && Number.isFinite(other.r) && other.r > 0) assert.ok(Math.hypot(other.x - o.x, other.z - o.z) > other.r + o.r + 2, v.key + ' clear of ' + other.key);
    for (const r of SEVERANCE_PATROLS) for (const q of r.route) assert.ok(Math.hypot(q.x - v.x, q.z - v.z) > 5, v.key + ' off patrol waypoints');
  }
});


const originalSitePositions = [
  ['vein_pass', 4, -104], ['vein_flats_north', 50, 48],
  ['vein_flats_east', 88, 2], ['vein_canyon_west', -56, -38],
  ['vein_canyon_north', -94, 66],
];
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const distanceToFootprint = (a, b) => b.r != null
  ? distance(a, b) - b.r
  : Math.hypot(Math.max(0, Math.abs(a.x - b.x) - (b.hw ?? 0)),
    Math.max(0, Math.abs(a.z - b.z) - (b.hd ?? 0)));
const distanceToSegment = (a, b, c) => {
  const dx = c.x - b.x, dz = c.z - b.z, squared = dx * dx + dz * dz;
  const t = squared ? Math.max(0, Math.min(1, ((a.x - b.x) * dx + (a.z - b.z) * dz) / squared)) : 0;
  return Math.hypot(a.x - (b.x + dx * t), a.z - (b.z + dz * t));
};

test('added veins preserve all old keys/positions and remain well separated across the Expanse', () => {
  assert.deepEqual(SEVERANCE_VEINS.slice(0, originalSitePositions.length).map(
    ({ key, x, z }) => [key, x - E.x, z - E.z]), originalSitePositions);
  assert.equal(SEVERANCE_VEINS.length, 15);
  const keys = SEVERANCE_VEINS.map((v) => v.key);
  assert.equal(new Set(keys).size, keys.length, 'unique keys keep replenishment independent');
  const additional = SEVERANCE_VEINS.slice(originalSitePositions.length);
  assert.equal(additional.length, 10);
  for (const v of additional) {
    const margin = Math.min(E.hw - Math.abs(v.x - E.x), E.hd - Math.abs(v.z - E.z));
    assert.ok(margin >= E.rim + 7, v.key + ': clear of impassable rim');
    assert.equal(travelRegionAt(v.x, v.z), 'severance_expanse', v.key);
    assert.ok(Math.hypot(v.x - E.outpost.x, v.z - E.outpost.z) > E.outpost.r + 8, v.key + ': outside the outpost buffer');
    for (const other of SEVERANCE_VEINS) if (other !== v) {
      assert.ok(distance(v, other) >= 20, v.key + ': separated from ' + other.key);
    }
    // The actual movement collider set includes massifs, cliffs, ruin walls,
    // rocks, crystal formations and the outpost construction.
    for (const obstacle of SEVERANCE_PROPS) if (obstacle.r != null || obstacle.hw != null) {
      assert.ok(distanceToFootprint(v, obstacle) > v.r + 5,
        v.key + ': clearance from ' + obstacle.type);
    }
    const ownObject = OBJECTS.find((obj) => obj.key === v.key);
    assert.equal(ownObject?.type, 'resonant_vein', v.key + ': server object registered');
    for (const other of OBJECTS) if (other !== ownObject && !other.embedded && (other.r != null || other.hw != null)) {
      assert.ok(distanceToFootprint(v, other) > v.r + 4,
        v.key + ': clear of object ' + other.key);
    }
    // A route is a sequence of segments, not only a set of discrete patrol
    // waypoints. Keep harvesting off the travelled corridors entirely.
    for (const patrol of SEVERANCE_PATROLS) {
      for (let i = 1; i < patrol.route.length; i++) {
        assert.ok(distanceToSegment(v, patrol.route[i - 1], patrol.route[i]) > 10,
          v.key + ': clear of patrol travel corridor');
      }
    }
    // At least one physically available, near-level F-key interaction spot
    // must exist on the correct side of every node.
    const available = Array.from({ length: 16 }, (_, i) => {
      const a = i * 2 * Math.PI / 16;
      const spot = { x: v.x + Math.cos(a) * 2.4, z: v.z + Math.sin(a) * 2.4 };
      const resolved = resolveCollisions({ ...spot }, .45);
      return Math.hypot(resolved.x - spot.x, resolved.z - spot.z) < .05
        && Math.abs(pocketHeight(spot.x, spot.z) - pocketHeight(v.x, v.z)) < 1.5
        && hasLineOfSight(spot, v, COLLIDERS);
    }).filter(Boolean).length;
    assert.ok(available >= 8, v.key + ': F-key harvest ring reachable without collision or terrain step');
  }
});

// Coarse but connected movement check: from the existing arrival, every new
// vein must be reachable without crossing an impassable world collider.
// This is deliberately a layout test, not an alteration to gameplay pathing.
test('additional veins have a connected walkable approach from the existing arrival terrace', () => {
  const step = 4, minX = -132, minZ = -156, width = 67, depth = 79;
  const cells = new Uint8Array(width * depth);
  const visited = new Uint8Array(width * depth);
  const cell = (x, z) => z * width + x;
  const world = (x, z) => ({ x: E.x + minX + step * x, z: E.z + minZ + step * z });
  for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) {
    const p = world(x, z), q = resolveCollisions({ ...p }, .45);
    cells[cell(x, z)] = Math.hypot(q.x - p.x, q.z - p.z) < .05 ? 1 : 0;
  }
  const sx = Math.round((E.arrival.x - E.x - minX) / step);
  const sz = Math.round((E.arrival.z - E.z - minZ) / step);
  assert.ok(cells[cell(sx, sz)], 'existing arrival terrace is accessible');
  const queue = [cell(sx, sz)]; visited[queue[0]] = 1;
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index], x = id % width, z = Math.floor(id / width);
    for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth || !cells[cell(nx, nz)]) continue;
      if (dx && dz && (!cells[cell(x + dx, z)] || !cells[cell(x, z + dz)])) continue;
      const next = cell(nx, nz);
      if (!visited[next]) { visited[next] = 1; queue.push(next); }
    }
  }
  for (const v of SEVERANCE_VEINS.slice(originalSitePositions.length)) {
    const approachable = queue.some((id) => {
      const p = world(id % width, Math.floor(id / width));
      return distance(p, v) < 3.5 && hasLineOfSight(p, v, COLLIDERS);
    });
    assert.ok(approachable, v.key + ': continuous walkable approach from the arrival');
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
