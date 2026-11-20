// The Silent Foundry: the dungeon behind the Severance Gate. A disconnected
// region of four chambers in a line, reached only through the gate's portal:
// the Fabrication Hall (arrival), the Cultivation Vault, the Harmonic Chamber
// and the Excavation Depths. Shared geometry only: layout, colliders, walkable
// height and area names. Encounters, rewards and their rules are server-only
// (server/sim/silent-foundry.js).

const smooth = (t) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };

export const SILENT_FOUNDRY = Object.freeze({
  name: 'Silent Foundry', x: 0, z: -1300, hw: 24, hd: 104,
  // the arrival is at the north end; the return portal stands behind it
  arrival: Object.freeze({ x: 0, z: -1300 + 94 }),
  exit: Object.freeze({ x: 0, z: -1300 + 99.5 }),
  cache: Object.freeze({ x: 0, z: -1300 - 98 }),
  door: 3.6,                        // half-width of each chamber doorway
  depth: 4.2,                       // the Excavation Depths lie this far below the halls
});
const F = SILENT_FOUNDRY;
const at = (u, v) => ({ x: F.x + u, z: F.z + v });

// Chamber bands along v (local z), north to south.
export const FOUNDRY_AREAS = Object.freeze([
  Object.freeze({ name: 'Fabrication Hall', v0: 52, v1: 104 }),
  Object.freeze({ name: 'Cultivation Vault', v0: 0, v1: 52 }),
  Object.freeze({ name: 'Harmonic Chamber', v0: -52, v1: 0 }),
  Object.freeze({ name: 'Excavation Depths', v0: -104, v1: -52 }),
]);

export function inSilentFoundry(x, z, pad = 0) {
  return Math.abs(x - F.x) <= F.hw + pad && Math.abs(z - F.z) <= F.hd + pad;
}

export function foundryArea(x, z) {
  if (!inSilentFoundry(x, z)) return null;
  const v = z - F.z;
  return FOUNDRY_AREAS.find((a) => v >= a.v0 && v <= a.v1)?.name ?? null;
}

/** Walkable height: the halls are level; a broad ramp descends into the Depths. */
export function foundryHeight(x, z) {
  const v = z - F.z;
  return -F.depth * smooth((-56 - v) / 14);
}

const box = (type, u, v, hw, hd, h, extra = {}) => Object.freeze({ type, ...at(u, v), hw, hd, h, ...extra });
const disc = (type, u, v, r, h, extra = {}) => Object.freeze({ type, ...at(u, v), r, h, ...extra });

// Partition walls with a central doorway at each chamber boundary.
const PARTITIONS = [52, 0, -52].flatMap((v) => {
  // stop 0.6 m short of the side walls: too narrow to pass, and the region clamp
  // can never place anyone inside a partition
  const side = (F.hw - 0.6 - F.door) / 2;
  return [-1, 1].map((s) => box('foundry_wall', s * (F.door + side), v, side, 0.9, 9));
});

// Fabrication Hall: press lines along both walls, a dormant assembly gantry.
const FABRICATION = [
  ...[64, 78, 92].flatMap((v) => [-1, 1].map((s) => box('foundry_press', s * 15.5, v, 2.6, 3.2, 5.5))),
  box('foundry_gantry_foot', -8.5, 70, 0.7, 0.7, 7), box('foundry_gantry_foot', 8.5, 70, 0.7, 0.7, 7),
];
// Cultivation Vault: culture vats in two rows, a nutrient manifold between them.
const CULTIVATION = [
  ...[12, 26, 40].flatMap((v) => [-1, 1].map((s) => disc('foundry_vat', s * 10, v, 2.3, 4.5))),
  box('foundry_manifold', 0, 26, 0.5, 9, 0.7),
];
// Harmonic Chamber: the resonator at the centre, four pylons around it.
const HARMONIC = [
  disc('foundry_resonator', 0, -26, 3.6, 8),
  ...[[-12, -14], [12, -14], [-12, -38], [12, -38]].map(([u, v]) => disc('foundry_pylon', u, v, 1.0, 7)),
];
// Excavation Depths: mineral columns breaking through the floor.
const DEPTHS = [
  ...[[-14, -64, 1.8], [13, -70, 1.5], [-9, -86, 1.3], [16, -90, 2.0], [-17, -96, 1.6], [6, -62, 1.1]].map(([u, v, r]) => disc('foundry_column', u, v, r, 9)),
];

export const FOUNDRY_COLLIDERS = Object.freeze([...PARTITIONS, ...FABRICATION, ...CULTIVATION, ...HARMONIC, ...DEPTHS]);
export const FOUNDRY_LAYOUT = Object.freeze({ fabrication: FABRICATION, cultivation: CULTIVATION, harmonic: HARMONIC, depths: DEPTHS, partitions: PARTITIONS });

export function clampToFoundry(p, rad) {
  p.x = Math.max(F.x - F.hw + rad, Math.min(F.x + F.hw - rad, p.x));
  p.z = Math.max(F.z - F.hd + rad, Math.min(F.z + F.hd - rad, p.z));
  return p;
}
