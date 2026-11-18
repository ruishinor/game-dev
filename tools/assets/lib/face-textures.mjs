// Small face textures: a tintable eye map (from MakeHuman's CC0 eye texture)
// and a procedural eyelash card texture.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { makeNoise, smooth } from './noise.mjs';

/** Eye map: sclera as authored; iris replaced by a neutral luminance detail
 *  layer with the iris mask in alpha (the client tints it per character). */
export async function eyeTexture(mhDir, size = 512) {
  const src = path.join(mhDir, 'eyes', 'materials', 'brown_eye.png');
  const { data, info } = await sharp(fs.readFileSync(src)).resize(size, size).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const S = info.width;
  const out = Buffer.alloc(S * S * 4);
  const irises = [[0.703, 0.293], [0.289, 0.707]];
  const nz = makeNoise(11);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const o = (y * S + x) * 4;
      const u = x / S, v = y / S;
      let r = data[o], g = data[o + 1], b = data[o + 2];
      let a = 0;
      for (const [cx, cy] of irises) {
        const dx = u - cx, dy = v - cy;
        const d = Math.hypot(dx, dy) / 0.112;
        if (d > 1.15) continue;
        const ang = Math.atan2(dy, dx);
        // Radial fibres, crypts, a darker limbal ring and collarette.
        const fib = 0.5 + 0.5 * nz.noise(Math.cos(ang) * 9, Math.sin(ang) * 9, d * 3) * 0.6 + 0.25 * Math.sin(ang * 90 + nz.noise(d * 4, ang, 1) * 6);
        const crypt = smooth(0.15, 0.35, nz.noise(Math.cos(ang) * 14, Math.sin(ang) * 14, d * 7));
        const collar = Math.exp(-(((d - 0.5) / 0.08) ** 2));
        let lum = 0.55 + 0.35 * (fib - 0.5) - 0.25 * crypt + 0.25 * collar;
        lum *= 1 - 0.55 * smooth(0.82, 1.0, d); // limbal ring
        const pupil = 1 - smooth(0.3, 0.36, d);
        lum = lum * (1 - pupil) + 0.02 * pupil;
        const m = 1 - smooth(0.98, 1.06, d);
        const L = Math.round(Math.max(0, Math.min(1, lum)) * 255);
        r = r * (1 - m) + L * m; g = g * (1 - m) + L * m; b = b * (1 - m) + L * m;
        // Alpha = iris tint mask (0 in pupil so it stays black).
        a = Math.max(a, m * (1 - pupil));
      }
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = Math.round(a * 255);
    }
  return { data: out, size: S };
}

/** Lash cards: upper lashes in the top half, lower in the bottom; u tiles. */
export function lashTexture(w = 256, h = 128) {
  const out = new Float32Array(w * h);
  const nz = makeNoise(5);
  const draw = (half, count, len, curl) => {
    for (let i = 0; i < count; i++) {
      const u0 = (i + nz.rnd() * 0.8) / count;
      const L = len * (0.6 + 0.4 * nz.rnd());
      const c = curl * (0.6 + 0.8 * nz.rnd()) * (nz.rnd() < 0.5 ? 1 : -1) * 0.25 + curl;
      for (let s = 0; s <= 60; s++) {
        const t = s / 60;
        const px = (u0 + c * t * t * 0.05) * w;
        const py = (half * 0.5 + t * L * 0.5) * h;
        const rad = 1.4 * (1 - t) + 0.35;
        for (let yy = Math.floor(py - 2); yy <= py + 2; yy++)
          for (let xx = Math.floor(px - 3); xx <= px + 3; xx++) {
            const X = ((xx % w) + w) % w;
            if (yy < 0 || yy >= h) continue;
            const d = Math.hypot(xx - px, yy - py);
            const aa = Math.max(0, Math.min(1, rad + 0.5 - d));
            out[yy * w + X] = Math.max(out[yy * w + X], aa);
          }
      }
    }
  };
  draw(0, 70, 0.95, 0.5);
  draw(1, 40, 0.8, -0.3);
  const data = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = 18; data[i * 4 + 1] = 14; data[i * 4 + 2] = 12;
    data[i * 4 + 3] = Math.round(out[i] * 255);
  }
  return { data, w, h };
}
