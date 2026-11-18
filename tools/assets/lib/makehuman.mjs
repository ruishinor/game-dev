// Reader for MakeHuman's CC0 data files (hm08 base mesh, .target morphs,
// .mhskel joint definitions, .mhw skin weights and .mhclo proxy fitting).
//
// Written for this project from the published file formats; no MakeHuman
// program code (AGPL) is used. The data itself is CC0 (MakeHuman LICENSE.md,
// section C) and is read from .asset-cache/makehuman, which
// tools/assets/fetch.mjs fills from the pinned upstream commit.
//
// Units: MakeHuman data is in decimetres, y up, facing +z. Everything returned
// here stays in those units; the fitting step converts to metres.

import fs from 'node:fs';
import path from 'node:path';

export function parseObj(text) {
  const v = [];
  const vt = [];
  const faces = [];
  let group = '';
  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) {
      const p = line.split(/\s+/);
      v.push(+p[1], +p[2], +p[3]);
    } else if (line.startsWith('vt ')) {
      const p = line.split(/\s+/);
      vt.push(+p[1], +p[2]);
    } else if (line.startsWith('f ')) {
      const p = line.trim().split(/\s+/).slice(1);
      faces.push({ group, v: p.map((s) => +s.split('/')[0] - 1), t: p.map((s) => (s.split('/')[1] ? +s.split('/')[1] - 1 : -1)) });
    } else if (line.startsWith('g ')) group = line.slice(2).trim();
  }
  return { v: Float64Array.from(v), vt: Float64Array.from(vt), faces };
}

/** Sparse morph: {idx: Int32Array, d: Float64Array (3 per index)}. */
export function parseTarget(text) {
  const idx = [];
  const d = [];
  for (const line of text.split('\n')) {
    if (!line || line[0] === '#') continue;
    const p = line.trim().split(/\s+/);
    if (p.length < 4) continue;
    idx.push(+p[0]);
    d.push(+p[1], +p[2], +p[3]);
  }
  return { idx: Int32Array.from(idx), d: Float64Array.from(d) };
}

const AGES = [['baby', 0], ['child', 0.1875], ['young', 0.5], ['old', 1]];
const TRI = (x) => (x < 0.5 ? [['min', 1 - 2 * x], ['average', 2 * x]] : [['average', 2 - 2 * x], ['max', 2 * x - 1]]);
function ageWeights(a) {
  for (let i = 0; i < AGES.length - 1; i++) {
    const [n0, a0] = AGES[i];
    const [n1, a1] = AGES[i + 1];
    if (a <= a1) {
      const k = (a - a0) / (a1 - a0);
      return [[n0, 1 - k], [n1, k]];
    }
  }
  return [['old', 1]];
}

/**
 * Macro body parameters, all 0..1: gender (0 female, 1 male), age (0.5 = 25
 * years), muscle, weight, height, proportions (1 = idealised), and an
 * ancestry blend {african, asian, caucasian} that sums to 1. Returns
 * [targetPath, weight] pairs following the naming scheme of the shipped files.
 */
export function macroTargets({ gender = 0.5, age = 0.5, muscle = 0.5, weight = 0.5, height = 0.5, proportions = 0.5, ancestry = { african: 1 / 3, asian: 1 / 3, caucasian: 1 / 3 } }) {
  const g = [['female', 1 - gender], ['male', gender]];
  const a = ageWeights(age);
  const m = TRI(muscle).map(([n, w]) => [n + 'muscle', w]);
  const wt = TRI(weight).map(([n, w]) => [n + 'weight', w]);
  const out = [];
  const push = (p, w) => w > 1e-6 && out.push([p, w]);
  for (const [gn, gw] of g)
    for (const [an, aw] of a) {
      for (const [eth, ew] of Object.entries(ancestry)) push(`macrodetails/${eth}-${gn}-${an}.target`, gw * aw * ew);
      for (const [mn, mw] of m)
        for (const [wn, ww] of wt) {
          const base = gw * aw * mw * ww;
          push(`macrodetails/universal-${gn}-${an}-${mn}-${wn}.target`, base);
          const h = height - 0.5;
          if (h) push(`macrodetails/height/${gn}-${an}-${mn}-${wn}-${h > 0 ? 'max' : 'min'}height.target`, base * Math.abs(h) * 2);
          const pr = proportions - 0.5;
          if (pr) push(`macrodetails/proportions/${gn}-${an}-${mn}-${wn}-${pr > 0 ? 'ideal' : 'uncommon'}proportions.target`, base * Math.abs(pr) * 2);
        }
    }
  return out;
}

/** Signed modifier helper: value -1..1 between two targets (decr/incr style). */
export const pair = (neg, pos, value) => (value < 0 ? [[neg, -value]] : value > 0 ? [[pos, value]] : []);

export class MakeHuman {
  /** Every data file read in this process (for the provenance ledger). */
  static used = new Set();
  constructor(dir) {
    this.dir = dir;
    this.cache = new Map();
    this.base = parseObj(this.read('3dobjs/base.obj'));
  }
  read(rel) {
    MakeHuman.used.add(path.normalize(rel).split(path.sep).join('/'));
    return fs.readFileSync(path.join(this.dir, rel), 'utf8');
  }
  has(rel) {
    return fs.existsSync(path.join(this.dir, 'targets', rel));
  }
  target(rel) {
    let t = this.cache.get(rel);
    if (!t) {
      t = parseTarget(this.read(path.join('targets', rel)));
      this.cache.set(rel, t);
    }
    return t;
  }
  /** Base positions with weighted targets applied (new Float64Array). */
  apply(list, from = this.base.v) {
    const v = Float64Array.from(from);
    for (const [rel, w] of list) {
      const t = this.target(rel);
      for (let i = 0; i < t.idx.length; i++) {
        const o = t.idx[i] * 3;
        v[o] += t.d[i * 3] * w;
        v[o + 1] += t.d[i * 3 + 1] * w;
        v[o + 2] += t.d[i * 3 + 2] * w;
      }
    }
    return v;
  }
  skeleton() {
    return (this._skel ??= JSON.parse(this.read('rigs/default.mhskel')));
  }
  /** Joint positions (mean of the defining vertices) for the given mesh positions. */
  joints(v) {
    const out = {};
    for (const [name, verts] of Object.entries(this.skeleton().joints)) {
      const p = [0, 0, 0];
      for (const i of verts) for (let k = 0; k < 3; k++) p[k] += v[i * 3 + k];
      out[name] = p.map((x) => x / verts.length);
    }
    return out;
  }
  /** Bone name -> [[vertex, weight]] */
  weights() {
    return (this._w ??= JSON.parse(this.read('rigs/default_weights.mhw')).weights);
  }
  /** Parse an .mhclo proxy and return a fitter: (basePositions) => Float64Array proxy positions. */
  proxy(rel) {
    const text = this.read(rel);
    const refs = [];
    const scale = {};
    let inVerts = false;
    for (const line of text.split('\n')) {
      const p = line.trim().split(/\s+/);
      if (!p[0] || p[0][0] === '#') continue;
      if (/^[xyz]_scale$/.test(p[0])) scale[p[0][0]] = [+p[1], +p[2], +p[3]];
      else if (p[0] === 'verts') inVerts = true;
      else if (inVerts && p.length === 9 && /^\d+$/.test(p[0])) refs.push(p.map(Number));
      else if (inVerts && p.length === 1 && /^\d+$/.test(p[0])) refs.push([+p[0], +p[0], +p[0], 1, 0, 0, 0, 0, 0]);
      else if (inVerts && !/^\d/.test(p[0])) inVerts = false;
    }
    const objFile = /obj_file\s+(\S+)/.exec(text)[1];
    const obj = parseObj(this.read(path.join(path.dirname(rel), objFile)));
    const mat = /material\s+(\S+)/.exec(text);
    if (mat) MakeHuman.used.add(path.normalize(path.join(path.dirname(rel), mat[1])).split(path.sep).join('/'));
    const fit = (v) => {
      const s = ['x', 'y', 'z'].map((ax, k) => {
        const sc = scale[ax];
        return sc ? Math.abs(v[sc[0] * 3 + k] - v[sc[1] * 3 + k]) / sc[2] : 1;
      });
      const out = new Float64Array(refs.length * 3);
      refs.forEach((r, i) => {
        for (let k = 0; k < 3; k++) out[i * 3 + k] = r[3] * v[r[0] * 3 + k] + r[4] * v[r[1] * 3 + k] + r[5] * v[r[2] * 3 + k] + r[6 + k] * s[k];
      });
      return out;
    };
    return { obj, fit, count: refs.length };
  }
}
