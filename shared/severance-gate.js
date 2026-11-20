// The Severance Gate: gameplay contract shared by the server (authority) and the
// client (prediction and presentation). Deterministic, no DOM / Node APIs.
//
// Everything is positioned from ONE anchor, SEVERANCE_GATE. The footprint below is
// authored in the asset's own frame (Blender metres: X right, -Y toward the
// approach, Z up; the same numbers the build writes to gate-metrics.json) and
// transformed by the anchor's position and quarter-turn yaw.
//
// The Severance Expanse (SEVERANCE_EXPANSE, alias SEVERANCE_POCKET) is a bounded,
// disconnected outdoor region: a stratified ash plateau crossed by three routes
// (the Causeway of Sentinels in the west, the Severed Pass through the central
// spine, the Amber Flats in the east) that converge on the gate basin in the
// north. Impassable massifs are colliders with matching terrain lifts, so the
// walking surface stays gentle everywhere a player can stand.

// Asset frame dimensions (must match tools/asset-pipeline/.../severance_gate.py;
// test/severance-gate.test.js checks them against the committed metrics).
export const GATE_FRAME = Object.freeze({
  height: 28,
  floor: 4.6,
  body: Object.freeze({ hw0: 8.05, hd0: 6.8, hw1: 3.7, hd1: 3.6 }),
  plinth: Object.freeze({ hw: 9.05, front: -8.9, rear: 7.8, upperFront: -8.4 }),
  stairs: Object.freeze({ hw: 3.0, steps: 23, tread: 0.38, front: -8.4 - 22 * 0.38, cheek: 0.75 }),
  // Free corridor through the passage: the narrowest interior rib (1.55 m half
  // width) bounds it, so movement never clips the visible stone.
  passage: Object.freeze({ hw: 1.55, mouth: -6.8, back: 1.0, ceiling: 12.0, apex: 14.4 }),
  portal: Object.freeze({ y: 1.35, z: 9.4, rx: 2.4, rz: 4.6 }),
});

// The Expanse region. Coordinates are world metres; north is +z.
export const SEVERANCE_EXPANSE = Object.freeze({
  name: 'Severance Expanse',
  x: 0, z: -720, hw: 150, hd: 175,
  rim: 12,                                  // walkable limit inside the enclosing ridge
  arrival: Object.freeze({ x: 15, z: -866 }),
  // Owner-approved return-rift placement (#147): the shared Phase Scar rift stands
  // beside the arrival terrace and faces it.
  beacon: Object.freeze({ x: 11, z: -864 }),
  outpost: Object.freeze({ x: 62, z: -848, r: 17 }),
});
/** @deprecated name kept for existing callers; the pocket is now the full Expanse. */
export const SEVERANCE_POCKET = SEVERANCE_EXPANSE;

// The anchor. yaw is the rotation of the asset's front (+Z in glTF) about +Y;
// Math.PI makes the gate face south, toward the arrival. Quarter turns only:
// the shared collision model uses axis-aligned boxes.
export const SEVERANCE_GATE = Object.freeze({ x: 0, z: -595, yaw: Math.PI });

const quarter = Math.round(SEVERANCE_GATE.yaw / (Math.PI / 2));
if (Math.abs(SEVERANCE_GATE.yaw - quarter * Math.PI / 2) > 1e-9) throw new Error('Severance Gate yaw must be a quarter turn');
const COS = Math.round(Math.cos(SEVERANCE_GATE.yaw)), SIN = Math.round(Math.sin(SEVERANCE_GATE.yaw));

/** Asset frame (bx right, by toward the rear) -> world (x, z). */
export function gateToWorld(bx, by) {
  const lx = bx, lz = -by; // glTF frame
  return { x: SEVERANCE_GATE.x + lx * COS + lz * SIN, z: SEVERANCE_GATE.z - lx * SIN + lz * COS };
}
/** World (x, z) -> asset frame (bx, by). */
export function worldToGate(x, z) {
  const dx = x - SEVERANCE_GATE.x, dz = z - SEVERANCE_GATE.z;
  const lx = dx * COS - dz * SIN, lz = dx * SIN + dz * COS;
  return { bx: lx, by: -lz };
}
function boxFrom(bx0, bx1, by0, by1, extra) {
  const a = gateToWorld(bx0, by0), b = gateToWorld(bx1, by1);
  return Object.freeze({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, hw: Math.abs(a.x - b.x) / 2, hd: Math.abs(a.z - b.z) / 2, ...extra });
}

const F = GATE_FRAME;
const CORRIDOR = F.stairs.hw;              // stairs and landing half width
const CHEEK = F.stairs.hw + F.stairs.cheek;
const PASS = F.passage.hw;
// Solid footprint: everything except the stair corridor, the landing and the passage.
export const GATE_COLLIDERS = Object.freeze([
  boxFrom(-F.plinth.hw, -CORRIDOR, F.plinth.front, F.plinth.rear, { type: 'severance_mass', h: F.height }),
  boxFrom(CORRIDOR, F.plinth.hw, F.plinth.front, F.plinth.rear, { type: 'severance_mass', h: F.height }),
  boxFrom(-CORRIDOR, -PASS, F.passage.mouth, F.plinth.rear, { type: 'severance_mass', h: F.height }),
  boxFrom(PASS, CORRIDOR, F.passage.mouth, F.plinth.rear, { type: 'severance_mass', h: F.height }),
  boxFrom(-PASS, PASS, F.passage.back, F.plinth.rear, { type: 'severance_mass', h: F.height }),
  boxFrom(-CHEEK, -CORRIDOR, F.stairs.front - 0.25, F.plinth.front, { type: 'severance_cheek', h: 2.6 }),
  boxFrom(CORRIDOR, CHEEK, F.stairs.front - 0.25, F.plinth.front, { type: 'severance_cheek', h: 2.6 }),
]);

const P = SEVERANCE_EXPANSE;
const at = (u, v) => ({ x: P.x + u, z: P.z + v });

// Massifs: [u, v, radius, height, kind]. The collider is the full radius; the
// terrain lift falls to zero at that radius, so nothing walkable is ever on a
// slope. Spires are drawn as rock meshes over a low lift.
const MASSIFS = [
  // central spine, split by the Severed Pass (v -12 .. +1)
  [0, -64, 10, 16, 'ridge'], [3, -49, 11, 20, 'ridge'], [-2, -34, 10, 21, 'ridge'], [2, -21, 9, 17, 'ridge'],
  [-1, 10, 9, 18, 'ridge'], [3, 24, 11, 23, 'ridge'], [0, 39, 10, 21, 'ridge'], [-4, 53, 9, 16, 'ridge'], [-2, 65, 7, 11, 'ridge'],
  // west mesas above the Causeway of Sentinels
  [-96, -46, 18, 27, 'mesa'], [-108, -24, 14, 24, 'mesa'], [-86, -68, 12, 22, 'mesa'], [-112, 20, 13, 26, 'mesa'],
  // east mesas beyond the Amber Flats
  [100, 40, 20, 30, 'mesa'], [88, 63, 13, 24, 'mesa'], [114, 16, 12, 26, 'mesa'], [108, -88, 15, 25, 'mesa'],
  // the gate basin's flanking ridges
  [-46, 140, 14, 24, 'ridge'], [-62, 120, 12, 20, 'ridge'], [46, 140, 14, 24, 'ridge'], [62, 119, 12, 22, 'ridge'],
  // free-standing spires (landmarks)
  [-55, -92, 3.6, 4, 'spire'], [-38, 84, 4.2, 4, 'spire'], [44, 96, 3.6, 4, 'spire'], [58, -30, 3.2, 4, 'spire'],
  [-122, 66, 4.6, 4, 'spire'], [126, -60, 4.2, 4, 'spire'], [-24, -122, 2.9, 3, 'spire'], [26, 70, 3.0, 4, 'spire'],
];
export const SEVERANCE_MASSIFS = Object.freeze(MASSIFS.map(([u, v, r, h, kind], i) => Object.freeze({ type: 'severance_massif', kind, ...at(u, v), r, h, seed: 1300 + i })));
// Spire meshes rise far above their low terrain lift.
export const SPIRE_HEIGHT = (m) => 16 + (m.seed % 7) * 2.4;

// Amber and teal mineral formations scattered over the Amber Flats.
const CRYSTALS = [[40, -60, 1.6], [52, -40, 2.2], [66, -8, 1.4], [34, 10, 1.8], [48, 26, 2.4], [70, 42, 1.6], [58, 74, 2.0], [32, 58, 1.3],
  [80, -50, 1.9], [24, -32, 1.2], [90, -18, 2.1], [38, 86, 1.5], [74, 12, 1.2], [44, -84, 1.7]];
export const SEVERANCE_CRYSTALS = Object.freeze(CRYSTALS.map(([u, v, r], i) => Object.freeze({ type: 'severance_crystal', ...at(u, v), r, h: 2.4 * r + 1, seed: 1500 + i, teal: i % 4 === 1 })));

// The colossal ring: a broken ring of gate-builder stone standing across the
// west route, sunk into the ash (severance_kit.glb, Ring_Colossal). Travellers
// pass beneath it along the route (the ring's plane faces +-z). Colliders are its
// west foot and the east foot with the voussoirs that fell from the break.
export const SEVERANCE_RING = Object.freeze({ ...at(-48, 26), radius: 16, tube: 2.6, sink: 0.22, yaw: 0 });
const RING_FEET = [[-13.2, 2.2], [12.9, 3.4]].map(([dx, r]) => Object.freeze({ type: 'severance_ring_foot', x: SEVERANCE_RING.x + dx, z: SEVERANCE_RING.z, r, h: 6 }));

// Ruins (variant names are nodes in the gate GLB's Ruins scene); colliders
// follow the visible footprint. Paving is flush and has no collider.
const RUIN_LAYOUT = [
  // arrival and the start of the routes
  ['Ruin_Stele', 4, -140, 0.3, { r: 0.6, h: 3.3 }],
  ['Ruin_Pillar_Stump', -18, -128, 0.5, { r: 1.05, h: 1.8 }],
  // the Causeway of Sentinels (west)
  ['Ruin_Pillar_Broken', -34, -96, 0.1, { r: 0.95, h: 6 }], ['Ruin_Pillar_Broken', -54, -66, 1.2, { r: 0.95, h: 6 }],
  ['Ruin_Pillar_Stump', -28, -60, 2.2, { r: 1.05, h: 1.8 }], ['Ruin_Pillar_Broken', -36, -24, 0.8, { r: 0.95, h: 6 }],
  ['Ruin_Pillar_Broken', -62, -4, 2.6, { r: 0.95, h: 6 }], ['Ruin_Stele', -40, 2, 1.9, { r: 0.6, h: 3.3 }],
  ['Ruin_Arch_Fragment', -74, 52, 0.35, { r: 0.85, h: 6, dx: -0.3 }], ['Ruin_Pillar_Stump', -30, 70, 0.4, { r: 1.05, h: 1.8 }],
  ['Ruin_Paving', -46, -78, 0.2, null], ['Ruin_Paving', -44, -40, 1.3, null], ['Ruin_Paving', -50, -6, 2.1, null], ['Ruin_Paving', -48, 34, 0.7, null],
  // the Severed Pass
  ['Ruin_Pillar_Broken', -9, -6, 0.6, { r: 0.95, h: 6 }], ['Ruin_Paving', 1, -5, 0.9, null],
  // the Amber Flats
  ['Ruin_Monolith_Fallen', 60, -64, Math.PI / 2, { hw: 1.2, hd: 4.7, h: 1.6 }], ['Ruin_Stele', 82, 28, 2.6, { r: 0.6, h: 3.3 }],
  // the ceremonial approach before the gate
  ['Ruin_Pillar_Broken', -11, 86, 0.1, { r: 0.95, h: 6 }], ['Ruin_Pillar_Stump', 11, 86, 0.5, { r: 1.05, h: 1.8 }],
  ['Ruin_Pillar_Stump', -12, 98, 1.1, { r: 1.05, h: 1.8 }], ['Ruin_Pillar_Broken', 12, 98, 2.2, { r: 0.95, h: 6 }],
  ['Ruin_Paving', 0, 78, 0.2, null], ['Ruin_Paving', -1.5, 92, 1.3, null],
];
export const SEVERANCE_RUINS = Object.freeze(RUIN_LAYOUT.map(([variant, du, dv, rot, col], i) => {
  const { x, z } = at(du, dv);
  const base = { type: 'severance_ruin', variant, x, z, rot, seed: 400 + i };
  if (!col) return Object.freeze(base);
  if (col.hw) return Object.freeze({ ...base, hw: col.hw, hd: col.hd, h: col.h });
  return Object.freeze({ ...base, x: x + (col.dx || 0) * Math.cos(rot), z: z - (col.dx || 0) * Math.sin(rot), r: col.r, h: col.h, vx: x, vz: z });
}));

// Weathered boulders on the plains (licensed CC0 nature-kit rocks, re-toned).
const OUTCROPS = [[-26, -110, 3.1], [36, -112, 2.6], [-70, -120, 3.0], [92, -128, 2.4], [-128, -100, 3.6], [128, -126, 3.2],
  [-20, -86, 2.2], [24, -76, 2.0], [-74, -20, 2.6], [-20, 30, 2.0], [22, 40, 2.4], [-82, 90, 3.0], [84, 98, 2.8], [-100, 120, 3.4],
  [104, 124, 3.0], [-28, 112, 2.0], [28, 118, 1.8], [126, 82, 3.2], [-132, -10, 2.8], [72, -100, 2.0]];
export const SEVERANCE_OUTCROPS = Object.freeze(OUTCROPS.map(([du, dv, s], i) => Object.freeze({ type: 'severance_outcrop', ...at(du, dv), r: 0.95 * s, h: 1.7 * s, s, seed: 900 + i })));

export const SEVERANCE_PROPS = Object.freeze([...GATE_COLLIDERS, ...SEVERANCE_MASSIFS, ...SEVERANCE_CRYSTALS.map((c) => Object.freeze({ ...c, r: c.r * 0.85 })), ...RING_FEET, ...SEVERANCE_RUINS, ...SEVERANCE_OUTCROPS]);


export function inSeverancePocket(x, z, pad = 0) {
  return Math.abs(x - P.x) <= P.hw + pad && Math.abs(z - P.z) <= P.hd + pad;
}
/** Walkable rectangle inside the ridge, for a circle of radius rad. */
export function clampToPocket(p, rad) {
  const lx = P.hw - P.rim - rad, lz = P.hd - P.rim - rad;
  p.x = Math.max(P.x - lx, Math.min(P.x + lx, p.x));
  p.z = Math.max(P.z - lz, Math.min(P.z + lz, p.z));
  return p;
}

/** The walkable ground of the gate itself, or null outside its corridor. */
export function gateGroundHeight(x, z) {
  const { bx, by } = worldToGate(x, z);
  const S = F.stairs;
  if (Math.abs(bx) <= CORRIDOR && by >= S.front - 0.2 && by < F.plinth.upperFront) {
    // A ramp through the step nosings (each tread sits within +/-0.1 m of it).
    const rise = F.floor / S.steps;
    return Math.max(0, Math.min(F.floor, rise * (by - S.front) / S.tread + rise / 2));
  }
  if (Math.abs(bx) <= CORRIDOR && by >= F.plinth.upperFront && by <= F.passage.mouth + 0.05) return F.floor;
  if (Math.abs(bx) <= PASS + 0.3 && by > F.passage.mouth && by <= F.portal.y + 0.4) return F.floor;
  return null;
}

const smooth = (t) => { const c = t < 0 ? 0 : t > 1 ? 1 : t; return c * c * (3 - 2 * c); };
const PROFILE = { mesa: [0.62, 0.98], ridge: [0.34, 0.98], spire: [0.2, 0.95] };

/** Terrain lift of the massifs at a point (0 outside every collider). */
export function massifLift(x, z) {
  let h = 0;
  for (const m of SEVERANCE_MASSIFS) {
    const dx = x - m.x, dz = z - m.z;
    if (Math.abs(dx) > m.r || Math.abs(dz) > m.r) continue;
    const t = Math.hypot(dx, dz) / m.r;
    if (t >= 1) continue;
    const [a, b] = PROFILE[m.kind];
    let k = 1 - smooth((t - a) / (b - a));
    if (m.kind === 'mesa') k *= 0.94 + 0.06 * Math.sin(x * 0.31 + z * 0.23 + m.seed);
    h = Math.max(h, m.h * k);
  }
  return h;
}

/** The enclosure dips to a low saddle behind the gate so it stands against open sky. */
export function expanseSaddle(x, z) {
  const u = x - P.x, v = z - P.z;
  return 1 - 0.78 * smooth(1 - Math.abs(u) / 90) * smooth((v - 95) / 45);
}

/** Expanse terrain: ash dunes, a dry lakebed, level terraces at the arrival, outpost and gate, massifs, enclosing ridge. */
export function pocketHeight(x, z) {
  const g = gateGroundHeight(x, z);
  if (g !== null) return g;
  const u = x - P.x, v = z - P.z;
  let h = 1.1 * Math.sin(x * 0.043 + 1.1) * Math.cos(z * 0.037) + 0.55 * Math.sin(x * 0.11 + z * 0.07) + 0.25 * Math.sin(x * 0.29 - z * 0.23);
  // the dry lake in the Amber Flats sits a little lower and dead level
  const lake = Math.hypot(u - 62, v - 12) / 26;
  h = h * smooth(lake * 1.2 - 0.2) - 0.6 * (1 - smooth(lake));
  const { bx, by } = worldToGate(x, z);
  const gateD = Math.hypot(Math.max(0, Math.abs(bx) - 9), Math.max(0, by - 8, -18 - by));
  h *= smooth((gateD - 6) / 14);
  h *= smooth(Math.hypot(x - P.arrival.x, z - P.arrival.z) / 14);
  h *= smooth((Math.hypot(x - P.outpost.x, z - P.outpost.z) - P.outpost.r) / 10);
  h += massifLift(x, z);
  const edge = Math.min(P.hw - Math.abs(u), P.hd - Math.abs(v));
  // the enclosing ridge: a gentle rise across the last walkable metres, then a
  // steep wall beyond the walkable limit (rim)
  const wob = (0.8 + 0.2 * Math.sin(x * 0.07 + z * 0.05)) * expanseSaddle(x, z);
  if (edge < P.rim + 4) h += (P.rim + 4 - edge) * (P.rim + 4 - edge) * 0.04 * wob;
  if (edge < P.rim) h += (P.rim - edge) * (P.rim - edge) * 0.35 * wob;
  // Seat the shared Phase Scar foundation and its approach on a local level pad.
  h *= smooth((Math.hypot(x - P.beacon.x, z - P.beacon.z) - 5.5) / 4);
  return h;
}

/** Sub-area label for the zone line. */
export function pocketArea(x, z) {
  const u = x - P.x, v = z - P.z;
  const { bx, by } = worldToGate(x, z);
  if (Math.abs(bx) < 55 && by > -40 && by < 50) return 'Severance Gate';
  if (Math.hypot(x - P.outpost.x, z - P.outpost.z) < P.outpost.r + 4) return 'Expedition Outpost';
  if (Math.hypot(x - P.arrival.x, z - P.arrival.z) < 16) return 'Arrival Terrace';
  if (Math.abs(u) < 15 && v > -22 && v < 14) return 'Severed Pass';
  if (u < -15) return 'Causeway of Sentinels';
  if (u > 15) return 'Amber Flats';
  return 'Ash Plain';
}


/** Camera roof: the stone above the passage stops the orbit camera. */
export function gateCameraBlocked(x, y, z) {
  const { bx, by } = worldToGate(x, z);
  return Math.abs(bx) <= CORRIDOR + 0.25 && by > F.passage.mouth - 0.2 && by < F.plinth.rear && y > F.floor + 7.4 && y < F.height + 0.5;
}

// Interaction anchors (server objects). The threshold sits at the back of the
// walkable passage, in front of the portal plane; the beacon returns to the Reach.
export const GATE_THRESHOLD = Object.freeze({ ...gateToWorld(0, F.passage.back - 0.1), range: 4.5 });
export const GATE_FRONT = Object.freeze(gateToWorld(0, F.stairs.front - 2.2));
