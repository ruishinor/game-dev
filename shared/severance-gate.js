// The Severance Gate: gameplay contract shared by the server (authority) and the
// client (prediction and presentation). Deterministic, no DOM / Node APIs.
//
// Everything is positioned from ONE anchor, SEVERANCE_GATE. The footprint below is
// authored in the asset's own frame (Blender metres: X right, -Y toward the
// approach, Z up; the same numbers the build writes to gate-metrics.json) and
// transformed by the anchor's position and quarter-turn yaw. The Severance
// Expanse zone is being built separately; until it lands on main, the gate
// stands in SEVERANCE_POCKET, a small, explicitly provisional approach area.
// Relocating the gate into the real zone means changing the anchor (and
// retiring the pocket), not editing this footprint.

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

// Provisional approach pocket: a bounded, disconnected region (like the Phase
// Annex) until the Severance Expanse zone supplies the real landscape.
export const SEVERANCE_POCKET = Object.freeze({
  name: 'Severance Expanse',
  provisional: true,
  x: -300, z: 6, hw: 48, hd: 72,
  rim: 8,                                   // walkable limit inside the visible ridge
  arrival: Object.freeze({ x: -300, z: -52 }),
  beacon: Object.freeze({ x: -300, z: -56.5 }),
});

// The anchor. yaw is the rotation of the asset's front (+Z in glTF) about +Y;
// Math.PI makes the gate face south, down the approach. Quarter turns only:
// the shared collision model uses axis-aligned boxes.
export const SEVERANCE_GATE = Object.freeze({ x: -300, z: 52, yaw: Math.PI });

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

// Ruins along the approach (variant names are nodes in the gate GLB's Ruins
// scene). Positions are offsets from the pocket centre; colliders follow the
// visible footprint. Paving is flush and has no collider.
const P = SEVERANCE_POCKET;
const RUIN_LAYOUT = [
  ['Ruin_Stele', 5.2, -44, 0.3, { r: 0.6, h: 3.3 }],
  ['Ruin_Pillar_Broken', -7.5, -26, 0.1, { r: 0.95, h: 6 }],
  ['Ruin_Pillar_Stump', 7.5, -26, 0.5, { r: 1.05, h: 1.8 }],
  ['Ruin_Pillar_Stump', -8, -4, 1.1, { r: 1.05, h: 1.8 }],
  ['Ruin_Pillar_Broken', 8, -4, 2.2, { r: 0.95, h: 6 }],
  ['Ruin_Monolith_Fallen', 15, 12, Math.PI / 2, { hw: 1.2, hd: 4.7, h: 1.6 }],
  ['Ruin_Arch_Fragment', -14, 16, 0.35, { r: 0.85, h: 6, dx: -0.3 }],
  ['Ruin_Pillar_Broken', -9, 30, 0.8, { r: 0.95, h: 6 }],
  ['Ruin_Paving', 0, -34, 0.2, null],
  ['Ruin_Paving', -1.5, -14, 1.3, null],
  ['Ruin_Paving', 1, 8, 2.1, null],
  ['Ruin_Paving', 0.5, 25, 0.7, null],
  ['Ruin_Pillar_Stump', 21, -18, 0.4, { r: 1.05, h: 1.8 }],
  ['Ruin_Stele', -20, -6, 2.6, { r: 0.6, h: 3.3 }],
];
export const SEVERANCE_RUINS = Object.freeze(RUIN_LAYOUT.map(([variant, dx, dz, rot, col], i) => {
  const x = P.x + dx, z = P.z + dz;
  const base = { type: 'severance_ruin', variant, x, z, rot, seed: 400 + i };
  if (!col) return Object.freeze(base);
  if (col.hw) return Object.freeze({ ...base, hw: col.hw, hd: col.hd, h: col.h });
  return Object.freeze({ ...base, x: x + (col.dx || 0) * Math.cos(rot), z: z - (col.dx || 0) * Math.sin(rot), r: col.r, h: col.h, vx: x, vz: z });
}));

// Large weathered outcrops on the plain (licensed CC0 nature-kit rocks).
const OUTCROPS = [[-26, -40, 3.1], [27, -44, 2.6], [-30, -10, 2.4], [31, 4, 3.4], [-28, 34, 2.9], [26, 38, 2.2], [-36, 58, 3.6], [36, 60, 3.2], [-18, -56, 2.0], [19, 22, 1.8]];
export const SEVERANCE_OUTCROPS = Object.freeze(OUTCROPS.map(([dx, dz, s], i) => Object.freeze({ type: 'severance_outcrop', x: P.x + dx, z: P.z + dz, r: 0.95 * s, h: 1.7 * s, s, seed: 900 + i })));

export const SEVERANCE_PROPS = Object.freeze([...GATE_COLLIDERS, ...SEVERANCE_RUINS, ...SEVERANCE_OUTCROPS]);

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
/** Pocket terrain: an ash plain, flattened along the approach and round the gate, rising to a ridge. */
export function pocketHeight(x, z) {
  const g = gateGroundHeight(x, z);
  if (g !== null) return g;
  const dx = x - P.x, dz = z - P.z;
  let h = 0.85 * Math.sin(x * 0.071 + 1.1) * Math.cos(z * 0.053) + 0.45 * Math.sin(x * 0.17 + z * 0.11) + 0.22 * Math.sin(x * 0.41 - z * 0.29);
  const { bx, by } = worldToGate(x, z);
  const gateD = Math.hypot(Math.max(0, Math.abs(bx) - 9), Math.max(0, by - 8, -18 - by));
  h *= smooth((gateD - 6) / 14);                                   // level apron around the plinth and stairs
  h = h * (1 - 0.7 * smooth(1 - Math.abs(dx) / 7));                  // the old causeway
  h *= smooth(Math.hypot(x - P.arrival.x, z - P.arrival.z) / 12);   // level arrival terrace
  const edge = Math.min(P.hw - Math.abs(dx), P.hd - Math.abs(dz));
  if (edge < 16) h += (16 - edge) * (16 - edge) * 0.16 * (0.85 + 0.15 * Math.sin(x * 0.23 + z * 0.19));
  return h;
}

/** Sub-area label for the zone line. */
export function pocketArea(x, z) {
  const { bx, by } = worldToGate(x, z);
  if (Math.abs(bx) < 14 && by > -26 && by < 12) return 'Severance Gate';
  if (Math.hypot(x - P.arrival.x, z - P.arrival.z) < 14) return 'Arrival Terrace';
  return 'Ruined Approach';
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
