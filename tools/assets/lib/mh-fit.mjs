// Fit a MakeHuman body onto the game's humanoid rig (the Universal Animation
// Library skeleton the clips are authored for).
//
// The clips only animate bone rotations (plus pelvis translation), so the
// rig keeps every rest rotation and bone direction and takes its bone
// *lengths* from the MakeHuman body. The body is then posed from MakeHuman's
// A-pose into the rig's T-pose by linear blend skinning with MakeHuman's own
// CC0 weights, each MakeHuman bone following the rig bone it maps to.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => mul(a, 1 / (len(a) || 1));
const lerp = (a, b, k) => add(a, mul(sub(b, a), k));

/** Rotation matrix (row-major 3x3) taking orthonormal frame A to frame B. */
function frame(primary, secondary) {
  const x = norm(primary);
  const z = norm(cross(x, secondary));
  const y = cross(z, x);
  return [x, y, z];
}
function frameRotation(aP, aS, bP, bS) {
  const A = frame(aP, aS);
  const B = frame(bP, bS);
  // R = B^T * A  (columns of B times rows of A)
  const R = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R.push(B[0][i] * A[0][j] + B[1][i] * A[1][j] + B[2][i] * A[2][j]);
  return R;
}
function minimalRotation(a, b) {
  a = norm(a);
  b = norm(b);
  const helper = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const axis = cross(a, b);
  if (len(axis) < 1e-9) return frameRotation(a, helper, b, helper);
  return frameRotation(a, axis, b, axis);
}
const apply = (R, v) => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];

const SIDES = [['l', 'L'], ['r', 'R']];
const FINGERS = [['thumb', 1], ['index', 2], ['middle', 3], ['ring', 4], ['pinky', 5]];

/** Rig joint -> point on the MakeHuman body (joints J in metres). */
export function rigTargets(J, rig) {
  const h = (b) => J[`${b}____head`];
  const t = (b) => J[`${b}____tail`];
  const T = {
    pelvis: h('spine05'),
    spine_01: h('spine03'),
    spine_02: h('spine02'),
    spine_03: h('spine01'),
    neck_01: h('neck01'),
    Head: h('head'),
  };
  if (rig) {
    // Spine and neck joints: the point on MakeHuman's centre line at the
    // rig joint's height (the body is already scaled sole-to-crown).
    const line = ['spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'neck01', 'neck02', 'neck03', 'head'].map(h).concat([t('head')]);
    const at = (y) => {
      for (let i = 0; i + 1 < line.length; i++) {
        const a = line[i], b = line[i + 1];
        if ((y >= a[1] && y <= b[1]) || i + 2 === line.length) return lerp(a, b, (y - a[1]) / (b[1] - a[1] || 1));
      }
    };
    for (const n of ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head']) T[n] = at(rig[n].world[1]);
  }
  for (const [s, S] of SIDES) {
    Object.assign(T, {
      [`clavicle_${s}`]: h(`clavicle.${S}`),
      [`upperarm_${s}`]: h(`upperarm01.${S}`),
      [`lowerarm_${s}`]: h(`lowerarm01.${S}`),
      [`hand_${s}`]: h(`wrist.${S}`),
      [`thigh_${s}`]: h(`upperleg01.${S}`),
      [`calf_${s}`]: h(`lowerleg01.${S}`),
      [`foot_${s}`]: h(`foot.${S}`),
      [`ball_${s}`]: t(`foot.${S}`),
      [`ball_leaf_${s}`]: t(`toe3-3.${S}`),
    });
    for (const [f, n] of FINGERS) {
      T[`${f}_01_${s}`] = h(`finger${n}-1.${S}`);
      T[`${f}_02_${s}`] = h(`finger${n}-2.${S}`);
      T[`${f}_03_${s}`] = h(`finger${n}-3.${S}`);
      T[`${f}_04_leaf_${s}`] = t(`finger${n}-3.${S}`);
    }
  }
  return T;
}

/** MakeHuman bone -> rig bone whose motion it follows. */
export function boneMap(mhBone) {
  const m = /^(.*?)(?:\.([LR]))?$/.exec(mhBone);
  const base = m[1];
  const s = m[2] ? m[2].toLowerCase() : null;
  if (/^(root|spine05|spine04|pelvis)$/.test(base)) return 'pelvis';
  if (base === 'spine03') return 'spine_01';
  if (base === 'spine02') return 'spine_02';
  if (base === 'spine01' || base === 'breast') return 'spine_03';
  if (/^neck0[123]$/.test(base)) return 'neck_01';
  if (base === 'clavicle') return `clavicle_${s}`;
  if (/^(shoulder01|upperarm0[12])$/.test(base)) return `upperarm_${s}`;
  if (/^lowerarm0[12]$/.test(base)) return `lowerarm_${s}`;
  if (base === 'wrist' || base.startsWith('metacarpal')) return `hand_${s}`;
  let f = /^finger(\d)-(\d)$/.exec(base);
  if (f) return `${FINGERS[+f[1] - 1][0]}_0${f[2]}_${s}`;
  if (/^upperleg0[12]$/.test(base)) return `thigh_${s}`;
  if (/^lowerleg0[12]$/.test(base)) return `calf_${s}`;
  if (base === 'foot') return `foot_${s}`;
  if (base.startsWith('toe')) return `ball_${s}`;
  return 'Head'; // head, jaw, eyes, tongue and the facial muscles
}

/**
 * @param rig  {name: {parent, world: [x,y,z], child?: primary child name}} rest pose in metres
 * @param J    MakeHuman joints in metres
 * @param scale  overall scale applied to MakeHuman lengths (1 = as modelled)
 * @returns {world: new rig joint positions, transforms: rig bone -> {h, H, R}}
 */
export function fitRig(rig, J, { keepRig = true } = {}) {
  const T = rigTargets(J, keepRig ? rig : null);
  const names = Object.keys(rig);
  const children = {};
  for (const n of names) if (rig[n].parent && rig[rig[n].parent]) (children[rig[n].parent] ||= []).push(n);
  const world = {};
  if (keepRig) {
    // The rig keeps its own joint positions (gear and clothing are authored
    // against them); the body is stretched along each bone to fit.
    const walk = (b) => {
      world[b] = rig[b].world.slice();
      for (const c of children[b] || []) walk(c);
    };
    walk('pelvis');
  } else {
  // Pelvis sits where MakeHuman's is, then every child keeps the rig's
  // direction and takes MakeHuman's length.
  world.pelvis = T.pelvis.slice();
  const walk = (b) => {
    for (const c of children[b] || []) {
      const dir = norm(sub(rig[c].world, rig[b].world));
      const L = T[c] && T[b] ? len(sub(T[c], T[b])) : len(sub(rig[c].world, rig[b].world));
      world[c] = add(world[b], mul(dir, L));
      walk(c);
    }
  };
  walk('pelvis');
  }
  // Joints above the pelvis (root, armature) keep their place.

  // Per rig bone: MakeHuman segment (h -> t) maps onto rig segment (H -> Tn).
  const primary = (b) => {
    if (rig[b].child) return rig[b].child;
    const cs = (children[b] || []).filter((c) => T[c]);
    return cs.find((c) => /middle_01|spine|neck|Head|lowerarm|hand_|calf|foot_|ball_|_0[234]/.test(c)) || cs[0];
  };
  const transforms = {};
  for (const b of names) {
    if (!T[b]) continue;
    const c = primary(b);
    const h = T[b];
    const H = world[b];
    let R;
    if (c && T[c]) {
      const a = sub(T[c], h);
      const d = sub(world[c], H);
      const side = b.endsWith('_l') ? 'l' : b.endsWith('_r') ? 'r' : null;
      if (side && /^(hand|index|middle|ring|pinky|lowerarm)/.test(b)) {
        // Keep the palm orientation: align index->pinky across the hand too.
        const acrossMH = sub(T[`pinky_01_${side}`], T[`index_01_${side}`]);
        const acrossRig = sub(world[`pinky_01_${side}`], world[`index_01_${side}`]);
        R = frameRotation(a, acrossMH, d, acrossRig);
      } else if (side && /^(foot|ball)/.test(b)) {
        R = frameRotation(a, [1, 0, 0], d, [1, 0, 0]);
      } else R = minimalRotation(a, d);
    } else R = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    // Axial stretch so the MakeHuman segment spans the rig segment exactly.
    let axis = null, k = 1;
    if (c && T[c]) {
      const a = sub(T[c], h);
      axis = norm(a);
      k = len(sub(world[c], H)) / (len(a) || 1);
      k = Math.max(0.75, Math.min(1.33, k));
    }
    transforms[b] = { h, H, R, axis, k };
  }
  // Head has no rig child with a target: align MakeHuman head axis to the rig's neck->head continuation.
  if (transforms.Head && transforms.neck_01) transforms.Head.R = transforms.neck_01.R.slice();
  return { world, transforms, targets: T };
}

/** Pose vertices (array of [x,y,z]) with per-vertex rig weights [[bone, w], ...]. */
export function poseVertices(verts, weights, transforms) {
  return verts.map((p, i) => {
    let o = [0, 0, 0];
    let tw = 0;
    for (const [b, w] of weights[i]) {
      const t = transforms[b];
      if (!t) continue;
      let d = sub(p, t.h);
      if (t.axis && t.k !== 1) d = add(d, mul(t.axis, (t.k - 1) * dot(d, t.axis)));
      o = add(o, mul(add(t.H, apply(t.R, d)), w));
      tw += w;
    }
    return tw > 0 ? mul(o, 1 / tw) : p;
  });
}
export const vec = { sub, add, mul, dot, cross, len, norm, lerp, apply };
