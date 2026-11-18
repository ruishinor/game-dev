// Character appearances. A look is data: which body, which clothing shells are
// shown and how each part is shaded, plus gear attached to bones. Looks are
// independent of combat class — the server only stores and relays the id.
//
// Attachment builders work in model space with the body in its bind pose
// (T-pose, facing +Z, feet at y = 0, left side at +X); each piece is then
// handed to a bone and follows it rigidly.

import * as THREE from '/vendor/three/three.module.js';
import { buildUtilityPouch } from './utility-pouch.js';

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0, ...o });
const glow = (color) => new THREE.MeshBasicMaterial({ color });

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function place(mesh, x, y, z, rx = 0, ry = 0, rz = 0) {
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  return mesh;
}

/** A round tube along points (a strap or a hose). */
function strap(points, material, radius = 0.014) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 18, radius, 6, false), material);
  m.castShadow = true;
  return m;
}

// --- gear --------------------------------------------------------------------

/** Red Rucker's load-bearing rucksack: dark slate pack, webbing rows, black straps. */
function rucksack(ctx) {
  const shell = std({ color: 0x2b3038, roughness: 0.85 });
  const dark = std({ color: 0x15171b, roughness: 0.9 });
  const pack = new THREE.Group();
  const add = (geo, mat, ...at) => pack.add(place(new THREE.Mesh(geo, mat), ...at));
  add(box(0.3, 0.44, 0.15), shell, 0, 1.3, -0.245);
  add(box(0.28, 0.1, 0.13), shell, 0, 1.54, -0.235, 0.25); // rounded top
  add(box(0.24, 0.2, 0.05), shell, 0, 1.22, -0.335); // front pocket
  add(box(0.09, 0.06, 0.012), dark, 0, 1.47, -0.324); // patch panel
  for (let i = 0; i < 4; i++) add(box(0.25, 0.018, 0.012), dark, 0, 1.15 + i * 0.055, -0.364); // webbing
  add(box(0.3, 0.03, 0.155), dark, 0, 1.09, -0.245); // base
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 5, 10, Math.PI), dark);
  pack.add(place(handle, 0, 1.59, -0.23));
  for (const s of [-1, 1]) {
    pack.add(
      strap(
        [
          [s * 0.09, 1.5, -0.17],
          [s * 0.105, 1.535, -0.07],
          [s * 0.115, 1.505, 0.06],
          [s * 0.125, 1.4, 0.128],
          [s * 0.14, 1.27, 0.118],
          [s * 0.155, 1.17, 0.03],
          [s * 0.14, 1.12, -0.17],
        ],
        dark,
        0.017
      )
    );
  }
  ctx.attach('spine_03', pack);
}

/** The white compass star worn on the shorts, left leg. */
function shortsStar(ctx) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 ? 0.006 : i % 4 === 0 ? 0.026 : 0.014;
    shape[i ? 'lineTo' : 'moveTo'](Math.sin(a) * r, Math.cos(a) * r);
  }
  const star = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: 0xf4f1ea, side: THREE.DoubleSide }));
  ctx.attach('thigh_l', place(star, 0.115, 0.74, 0.107, 0, 0.35, 0));
}

/** Vanguard: pauldrons, a glowing capacitor spine, gauntlet coils and a visor slit. */
function capacitorHarness(ctx) {
  const plate = ctx.shellMaterial('chest');
  const amber = glow(0xffb45c);
  ctx.glows.push(amber);
  // Pauldrons, dorsal stack and gauntlet housings: gear-recipes.js (vanguardKinetic).
  for (const s of [-1, 1]) {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.012, 6, 16), amber);
    ctx.attach(`lowerarm_${s > 0 ? 'l' : 'r'}`, place(coil, s * 0.67, 1.441, -0.068, 0, Math.PI / 2, 0));
    ctx.coils.push(coil);
    const knee = new THREE.Mesh(box(0.1, 0.1, 0.04), plate);
    ctx.attach(`calf_${s > 0 ? 'l' : 'r'}`, place(knee, s * 0.089, 0.52, 0.075, -0.2));
  }
  const visor = new THREE.Mesh(box(0.13, 0.022, 0.02), amber);
  ctx.attach('Head', place(visor, 0, 1.7, 0.128));
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 0), amber);
  ctx.attach('spine_03', place(core, 0, 1.36, 0.158));
}

/** Conductor: culture tank with living fluid, feed lines to a collar, hip satchel. */
function cultureTank(ctx) {
  const casing = std({ color: 0x1b2e30, metalness: 0.6, roughness: 0.4 });
  const teal = glow(0x7dffc4);
  ctx.glows.push(teal);
  // Reservoirs, frame and feed lines: gear-recipes.js (conductorCulture).
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.016, 6, 14), casing);
  ctx.attach('neck_01', place(collar, 0, 1.5, 0.0, Math.PI / 2 - 0.25));
  ctx.attach('pelvis', place(buildUtilityPouch(THREE,'conductor'), 0.19, 0.93, 0.0));
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), teal);
  ctx.attach('pelvis', place(lamp, 0.24, 0.95, 0.01));
  // A small industrial lower-face respirator breaks up the exposed
  // mannequin silhouette without hiding the eyes or adding fantasy trim.
  const filter = std({ color: 0x253c39, metalness: 0.35, roughness: 0.65 });
  const mask = new THREE.Mesh(box(0.15, 0.075, 0.042), filter);
  ctx.attach('Head', place(mask, 0, 1.635, 0.143, -0.12));
  for (const side of [-1, 1]) {
    const port = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.025, 8), casing);
    ctx.attach('Head', place(port, side * 0.085, 1.632, 0.153, Math.PI / 2));
  }
}

/** Archivist: a slate held at the hip that she gestures over, and a gold collar. */
function archivistKit(ctx) {
  const gold = glow(0xffd27a);
  ctx.glows.push(gold);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 6, 14), gold);
  ctx.attach('neck_01', place(collar, 0, 1.495, 0.0, Math.PI / 2 - 0.25));
  const slate = new THREE.Mesh(box(0.16, 0.012, 0.11), std({ color: 0x1d1b2c, metalness: 0.5, roughness: 0.4 }));
  ctx.attach('pelvis', place(slate, -0.2, 0.98, 0.02, 0, 0, 1.2));
  const face = new THREE.Mesh(box(0.14, 0.004, 0.09), gold);
  ctx.attach('pelvis', place(face, -0.207, 0.98, 0.02, 0, 0, 1.2));
}

/** Field survey rig: twin sealed cartridges, asymmetric receiver and protected visor. */
function surveyRig(ctx) {
  const steel = std({ color: 0x687779, metalness: 0.65, roughness: 0.55 });
  const rubber = std({ color: 0x252a2a, roughness: 0.94 });
  const glass = std({ color: 0x2a4549, metalness: 0.55, roughness: 0.24 });
  const status = glow(0xe1bc6b);
  // Cartridges, power cell, mast and supply line: gear-recipes.js (surveyorField).
  ctx.attach('Head', place(new THREE.Mesh(box(0.133, 0.039, 0.028), rubber), 0, 1.698, 0.117));
  ctx.attach('Head', place(new THREE.Mesh(box(0.117, 0.022, 0.009), glass), 0, 1.70, 0.135));
  ctx.attach('Head', place(new THREE.Mesh(box(0.014, 0.008, 0.006), status), -0.045, 1.70, 0.141));
  ctx.attach('pelvis', place(buildUtilityPouch(THREE,'surveyor'), 0.185, 0.94, -0.02));
}

/** A forearm projector and offset reserve cell, not a physical shield. */
function aegisArray(ctx) {
  const alloy = std({ color: 0x697f83, metalness: 0.65, roughness: 0.5 });
  const ceramic = std({ color: 0x31383b, metalness: 0.25, roughness: 0.82 });
  const status = glow(0x89cfe1);
  const attach = (bone, geo, mat, ...at) => ctx.attach(bone, place(new THREE.Mesh(geo, mat), ...at));
  // Dorsal resonance apparatus: gear-recipes.js (keeperResonance).
  const emitter = new THREE.Group();
  emitter.name = 'aegis-projector';
  emitter.add(place(new THREE.Mesh(box(0.16, 0.065, 0.115), ceramic), 0.60, 1.45, -0.065));
  for (const z of [-0.132, 0.002]) emitter.add(place(new THREE.Mesh(box(0.13, 0.034, 0.024), alloy), 0.60, 1.47, z, 0, 0, 0.16));
  emitter.add(place(new THREE.Mesh(new THREE.TorusGeometry(0.037, 0.008, 6, 16), alloy), 0.60, 1.491, -0.065, -Math.PI / 2));
  emitter.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.014, 10), status), 0.60, 1.488, -0.065));
  ctx.attach('lowerarm_l', emitter);
  attach('Head', box(0.054, 0.028, 0.021), alloy, -0.043, 1.7, 0.125);
  attach('Head', box(0.032, 0.009, 0.008), status, -0.043, 1.7, 0.139);
  ctx.attach('pelvis',place(buildUtilityPouch(THREE,'keeper'),-0.18,0.94,-0.02));
}

// --- looks -------------------------------------------------------------------

export const LOOK_DEFS = {
  vanguard_plate: {
    body: 'humanoid_m',
    scale: 1.05,
    parts: { body: { color: 0x343b46, roughness: 0.75 }, joints: { color: 0x1c2027, roughness: 0.6 } },
    shells: {
      chest: { color: 0xb4c0cd, metalness: 0.7, roughness: 0.42, map: 'look_plate_panels', emissiveMap: 'look_plate_glow', emissive: 0xffb45c },
      belt: { color: 0x596573, metalness: 0.6, roughness: 0.5, map: 'look_plate_panels', emissiveMap: 'look_plate_glow', emissive: 0xffb45c },
      forearms: { color: 0xb4c0cd, metalness: 0.7, roughness: 0.42, map: 'look_plate_panels', emissiveMap: 'look_plate_glow', emissive: 0xffb45c },
      upperarms: { color: 0x4a5461, metalness: 0.4, roughness: 0.6 },
      shins: { color: 0xb4c0cd, metalness: 0.7, roughness: 0.42, map: 'look_plate_panels', emissiveMap: 'look_plate_glow', emissive: 0xffb45c },
      thighs: { color: 0x4a5461, metalness: 0.4, roughness: 0.6 },
      shoes: { color: 0x596573, metalness: 0.6, roughness: 0.5 },
      helmet: { color: 0xa3b0be, metalness: 0.7, roughness: 0.4, map: 'look_plate_panels' },
    },
    gear: [capacitorHarness],
    accent: 0xffb45c,
  },
  red_rucker: {
    body: 'humanoid_m',
    scale: 1.02,
    // Veyran: smooth, featureless, naturally crimson. The mannequin's joint
    // panels take a slightly deeper red so the body reads as one skin.
    parts: { body: { color: 0xffffff, roughness: 0.55, map: 'look_red_rucker_body' }, joints: { color: 0xa81719, roughness: 0.55 } },
    shells: {
      shorts: { color: 0xffffff, roughness: 0.85, map: 'look_red_rucker_shorts' },
      shoes: { color: 0xb51a1a, roughness: 0.7 },
    },
    gear: [rucksack, shortsStar],
    accent: 0xff6a4a,
  },
  aegis_keeper: {
    body: 'humanoid_f',
    scale: 0.95,
    parts: { body: { color: 0x919b91, roughness: 0.78 }, joints: { color: 0x282d30, roughness: 0.88 } },
    shells: {
      coat: { color: 0x777c76, roughness: 0.86, map: 'look_coat_panels' },
      upperarms: { color: 0x414b50, roughness: 0.72 },
      forearms: { color: 0x506063, metalness: 0.48, roughness: 0.59 },
      thighs: { color: 0x373d41, roughness: 0.86 },
      shins: { color: 0x515b5e, metalness: 0.38, roughness: 0.67 },
      shoes: { color: 0x343b3d, roughness: 0.88 },
      hood: { color: 0x414b50, roughness: 0.83 },
    },
    gear: [aegisArray],
    accent: 0x89cfe1,
  },
  conductor: {
    body: 'humanoid_f',
    scale: 1.0,
    parts: { body: { color: 0xd3ddd6, roughness: 0.45 }, joints: { color: 0x1a302f, roughness: 0.6 } },
    shells: {
      coat: { color: 0x3a8273, roughness: 0.8, map: 'look_coat_panels', emissiveMap: 'look_coat_glow', emissive: 0x7dffc4 },
      upperarms: { color: 0x234c46, roughness: 0.8 },
      forearms: { color: 0x17302f, roughness: 0.6, metalness: 0.3 },
      thighs: { color: 0x1c3a38, roughness: 0.8 },
      shins: { color: 0x15292a, roughness: 0.6, metalness: 0.3 },
      shoes: { color: 0x15292a, roughness: 0.6, metalness: 0.3 },
      hood: { color: 0x2a5f55, roughness: 0.85 },
    },
    gear: [cultureTank],
    accent: 0x7dffc4,
  },
  brine_surveyor: {
    body: 'humanoid_f',
    scale: 1.0,
    parts: { body: { color: 0x64716e, roughness: 0.72 }, joints: { color: 0x252d2c, roughness: 0.88 } },
    shells: {
      coat: { color: 0x777b70, roughness: 0.88, map: 'look_coat_panels' },
      upperarms: { color: 0x9b713d, roughness: 0.84 },
      forearms: { color: 0x444b48, roughness: 0.60, metalness: 0.32 },
      thighs: { color: 0x454b46, roughness: 0.9 },
      shins: { color: 0x343b3b, roughness: 0.75, metalness: 0.2 },
      shoes: { color: 0x303534, roughness: 0.88 },
      hood: { color: 0x8e653a, roughness: 0.82 },
    },
    gear: [surveyRig],
    accent: 0xe1bc6b,
  },
  archivist: {
    body: 'humanoid_f',
    scale: 1.0,
    parts: { body: { color: 0xd9c8b4, roughness: 0.5 }, joints: { color: 0x2d2a44, roughness: 0.6 } },
    shells: {
      coat: { color: 0x6f6294, roughness: 0.85, map: 'look_coat_panels' },
      upperarms: { color: 0x4a4168, roughness: 0.85 },
      forearms: { color: 0x4a4168, roughness: 0.85 },
      thighs: { color: 0x4a4168, roughness: 0.85 },
      shins: { color: 0x2d2a44, roughness: 0.7 },
      shoes: { color: 0x2d2a44, roughness: 0.7 },
      hood: { color: 0x4a4168, roughness: 0.85 },
    },
    gear: [archivistKit],
    accent: 0xffd27a,
  },
};

/** Entity class -> look used when the server does not name one. */
export const CLASS_LOOK = { vanguard: 'vanguard_plate', symbiotech: 'conductor', surveyor: 'brine_surveyor', keeper:'aegis_keeper', archivist: 'archivist' };

export function lookFor(meta) {
  if (meta.a && LOOK_DEFS[meta.a]) return meta.a;
  return CLASS_LOOK[meta.c] || null;
}

/** Every bundle the looks need, for preloading. */
export const HUMANOID_BUNDLES = ['humanoid_m', 'humanoid_f'];
