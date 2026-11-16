// Humanoid character processing.
//
//  * Clips from both animation libraries are merged onto one skeleton. The two
//    libraries share an identical rest pose and differ only in bone names, so
//    retargeting is a rename (verified at build time, see checkRestPose).
//  * The body mesh gets a positional UV atlas (front half / back half in bind
//    pose) so outfits can be painted in body coordinates.
//  * Clothing and armour are generated as "shells": regions of the body mesh,
//    selected by skin weights and clipped by planes, pushed out along the
//    normals. A shell keeps the body's skin weights, so it follows every
//    animation with no extra rigging.

const SIDES = [
  ['L', 'l'],
  ['R', 'r'],
];

/** Animation-library-1 bone name -> shared rig bone name. */
export const BONE_MAP = (() => {
  const m = { root: 'root', 'DEF-hips': 'pelvis', 'DEF-spine.001': 'spine_01', 'DEF-spine.002': 'spine_02', 'DEF-spine.003': 'spine_03', 'DEF-neck': 'neck_01', 'DEF-head': 'Head' };
  for (const [S, s] of SIDES) {
    Object.assign(m, {
      [`DEF-shoulder.${S}`]: `clavicle_${s}`,
      [`DEF-upper_arm.${S}`]: `upperarm_${s}`,
      [`DEF-forearm.${S}`]: `lowerarm_${s}`,
      [`DEF-hand.${S}`]: `hand_${s}`,
      [`DEF-thigh.${S}`]: `thigh_${s}`,
      [`DEF-shin.${S}`]: `calf_${s}`,
      [`DEF-foot.${S}`]: `foot_${s}`,
      [`DEF-toe.${S}`]: `ball_${s}`,
    });
    for (const f of ['index', 'middle', 'pinky', 'ring']) for (const i of [1, 2, 3]) m[`DEF-f_${f}.0${i}.${S}`] = `${f}_0${i}_${s}`;
    for (const i of [1, 2, 3]) m[`DEF-thumb.0${i}.${S}`] = `thumb_0${i}_${s}`;
  }
  return m;
})();

const nodesByName = (doc) => new Map(doc.getRoot().listNodes().map((n) => [n.getName(), n]));

/** Fail the build if the two rigs stop being rename-compatible. */
export function checkRestPose(target, source, map = BONE_MAP) {
  const T = nodesByName(target);
  const S = nodesByName(source);
  let worst = 0;
  for (const [from, to] of Object.entries(map)) {
    const a = S.get(from);
    const b = T.get(to);
    if (!a || !b) throw new Error(`rig mismatch: ${from} -> ${to} not found`);
    const ra = a.getRotation();
    const rb = b.getRotation();
    const dot = Math.abs(ra[0] * rb[0] + ra[1] * rb[1] + ra[2] * rb[2] + ra[3] * rb[3]);
    worst = Math.max(worst, 2 * Math.acos(Math.min(1, dot)) * (180 / Math.PI));
  }
  if (worst > 0.5) throw new Error(`rest poses differ by ${worst.toFixed(2)} degrees; a rename is no longer a valid retarget`);
  return worst;
}

// Only rotations drive the pose; the pelvis also keeps its translation (crouch,
// jump, death). Dropping the rest keeps clips portable between body shapes and
// removes root motion, which the server owns.
const keepChannel = (bone, path) => bone && bone !== 'root' && !bone.includes('_leaf') && (path === 'rotation' || (path === 'translation' && bone === 'pelvis'));

/** Remove unwanted clips and channels from a document that already has clips. */
export function trimClips(doc, keep) {
  for (const anim of doc.getRoot().listAnimations()) {
    if (!keep.includes(anim.getName())) {
      // Dispose the parts too: an orphaned sampler still pins its keyframes.
      for (const ch of anim.listChannels()) ch.dispose();
      for (const s of anim.listSamplers()) s.dispose();
      anim.dispose();
      continue;
    }
    for (const ch of anim.listChannels()) {
      const node = ch.getTargetNode();
      if (keepChannel(node && node.getName(), ch.getTargetPath())) continue;
      // The sampler stays attached to the clip (and keeps its keyframes in the
      // file) unless it is disposed along with its channel.
      const sampler = ch.getSampler();
      ch.dispose();
      if (sampler) sampler.dispose();
    }
  }
}

/** Copy named clips from `source` (library-1 bone names) onto `target`'s skeleton. */
export function addRetargetedClips(target, source, names, map = BONE_MAP) {
  const T = nodesByName(target);
  const buffer = target.getRoot().listBuffers()[0];
  const copy = (acc) => target.createAccessor().setType(acc.getType()).setArray(acc.getArray().slice()).setNormalized(acc.getNormalized()).setBuffer(buffer);
  for (const name of names) {
    const src = source.getRoot().listAnimations().find((a) => a.getName() === name);
    if (!src) throw new Error(`clip not found in source library: ${name}`);
    const anim = target.createAnimation(name);
    for (const ch of src.listChannels()) {
      const bone = map[ch.getTargetNode().getName()];
      const path = ch.getTargetPath();
      if (!keepChannel(bone, path)) continue;
      const s = ch.getSampler();
      const sampler = target.createAnimationSampler().setInput(copy(s.getInput())).setOutput(copy(s.getOutput())).setInterpolation(s.getInterpolation());
      anim.addSampler(sampler).addChannel(target.createAnimationChannel().setTargetNode(T.get(bone)).setTargetPath(path).setSampler(sampler));
    }
  }
}

export function clipDurations(doc) {
  const out = {};
  for (const anim of doc.getRoot().listAnimations()) {
    let d = 0;
    for (const s of anim.listSamplers()) d = Math.max(d, s.getInput().getMax([])[0]);
    out[anim.getName()] = Math.round(d * 1000) / 1000;
  }
  return out;
}

// --- mesh surgery ------------------------------------------------------------

function readTriangles(prim) {
  const P = prim.getAttribute('POSITION');
  const N = prim.getAttribute('NORMAL');
  const J = prim.getAttribute('JOINTS_0');
  const W = prim.getAttribute('WEIGHTS_0');
  const verts = [];
  for (let i = 0; i < P.getCount(); i++) {
    const j = J.getElement(i, []);
    const w = W.getElement(i, []);
    const sk = new Map();
    for (let k = 0; k < 4; k++) if (w[k] > 0) sk.set(j[k], (sk.get(j[k]) || 0) + w[k]);
    verts.push({ p: P.getElement(i, []), n: N.getElement(i, []), sk });
  }
  const idx = prim.getIndices();
  const count = idx ? idx.getCount() : P.getCount();
  const tris = [];
  for (let i = 0; i < count; i += 3) tris.push([0, 1, 2].map((k) => verts[idx ? idx.getScalar(i + k) : i + k]));
  return tris;
}

function lerpVertex(a, b, k) {
  const p = [0, 1, 2].map((i) => a.p[i] + (b.p[i] - a.p[i]) * k);
  let n = [0, 1, 2].map((i) => a.n[i] + (b.n[i] - a.n[i]) * k);
  const len = Math.hypot(...n) || 1;
  n = n.map((v) => v / len);
  const sk = new Map();
  for (const [j, w] of a.sk) sk.set(j, w * (1 - k));
  for (const [j, w] of b.sk) sk.set(j, (sk.get(j) || 0) + w * k);
  return { p, n, sk };
}

/** Keep the part of each triangle where dist(p) >= 0. */
function clipTriangles(tris, dist) {
  const out = [];
  for (const t of tris) {
    const d = t.map((v) => dist(v.p));
    if (d[0] >= 0 && d[1] >= 0 && d[2] >= 0) {
      out.push(t);
      continue;
    }
    if (d[0] < 0 && d[1] < 0 && d[2] < 0) continue;
    const poly = [];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      if (d[i] >= 0) poly.push(t[i]);
      if (d[i] >= 0 !== d[j] >= 0) poly.push(lerpVertex(t[i], t[j], d[i] / (d[i] - d[j])));
    }
    for (let i = 1; i + 1 < poly.length; i++) out.push([poly[0], poly[i], poly[i + 1]]);
  }
  return out;
}

/** Atlas layout: 2 m of body width per half, 1.9 m of height. Front half on the left. */
export const ATLAS = { halfWidthM: 1, heightM: 1.9 };
export function atlasUV(p, back) {
  const x = Math.max(-ATLAS.halfWidthM, Math.min(ATLAS.halfWidthM, p[0])) / ATLAS.halfWidthM;
  return [back ? 0.75 - x * 0.25 : 0.25 + x * 0.25, 1 - Math.max(0, Math.min(ATLAS.heightM, p[1])) / ATLAS.heightM];
}

function writePrimitive(doc, tris, material, offset = 0) {
  const buffer = doc.getRoot().listBuffers()[0];
  const pos = [];
  const nrm = [];
  const uv = [];
  const jnt = [];
  const wgt = [];
  const index = [];
  const seen = new Map();
  for (const t of tris) {
    const ax = t[1].p[0] - t[0].p[0];
    const ay = t[1].p[1] - t[0].p[1];
    const bx = t[2].p[0] - t[0].p[0];
    const by = t[2].p[1] - t[0].p[1];
    const back = ax * by - ay * bx < 0; // z of the face normal
    for (const v of t) {
      const key = `${v.p[0].toFixed(5)},${v.p[1].toFixed(5)},${v.p[2].toFixed(5)}|${v.n[0].toFixed(2)},${v.n[1].toFixed(2)},${v.n[2].toFixed(2)}|${back ? 1 : 0}`;
      let i = seen.get(key);
      if (i === undefined) {
        i = pos.length / 3;
        seen.set(key, i);
        pos.push(v.p[0] + v.n[0] * offset, v.p[1] + v.n[1] * offset, v.p[2] + v.n[2] * offset);
        nrm.push(...v.n);
        uv.push(...atlasUV(v.p, back));
        const top = [...v.sk].sort((a, b) => b[1] - a[1]).slice(0, 4);
        const sum = top.reduce((s, e) => s + e[1], 0) || 1;
        for (let k = 0; k < 4; k++) {
          jnt.push(top[k] ? top[k][0] : 0);
          wgt.push(top[k] ? top[k][1] / sum : 0);
        }
      }
      index.push(i);
    }
  }
  const acc = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  return doc
    .createPrimitive()
    .setMaterial(material)
    .setIndices(acc('SCALAR', pos.length / 3 > 65535 ? new Uint32Array(index) : new Uint16Array(index)))
    .setAttribute('POSITION', acc('VEC3', new Float32Array(pos)))
    .setAttribute('NORMAL', acc('VEC3', new Float32Array(nrm)))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(uv)))
    .setAttribute('JOINTS_0', acc('VEC4', new Uint8Array(jnt)))
    .setAttribute('WEIGHTS_0', acc('VEC4', new Float32Array(wgt)));
}

/**
 * Rebuild the body with atlas UVs and add one skinned mesh per shell spec.
 * @param shells [{name, joints: string[], threshold?, offset, clip?: (J) => Array<(p) => number>}]
 * @returns names of the generated shells with their triangle counts
 */
export function buildBody(doc, shells) {
  const root = doc.getRoot();
  const meshNode = root.listNodes().find((n) => n.getMesh() && n.getSkin());
  const skin = meshNode.getSkin();
  const jointNames = skin.listJoints().map((j) => j.getName());
  const J = {};
  for (const j of skin.listJoints()) J[j.getName()] = j.getWorldTranslation();

  const mesh = meshNode.getMesh();
  const parts = mesh.listPrimitives().map((prim) => ({ material: prim.getMaterial(), tris: readTriangles(prim) }));
  for (const prim of mesh.listPrimitives()) {
    mesh.removePrimitive(prim);
    prim.dispose();
  }
  const names = ['body', 'joints'];
  parts.forEach((part, i) => {
    part.material.setName(names[i] || `body_${i}`).setDoubleSided(false);
    mesh.addPrimitive(writePrimitive(doc, part.tris, part.material));
  });
  meshNode.setName('body');
  mesh.setName('body');

  const all = parts.flatMap((p) => p.tris);
  const report = {};
  for (const spec of shells) {
    const set = new Set(spec.joints.map((n) => jointNames.indexOf(n)).filter((i) => i >= 0));
    const share = (v) => {
      let s = 0;
      for (const [j, w] of v.sk) if (set.has(j)) s += w;
      return s;
    };
    const threshold = spec.threshold ?? 0.5;
    let tris = all.filter((t) => t.every((v) => share(v) >= threshold));
    for (const plane of spec.clip ? spec.clip(J) : []) tris = clipTriangles(tris, plane);
    if (!tris.length) throw new Error(`shell ${spec.name} selected no geometry`);
    const material = doc.createMaterial(`shell_${spec.name}`).setBaseColorFactor([0.5, 0.5, 0.5, 1]).setRoughnessFactor(0.7).setMetallicFactor(0).setDoubleSided(true);
    const shellMesh = doc.createMesh(`shell_${spec.name}`).addPrimitive(writePrimitive(doc, tris, material, spec.offset));
    const node = doc.createNode(`shell_${spec.name}`).setMesh(shellMesh).setSkin(skin);
    meshNode.getParentNode().addChild(node);
    report[spec.name] = tris.length;
  }
  return { shells: report, joints: Object.fromEntries(Object.entries(J).map(([k, v]) => [k, v.map((x) => Math.round(x * 1000) / 1000)])) };
}
