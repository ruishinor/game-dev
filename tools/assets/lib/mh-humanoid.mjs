// Replace the mannequin body of a humanoid document with a fitted MakeHuman
// body: suit body (atlas UVs, for look textures), skin head with facial
// morph targets, skin hands, eyes with gaze joints, lashes and teeth.
// Clothing shells are cut from the new surface with the existing SHELLS rules.
import { macroTargets } from './makehuman.mjs';
import { buildBody, rigWeights } from './mh-body.mjs';
import { readRig, moveJoints } from './mh-rig.mjs';
import { vec } from './mh-fit.mjs';
import { clipTriangles, writePrimitive, atlasUV, readTriangles } from './humanoid.mjs';
import { smooth } from './noise.mjs';
import { scalpWeight } from './mh-skin.mjs';

const ANC = ['african', 'asian', 'caucasian'];
/** Expression units (blended over the three ancestry variants). [name, unit, weight] */
export const EXPRESSIONS = [
  ['blink_l', ['eye-left-closure']],
  ['blink_r', ['eye-right-closure']],
  ['wide_l', ['eye-left-opened-up']],
  ['wide_r', ['eye-right-opened-up']],
  ['squint_l', ['eye-left-slit']],
  ['squint_r', ['eye-right-slit']],
  ['brow_up_l', ['eyebrows-left-up']],
  ['brow_up_r', ['eyebrows-right-up']],
  ['brow_down_l', ['eyebrows-left-down']],
  ['brow_down_r', ['eyebrows-right-down']],
  ['brow_inner_l', ['eyebrows-left-inner-up']],
  ['brow_inner_r', ['eyebrows-right-inner-up']],
  ['smile', ['mouth-corner-puller']],
  ['frown', ['mouth-depression']],
  ['jaw_open', ['mouth-open']],
  ['lips_press', ['mouth-compression']],
  ['lips_pucker', ['mouth-pursing']],
  ['grimace', ['mouth-retraction']],
  ['sneer', ['nose-left-elevation', 'nose-right-elevation']],
];
/** Identity shape morphs. Weight range in the client is -1..1 unless noted. */
export const IDENTITY = [
  ['jaw_width', [['chin/chin-width-incr.target', 0.7], ['chin/chin-bones-incr.target', 0.6]]],
  ['chin', [['chin/chin-prominent-incr.target', 0.8], ['chin/chin-height-incr.target', 0.4]]],
  ['cheekbones', [['cheek/l-cheek-bones-incr.target', 0.8], ['cheek/r-cheek-bones-incr.target', 0.8]]],
  ['cheek_volume', [['cheek/l-cheek-volume-incr.target', 0.7], ['cheek/r-cheek-volume-incr.target', 0.7]]],
  ['nose_width', [['nose/nose-scale-horiz-incr.target', 0.7], ['nose/nose-flaring-incr.target', 0.5]]],
  ['nose_length', [['nose/nose-scale-vert-incr.target', 0.6], ['nose/nose-point-down.target', 0.2]]],
  ['nose_hump', [['nose/nose-hump-incr.target', 0.8]]],
  ['nose_bridge', [['nose/nose-width1-decr.target', 0.6], ['nose/nose-scale-depth-incr.target', 0.4]]],
  ['lips_full', [['mouth/mouth-upperlip-volume-incr.target', 0.7], ['mouth/mouth-lowerlip-volume-incr.target', 0.7]]],
  ['mouth_width', [['mouth/mouth-scale-horiz-incr.target', 0.7]]],
  ['brow_ridge', [['eyebrows/eyebrows-trans-forward.target', 0.6], ['forehead/forehead-trans-forward.target', 0.25]]],
  ['eye_size', [['eyes/l-eye-scale-incr.target', 0.5], ['eyes/r-eye-scale-incr.target', 0.5]]],
  ['eye_tilt', [['eyes/l-eye-eyefold-angle-up.target', 0.7], ['eyes/r-eye-eyefold-angle-up.target', 0.7]]],
  ['eye_fold', [['eyes/l-eye-eyefold-down.target', 0.6], ['eyes/r-eye-eyefold-down.target', 0.6]]],
  ['head_width', [['head/head-scale-horiz-incr.target', 0.35]]],
  ['face_fat', [['head/head-fat-incr.target', 0.6]]],
  ['face_angular', [['head/head-square.target', 0.6]]],
  ['ear_size', [['ears/l-ear-scale-incr.target', 0.6], ['ears/r-ear-scale-incr.target', 0.6]]],
];

function vertexNormals(P, faces, n) {
  const N = Array.from({ length: n }, () => [0, 0, 0]);
  for (const f of faces)
    for (let k = 1; k + 1 < f.v.length; k++) {
      const a = P[f.v[0]], b = P[f.v[k]], c = P[f.v[k + 1]];
      const fn = vec.cross(vec.sub(b, a), vec.sub(c, a));
      for (const i of [f.v[0], f.v[k], f.v[k + 1]]) {
        const o = N[i];
        o[0] += fn[0]; o[1] += fn[1]; o[2] += fn[2];
      }
    }
  return N.map((x) => vec.norm(x));
}

/** Pose one rest point with given weights. */
function poseOne(p, ws, T) {
  let o = [0, 0, 0], tw = 0;
  for (const [b, w] of ws) {
    const t = T[b];
    if (!t) continue;
    let d = vec.sub(p, t.h);
    if (t.axis && t.k !== 1) d = vec.add(d, vec.mul(t.axis, (t.k - 1) * vec.dot(d, t.axis)));
    o = vec.add(o, vec.mul(vec.add(t.H, vec.apply(t.R, d)), w));
    tw += w;
  }
  return tw ? vec.mul(o, 1 / tw) : p;
}

export function replaceWithMakeHuman(doc, mh, spec, shells) {
  const root = doc.getRoot();
  const meshNode = root.listNodes().find((n) => n.getMesh() && n.getSkin());
  const skin = meshNode.getSkin();
  const buffer = root.listBuffers()[0];
  const rig = readRig(skin);

  // --- body fit -------------------------------------------------------------
  const body = buildBody(mh, rig, spec);
  const { posed, weights: W, fit } = body;
  const s0 = fit.scale;
  const oy = fit.offsetY;
  const nv = posed.length;
  const faces = mh.base.faces.filter((f) => f.group === 'body');
  const normals = vertexNormals(posed, faces, nv);

  // Eye joints (gaze), children of Head, appended to the skin.
  const head = root.listNodes().find((n) => n.getName() === 'Head');
  const eyeCentre = {};
  {
    const proxy = mh.proxy('eyes/high-poly/high-poly.mhclo');
    const pv = proxy.fit(body.raw);
    const sum = { l: [0, 0, 0, 0], r: [0, 0, 0, 0] };
    for (let i = 0; i < pv.length / 3; i++) {
      const p = poseOne([pv[i * 3] * s0, pv[i * 3 + 1] * s0 + oy, pv[i * 3 + 2] * s0], [['Head', 1]], fit.transforms);
      const s = p[0] > 0 ? 'l' : 'r';
      sum[s][0] += p[0]; sum[s][1] += p[1]; sum[s][2] += p[2]; sum[s][3]++;
    }
    for (const s of ['l', 'r']) eyeCentre[s] = sum[s].slice(0, 3).map((x) => x / sum[s][3]);
    body.eyeProxy = { proxy, pv };
  }
  // Ball centre: the proxy's mean is biased forward by the cornea; push back by ~3 mm.
  for (const s of ['l', 'r']) eyeCentre[s][2] -= 0.003;
  const world = { ...fit.world, eye_l: eyeCentre.l, eye_r: eyeCentre.r };
  for (const s of ['l', 'r']) {
    let node = root.listNodes().find((n) => n.getName() === `eye_${s}`);
    if (!node) {
      node = doc.createNode(`eye_${s}`);
      head.addChild(node);
      skin.addJoint(node);
    }
  }
  const joints = skin.listJoints();
  const ibm = skin.getInverseBindMatrices();
  ibm.setArray(new Float32Array(joints.length * 16));
  moveJoints(skin, world);
  const names = joints.map((j) => j.getName());
  const ji = (n) => {
    const i = names.indexOf(n);
    if (i < 0) throw new Error(`joint ${n} missing`);
    return i;
  };

  // --- regions ----------------------------------------------------------------
  const neckCut = rig.neck_01.world[1] + (spec.neckline ?? 0.02);
  const wristX = Math.abs(rig.hand_l.world[0]) - (spec.cuff ?? 0.02);
  const ankleY = rig.foot_l.world[1] + (spec.boot ?? 0.06);
  const centroid = (f) => vec.mul(f.v.reduce((a, i) => vec.add(a, posed[i]), [0, 0, 0]), 1 / f.v.length);
  const region = (f) => {
    const c = centroid(f);
    if (c[1] > neckCut && Math.abs(c[0]) < 0.14) return 'head';
    if (Math.abs(c[0]) > wristX && c[1] > 1.0) return 'hands';
    if (c[1] < ankleY) return 'feet';
    return 'body';
  };
  const byRegion = { head: [], hands: [], feet: [], body: [] };
  for (const f of faces) byRegion[region(f)].push(f);

  // --- shells and suit body (atlas UVs) ----------------------------------------
  const skMap = (i) => new Map(W[i].map(([b, w]) => [ji(b), w]));
  const triOf = (f) => {
    const out = [];
    for (let k = 1; k + 1 < f.v.length; k++) out.push([f.v[0], f.v[k], f.v[k + 1]].map((i) => ({ p: posed[i], n: normals[i], sk: skMap(i) })));
    return out;
  };
  // Interior surfaces (mouth cavity, eye sockets) never become clothing.
  const bv0 = mh.base.v;
  const baseN = vertexNormals(Array.from({ length: bv0.length / 3 }, (_, i) => [bv0[i * 3], bv0[i * 3 + 1], bv0[i * 3 + 2]]), faces, bv0.length / 3);
  const interior = (f) => {
    const c = [0, 0, 0], n = [0, 0, 0];
    for (const i of f.v) for (let q = 0; q < 3; q++) { c[q] += bv0[i * 3 + q] / f.v.length; n[q] += baseN[i][q]; }
    const inside = (cx, cy, cz, r) => Math.hypot(c[0] - cx, c[1] - cy, c[2] - cz) < r && n[0] * (c[0] - cx) + n[1] * (c[1] - cy) + n[2] * (c[2] - cz) < 0;
    return inside(0, 6.62, 1.15, 0.42) || inside(0.31, 7.28, 1.25, 0.24) || inside(-0.31, 7.28, 1.25, 0.24);
  };
  const allTris = faces.filter((f) => !interior(f)).flatMap(triOf);
  const J = {};
  for (const j of joints) J[j.getName()] = j.getWorldTranslation();
  const mesh = meshNode.getMesh();
  const oldMats = mesh.listPrimitives().map((p) => p.getMaterial());
  // The mannequin's smooth head is kept for helmets and for faceless looks
  // (the realistic head is hidden in both cases).
  const mannequinTris = mesh.listPrimitives().flatMap((p) => readTriangles(p));
  const mannequinShells = [
    { name: 'helmet', offset: 0.014 },
    { name: 'mannequin_head', offset: 0.0015 },
  ];
  for (const prim of mesh.listPrimitives()) {
    mesh.removePrimitive(prim);
    prim.dispose();
  }
  const mat = (name, i) => (oldMats[i] || doc.createMaterial(name)).setName(name).setDoubleSided(false);
  mesh.addPrimitive(writePrimitive(doc, byRegion.body.flatMap(triOf), mat('body', 0)));
  mesh.addPrimitive(writePrimitive(doc, byRegion.feet.flatMap(triOf), mat('joints', 1)));
  meshNode.setName('body');
  mesh.setName('body');
  const report = {};
  const headJ = names.indexOf('Head');
  for (const ms of mannequinShells) {
    const tris = mannequinTris.filter((t) => t.every((v) => (v.sk.get(headJ) || 0) >= 0.6));
    const material = doc.createMaterial(`shell_${ms.name}`).setBaseColorFactor([0.5, 0.5, 0.5, 1]).setRoughnessFactor(0.7).setMetallicFactor(0).setDoubleSided(ms.name === 'helmet');
    const node = doc.createNode(`shell_${ms.name}`).setMesh(doc.createMesh(`shell_${ms.name}`).addPrimitive(writePrimitive(doc, tris, material, ms.offset))).setSkin(skin);
    meshNode.getParentNode().addChild(node);
    report[ms.name] = tris.length;
  }
  for (const sp of shells) {
    if (mannequinShells.some((m) => m.name === sp.name)) continue;
    const set = new Set(sp.joints.map((n) => names.indexOf(n)).filter((i) => i >= 0));
    // Shells marked source: 'mannequin' are cut from the smooth mannequin
    // surface (hoods drape over ears instead of tracing them).
    const share = (v) => {
      let s = 0;
      for (const [j, w] of v.sk) if (set.has(j)) s += w;
      return s;
    };
    let tris = (sp.source === 'mannequin' ? mannequinTris : allTris).filter((t) => t.every((v) => share(v) >= (sp.threshold ?? 0.5)));
    for (const plane of sp.clip ? sp.clip(J) : []) tris = clipTriangles(tris, plane);
    if (!tris.length) throw new Error(`shell ${sp.name} selected no geometry`);
    const material = doc.createMaterial(`shell_${sp.name}`).setBaseColorFactor([0.5, 0.5, 0.5, 1]).setRoughnessFactor(0.7).setMetallicFactor(0).setDoubleSided(true);
    const shellMesh = doc.createMesh(`shell_${sp.name}`).addPrimitive(writePrimitive(doc, tris, material, sp.offset));
    const node = doc.createNode(`shell_${sp.name}`).setMesh(shellMesh).setSkin(skin);
    meshNode.getParentNode().addChild(node);
    report[sp.name] = tris.length;
  }

  // --- skin meshes (MakeHuman UVs + atlas UV1) ---------------------------------
  const vt = mh.base.vt;
  const acc = (type, a) => doc.createAccessor().setType(type).setArray(a).setBuffer(buffer);
  /** Build indexed arrays for faces, keyed on (vertex, uv). */
  function arrays(list, pos = posed, nrm = normals) {
    const key = new Map();
    const o = { src: [], P: [], N: [], UV: [], UV1: [], J: [], Wt: [], I: [] };
    for (const f of list) {
      const ids = f.v.map((vi, k) => {
        const ti = f.t[k];
        const kk = vi * 65536 + ti + 1;
        let id = key.get(kk);
        if (id === undefined) {
          id = o.src.length;
          key.set(kk, id);
          o.src.push(vi);
          o.P.push(...pos[vi]);
          o.N.push(...nrm[vi]);
          o.UV.push(ti >= 0 ? vt[ti * 2] : 0, ti >= 0 ? 1 - vt[ti * 2 + 1] : 0);
          o.UV1.push(...atlasUV(pos[vi], nrm[vi][2] < 0));
          const ws = (o.weightsOf || W)[vi];
          for (let q = 0; q < 4; q++) {
            o.J.push(ws[q] ? ji(ws[q][0]) : 0);
            o.Wt.push(ws[q] ? ws[q][1] : 0);
          }
        }
        return id;
      });
      for (let k = 1; k + 1 < ids.length; k++) o.I.push(ids[0], ids[k], ids[k + 1]);
    }
    return o;
  }
  const prim = (o, material) =>
    doc
      .createPrimitive()
      .setMaterial(material)
      .setIndices(acc('SCALAR', o.src.length > 65535 ? new Uint32Array(o.I) : new Uint16Array(o.I)))
      .setAttribute('POSITION', acc('VEC3', new Float32Array(o.P)))
      .setAttribute('NORMAL', acc('VEC3', new Float32Array(o.N)))
      .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(o.UV)))
      .setAttribute('TEXCOORD_1', acc('VEC2', new Float32Array(o.UV1)))
      .setAttribute('JOINTS_0', acc('VEC4', new Uint8Array(o.J)))
      .setAttribute('WEIGHTS_0', acc('VEC4', new Float32Array(o.Wt)));
  const skinMat = doc.createMaterial('skin').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.6).setMetallicFactor(0);
  const addNode = (name, m) => {
    const node = doc.createNode(name).setMesh(m).setSkin(skin);
    meshNode.getParentNode().addChild(node);
    return node;
  };
  addNode('hands', doc.createMesh('hands').addPrimitive(prim(arrays(byRegion.hands), skinMat)));

  // Helpers (lashes, teeth) follow the body by inverse-distance binding to
  // nearby base vertices, then are posed with the head.
  const bodyVerts = [...new Set(faces.flatMap((f) => f.v))];
  const bv = mh.base.v;
  function bindHelper(i, k = 4) {
    const p = [bv[i * 3], bv[i * 3 + 1], bv[i * 3 + 2]];
    const best = [];
    for (const j of bodyVerts) {
      if (Math.abs(bv[j * 3 + 1] - p[1]) > 0.6) continue;
      const d = Math.hypot(bv[j * 3] - p[0], bv[j * 3 + 1] - p[1], bv[j * 3 + 2] - p[2]);
      if (best.length < k || d < best[best.length - 1][1]) {
        best.push([j, d]);
        best.sort((a, b) => a[1] - b[1]);
        if (best.length > k) best.pop();
      }
    }
    const ws = best.map(([j, d]) => [j, 1 / (d + 1e-4)]);
    const s = ws.reduce((a, e) => a + e[1], 0);
    return ws.map(([j, w]) => [j, w / s]);
  }
  const raw = body.raw;
  const helperRest = (i, bind) => {
    const p = [bv[i * 3], bv[i * 3 + 1], bv[i * 3 + 2]];
    for (const [j, w] of bind) for (let q = 0; q < 3; q++) p[q] += w * (raw[j * 3 + q] - bv[j * 3 + q]);
    return [p[0] * s0, p[1] * s0 + oy, p[2] * s0];
  };

  // --- head: skin + teeth, with morph targets ----------------------------------
  const headFaces = byRegion.head;
  const teethFaces = mh.base.faces.filter((f) => /^helper-(upper|lower)-teeth$/.test(f.group));
  const teethIdx = [...new Set(teethFaces.flatMap((f) => f.v))];
  const helperPos = new Map();
  const helperBind = new Map();
  for (const i of teethIdx) {
    const b = bindHelper(i);
    helperBind.set(i, b);
    helperPos.set(i, poseOne(helperRest(i, b), [['Head', 1]], fit.transforms));
  }
  const posAll = (i) => (i < nv && !helperPos.has(i) ? posed[i] : helperPos.get(i));
  const teethPos = new Proxy([], { get: (_, k) => posAll(+k) });
  const teethN = vertexNormals({ length: 0, ...Object.fromEntries(teethIdx.map((i) => [i, helperPos.get(i)])) }, teethFaces, mh.base.v.length / 3);
  const headArr = arrays(headFaces);
  const teethArr = (() => {
    const o = arrays.call(null, teethFaces, teethPos, teethN);
    return o;
  })();
  // Teeth are rigid with the head.
  for (let q = 0; q < teethArr.J.length; q += 4) {
    teethArr.J[q] = ji('Head'); teethArr.Wt[q] = 1;
    for (let r = 1; r < 4; r++) { teethArr.J[q + r] = 0; teethArr.Wt[q + r] = 0; }
  }

  // Morph deltas: displace rest positions, re-pose, subtract.
  const headVerts = [...new Set(headFaces.flatMap((f) => f.v))];
  const restPt = (i) => [raw[i * 3] * s0, raw[i * 3 + 1] * s0 + oy, raw[i * 3 + 2] * s0];
  const fade = (i) => smooth(neckCut + 0.005, neckCut + 0.06, posed[i][1]);
  const morphs = [];
  const unitDelta = (unit) => {
    const d = new Map();
    for (const a of ANC) {
      const t = mh.target(`expression/units/${a}/${unit}.target`);
      for (let k = 0; k < t.idx.length; k++) {
        const o = d.get(t.idx[k]) || [0, 0, 0];
        for (let q = 0; q < 3; q++) o[q] += t.d[k * 3 + q] / ANC.length;
        d.set(t.idx[k], o);
      }
    }
    return d;
  };
  const listDelta = (list) => {
    const d = new Map();
    for (const [rel, w] of list) {
      const t = mh.target(rel);
      for (let k = 0; k < t.idx.length; k++) {
        const o = d.get(t.idx[k]) || [0, 0, 0];
        for (let q = 0; q < 3; q++) o[q] += t.d[k * 3 + q] * w;
        d.set(t.idx[k], o);
      }
    }
    return d;
  };
  // Ancestry and age as differences of the macro mix (head only).
  const macro = spec.macro || {};
  const macroDelta = (over) => {
    const a = mh.apply(macroTargets({ ...macro, ...over }), new Float64Array(mh.base.v.length));
    const b = mh.apply(macroTargets(macro), new Float64Array(mh.base.v.length));
    const d = new Map();
    for (const i of headVerts) d.set(i, [a[i * 3] - b[i * 3], a[i * 3 + 1] - b[i * 3 + 1], a[i * 3 + 2] - b[i * 3 + 2]]);
    return d;
  };
  const sets = [
    ...EXPRESSIONS.map(([name, units]) => ({ name, kind: 'expr', d: units.map(unitDelta).reduce((A, B) => { for (const [k, v] of B) A.set(k, vec.add(A.get(k) || [0, 0, 0], v)); return A; }, new Map()) })),
    { name: 'heritage_a', kind: 'id', d: macroDelta({ ancestry: { african: 1, asian: 0, caucasian: 0 } }) },
    { name: 'heritage_b', kind: 'id', d: macroDelta({ ancestry: { african: 0, asian: 1, caucasian: 0 } }) },
    { name: 'heritage_c', kind: 'id', d: macroDelta({ ancestry: { african: 0, asian: 0, caucasian: 1 } }) },
    { name: 'age', kind: 'id', d: (() => { const d = macroDelta({ age: 0.875 }); for (const [k, v] of listDelta([['head/head-age-incr.target', 0.6]])) d.set(k, vec.add(d.get(k) || [0, 0, 0], v)); return d; })() },
    ...IDENTITY.map(([name, list]) => ({ name, kind: 'id', d: listDelta(list.filter(([rel]) => mh.has(rel))) })),
  ];
  const headSet = new Set(headVerts);
  const boundDelta = (bind, disp) => {
    let d = [0, 0, 0];
    for (const [j, w] of bind || []) if (disp.has(j)) d = vec.add(d, vec.mul(vec.sub(disp.get(j), posed[j]), w));
    return d;
  };
  const eyeShift = {};
  const ranges = {};
  // Eyeball radius from the fitted proxy (mean distance of its vertices from the centre).
  const ballR = (() => {
    const { pv } = body.eyeProxy;
    let sum = 0, n = 0;
    for (let i = 0; i < pv.length / 3; i++) {
      const p = poseOne([pv[i * 3] * s0, pv[i * 3 + 1] * s0 + oy, pv[i * 3 + 2] * s0], [['Head', 1]], fit.transforms);
      const c = p[0] > 0 ? eyeCentre.l : eyeCentre.r;
      sum += vec.len(vec.sub(p, c));
      n++;
    }
    return (sum / n) * 0.97;
  })();
  const morphReport = [];
  for (const set of sets) {
    // Displaced rest -> posed positions for head vertices.
    const disp = new Map();
    for (const i of headVerts) {
      const dd = set.d.get(i);
      if (!dd) continue;
      const f = set.kind === 'id' ? fade(i) : 1;
      if (!f) continue;
      const p = vec.add(restPt(i), vec.mul(dd, s0 * f));
      disp.set(i, poseOne(p, W[i], fit.transforms));
    }
    const P2 = (i) => disp.get(i) || posed[i];
    // Normals over head faces only (boundary vertices are not displaced).
    const N2 = new Map();
    for (const f of headFaces)
      for (let k = 1; k + 1 < f.v.length; k++) {
        const a = P2(f.v[0]), b = P2(f.v[k]), c = P2(f.v[k + 1]);
        const fn = vec.cross(vec.sub(b, a), vec.sub(c, a));
        for (const i of [f.v[0], f.v[k], f.v[k + 1]]) N2.set(i, vec.add(N2.get(i) || [0, 0, 0], fn));
      }
    const N0 = new Map();
    for (const f of headFaces)
      for (let k = 1; k + 1 < f.v.length; k++) {
        const a = posed[f.v[0]], b = posed[f.v[k]], c = posed[f.v[k + 1]];
        const fn = vec.cross(vec.sub(b, a), vec.sub(c, a));
        for (const i of [f.v[0], f.v[k], f.v[k + 1]]) N0.set(i, vec.add(N0.get(i) || [0, 0, 0], fn));
      }
    const dP = new Float32Array(headArr.src.length * 3);
    const dN = new Float32Array(headArr.src.length * 3);
    let maxd = 0;
    headArr.src.forEach((i, k) => {
      if (!disp.has(i)) return;
      const d = vec.sub(disp.get(i), posed[i]);
      dP.set(d, k * 3);
      maxd = Math.max(maxd, vec.len(d));
      const n2 = vec.norm(N2.get(i)), n0 = vec.norm(N0.get(i));
      dN.set(vec.sub(n2, n0), k * 3);
    });
    // Teeth: expression units move the lower teeth (jaw open).
    const tP = new Float32Array(teethArr.src.length * 3);
    if (set.kind === 'expr')
      teethArr.src.forEach((i, k) => {
        const dd = set.d.get(i);
        if (dd) tP.set(vec.apply(fit.transforms.Head.R, vec.mul(dd, s0)), k * 3);
      });
    else
      // Shape morphs move the teeth with the mouth around them.
      teethArr.src.forEach((i, k) => tP.set(boundDelta(helperBind.get(i), disp), k * 3));
    // How far this morph moves each eye socket (the eyeballs follow at runtime).
    if (set.kind === 'id') {
      for (const s of ['l', 'r']) {
        let acc = [0, 0, 0], n = 0;
        for (const [i, p] of disp) {
          if (vec.len(vec.sub(posed[i], eyeCentre[s])) < 0.022) { acc = vec.add(acc, vec.sub(p, posed[i])); n++; }
        }
        (eyeShift[set.name] ||= {})[s] = n ? vec.mul(acc, 1 / n).map((x) => Math.round(x * 1e5) / 1e5) : [0, 0, 0];
      }
      // Safe weight range: no lid or cheek vertex may sink into the eyeball.
      const ok = (w) => {
        for (const s of ['l', 'r']) {
          const c = vec.add(eyeCentre[s], vec.mul(eyeShift[set.name][s], w));
          for (const i of headVerts) {
            const p0 = posed[i];
            if (vec.len(vec.sub(p0, eyeCentre[s])) > 0.026) continue;
            const d0 = vec.len(vec.sub(p0, eyeCentre[s]));
            if (d0 < ballR - 0.0005 || !disp.has(i)) continue; // socket interior, or unmoved
            const p = vec.add(p0, vec.mul(vec.sub(disp.get(i), p0), w));
            // Inward past the ball surface by more than the rest contact allows.
            if (vec.len(vec.sub(p, c)) < Math.min(d0, ballR + 0.0008) - 0.0007) return false;
          }
        }
        return true;
      };
      let hi = 0, lo = 0;
      for (let w = 0.1; w <= 1.001 && ok(w); w += 0.1) hi = Math.round(w * 10) / 10;
      for (let w = -0.1; w >= -1.001 && ok(w); w -= 0.1) lo = Math.round(w * 10) / 10;
      ranges[set.name] = [lo, hi];
    }
    morphs.push({ name: set.name, kind: set.kind, dP, dN, tP, disp });
    morphReport.push([set.name, Math.round(maxd * 1000) / 1000]);
    void headSet;
  }
  const headMesh = doc.createMesh('head');
  const pHead = prim(headArr, skinMat);
  const teethMat = doc.createMaterial('teeth').setBaseColorFactor([0.86, 0.83, 0.76, 1]).setRoughnessFactor(0.35).setMetallicFactor(0);
  const pTeeth = prim(teethArr, teethMat);
  for (const m of morphs) {
    pHead.addTarget(doc.createPrimitiveTarget(m.name).setAttribute('POSITION', acc('VEC3', m.dP)).setAttribute('NORMAL', acc('VEC3', m.dN)));
    pTeeth.addTarget(doc.createPrimitiveTarget(m.name).setAttribute('POSITION', acc('VEC3', m.tP)));
  }
  // Separate meshes: quantisation is per mesh, and a skinned multi-primitive
  // mesh with morph targets does not survive it intact.
  headMesh.addPrimitive(pHead);
  const extras = { targetNames: morphs.map((m) => m.name), identity: morphs.filter((m) => m.kind === 'id').map((m) => m.name), eyeShift, ranges };
  headMesh.setWeights(morphs.map(() => 0)).setExtras(extras);
  addNode('head', headMesh);
  const teethMesh = doc.createMesh('teeth').addPrimitive(pTeeth).setWeights(morphs.map(() => 0)).setExtras({ targetNames: extras.targetNames });
  addNode('teeth', teethMesh);

  // --- hair: layered shells over the scalp, one node per style ----------------
  {
    const hw = (i) => W[i].reduce((a, [b, w]) => a + (b === 'Head' ? w : 0), 0);
    const scalp = new Map();
    for (const i of headVerts) {
      const w = scalpWeight(bv[i * 3], bv[i * 3 + 1], bv[i * 3 + 2], hw(i));
      if (w > 0) scalp.set(i, w);
    }
    const hairFaces = headFaces.filter((f) => f.v.some((i) => scalp.has(i)));
    const srcIndex = new Map();
    headArr.src.forEach((vi, k) => srcIndex.has(vi) || srcIndex.set(vi, k));
    let top = -Infinity;
    for (const i of scalp.keys()) top = Math.max(top, posed[i][1]);
    const centre = vec.mul([...scalp.keys()].reduce((a, i) => vec.add(a, posed[i]), [0, 0, 0]), 1 / scalp.size);
    const whorl = [0, top - 0.02, centre[2] - 0.045];
    for (const style of spec.hair || []) {
      const o = { P: [], N: [], UV: [], F: [], J: [], Wt: [], I: [], src: [] };
      const verts = [...new Set(hairFaces.flatMap((f) => f.v))];
      const layerOf = new Map();
      for (let L = 0; L < style.layers; L++) {
        const h = style.layers === 1 ? 1 : (L + 1) / style.layers;
        const base = o.src.length;
        verts.forEach((i, k) => {
          const n = normals[i];
          const p = posed[i];
          const sw = scalp.get(i) || 0;
          const a = Math.max(0, n[1]), b = Math.abs(n[0]), c = Math.max(0, -n[2]), f = Math.max(0, n[2]);
          // Crest profile: a ridge along the skull midline from the hairline to the nape.
          const T = style.profile === 'crest'
            ? sw * style.top * Math.exp(-((p[0] / style.width) ** 2)) * (1 - smooth(0.06, 0.11, p[2] - fit.world.Head[2]))
            : sw * (a * style.top + b * style.side + c * style.back + f * style.top) / (a + b + c + f || 1);
          const g = style.flow === 'back' ? [Math.sign(p[0]) * 0.25 * b, 0.1, -1] : vec.add(vec.norm(vec.sub(p, whorl)), [0, -0.5, 0]);
          const fl = vec.norm(vec.sub(g, vec.mul(n, vec.dot(g, n))));
          const q = vec.add(vec.add(p, vec.mul(n, h * T + 0.0004 * h)), vec.mul(fl, h * T * style.lean));
          q[1] -= h * h * T * 0.25 * style.lean;
          o.src.push(i);
          o.P.push(...q);
          o.N.push(...n);
          o.UV.push(h, sw);
          o.F.push(...fl);
          for (let r = 0; r < 4; r++) {
            o.J.push(W[i][r] ? ji(W[i][r][0]) : 0);
            o.Wt.push(W[i][r] ? W[i][r][1] : 0);
          }
          layerOf.set(L * 1e6 + i, base + k);
        });
        for (const fc of hairFaces) {
          const ids = fc.v.map((i) => layerOf.get(L * 1e6 + i));
          for (let k = 1; k + 1 < ids.length; k++) o.I.push(ids[0], ids[k], ids[k + 1]);
        }
      }
      const mat = doc.createMaterial(`hair_${style.name}`).setBaseColorFactor([0.1, 0.08, 0.07, 1]).setAlphaMode('MASK').setRoughnessFactor(0.55).setMetallicFactor(0).setDoubleSided(true);
      const pr = doc
        .createPrimitive()
        .setMaterial(mat)
        .setIndices(acc('SCALAR', o.src.length > 65535 ? new Uint32Array(o.I) : new Uint16Array(o.I)))
        .setAttribute('POSITION', acc('VEC3', new Float32Array(o.P)))
        .setAttribute('NORMAL', acc('VEC3', new Float32Array(o.N)))
        .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(o.UV)))
        .setAttribute('_FLOW', acc('VEC3', new Float32Array(o.F)))
        .setAttribute('JOINTS_0', acc('VEC4', new Uint8Array(o.J)))
        .setAttribute('WEIGHTS_0', acc('VEC4', new Float32Array(o.Wt)));
      // Follow the head's shape morphs from the scalp vertex each layer grew from.
      for (const m of morphs) {
        const d = new Float32Array(o.src.length * 3);
        o.src.forEach((vi, k) => {
          const j = srcIndex.get(vi);
          if (j !== undefined) d.set(m.dP.subarray(j * 3, j * 3 + 3), k * 3);
        });
        pr.addTarget(doc.createPrimitiveTarget(m.name).setAttribute('POSITION', acc('VEC3', d)));
      }
      const hm = doc.createMesh(`hair_${style.name}`).addPrimitive(pr).setWeights(morphs.map(() => 0)).setExtras({ targetNames: morphs.map((m) => m.name), layers: style.layers });
      addNode(`hair_${style.name}`, hm);
    }
  }

  // --- eyes (rigid on eye joints) -----------------------------------------------
  const { proxy, pv } = body.eyeProxy;
  const obj = proxy.obj;
  const isCornea = (f) => f.t.every((t) => obj.vt[t * 2] > 0.85 && obj.vt[t * 2 + 1] < 0.15);
  const eyeP = Array.from({ length: pv.length / 3 }, (_, i) => poseOne([pv[i * 3] * s0, pv[i * 3 + 1] * s0 + oy, pv[i * 3 + 2] * s0], [['Head', 1]], fit.transforms));
  const eyeN = vertexNormals(eyeP, obj.faces, eyeP.length);
  const eyeArrays = (list) => {
    const key = new Map();
    const o = { src: [], P: [], N: [], UV: [], UV1: [], J: [], Wt: [], I: [] };
    for (const f of list) {
      const ids = f.v.map((vi, k) => {
        const ti = f.t[k];
        const kk = vi * 65536 + ti + 1;
        let id = key.get(kk);
        if (id === undefined) {
          id = o.src.length;
          key.set(kk, id);
          o.src.push(vi);
          o.P.push(...eyeP[vi]);
          o.N.push(...eyeN[vi]);
          o.UV.push(obj.vt[ti * 2], 1 - obj.vt[ti * 2 + 1]);
          o.UV1.push(0, 0);
          o.J.push(ji(eyeP[vi][0] > 0 ? 'eye_l' : 'eye_r'), 0, 0, 0);
          o.Wt.push(1, 0, 0, 0);
        }
        return id;
      });
      for (let k = 1; k + 1 < ids.length; k++) o.I.push(ids[0], ids[k], ids[k + 1]);
    }
    return o;
  };
  const eyeMat = doc.createMaterial('eye').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.3).setMetallicFactor(0);
  const corneaMat = doc.createMaterial('cornea').setBaseColorFactor([1, 1, 1, 0.08]).setAlphaMode('BLEND').setRoughnessFactor(0.03).setMetallicFactor(0);
  addNode('eyes', doc.createMesh('eyes').addPrimitive(prim(eyeArrays(obj.faces.filter((f) => !isCornea(f))), eyeMat)).addPrimitive(prim(eyeArrays(obj.faces.filter(isCornea)), corneaMat)));

  // --- lashes: cards along the lid margins, following blink morphs -------------
  const lashNode = buildLashes({ mh, doc, acc, prim, ji, helperRest, bindHelper, poseOne, fit, morphs, sets, eyeCentre, s0, boundDelta });
  if (lashNode) addNode('lashes', lashNode);

  return {
    shells: report,
    joints: Object.fromEntries(Object.entries(J).map(([k, v]) => [k, v.map((x) => Math.round(x * 1000) / 1000)])),
    morphs: morphReport,
    ranges,
    ballR,
    regions: Object.fromEntries(Object.entries(byRegion).map(([k, v]) => [k, v.length])),
    eyes: eyeCentre,
  };
}

/** Eyelash cards from MakeHuman's lash helper strips (placement only). */
function buildLashes({ mh, doc, acc, prim, ji, helperRest, bindHelper, poseOne, fit, morphs, sets, eyeCentre, s0, boundDelta }) {
  const groups = [
    ['helper-l-eyelashes-2', 'l', 1], // upper
    ['helper-r-eyelashes-2', 'r', 1],
    ['helper-l-eyelashes-1', 'l', -1], // lower
    ['helper-r-eyelashes-1', 'r', -1],
  ];
  const o = { src: [], P: [], N: [], UV: [], UV1: [], J: [], Wt: [], I: [] };
  const deltas = morphs.map(() => []);
  for (const [g, side, up] of groups) {
    const idx = [...new Set(mh.base.faces.filter((f) => f.group === g).flatMap((f) => f.v))];
    if (!idx.length) continue;
    const pts = idx.map((i) => {
      const b = bindHelper(i);
      return { i, p: poseOne(helperRest(i, b), [['Head', 1]], fit.transforms) };
    });
    const c = eyeCentre[side];
    // Order along the lid by angle around the eye centre (in the face plane).
    for (const q of pts) q.a = Math.atan2(q.p[1] - c[1], (q.p[0] - c[0]) * (side === 'l' ? 1 : -1));
    pts.sort((a, b) => a.a - b.a);
    const seg = 14;
    const cols = [];
    for (let s = 0; s <= seg; s++) {
      const lo = Math.floor((s / seg) * (pts.length - 1));
      const hi = Math.min(pts.length - 1, lo + 4);
      const grp = pts.slice(lo, hi + 1);
      const p = vec.mul(grp.reduce((a, q) => vec.add(a, q.p), [0, 0, 0]), 1 / grp.length);
      cols.push({ p, src: grp.map((q) => q.i) });
    }
    const lenMax = (up > 0 ? 0.0095 : 0.0045);
    const base = o.src.length;
    cols.forEach((col, s) => {
      const t = s / seg;
      const out = vec.norm(vec.sub(col.p, c));
      const dir = vec.norm(vec.add(vec.mul(out, 0.55), [0, 0.55 * up, 0.75]));
      const L = lenMax * (0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, t * 1.15)));
      const tip = vec.add(vec.add(col.p, vec.mul(dir, L)), [0, 0.0025 * up, 0]);
      const root = vec.add(col.p, vec.mul(out, -0.0004));
      for (const [p, v] of [[root, 0], [tip, 1]]) {
        o.src.push(col.src[0]);
        o.P.push(...p);
        o.N.push(...vec.norm(vec.add(out, [0, 0, 0.6])));
        o.UV.push(t * 3, v * 0.5 + (up > 0 ? 0 : 0.5));
        o.UV1.push(0, 0);
        o.J.push(ji('Head'), 0, 0, 0);
        o.Wt.push(1, 0, 0, 0);
        // morph: average helper delta of this column (rotated into rig space)
        const colBind = bindHelper(col.src[0]);
        sets.forEach((set, m) => {
          if (set.kind === 'id') {
            deltas[m].push(...boundDelta(colBind, morphs[m].disp));
            return;
          }
          let d = [0, 0, 0], n = 0;
          for (const i of col.src) {
            const dd = set.kind === 'expr' && set.d.get(i);
            if (dd) { d = vec.add(d, dd); n++; }
          }
          deltas[m].push(...(n ? vec.apply(fit.transforms.Head.R, vec.mul(d, s0 / n)) : [0, 0, 0]));
        });
      }
    });
    for (let s = 0; s < seg; s++) {
      const a = base + s * 2;
      o.I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  if (!o.src.length) return null;
  const mat = doc.createMaterial('lashes').setBaseColorFactor([0.05, 0.04, 0.035, 1]).setAlphaMode('MASK').setAlphaCutoff(0.4).setDoubleSided(true).setRoughnessFactor(0.6);
  const p = prim(o, mat);
  morphs.forEach((m, k) => p.addTarget(doc.createPrimitiveTarget(m.name).setAttribute('POSITION', acc('VEC3', new Float32Array(deltas[k])))));
  const mesh = doc.createMesh('lashes').addPrimitive(p);
  mesh.setWeights(morphs.map(() => 0));
  mesh.setExtras({ targetNames: morphs.map((m) => m.name) });
  return mesh;
}

export { rigWeights };
