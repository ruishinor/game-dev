// Procedural skin texture bake in MakeHuman's default UV layout.
//
// Everything is derived from the CC0 base mesh: texels are rasterised from
// the UV layout, each texel knows its rest-pose 3D position and normal, and
// the maps are functions of that position (so 3D noise has no UV seams).
// Coordinates below are MakeHuman base-mesh decimetres (y up, +z forward).
//
// Outputs (all RGBA Uint8, size x size):
//   albedo  neutral light skin; per-character tone is applied by the client
//   normal  tangent-space detail (pores, fine lines, creases)
//   orm     R ambient occlusion, G roughness, B unused (glTF ORM layout)
//   masks   R eyebrow density, G beard/stubble density, B scalp hair, A lips
import { makeNoise, smooth } from './noise.mjs';
import { rigWeights } from './mh-body.mjs';

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const gauss = (dx, dy, dz, rx, ry, rz) => Math.exp(-((dx / rx) ** 2 + (dy / ry) ** 2 + (dz / rz) ** 2));

/** Per-vertex soft masks that come from MakeHuman expression targets. */
function targetMask(mh, rel, n) {
  const t = mh.target(rel);
  const m = new Float64Array(n);
  let max = 0;
  for (let i = 0; i < t.idx.length; i++) {
    const d = Math.hypot(t.d[i * 3], t.d[i * 3 + 1], t.d[i * 3 + 2]);
    m[t.idx[i]] = d;
    max = Math.max(max, d);
  }
  for (let i = 0; i < n; i++) m[i] /= max || 1;
  return m;
}

function vertexNormals(v, faces) {
  const n = new Float64Array(v.length);
  for (const f of faces)
    for (let k = 1; k + 1 < f.v.length; k++) {
      const [a, b, c] = [f.v[0], f.v[k], f.v[k + 1]];
      const ux = v[b * 3] - v[a * 3], uy = v[b * 3 + 1] - v[a * 3 + 1], uz = v[b * 3 + 2] - v[a * 3 + 2];
      const wx = v[c * 3] - v[a * 3], wy = v[c * 3 + 1] - v[a * 3 + 1], wz = v[c * 3 + 2] - v[a * 3 + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      for (const i of [a, b, c]) {
        n[i * 3] += nx; n[i * 3 + 1] += ny; n[i * 3 + 2] += nz;
      }
    }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}

/** Concavity per vertex: how far the neighbourhood average lies in front of the vertex. */
function cavity(v, nrm, faces) {
  const sum = new Float64Array(v.length);
  const cnt = new Float64Array(v.length / 3);
  for (const f of faces)
    for (let k = 0; k < f.v.length; k++) {
      const a = f.v[k], b = f.v[(k + 1) % f.v.length];
      for (const [x, y] of [[a, b], [b, a]]) {
        sum[x * 3] += v[y * 3]; sum[x * 3 + 1] += v[y * 3 + 1]; sum[x * 3 + 2] += v[y * 3 + 2];
        cnt[x]++;
      }
    }
  const out = new Float64Array(v.length / 3);
  for (let i = 0; i < out.length; i++) {
    if (!cnt[i]) continue;
    const dx = sum[i * 3] / cnt[i] - v[i * 3], dy = sum[i * 3 + 1] / cnt[i] - v[i * 3 + 1], dz = sum[i * 3 + 2] / cnt[i] - v[i * 3 + 2];
    out[i] = dx * nrm[i * 3] + dy * nrm[i * 3 + 1] + dz * nrm[i * 3 + 2];
  }
  return out;
}

/** Hair-bearing scalp weight (0..1) in base-mesh decimetres, before noise. */
export function scalpWeight(x, y, z, headW) {
  if (headW <= 0.3) return 0;
  const ax = Math.abs(x);
  const front = smooth(0.4, 1.3, z);
  const hairline = 7.83 + 0.06 * Math.cos(ax * 4) * front - (1 - front) * (0.25 + 0.75 * smooth(0.2, -0.6, z));
  const temple = ax > 0.52 && z > 0.65 ? 0.08 : 0;
  return smooth(hairline + temple - 0.02, hairline + temple + 0.07, y) * (ax > 0.66 && y < 7.65 && z > 0.2 ? 0 : 1);
}

export function bakeSkin(mh, { size = 2048, seed = 7, male = true } = {}) {
  const v = mh.base.v;
  const nv = v.length / 3;
  const faces = mh.base.faces.filter((f) => f.group === 'body');
  const nrm = vertexNormals(v, faces);
  const cav = cavity(v, nrm, faces);
  const W = rigWeights(mh, nv);
  const headW = Float64Array.from(W, (ws) => ws.reduce((s, [b, w]) => s + (b === 'Head' ? w : 0), 0));
  const lipT = targetMask(mh, 'expression/units/caucasian/mouth-pursing.target', nv);
  const lipE = targetMask(mh, 'expression/units/caucasian/mouth-eversion.target', nv);
  const lidL = targetMask(mh, 'expression/units/caucasian/eye-left-closure.target', nv);
  const lidR = targetMask(mh, 'expression/units/caucasian/eye-right-closure.target', nv);
  // Per-vertex attribute block: headW, lip, lid, cavity
  const A = 4;
  const attr = new Float64Array(nv * A);
  for (let i = 0; i < nv; i++) {
    attr[i * A] = headW[i];
    attr[i * A + 1] = Math.max(lipT[i], lipE[i]);
    attr[i * A + 2] = Math.max(lidL[i], lidR[i]);
    attr[i * A + 3] = cav[i];
  }

  // --- rasterise --------------------------------------------------------------
  const S = size;
  const N = S * S;
  const cov = new Uint8Array(N);
  const P = new Float32Array(N * 3);
  const Nn = new Float32Array(N * 3);
  const At = new Float32Array(N * A);
  const vt = mh.base.vt;
  for (const f of faces) {
    for (let k = 1; k + 1 < f.v.length; k++) {
      const ids = [0, k, k + 1];
      const vi = ids.map((j) => f.v[j]);
      const uv = ids.map((j) => [vt[f.t[j] * 2] * S - 0.5, (1 - vt[f.t[j] * 2 + 1]) * S - 0.5]);
      const x0 = Math.max(0, Math.floor(Math.min(uv[0][0], uv[1][0], uv[2][0])));
      const x1 = Math.min(S - 1, Math.ceil(Math.max(uv[0][0], uv[1][0], uv[2][0])));
      const y0 = Math.max(0, Math.floor(Math.min(uv[0][1], uv[1][1], uv[2][1])));
      const y1 = Math.min(S - 1, Math.ceil(Math.max(uv[0][1], uv[1][1], uv[2][1])));
      const d = (uv[1][1] - uv[2][1]) * (uv[0][0] - uv[2][0]) + (uv[2][0] - uv[1][0]) * (uv[0][1] - uv[2][1]);
      if (Math.abs(d) < 1e-12) continue;
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const a = ((uv[1][1] - uv[2][1]) * (x - uv[2][0]) + (uv[2][0] - uv[1][0]) * (y - uv[2][1])) / d;
          const b = ((uv[2][1] - uv[0][1]) * (x - uv[2][0]) + (uv[0][0] - uv[2][0]) * (y - uv[2][1])) / d;
          const c = 1 - a - b;
          if (a < -0.02 || b < -0.02 || c < -0.02) continue;
          const o = y * S + x;
          cov[o] = 1;
          const w = [a, b, c];
          for (let q = 0; q < 3; q++) {
            P[o * 3 + q] = w[0] * v[vi[0] * 3 + q] + w[1] * v[vi[1] * 3 + q] + w[2] * v[vi[2] * 3 + q];
            Nn[o * 3 + q] = w[0] * nrm[vi[0] * 3 + q] + w[1] * nrm[vi[1] * 3 + q] + w[2] * nrm[vi[2] * 3 + q];
          }
          for (let q = 0; q < A; q++) At[o * A + q] = w[0] * attr[vi[0] * A + q] + w[1] * attr[vi[1] * A + q] + w[2] * attr[vi[2] * A + q];
        }
    }
  }

  // --- shade -----------------------------------------------------------------
  const nz = makeNoise(seed);
  const albedo = new Float32Array(N * 3);
  const height = new Float32Array(N);
  const orm = new Float32Array(N * 2);
  const masks = new Float32Array(N * 4);
  const base = [0.80, 0.62, 0.53]; // linear-ish light neutral; client tints
  for (let o = 0; o < N; o++) {
    if (!cov[o]) continue;
    const x = P[o * 3], y = P[o * 3 + 1], z = P[o * 3 + 2];
    const ax = Math.abs(x);
    const nzv = Nn[o * 3 + 2];
    const hw = At[o * A], lipRaw = At[o * A + 1], lid = At[o * A + 2], cv = At[o * A + 3];
    const face = hw * smooth(-0.1, 0.5, nzv);
    // Mouth interior: behind the lips and inside the head.
    const nxv = Nn[o * 3], nyv = Nn[o * 3 + 1];
    const facing = (cx, cy, cz) => nxv * (x - cx) + nyv * (y - cy) + nzv * (z - cz);
    const inMouth = hw > 0.5 && Math.hypot(x, y - 6.62, z - 1.15) < 0.42 && z < 1.47 && facing(0, 6.62, 1.15) < 0 ? 1 : 0;
    // Eye socket interior surfaces (hidden by the eyeball; keep them dark).
    const ex = x < 0 ? -0.31 : 0.31;
    const inSocket = hw > 0.5 && Math.hypot(x - ex, y - 7.28, z - 1.25) < 0.24 && facing(ex, 7.28, 1.25) < 0 ? 1 : 0;
    const lip = clamp01(smooth(0.33, 0.55, lipRaw) * (y > 6.43 && y < 6.86 ? 1 : 0) * smooth(1.38, 1.48, z) * (1 - smooth(0.2, 0.26, ax)));

    let r = base[0], g = base[1], b = base[2];
    // Large-scale blotch and fine mottling.
    const blot = nz.fbm(x * 1.6, y * 1.6, z * 1.6, 4);
    const mott = nz.fbm(x * 9, y * 9, z * 9, 3);
    r *= 1 + blot * 0.07 + mott * 0.035;
    g *= 1 + blot * 0.05 + mott * 0.03;
    b *= 1 + blot * 0.04 + mott * 0.03;
    // Vascular warmth: cheeks, nose, ears, chin, knuckles and palms.
    let red = 0;
    red += 0.55 * gauss(ax - 0.43, y - 7.02, z - 1.32, 0.2, 0.16, 0.3) * face;
    red += 0.6 * gauss(x, y - 6.93, z - 1.66, 0.11, 0.08, 0.12) * face;
    red += 0.45 * gauss(ax - 0.15, y - 6.92, z - 1.5, 0.08, 0.07, 0.1) * face;
    red += 0.3 * gauss(x, y - 6.27, z - 1.4, 0.18, 0.1, 0.2) * face;
    red += 0.45 * smooth(0.6, 0.72, ax) * hw * (y > 6.85 && y < 7.75 ? 1 : 0);
    red += 0.3 * smooth(3.9, 4.6, ax) * (y < 4.5 ? 1 : 0);
    red = clamp01(red);
    r *= 1 + red * 0.08; g *= 1 - red * 0.13; b *= 1 - red * 0.08;
    // Periorbital: slightly darker, cooler under the eyes; warmer lids.
    const under = gauss(ax - 0.31, y - 7.14, z - 1.48, 0.17, 0.06, 0.2) * face;
    r *= 1 - under * 0.16; g *= 1 - under * 0.17; b *= 1 - under * 0.07;
    const lidTone = clamp01(lid * 1.4) * hw * (inSocket ? 0 : 1);
    r *= 1 - lidTone * 0.04; g *= 1 - lidTone * 0.12; b *= 1 - lidTone * 0.05;
    // Lips: deeper, redder, with a soft vermilion border.
    if (lip > 0) {
      const lr = [0.66, 0.36, 0.36];
      const k = lip * 0.85;
      r = r * (1 - k) + lr[0] * k * (1 + mott * 0.05);
      g = g * (1 - k) + lr[1] * k;
      b = b * (1 - k) + lr[2] * k;
    }
    if (inMouth) { r = 0.38; g = 0.12; b = 0.12; }
    if (inSocket) { r *= 0.35; g *= 0.25; b *= 0.25; }
    // Freckles / naevi: sparse speckles.
    const sp = nz.cell(x * 22, y * 22, z * 22);
    const freck = (1 - smooth(0.05, 0.13, sp)) * (nz.noise(x * 3 + 9, y * 3, z * 3) > 0.25 ? 1 : 0.15);
    r *= 1 - freck * 0.12; g *= 1 - freck * 0.16; b *= 1 - freck * 0.16;
    // Palms and soles are lighter and less pigmented.
    const palm = smooth(3.9, 4.6, ax) * smooth(0.1, -0.5, Nn[o * 3 + 1]) * (y < 4 ? 1 : 0);
    r = r + (0.86 - r) * palm * 0.25; g = g + (0.66 - g) * palm * 0.25; b = b + (0.58 - b) * palm * 0.25;

    albedo[o * 3] = r; albedo[o * 3 + 1] = g; albedo[o * 3 + 2] = b;

    // Height: pores, grain, fine lines.
    const pore = smooth(0.0, 0.33, nz.cell(x * 70, y * 70, z * 70));
    const poreAmt = 0.4 + 0.6 * clamp01(face * (gauss(ax - 0.35, y - 6.95, z - 1.35, 0.3, 0.25, 0.4) + gauss(x, y - 6.95, z - 1.6, 0.14, 0.15, 0.2)));
    let h = (pore - 1) * 0.5 * poreAmt * (0.35 + 0.65 * hw);
    h += nz.fbm(x * 40, y * 40, z * 40, 3) * 0.16;
    // Forehead lines and frown lines.
    const fh = face * smooth(7.62, 7.75, y) * (1 - smooth(8.05, 8.25, y)) * (1 - smooth(0.35, 0.55, ax));
    h += fh * Math.sin(y * 95 + nz.noise(x * 6, y, z) * 2.5) * 0.06 * (0.5 + 0.5 * nz.noise(x * 4, y * 2, 3));
    // Crow's feet.
    const cf = face * gauss(ax - 0.6, y - 7.28, z - 1.15, 0.1, 0.12, 0.3);
    h += cf * Math.sin(Math.atan2(y - 7.28, ax - 0.5) * 22) * 0.07;
    // Lip vertical lines.
    h += lip * Math.sin(x * 260 + nz.noise(x * 30, y * 30, z) * 2) * 0.35;
    if (lip > 0) h = h * (1 - lip * 0.5);
    height[o] = h;

    // AO from mesh concavity, nostrils, mouth, sockets.
    let ao = 1 - clamp01(cv * 18) * 0.55;
    ao *= 1 - 0.5 * gauss(ax - 0.12, y - 6.88, z - 1.47, 0.05, 0.035, 0.06) * face;
    if (inMouth) ao *= 0.35;
    if (inSocket) ao *= 0.25;
    orm[o * 2] = clamp01(ao);
    // Roughness: oily T-zone and lips are smoother.
    let rough = 0.6 - 0.12 * face * (gauss(x, y - 7.8, z - 1.4, 0.35, 0.3, 0.4) + gauss(x, y - 6.95, z - 1.6, 0.12, 0.2, 0.2));
    rough = rough * (1 - lip) + 0.36 * lip;
    if (inMouth) rough = 0.3;
    rough += (pore - 0.8) * 0.06;
    orm[o * 2 + 1] = clamp01(rough);

    // --- hair masks -----------------------------------------------------------
    // Eyebrow: arched band above each eye, denser and thicker medially,
    // with strand breakup along the growth direction.
    const t = (ax - 0.07) / 0.6; // 0 medial .. 1 lateral
    let brow = 0;
    if (face > 0.2 && t > -0.05 && t < 1.05) {
      const yc = 7.47 + 0.12 * Math.sin(Math.PI * clamp01(t) * 0.85) - 0.03 * clamp01(t) ** 2;
      const thick = 0.055 * (1 - 0.6 * clamp01(t)) + 0.015;
      const dy = (y - yc) / thick;
      const band = Math.exp(-(dy * dy) * 2.2) * smooth(-0.05, 0.08, t) * (1 - smooth(0.88, 1.05, t));
      const ang = 1.2 - 1.05 * clamp01(t); // growth angle: up-out medially, outward laterally
      const along = ax * Math.cos(ang) + y * Math.sin(ang);
      const across = -ax * Math.sin(ang) + y * Math.cos(ang);
      const strand = 0.5 + 0.5 * nz.noise(along * 18, across * 260, z * 4);
      brow = clamp01(band * (0.35 + 0.9 * strand));
    }
    // Beard: below the cheekbone line and on the upper lip, chin, jaw and neck front.
    let beard = 0;
    if (hw > 0.05 || (y > 5.7 && z > 0)) {
      const cheekLine = 6.98 - 0.35 * smooth(0.25, 0.62, ax);
      const area = smooth(cheekLine + 0.06, cheekLine - 0.16, y) * smooth(5.7, 6.15, y) * (1 - smooth(0.56, 0.7, ax)) * smooth(-0.3, 0.2, z);
      const noseCut = 1 - (ax < 0.22 && y > 6.8 ? 1 : 0);
      const lipCut = 1 - smooth(0.05, 0.35, lip);
      const mouthGap = 1 - gauss(ax - 0.21, y - 6.67, z - 1.4, 0.05, 0.05, 0.2) * 0.8;
      const neckBack = 1 - smooth(0.25, -0.1, z) * (y < 6.4 ? 1 : 0);
      const fol = 1 - smooth(0.05, 0.22, nz.cell(x * 120, y * 120, z * 120));
      beard = clamp01(area * noseCut * lipCut * mouthGap * neckBack * (0.55 + 0.45 * fol) * (inMouth ? 0 : 1));
    }
    // Scalp: hair-bearing skin above the hairline.
    let scalp = 0;
    if (hw > 0.3) {
      scalp = scalpWeight(x, y, z, hw);
      scalp *= 0.75 + 0.25 * nz.noise(x * 30, y * 30, z * 30);
      scalp = clamp01(scalp);
    }
    masks[o * 4] = brow;
    masks[o * 4 + 1] = beard;
    masks[o * 4 + 2] = scalp;
    masks[o * 4 + 3] = lip;
  }

  // --- normals from height ---------------------------------------------------
  const strength = 2.2;
  const normal = new Float32Array(N * 3);
  for (let yy = 0; yy < S; yy++)
    for (let xx = 0; xx < S; xx++) {
      const o = yy * S + xx;
      if (!cov[o]) continue;
      const hx0 = cov[o - 1] ? height[o - 1] : height[o];
      const hx1 = xx + 1 < S && cov[o + 1] ? height[o + 1] : height[o];
      const hy0 = yy > 0 && cov[o - S] ? height[o - S] : height[o];
      const hy1 = yy + 1 < S && cov[o + S] ? height[o + S] : height[o];
      // image rows grow downward = +v in glTF UVs; tangent-space +Y points up the image
      let nx = -(hx1 - hx0) * strength * (S / 2048), ny = (hy1 - hy0) * strength * (S / 2048), nzz = 1;
      const l = Math.hypot(nx, ny, nzz);
      normal[o * 3] = nx / l; normal[o * 3 + 1] = ny / l; normal[o * 3 + 2] = nzz / l;
    }

  // --- pad islands so mips and bilinear filtering do not bleed background ---
  const chans = [[albedo, 3], [normal, 3], [orm, 2], [masks, 4]];
  let filled = cov.slice();
  for (let pass = 0; pass < 12; pass++) {
    const next = filled.slice();
    for (let yy = 0; yy < S; yy++)
      for (let xx = 0; xx < S; xx++) {
        const o = yy * S + xx;
        if (filled[o]) continue;
        const nb = [xx > 0 && o - 1, xx + 1 < S && o + 1, yy > 0 && o - S, yy + 1 < S && o + S].filter((q) => q !== false && filled[q]);
        if (!nb.length) continue;
        for (const [arr, c] of chans) for (let q = 0; q < c; q++) arr[o * c + q] = nb.reduce((s, n) => s + arr[n * c + q], 0) / nb.length;
        next[o] = 1;
      }
    filled = next;
  }
  for (let o = 0; o < N; o++) if (!filled[o]) { normal[o * 3 + 2] = 1; albedo[o * 3] = base[0]; albedo[o * 3 + 1] = base[1]; albedo[o * 3 + 2] = base[2]; orm[o * 2] = 1; orm[o * 2 + 1] = 0.6; }

  const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  const out = { size: S, albedo: new Uint8Array(N * 4), normal: new Uint8Array(N * 4), orm: new Uint8Array(N * 4), masks: new Uint8Array(N * 4) };
  for (let o = 0; o < N; o++) {
    // Albedo values above are authored as display-referred tones.
    for (let q = 0; q < 3; q++) out.albedo[o * 4 + q] = Math.round(clamp01(albedo[o * 3 + q]) * 255);
    out.albedo[o * 4 + 3] = 255;
    for (let q = 0; q < 3; q++) out.normal[o * 4 + q] = Math.round((normal[o * 3 + q] * 0.5 + 0.5) * 255);
    out.normal[o * 4 + 3] = 255;
    out.orm[o * 4] = Math.round(orm[o * 2] * 255);
    out.orm[o * 4 + 1] = Math.round(orm[o * 2 + 1] * 255);
    out.orm[o * 4 + 2] = 0;
    out.orm[o * 4 + 3] = 255;
    for (let q = 0; q < 4; q++) out.masks[o * 4 + q] = Math.round(clamp01(masks[o * 4 + q]) * 255);
  }
  void toSrgb;
  return out;
}
