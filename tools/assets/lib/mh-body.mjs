// Build a rig-fitted, UV-mapped, skinned MakeHuman body as plain arrays.
import { macroTargets } from './makehuman.mjs';
import { fitRig, poseVertices, boneMap, vec } from './mh-fit.mjs';

const DM = 0.1; // decimetres -> metres

/** Per base-mesh vertex: [[rigBone, weight] x <=4], normalised. */
export function rigWeights(mh, count) {
  const per = Array.from({ length: count }, () => new Map());
  for (const [bone, list] of Object.entries(mh.weights())) {
    const rb = boneMap(bone);
    for (const [v, w] of list) if (v < count) per[v].set(rb, (per[v].get(rb) || 0) + w);
  }
  return per.map((m) => {
    const top = [...m].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const s = top.reduce((a, e) => a + e[1], 0);
    return s > 0 ? top.map(([b, w]) => [b, w / s]) : [['Head', 1]];
  });
}

/**
 * @param mh   MakeHuman instance
 * @param rig  rig rest pose {name: {parent, world}} in metres
 * @param spec {macro: {...}, targets: [[rel, w]], groups: RegExp of obj groups to keep}
 */
export function buildBody(mh, rig, spec) {
  const list = [...macroTargets(spec.macro || {}), ...(spec.targets || [])];
  const raw = mh.apply(list);
  const n = raw.length / 3;
  const J0 = mh.joints(raw);
  // Uniform scale so MakeHuman's ankle-to-head span equals the rig's; the
  // remaining per-bone differences are taken up by axial stretch.
  let lo = Infinity, hi = -Infinity;
  for (const f of mh.base.faces) if (f.group === 'body') for (const i of f.v) { lo = Math.min(lo, raw[i * 3 + 1]); hi = Math.max(hi, raw[i * 3 + 1]); }
  // Sole-to-crown scale onto the rig's mannequin (spec.crown, metres).
  const s0 = spec.keepRig === false ? DM : (spec.crown || 1.8) / (hi - lo);
  const oy = spec.keepRig === false ? 0 : -lo * s0;
  const P = Array.from({ length: n }, (_, i) => [raw[i * 3] * s0, raw[i * 3 + 1] * s0 + oy, raw[i * 3 + 2] * s0]);
  const J = Object.fromEntries(Object.entries(J0).map(([k, v]) => [k, [v[0] * s0, v[1] * s0 + oy, v[2] * s0]]));
  const fit = fitRig(rig, J, { keepRig: spec.keepRig !== false });
  fit.scale = s0;
  fit.offsetY = oy;
  const W = rigWeights(mh, n);
  const posed = poseVertices(P, W, fit.transforms);
  // Stand the soles on y = 0 (body vertices only; helpers are excluded).
  let minY = Infinity;
  for (const f of mh.base.faces) if (f.group === 'body') for (const i of f.v) minY = Math.min(minY, posed[i][1]);
  const lift = spec.keepRig === false ? -minY : 0;
  fit.soleY = minY;
  for (const p of posed) p[1] += lift;
  for (const k of Object.keys(fit.world)) fit.world[k] = [fit.world[k][0], fit.world[k][1] + lift, fit.world[k][2]];
  fit.lift = lift;
  return { raw, rest: P, posed, weights: W, fit, joints: J, list };
}

/**
 * Triangles for the obj faces whose group matches `groups`, de-duplicated on
 * (vertex, uv). Normals are smooth across UV seams.
 */
export function meshArrays(mh, posed, weights, groups, { uvRemap } = {}) {
  const faces = mh.base.faces.filter((f) => groups.test(f.group));
  const vt = mh.base.vt;
  // smooth normals on base vertex indices
  const N = new Map();
  const acc = (i, v) => {
    const o = N.get(i) || [0, 0, 0];
    N.set(i, vec.add(o, v));
  };
  for (const f of faces) {
    for (let k = 1; k + 1 < f.v.length; k++) {
      const a = posed[f.v[0]], b = posed[f.v[k]], c = posed[f.v[k + 1]];
      const fn = vec.cross(vec.sub(b, a), vec.sub(c, a));
      for (const i of [f.v[0], f.v[k], f.v[k + 1]]) acc(i, fn);
    }
  }
  const key = new Map();
  const out = { position: [], normal: [], uv: [], weights: [], source: [], index: [] };
  const vert = (vi, ti) => {
    const k = vi * 65536 + (ti + 1);
    let o = key.get(k);
    if (o !== undefined) return o;
    o = out.source.length;
    key.set(k, o);
    out.source.push(vi);
    out.position.push(...posed[vi]);
    out.normal.push(...vec.norm(N.get(vi)));
    let u = ti >= 0 ? [vt[ti * 2], vt[ti * 2 + 1]] : [0, 0];
    if (uvRemap) u = uvRemap(u, vi);
    out.uv.push(u[0], 1 - u[1]);
    out.weights.push(weights[vi]);
    return o;
  };
  for (const f of faces) {
    const ids = f.v.map((vi, k) => vert(vi, f.t[k]));
    for (let k = 1; k + 1 < ids.length; k++) out.index.push(ids[0], ids[k], ids[k + 1]);
  }
  return out;
}

/** Fitted eyeball proxy, posed with the head. Returns arrays like meshArrays plus centres. */
export function eyeArrays(mh, body) {
  const proxy = mh.proxy('eyes/high-poly/high-poly.mhclo');
  const pv = proxy.fit(body.raw);
  const n = pv.length / 3;
  const head = body.fit.transforms.Head;
  const s0 = body.fit.scale;
  const oy = body.fit.offsetY;
  const pts = Array.from({ length: n }, (_, i) => [pv[i * 3] * s0, pv[i * 3 + 1] * s0 + oy, pv[i * 3 + 2] * s0]);
  const posed = pts.map((p) => vec.add(head.H, vec.apply(head.R, vec.sub(p, head.h)))).map((p) => [p[0], p[1] + body.fit.lift, p[2]]);
  const obj = proxy.obj;
  const fake = { base: { faces: obj.faces, vt: obj.vt } };
  const W = posed.map(() => [['Head', 1]]);
  // The proxy has two shells: the eyeball (sclera + iris, textured) and a
  // transparent cornea mapped to the corner disc of the texture.
  const isCornea = (f) => f.t.every((t) => obj.vt[t * 2] > 0.85 && obj.vt[t * 2 + 1] < 0.15);
  for (const f of obj.faces) f.group = isCornea(f) ? 'cornea' : 'ball';
  const arr = meshArrays(fake, posed, W, /^ball$/);
  arr.cornea = meshArrays(fake, posed, W, /^cornea$/);
  // Centres: mean of each side's vertices.
  const c = { l: [0, 0, 0], r: [0, 0, 0] };
  const k = { l: 0, r: 0 };
  for (const p of posed) {
    const s = p[0] > 0 ? 'l' : 'r';
    c[s] = vec.add(c[s], p);
    k[s]++;
  }
  arr.centers = { l: vec.mul(c.l, 1 / k.l), r: vec.mul(c.r, 1 / k.r) };
  return arr;
}
