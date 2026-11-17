// Signature equipment recipes for the four profession looks, built with
// gear-kit.js. Coordinates are bind-pose model space in metres (see looks.js):
// back plane z ~ -0.15, chest y ~ 1.3, shoulders (±0.22, 1.47), forearms
// (±0.6, 1.44, -0.065), visor (0, 1.70, 0.13), pelvis y ~ 0.93.
//
// Design rule from the owner's references (EQP-001, CHR-008): one modular
// reservoir family — structural frame, protective cylinder, cage, latches,
// supply lines, charge indicators — whose interior and silhouette change by
// discipline, not just its colour.

const PI = Math.PI;

/** A caged reservoir standing on its own axis at `at` (bone space), height h. */
function reservoir(b, bone, at, { r = 0.055, h = 0.3, tilt = 0, cap, band, fluid, kind = 0, cage = true, fill = 0.9, fillMin = 0.2 }) {
  const { prim, M } = b;
  const [x, y, z] = at;
  const rot = [0, 0, tilt];
  const up = (d) => [x - Math.sin(tilt) * d, y + Math.cos(tilt) * d, z];
  const capProfile = [[0, 0], [r * 1.25, 0], [r * 1.35, 0.012], [r * 1.35, 0.03], [r * 1.12, 0.045], [r * 0.6, 0.055], [r * 0.3, 0.07], [0, 0.07]];
  b.add(bone, prim.lathe(capProfile, 18), cap, up(h / 2), rot);
  b.add(bone, prim.lathe(capProfile, 18), cap, up(-h / 2), [PI, 0, tilt]);
  b.add(bone, prim.cyl(r * 1.06, h, 18, true), M.glass(), up(0), rot);
  b.fluid(bone, r * 0.9, h * 0.94, up(0), rot, { color: fluid, kind, fill, fillMin });
  if (cage) {
    for (let i = 0; i < 4; i++) {
      const a = i * PI / 2 + PI / 4;
      const ox = Math.cos(a) * r * 1.2;
      const oz = Math.sin(a) * r * 1.2;
      b.add(bone, prim.cyl(0.006, h * 1.02, 6), M.darkSteel(), [up(0)[0] + ox * Math.cos(tilt), up(0)[1] + ox * Math.sin(tilt), z + oz], rot);
    }
    b.add(bone, prim.torus(r * 1.2, 0.007, 18), band || M.darkSteel(), up(0), [PI / 2, 0, tilt]);
  }
}

// --- Kinetic Vanguard: kinetic storage stack -----------------------------------------

export function vanguardKinetic(b) {
  const { prim, M } = b;
  const orange = M.paint('kinetic-orange', { base: '#b2532a', metal: '#b9b4ab', hazard: true, stencil: 'KV-07', seed: 7 });
  const plate = M.paint('kinetic-plate', { base: '#59616a', metal: '#b9bec2', seed: 11 });
  const amber = M.lamp(0xffb45c);
  const S = 'spine_03';
  // structural frame against the back
  b.add(S, prim.block(0.32, 0.46, 0.05), plate, [0, 1.3, -0.19]);
  b.add(S, prim.block(0.06, 0.52, 0.06), M.darkSteel(), [0, 1.3, -0.225]);
  // two heavy kinetic accumulators (opaque, painted, banded)
  for (const s of [-1, 1]) {
    const x = s * 0.115;
    b.add(S, prim.lathe([[0, 0], [0.075, 0], [0.082, 0.02], [0.082, 0.33], [0.075, 0.35], [0.03, 0.37], [0, 0.37]], 20), orange, [x, 1.1, -0.29]);
    for (const yy of [1.17, 1.31]) b.add(S, prim.cyl(0.087, 0.026, 20), M.darkSteel(), [x, yy, -0.29]);
    b.add(S, prim.block(0.03, 0.09, 0.012, 0.004), amber, [x + s * 0.03, 1.38, -0.365]);
    // supply line over the shoulder to the chest capacitor
    b.add(S, prim.hose([[x, 1.47, -0.29], [x * 1.1, 1.56, -0.18], [x * 1.05, 1.55, -0.02], [x * 0.7, 1.44, 0.13]], 0.016), M.rubber());
  }
  // central charge cell: the glass reservoir shows stored Charge
  reservoir(b, S, [0, 1.3, -0.3], { r: 0.042, h: 0.27, cap: M.steel(), fluid: 0xffa040, kind: 0, cage: false, fill: 0.95, fillMin: 0.05 });
  b.segments(S, 6, 0.02, 0.03, 0.012, [0.19, 1.15, -0.225], [0, 0, 0], 0xffb45c);
  // chest capacitor housing (front), framing the existing glowing core
  b.add(S, prim.block(0.17, 0.12, 0.035), plate, [0, 1.36, 0.135], [0.1, 0, 0]);
  b.add(S, prim.torus(0.042, 0.009, 16), M.steel(), [0, 1.36, 0.157], [0.1, 0, 0]);
  // layered pauldrons with hazard band
  for (const s of [-1, 1]) {
    const bone = `upperarm_${s > 0 ? 'l' : 'r'}`;
    b.add(bone, prim.block(0.15, 0.05, 0.22, 0.02), orange, [s * 0.29, 1.515, -0.06], [0, 0, s * -0.22]);
    b.add(bone, prim.block(0.12, 0.04, 0.2, 0.018), plate, [s * 0.34, 1.485, -0.06], [0, 0, s * -0.5]);
    b.add(bone, prim.block(0.03, 0.012, 0.16, 0.004), amber, [s * 0.36, 1.47, -0.06], [0, 0, s * -0.5]);
    // gauntlet housing around the coil
    const fore = `lowerarm_${s > 0 ? 'l' : 'r'}`;
    b.add(fore, prim.block(0.17, 0.09, 0.11, 0.02), plate, [s * 0.575, 1.445, -0.068]);
    b.add(fore, prim.block(0.05, 0.02, 0.06, 0.006), amber, [s * 0.575, 1.495, -0.068]);
  }
  // helmet: brow ridge, cheek guards and a short antenna
  b.add('Head', prim.block(0.17, 0.035, 0.05, 0.012), plate, [0, 1.735, 0.115]);
  for (const s of [-1, 1]) b.add('Head', prim.block(0.03, 0.08, 0.09, 0.01), orange, [s * 0.09, 1.66, 0.06]);
  b.add('Head', prim.cyl(0.004, 0.14, 6), plate, [0.07, 1.84, -0.06], [0, 0, 0.15]);
  b.add('Head', prim.block(0.014, 0.014, 0.014, 0.004), amber, [0.06, 1.91, -0.06]);
}

// --- Symbiotech Conductor: dorsal culture frame (CHR-008 / EQP-001 restorative) -------

export function conductorCulture(b) {
  const { prim, M } = b;
  const frame = M.paint('culture-frame', { base: '#4e6a63', metal: '#c7ccc6', seed: 21 });
  const medic = M.paint('culture-medic', { base: '#cfd3cc', metal: '#9da3a0', cross: true, seed: 22 });
  const red = M.paint('culture-red', { base: '#8d2328', metal: '#c5bdb4', seams: false, seed: 23 });
  const green = M.lamp(0x7dffc4);
  const S = 'spine_03';
  // dorsal support frame: spine bar, two rails, hip struts
  b.add(S, prim.block(0.07, 0.5, 0.05), frame, [0, 1.28, -0.19]);
  for (const y of [1.12, 1.46]) b.add(S, prim.block(0.36, 0.035, 0.04), frame, [0, y, -0.21]);
  // three culture reservoirs, visibly different inside (strands / bubbles / particulate)
  reservoir(b, S, [0, 1.31, -0.29], { r: 0.055, h: 0.3, cap: M.steel(), band: red, fluid: 0x5dffa8, kind: 1 });
  reservoir(b, S, [-0.125, 1.27, -0.27], { r: 0.045, h: 0.25, tilt: 0.12, cap: M.steel(), band: red, fluid: 0x9fe86a, kind: 2 });
  reservoir(b, S, [0.125, 1.27, -0.27], { r: 0.045, h: 0.25, tilt: -0.12, cap: M.steel(), band: red, fluid: 0x56d8d0, kind: 3 });
  b.segments(S, 5, 0.018, 0.022, 0.01, [0.2, 1.17, -0.22], [0, 0, 0], 0x7dffc4);
  // feed lines from the reservoirs to the collar and the forearm interface
  for (const s of [-1, 1]) b.add(S, prim.hose([[s * 0.125, 1.41, -0.27], [s * 0.15, 1.52, -0.16], [s * 0.1, 1.53, -0.02], [s * 0.06, 1.5, 0.06]], 0.011), M.rubber());
  b.add(S, prim.hose([[0.125, 1.13, -0.27], [0.2, 1.1, -0.15], [0.22, 1.2, -0.05], [0.24, 1.38, -0.06]], 0.01), M.rubber());
  // articulated shoulder protection with medical marking
  for (const s of [-1, 1]) {
    const bone = `upperarm_${s > 0 ? 'l' : 'r'}`;
    b.add(bone, prim.block(0.13, 0.04, 0.17, 0.018), medic, [s * 0.285, 1.51, -0.06], [0, 0, s * -0.22]);
    b.add(bone, prim.block(0.1, 0.03, 0.15, 0.014), frame, [s * 0.33, 1.48, -0.06], [0, 0, s * -0.5]);
  }
  // compact forearm interface (left): housing, diagnostic window, injector ring
  b.add('lowerarm_l', prim.block(0.16, 0.06, 0.1, 0.016), frame, [0.58, 1.465, -0.066]);
  b.add('lowerarm_l', prim.block(0.09, 0.006, 0.06, 0.003), green, [0.58, 1.497, -0.066]);
  b.add('lowerarm_l', prim.torus(0.05, 0.01, 18), M.steel(), [0.66, 1.44, -0.066], [0, PI / 2, 0]);
  b.add('lowerarm_r', prim.block(0.12, 0.05, 0.09, 0.014), frame, [-0.58, 1.46, -0.066]);
  // cranial band with lamp and red-cross plate (keeps the eyes clear)
  b.add('Head', prim.torus(0.1, 0.012, 24, PI * 1.2), frame, [0, 1.76, 0.0], [PI / 2, 0, -PI * 0.1]);
  b.add('Head', prim.block(0.06, 0.05, 0.015, 0.006), medic, [0, 1.78, 0.1]);
  b.add('Head', prim.cyl(0.016, 0.03, 10), M.steel(), [0.09, 1.76, 0.06], [PI / 2, 0, 0]);
  b.add('Head', prim.disc(0.012, 12), green, [0.09, 1.76, 0.0765]);
}

// --- Aegis Keeper: resonance apparatus ------------------------------------------------

export function keeperResonance(b) {
  const { prim, M } = b;
  const shell = M.paint('keeper-shell', { base: '#3b4246', metal: '#c2c9cc', stencil: 'AK', seed: 31 });
  const cyan = M.lamp(0x6fdcff);
  const S = 'spine_03';
  // housing plate and the ring core facing outward (-Z)
  b.add(S, prim.block(0.3, 0.42, 0.05), shell, [0, 1.3, -0.19]);
  b.add(S, prim.lathe([[0.1, -0.03], [0.15, -0.03], [0.165, 0], [0.15, 0.03], [0.1, 0.03], [0.095, 0]], 32), M.chrome(), [0, 1.31, -0.25], [PI / 2, 0, 0]);
  b.core(S, 0.1, [0, 1.31, -0.278], [0, PI, 0], 0xb06cff);
  // twin stabiliser cylinders above and below with light strips
  for (const yy of [1.1, 1.52]) {
    b.add(S, prim.cyl(0.035, 0.26, 16), M.chrome(), [0, yy, -0.25], [0, 0, PI / 2]);
    b.add(S, prim.block(0.22, 0.008, 0.012, 0.003), cyan, [0, yy, -0.287]);
    for (const s of [-1, 1]) b.add(S, prim.lathe([[0, 0], [0.042, 0], [0.042, 0.02], [0.03, 0.03], [0, 0.03]], 14), M.darkSteel(), [s * 0.13, yy, -0.25], [0, 0, -s * PI / 2]);
  }
  // wound resonance coils on the side bars
  for (const s of [-1, 1]) {
    b.add(S, prim.cyl(0.012, 0.42, 8), M.darkSteel(), [s * 0.155, 1.31, -0.25]);
    for (let i = 0; i < 7; i++) b.add(S, prim.torus(0.02, 0.006, 10), M.brass(), [s * 0.155, 1.2 + i * 0.036, -0.25], [PI / 2, 0, 0]);
    b.add(S, prim.block(0.012, 0.3, 0.012, 0.003), cyan, [s * 0.18, 1.31, -0.27]);
  }
  b.segments(S, 5, 0.018, 0.024, 0.01, [-0.2, 1.16, -0.215], [0, 0, 0], 0x6fdcff);
  // asymmetric single pauldron on the projector arm
  b.add('upperarm_l', prim.block(0.15, 0.05, 0.21, 0.02), shell, [0.29, 1.51, -0.06], [0, 0, -0.22]);
  b.add('upperarm_l', prim.block(0.12, 0.012, 0.03, 0.004), cyan, [0.3, 1.53, 0.05], [0, 0, -0.22]);
  // projector upgrade: emitter fins and lens ring around the existing projector
  for (const z of [-0.14, 0.01]) b.add('lowerarm_l', prim.block(0.18, 0.05, 0.012, 0.004), M.chrome(), [0.6, 1.49, z], [0, 0, 0.12]);
  b.add('lowerarm_l', prim.torus(0.055, 0.008, 22), M.chrome(), [0.6, 1.5, -0.065], [-PI / 2, 0, 0]);
  b.add('lowerarm_l', prim.disc(0.04, 20), cyan, [0.6, 1.502, -0.065], [-PI / 2, 0, 0]);
  // circlet with forward sensor
  b.add('Head', prim.torus(0.098, 0.008, 28, PI * 1.3), M.chrome(), [0, 1.73, 0.0], [PI / 2, 0, -PI * 0.15]);
  b.add('Head', prim.block(0.03, 0.012, 0.012, 0.003), cyan, [0, 1.735, 0.1]);
}

// --- Brine Surveyor: field power rig ------------------------------------------------

export function surveyorField(b) {
  const { prim, M } = b;
  const ochre = M.paint('survey-ochre', { base: '#9b713d', metal: '#bdb6a6', hazard: true, stencil: 'BS-3', seed: 41 });
  const olive = M.paint('survey-olive', { base: '#59604f', metal: '#b7b9ae', seed: 42 });
  const cyan = M.lamp(0x6fd6ff);
  const amber = M.lamp(0xe1bc6b);
  const S = 'spine_03';
  b.add(S, prim.block(0.28, 0.4, 0.06), olive, [0, 1.3, -0.19]);
  // twin ribbed sealed cartridges (opaque) and one glass power cell (Power Cells)
  for (const s of [-1, 1]) {
    const x = s * 0.1;
    b.add(S, prim.lathe([[0, 0], [0.05, 0], [0.056, 0.015], [0.056, 0.3], [0.05, 0.315], [0.02, 0.33], [0, 0.33]], 18), ochre, [x, 1.14, -0.27]);
    for (let i = 0; i < 4; i++) b.add(S, prim.cyl(0.06, 0.016, 18), M.rubber(), [x, 1.19 + i * 0.065, -0.27]);
  }
  reservoir(b, S, [0, 1.3, -0.3], { r: 0.035, h: 0.24, cap: M.darkSteel(), fluid: 0x6fd6ff, kind: 4, cage: true, fill: 0.95, fillMin: 0.05 });
  b.segments(S, 5, 0.016, 0.022, 0.01, [-0.17, 1.17, -0.225], [0, 0, 0], 0x6fd6ff);
  // survey mast with small dish and status light
  b.add(S, prim.cyl(0.008, 0.36, 8), M.steel(), [-0.13, 1.66, -0.24], [0, 0, 0.08]);
  b.add(S, prim.lathe([[0, 0], [0.05, 0.012], [0.055, 0.02], [0.05, 0.018], [0, 0.006]], 18), M.steel(), [-0.145, 1.84, -0.24], [0.9, 0.4, 0]);
  b.add(S, prim.block(0.014, 0.014, 0.014, 0.004), amber, [-0.12, 1.5, -0.24]);
  b.add(S, prim.hose([[0.1, 1.47, -0.27], [0.15, 1.54, -0.13], [0.12, 1.55, 0.02], [0.08, 1.6, 0.1]], 0.011), M.rubber());
  // ochre shoulder pad with reflective band (right), field instrument (left forearm)
  b.add('upperarm_r', prim.block(0.14, 0.045, 0.19, 0.018), ochre, [-0.285, 1.51, -0.06], [0, 0, 0.22]);
  b.add('lowerarm_l', prim.block(0.15, 0.04, 0.11, 0.012), olive, [0.58, 1.475, -0.066]);
  b.add('lowerarm_l', prim.block(0.11, 0.005, 0.075, 0.002), cyan, [0.58, 1.497, -0.066]);
  b.add('lowerarm_l', prim.cyl(0.006, 0.12, 6), M.steel(), [0.66, 1.52, -0.11], [0, 0, -0.9]);
  // goggles: lens barrels over the existing visor
  for (const s of [-1, 1]) {
    b.add('Head', prim.cyl(0.026, 0.04, 14), M.darkSteel(), [s * 0.035, 1.7, 0.135], [PI / 2, 0, 0]);
    b.add('Head', prim.disc(0.02, 14), cyan, [s * 0.035, 1.7, 0.1555]);
  }
  // sample canisters on the belt
  for (let i = 0; i < 3; i++) b.add('pelvis', prim.cyl(0.018, 0.08, 10), M.glass(), [-0.17 + i * 0.04, 0.96, 0.1]);
}

export const SIGNATURE_GEAR = {
  vanguard_plate: vanguardKinetic,
  conductor: conductorCulture,
  aegis_keeper: keeperResonance,
  brine_surveyor: surveyorField,
};
