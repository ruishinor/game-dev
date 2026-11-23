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

// Resonant shard veins: gatherable outcrops (sites only; extraction and
// replenishment remain server-authoritative in server/sim/severance-veins.js).
// Coordinates are (u,v) relative to the Expanse centre. Retain the original
// five keys/positions and their array indices: existing character save data
// persists replenishment under those keys, and visual seed/yaw uses the index.
// Added locations occupy separate traversable ground away from ridge, ruins,
// patrol corridors, the arrival terrace, outpost and rift/gate approaches.
const VEINS = [
  // Original five — never rename or relocate existing persisted sites.
  ['vein_pass', 4, -104],
  ['vein_flats_north', 50, 48],
  ['vein_flats_east', 88, 2],
  ['vein_canyon_west', -56, -38],
  ['vein_canyon_north', -94, 66],
  // Western outskirts, south-to-north.
  ['vein_west_south', -114, -128],
  ['vein_west_lower', -114, -72],
  ['vein_west_mid', -102, 0],
  ['vein_west_upper', -86, 128],
  // Open southern plain and a separate pocket east of the central spine.
  ['vein_south_plain', -10, -136],
  ['vein_south_east', 18, -84],
  // Eastern outskirts, south-to-north.
  ['vein_east_south', 114, -128],
  ['vein_east_lower', 110, -48],
  ['vein_east_upper', 114, 84],
  ['vein_east_north', 82, 128],
];
export const SEVERANCE_VEINS = Object.freeze(VEINS.map(([key, u, v], i) => Object.freeze({ key, ...at(u, v), r: 0.95, yaw: (i * 2.39996) % (Math.PI * 2), seed: 2200 + i })));

// The salvage yard: a palisaded camp where rogue sentinels strip and re-forge
// scrap (salvage_camp.glb pieces). Visible layout and colliders only; who
// guards it, their levels and posts are server-only (server/sim/severance-camps.js).
// Local frame: +u east (the entrance faces east), +v north; metres.
export const SALVAGE_CAMP = Object.freeze({ key: 'salvage_yard', name: 'Scrapyard', ...at(-88, -146), r: 12, wall: 10 });
const CAMP_DECOR = [
  // piece, u, v, yaw (rad, three.js rotation.y), colliders [[du, dv, r]] in the piece frame
  ['CK_Forge', -5, 0.5, Math.PI / 2, [[0, 0, 1.45]]],
  ['CK_LeanTo', -1, 6.2, Math.PI, [[-2.2, -1.3, 0.25], [2.2, -1.3, 0.25], [-2.2, 1.3, 0.25], [2.2, 1.3, 0.25], [-0.6, -0.4, 0.6]]],
  ['CK_Gantry', 0.5, -5.5, 0, [[-2.2, -0.9, 0.22], [2.2, -0.9, 0.22], [-2.2, 0.9, 0.22], [2.2, 0.9, 0.22], [0.2, 0, 0.75]]],
  ['CK_Mast', -6.5, -6, 0.4, [[0, 0, 0.75]]],
  ['CK_Crates', 4.5, 6, 0.3, [[0.3, 0.3, 1.1]]],
  ['CK_Crates', 5.5, -5, 2.1, [[0.3, 0.3, 1.1]]],
  ['CK_Pile', -7, 3.8, 0, [[0, 0, 1.15]]],
  ['CK_Pile', 6.5, 2.4, 1.3, [[0, 0, 1.15]]],
];
const campAt = (u, v) => ({ x: SALVAGE_CAMP.x + u, z: SALVAGE_CAMP.z + v });
const campPieces = [];
const campColliders = [];
for (const [piece, u, v, yaw, cols] of CAMP_DECOR) {
  const p = campAt(u, v);
  campPieces.push(Object.freeze({ piece, ...p, yaw }));
  const c = Math.cos(yaw), s = Math.sin(yaw);
  // three.js rotation.y maps local (x, z) -> (x c + z s, -x s + z c); piece dv is local -z
  for (const [du, dv, r] of cols) campColliders.push(Object.freeze({ type: 'camp_' + piece.slice(3).toLowerCase(), x: p.x + du * c - dv * s, z: p.z - du * s - dv * c, r }));
}
// palisade: bays round the ring, leaving a two-bay entrance to the east
const BAY = 3.2, GAP = 0.36;
for (let a = GAP; a <= Math.PI * 2 - GAP + 1e-6; a += BAY / SALVAGE_CAMP.wall) {
  const p = { x: SALVAGE_CAMP.x + Math.cos(a) * SALVAGE_CAMP.wall, z: SALVAGE_CAMP.z + Math.sin(a) * SALVAGE_CAMP.wall };
  // the bay's front (local +z) faces outward: rotation.y maps +z to (sin yaw, cos yaw)
  const yaw = Math.atan2(Math.cos(a), Math.sin(a));
  campPieces.push(Object.freeze({ piece: 'CK_Wall', ...p, yaw }));
  const tx = -Math.sin(a), tz = Math.cos(a);
  for (const k of [-0.8, 0.8]) campColliders.push(Object.freeze({ type: 'camp_wall', x: p.x + tx * k, z: p.z + tz * k, r: 0.9 }));
}
export const SALVAGE_CAMP_PIECES = Object.freeze(campPieces);
export const SALVAGE_CAMP_COLLIDERS = Object.freeze(campColliders);

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

// The Expedition Outpost: a safe camp on the level pad east of the arrival. The
// shelter (outpost_shelter.glb, a faceted armour shell on a tube lattice) opens
// west toward the arrival terrace; the quartermaster stands behind a waist-high
// counter inside it (low colliders do not block line of sight).
const O = SEVERANCE_EXPANSE.outpost;
const ox = (dx, dz) => ({ x: O.x + dx, z: O.z + dz });
// Shelter frame: front (open) toward -x, length along x, half-width along z.
const SHX = O.x + 3, SHZ = O.z + 1;
export const EXPEDITION_OUTPOST = Object.freeze({
  name: 'Expedition Outpost', x: O.x, z: O.z, r: O.r,
  shelter: Object.freeze({ x: SHX, z: SHZ, yaw: -Math.PI / 2, front: -6.4, rear: 6.9, sledFront: -8.6, sledRear: 8.0, hw: 4.6, height: 3.86 }),
  // Two supplementary open field shelters extend the existing operations
  // shelter; they use real corner-post colliders but keep the approach open.
  auxiliaryShelters: Object.freeze([
    Object.freeze({key:'north',x:O.x-7,z:O.z+11,w:4.8,d:3.8,height:2.9,yaw:-Math.PI/2}),
    Object.freeze({key:'west',x:O.x-12,z:O.z-6,w:4.6,d:3.7,height:2.7,yaw:-Math.PI/2}),
  ]),
  quartermaster: Object.freeze({ x: SHX - 1.0, z: SHZ, yaw: -Math.PI / 2 }),
  counter: Object.freeze({ x: SHX - 2.6, z: SHZ, hw: 0.45, hd: 2.0, h: 0.75 }),
  table: Object.freeze({ x: SHX - 4.4, z: SHZ + 2.7, r: 0.75, h: 0.95 }),
  mast: Object.freeze(ox(-7.5, -8)),
  lamps: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7].filter((i) => i !== 4).map((i) => Object.freeze(ox(Math.cos(i * Math.PI / 4) * 14.5, Math.sin(i * Math.PI / 4) * 14.5)))),
  // outpost crew (presentation NPCs with a line of field talk; no services)
  crew: Object.freeze([
    Object.freeze({ key: 'outpost_surveyor', name: 'Surveyor Idris Vale', x: SHX - 4.4, z: SHZ + 3.85, yaw: Math.PI }),
    Object.freeze({ key: 'outpost_signaller', name: 'Signaller Maren Okafor', ...ox(-6.1, -7.2), yaw: -2.2 }),
  ]),
});
// Stationed defensive ring: two paired posts, two solo overwatch positions,
// and a Halo Construct officer who commands from the middle. These are
// neutral allied objects, not player-farmable enemy or quest NPCs.
export const EXPEDITION_DEFENDERS=Object.freeze([
 ...[
  [-11,2,0,'Expanse Warden · North Pair','arc'],
  [-11,5,1,'Expanse Warden · North Pair','kinetic'],
  [-9,-9,2,'Expanse Warden · South Pair','resonance'],
  [-6,-11,3,'Expanse Warden · South Pair','thermal'],
  [10,5,4,'Expanse Warden · Eastern Watch','arc'],
  [12,-8,5,'Expanse Warden · Basin Watch','resonance'],
 ].map(([dx,dz,variant,name,affinity],i)=>Object.freeze({
  key:'expanse_warden_'+(i+1),type:'outpost_warden',name,
  x:O.x+dx,z:O.z+dz,r:.45,variant,affinity,
  yaw:Math.atan2(dx,dz)
 })),
 Object.freeze({key:'expanse_security_officer',type:'outpost_commander',name:'Expedition Elite Security Officer',
  x:O.x+1,z:O.z+8,r:.45,variant:0,affinity:'resonance',yaw:Math.PI}),
]);
const OP = EXPEDITION_OUTPOST, SH = OP.shelter;
export const OUTPOST_COLLIDERS = Object.freeze([
  ...OP.auxiliaryShelters.flatMap(sh=>[-1,1].flatMap(sx=>[-1,1].map(sz=>Object.freeze({
    type:'outpost_shelter_post',x:sh.x+sx*(sh.w/2-.22),z:sh.z+sz*(sh.d/2-.22),r:.17,h:sh.height
  })))),
  ...[-1, 1].map((s) => Object.freeze({ type: 'outpost_shell', x: SH.x + (SH.front + SH.rear) / 2, z: SH.z + s * (SH.hw + 0.05), hw: (SH.rear - SH.front) / 2, hd: 0.3, h: 3 })),
  Object.freeze({ type: 'outpost_shell', x: SH.x + SH.rear - 0.3, z: SH.z, hw: 0.4, hd: SH.hw * 0.72, h: 2.8 }),
  ...[-1, 1].map((s) => Object.freeze({ type: 'outpost_sled', x: SH.x + (SH.sledFront - 6.2) / 2, z: SH.z + s * SH.hw * 0.92, hw: (6.2 + SH.sledFront) / -2, hd: 0.15, h: 3.6 })),
  ...[-1, 1].map((s) => Object.freeze({ type: 'outpost_sled', x: SH.x + (SH.sledRear + 6.2) / 2, z: SH.z + s * SH.hw * 0.82, hw: (SH.sledRear - 6.2) / 2, hd: 0.15, h: 2.6 })),
  Object.freeze({ type: 'outpost_counter', x: OP.counter.x, z: OP.counter.z, hw: OP.counter.hw, hd: OP.counter.hd, h: OP.counter.h }),
  Object.freeze({ type: 'outpost_table', x: OP.table.x, z: OP.table.z, r: OP.table.r, h: OP.table.h }),
  Object.freeze({ type: 'outpost_crates', x: SH.x + 3.2, z: SH.z - 3.3, hw: 0.9, hd: 0.7, h: 1.6 }),
  Object.freeze({ type: 'outpost_crates', ...ox(-6, 9), hw: 1.3, hd: 1.0, h: 1.9 }),
  Object.freeze({ type: 'outpost_crates', ...ox(9.5, -8.5), hw: 1.0, hd: 1.4, h: 1.5 }),
  Object.freeze({ type: 'outpost_generator', ...ox(10, 9), hw: 1.1, hd: 0.8, h: 1.6 }),
  Object.freeze({ type: 'outpost_mast', x: OP.mast.x, z: OP.mast.z, r: 0.55, h: 9 }),
  ...OP.lamps.map((l) => Object.freeze({ type: 'outpost_lamp', x: l.x, z: l.z, r: 0.18, h: 2.4 })),
]);
/** Inside the outpost's safe perimeter. */
export function inExpeditionOutpost(p) {
  return Math.hypot(p.x - OP.x, p.z - OP.z) < OP.r;
}

export const SEVERANCE_PROPS = Object.freeze([...GATE_COLLIDERS, ...SEVERANCE_MASSIFS, ...SEVERANCE_CRYSTALS.map((c) => Object.freeze({ ...c, r: c.r * 0.85 })), ...RING_FEET, ...SEVERANCE_RUINS, ...SEVERANCE_OUTCROPS, ...OUTPOST_COLLIDERS, ...SALVAGE_CAMP_COLLIDERS]);


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
  if (Math.hypot(x - P.outpost.x, z - P.outpost.z) < P.outpost.r) return 'Expedition Outpost';
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
