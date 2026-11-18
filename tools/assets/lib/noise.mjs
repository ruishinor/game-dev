// Deterministic 3D gradient noise (classic Perlin construction) and fBm,
// for procedural texture baking. Seeded; no Math.random.
export function makeNoise(seed = 1) {
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const p = new Uint8Array(512);
  const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const G = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1], [1, 1, 0], [0, -1, 1], [-1, 1, 0], [0, -1, -1]];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h, x, y, z) => {
    const g = G[h & 15];
    return g[0] * x + g[1] * y + g[2] * z;
  };
  function noise(x, y, z) {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    x -= X; y -= Y; z -= Z;
    const xi = X & 255, yi = Y & 255, zi = Z & 255;
    const u = fade(x), v = fade(y), w = fade(z);
    const A = p[xi] + yi, AA = p[A] + zi, AB = p[A + 1] + zi, B = p[xi + 1] + yi, BA = p[B] + zi, BB = p[B + 1] + zi;
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z), u), l(grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z), u), v),
      l(l(grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1), u), l(grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1), u), v),
      w,
    );
  }
  function fbm(x, y, z, oct = 4, lac = 2, gain = 0.5) {
    let a = 1, f = 1, s2 = 0, n = 0;
    for (let i = 0; i < oct; i++) {
      s2 += a * noise(x * f, y * f, z * f);
      n += a;
      a *= gain;
      f *= lac;
    }
    return s2 / n;
  }
  /** Cellular (Worley F1) distance, for pores and speckles. */
  function cell(x, y, z) {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    let best = 9;
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (let k = -1; k <= 1; k++) {
          const h = p[(p[(p[(X + i) & 255] + Y + j) & 255] + Z + k) & 255];
          const fx = X + i + (h / 255), fy = Y + j + (p[(h + 1) & 255] / 255), fz = Z + k + (p[(h + 2) & 255] / 255);
          const d = (fx - x) ** 2 + (fy - y) ** 2 + (fz - z) ** 2;
          if (d < best) best = d;
        }
    return Math.sqrt(best);
  }
  return { noise, fbm, cell, rnd };
}
export const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
