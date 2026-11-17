// Procedural effect textures, drawn once on 2D canvases (browser only).
// Everything is seeded, so two clients see identical sigils and sprites.
//
// atlas   : 4x4 sprite cells, white RGB with alpha (tinted per particle)
// sigils  : one texture per discipline; R = outer ring layer, G = inner layer,
//           B = soft radial wash. The decal shader rotates R and G separately.
// crack   : R = glowing fracture lines, G = scorch blotch (blast aftermath)
// noise   : tileable fbm value noise, grey, for beams, shells and shockwaves

export const CELL = {
  glow: 0, flare: 1, streak: 2, smoke: 3, bubble: 4, hex: 5, cross: 6, spore: 7,
  shard: 8, runeA: 9, runeB: 10, runeC: 11, dust: 12, ember: 13, diamond: 14, petal: 15,
};
export const SIGIL_STYLES = ['kinetic', 'resonance', 'restorative', 'survey', 'hazard'];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// --- sprite atlas ---------------------------------------------------------------

function radial(g, x, y, r, stops) {
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  for (const [o, a] of stops) grd.addColorStop(o, `rgba(255,255,255,${a})`);
  g.fillStyle = grd;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}

function rune(g, s, rand) {
  // An engineered glyph: a stem, two to four strokes on a 3x3 lattice, a node.
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.shadowColor = 'rgba(255,255,255,0.9)';
  g.shadowBlur = s * 0.08;
  g.lineWidth = s * 0.07;
  const p = (i) => [s * (0.25 + 0.25 * (i % 3)), s * (0.22 + 0.28 * Math.floor(i / 3))];
  g.beginPath();
  g.moveTo(...p(1));
  g.lineTo(...p(7));
  const n = 2 + Math.floor(rand() * 3);
  for (let k = 0; k < n; k++) {
    const a = Math.floor(rand() * 9);
    let b = Math.floor(rand() * 9);
    if (b === a) b = (a + 4) % 9;
    g.moveTo(...p(a));
    g.lineTo(...p(b));
  }
  g.stroke();
  const [nx, ny] = p(Math.floor(rand() * 9));
  g.beginPath();
  g.arc(nx, ny, s * 0.06, 0, TAU);
  g.fillStyle = '#fff';
  g.fill();
  g.shadowBlur = 0;
}

export function drawAtlas(size = 512) {
  const c = canvas(size);
  const g = c.getContext('2d');
  const s = size / 4;
  const rand = rng(0xa77e);
  const cell = (i, fn) => {
    g.save();
    g.translate((i % 4) * s, Math.floor(i / 4) * s);
    g.beginPath();
    g.rect(0, 0, s, s);
    g.clip();
    fn(s / 2);
    g.restore();
  };
  cell(CELL.glow, (h) => radial(g, h, h, h, [[0, 1], [0.18, 0.75], [0.45, 0.22], [1, 0]]));
  cell(CELL.flare, (h) => {
    radial(g, h, h, h * 0.55, [[0, 1], [0.3, 0.55], [1, 0]]);
    g.globalCompositeOperation = 'lighter';
    for (const [w, l] of [[0.05, 1], [0.035, 0.62]]) {
      for (let k = 0; k < (l === 1 ? 2 : 2); k++) {
        g.save();
        g.translate(h, h);
        g.rotate(k * Math.PI / 2 + (l === 1 ? 0 : Math.PI / 4));
        const grd = g.createLinearGradient(-h * l, 0, h * l, 0);
        grd.addColorStop(0, 'rgba(255,255,255,0)');
        grd.addColorStop(0.5, 'rgba(255,255,255,0.95)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.fillRect(-h * l, -h * w, h * 2 * l, h * w * 2);
        g.restore();
      }
    }
  });
  cell(CELL.streak, (h) => {
    g.save();
    g.translate(h, h);
    g.scale(1, 0.16);
    radial(g, 0, 0, h, [[0, 1], [0.35, 0.6], [1, 0]]);
    g.restore();
  });
  cell(CELL.smoke, (h) => {
    for (let k = 0; k < 26; k++) {
      const a = rand() * TAU;
      const d = rand() * h * 0.45;
      radial(g, h + Math.cos(a) * d, h + Math.sin(a) * d, h * (0.25 + rand() * 0.3), [[0, 0.16], [1, 0]]);
    }
  });
  cell(CELL.bubble, (h) => {
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = h * 0.09;
    g.shadowColor = '#fff';
    g.shadowBlur = h * 0.12;
    g.beginPath();
    g.arc(h, h, h * 0.72, 0, TAU);
    g.stroke();
    g.shadowBlur = 0;
    radial(g, h, h, h * 0.7, [[0, 0.12], [1, 0.0]]);
  });
  cell(CELL.hex, (h) => {
    g.strokeStyle = 'rgba(255,255,255,1)';
    g.lineWidth = h * 0.1;
    g.shadowColor = '#fff';
    g.shadowBlur = h * 0.15;
    g.beginPath();
    for (let k = 0; k <= 6; k++) g[k ? 'lineTo' : 'moveTo'](h + Math.cos(k * TAU / 6) * h * 0.7, h + Math.sin(k * TAU / 6) * h * 0.7);
    g.stroke();
    g.shadowBlur = 0;
    radial(g, h, h, h * 0.7, [[0, 0.25], [1, 0]]);
  });
  cell(CELL.cross, (h) => {
    radial(g, h, h, h * 0.9, [[0, 0.5], [1, 0]]);
    g.fillStyle = '#fff';
    g.shadowColor = '#fff';
    g.shadowBlur = h * 0.2;
    g.fillRect(h - h * 0.13, h - h * 0.55, h * 0.26, h * 1.1);
    g.fillRect(h - h * 0.55, h - h * 0.13, h * 1.1, h * 0.26);
    g.shadowBlur = 0;
  });
  cell(CELL.spore, (h) => {
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = h * 0.035;
    for (let k = 0; k < 9; k++) {
      const a = k * TAU / 9 + rand() * 0.3;
      g.beginPath();
      g.moveTo(h + Math.cos(a) * h * 0.38, h + Math.sin(a) * h * 0.38);
      g.lineTo(h + Math.cos(a) * h * 0.8, h + Math.sin(a) * h * 0.8);
      g.stroke();
    }
    radial(g, h, h, h * 0.5, [[0, 1], [0.5, 0.75], [0.8, 0.35], [1, 0]]);
  });
  cell(CELL.shard, (h) => {
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.shadowColor = '#fff';
    g.shadowBlur = h * 0.15;
    g.beginPath();
    g.moveTo(h * 0.35, h * 0.2);
    g.lineTo(h * 1.7, h * 0.85);
    g.lineTo(h * 0.95, h * 1.75);
    g.closePath();
    g.fill();
    g.shadowBlur = 0;
  });
  for (const i of [CELL.runeA, CELL.runeB, CELL.runeC]) cell(i, (h) => rune(g, h * 2, rand));
  cell(CELL.dust, (h) => {
    for (let k = 0; k < 14; k++) radial(g, h + (rand() - 0.5) * h * 0.8, h + (rand() - 0.5) * h * 0.8, h * (0.3 + rand() * 0.35), [[0, 0.18], [1, 0]]);
  });
  cell(CELL.ember, (h) => radial(g, h, h, h * 0.6, [[0, 1], [0.25, 0.9], [0.5, 0.25], [1, 0]]));
  cell(CELL.diamond, (h) => {
    g.fillStyle = '#fff';
    g.shadowColor = '#fff';
    g.shadowBlur = h * 0.25;
    g.beginPath();
    g.moveTo(h, h * 0.25);
    g.lineTo(h * 1.38, h);
    g.lineTo(h, h * 1.75);
    g.lineTo(h * 0.62, h);
    g.closePath();
    g.fill();
  });
  cell(CELL.petal, (h) => {
    g.save();
    g.translate(h, h);
    g.scale(0.42, 1);
    radial(g, 0, 0, h * 0.8, [[0, 1], [0.6, 0.6], [1, 0]]);
    g.restore();
  });
  return c;
}

// --- sigils ---------------------------------------------------------------------

function ringLayer(size, style, which, rand) {
  const c = canvas(size);
  const g = c.getContext('2d');
  const h = size / 2;
  g.translate(h, h);
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.lineCap = 'round';
  const R = h * 0.985;
  const circle = (r, w, dash) => {
    g.lineWidth = w;
    g.setLineDash(dash || []);
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.stroke();
    g.setLineDash([]);
  };
  const ticks = (r0, r1, n, w, every = 0, long = 0) => {
    g.lineWidth = w;
    g.beginPath();
    for (let k = 0; k < n; k++) {
      const a = k * TAU / n;
      const r1k = every && k % every === 0 ? r1 + long : r1;
      g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      g.lineTo(Math.cos(a) * r1k, Math.sin(a) * r1k);
    }
    g.stroke();
  };
  const runes = (r, n, sz) => {
    for (let k = 0; k < n; k++) {
      g.save();
      g.rotate(k * TAU / n);
      g.translate(r, -sz / 2);
      g.rotate(Math.PI / 2);
      g.translate(-sz / 2, -sz / 2);
      g.save();
      g.scale(1, 1);
      rune(g, sz, rand);
      g.restore();
      g.restore();
    }
  };
  const poly = (r, n, rot = 0, w = 3) => {
    g.lineWidth = w;
    g.beginPath();
    for (let k = 0; k <= n; k++) g[k ? 'lineTo' : 'moveTo'](Math.cos(rot + k * TAU / n) * r, Math.sin(rot + k * TAU / n) * r);
    g.stroke();
  };
  const u = size / 512;
  if (which === 'outer') {
    if (style === 'kinetic') {
      // Segmented capacitor ring with outward chevrons and load ticks.
      g.lineWidth = 16 * u;
      for (let k = 0; k < 12; k++) {
        g.beginPath();
        g.arc(0, 0, R - 18 * u, k * TAU / 12 + 0.05, (k + 1) * TAU / 12 - 0.05);
        g.stroke();
      }
      circle(R - 3 * u, 3 * u);
      circle(R - 40 * u, 2.5 * u);
      ticks(R - 62 * u, R - 46 * u, 72, 2.5 * u, 6, 8 * u);
      g.lineWidth = 6 * u;
      for (let k = 0; k < 6; k++) {
        const a = k * TAU / 6 + TAU / 12;
        g.save();
        g.rotate(a);
        g.beginPath();
        g.moveTo(R - 74 * u, -12 * u);
        g.lineTo(R - 60 * u, 0);
        g.lineTo(R - 74 * u, 12 * u);
        g.stroke();
        g.restore();
      }
    } else if (style === 'resonance') {
      circle(R - 3 * u, 3 * u);
      circle(R - 54 * u, 3 * u);
      circle(R - 62 * u, 1.5 * u, [6 * u, 9 * u]);
      runes(R - 28 * u, 18, 40 * u);
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.arc(0, 0, R - 9 * u, k * TAU / 3, k * TAU / 3 + 0.7);
        g.lineWidth = 7 * u;
        g.stroke();
      }
    } else if (style === 'restorative') {
      // A colony of overlapping cell membranes and a woven tendril.
      circle(R - 4 * u, 2.5 * u);
      g.lineWidth = 3 * u;
      for (let k = 0; k < 20; k++) {
        const a = k * TAU / 20;
        g.beginPath();
        g.arc(Math.cos(a) * (R - 34 * u), Math.sin(a) * (R - 34 * u), (18 + 9 * (k % 3)) * u, 0, TAU);
        g.stroke();
        g.beginPath();
        g.arc(Math.cos(a) * (R - 34 * u), Math.sin(a) * (R - 34 * u), 4 * u, 0, TAU);
        g.fill();
      }
      g.lineWidth = 4 * u;
      g.beginPath();
      for (let k = 0; k <= 240; k++) {
        const a = k * TAU / 240;
        const r = R - 70 * u + Math.sin(a * 14) * 9 * u;
        g[k ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
      }
      g.stroke();
    } else if (style === 'survey') {
      circle(R - 3 * u, 2.5 * u);
      ticks(R - 28 * u, R - 6 * u, 120, 2 * u, 10, 0);
      ticks(R - 18 * u, R - 6 * u, 360, 1 * u);
      circle(R - 34 * u, 2 * u);
      for (let k = 0; k < 4; k++) {
        g.save();
        g.rotate(k * Math.PI / 2);
        g.lineWidth = 6 * u;
        g.beginPath();
        g.moveTo(R - 50 * u, 0);
        g.lineTo(R - 90 * u, 0);
        g.stroke();
        g.beginPath();
        g.arc(R - 50 * u, 0, 6 * u, 0, TAU);
        g.fill();
        g.restore();
      }
    } else {
      // Hazard: striped band between two heavy rings.
      circle(R - 4 * u, 7 * u);
      circle(R - 44 * u, 4 * u);
      g.lineWidth = 10 * u;
      for (let k = 0; k < 40; k++) {
        const a = k * TAU / 40;
        g.beginPath();
        g.moveTo(Math.cos(a) * (R - 40 * u), Math.sin(a) * (R - 40 * u));
        g.lineTo(Math.cos(a + 0.09) * (R - 8 * u), Math.sin(a + 0.09) * (R - 8 * u));
        g.stroke();
      }
    }
  } else {
    const r = R * 0.62;
    if (style === 'kinetic') {
      poly(r, 6, 0, 5 * u);
      poly(r * 0.86, 6, 0, 2 * u);
      g.lineWidth = 3 * u;
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = k * TAU / 6;
        g.moveTo(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86);
        g.lineTo(Math.cos(a + TAU / 3) * r * 0.86, Math.sin(a + TAU / 3) * r * 0.86);
      }
      g.stroke();
      circle(r * 0.32, 6 * u);
      circle(r * 0.22, 2 * u, [5 * u, 6 * u]);
    } else if (style === 'resonance') {
      poly(r, 4, 0, 3 * u);
      poly(r, 4, Math.PI / 4, 3 * u);
      poly(r * 0.7, 3, -Math.PI / 2, 3 * u);
      poly(r * 0.7, 3, Math.PI / 2, 3 * u);
      circle(r * 0.35, 3 * u);
      for (let k = 0; k < 8; k++) {
        const a = k * TAU / 8;
        g.beginPath();
        g.arc(Math.cos(a) * r, Math.sin(a) * r, 8 * u, 0, TAU);
        g.fill();
      }
      runes(r * 0.52, 8, 26 * u);
    } else if (style === 'restorative') {
      for (let k = 0; k < 6; k++) {
        g.save();
        g.rotate(k * TAU / 6);
        g.lineWidth = 3.5 * u;
        g.beginPath();
        g.ellipse(r * 0.45, 0, r * 0.45, r * 0.17, 0, 0, TAU);
        g.stroke();
        g.restore();
      }
      circle(r * 0.2, 4 * u);
      g.lineWidth = 12 * u;
      g.beginPath();
      g.moveTo(-r * 0.12, 0);
      g.lineTo(r * 0.12, 0);
      g.moveTo(0, -r * 0.12);
      g.lineTo(0, r * 0.12);
      g.stroke();
    } else if (style === 'survey') {
      for (const f of [1, 0.75, 0.5, 0.25]) circle(r * f, 2 * u, f === 1 ? null : [8 * u, 8 * u]);
      g.lineWidth = 2 * u;
      g.beginPath();
      for (let k = -4; k <= 4; k++) {
        const x = k * r / 4;
        const y = Math.sqrt(Math.max(0, r * r - x * x));
        g.moveTo(x, -y);
        g.lineTo(x, y);
        g.moveTo(-y, x);
        g.lineTo(y, x);
      }
      g.stroke();
      g.lineWidth = 6 * u;
      g.beginPath();
      g.arc(0, 0, r, -0.35, 0.35);
      g.stroke();
    } else {
      g.lineWidth = 7 * u;
      for (let k = 0; k < 8; k++) {
        g.save();
        g.rotate(k * TAU / 8);
        for (const d of [0.35, 0.6, 0.85]) {
          g.beginPath();
          g.moveTo(r * (d + 0.1), -r * 0.09);
          g.lineTo(r * d, 0);
          g.lineTo(r * (d + 0.1), r * 0.09);
          g.stroke();
        }
        g.restore();
      }
      circle(r * 0.2, 5 * u);
    }
  }
  return c;
}

export function drawSigil(style, size = 512) {
  if (!SIGIL_STYLES.includes(style)) throw Error('unknown sigil style');
  const rand = rng(0x5e11 + SIGIL_STYLES.indexOf(style) * 977);
  const outer = ringLayer(size, style, 'outer', rand);
  const inner = ringLayer(size, style, 'inner', rand);
  const c = canvas(size);
  const g = c.getContext('2d');
  const read = (cv) => cv.getContext('2d').getImageData(0, 0, size, size).data;
  const a = read(outer);
  const b = read(inner);
  const img = g.createImageData(size, size);
  const h = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const r = Math.hypot(x - h, y - h) / h;
      const wash = r > 1 ? 0 : Math.pow(1 - r, 0.6) * 0.55 + Math.exp(-Math.pow((r - 0.93) * 9, 2)) * 0.45;
      img.data[i] = a[i + 3];
      img.data[i + 1] = b[i + 3];
      img.data[i + 2] = Math.round(Math.min(1, wash) * 255);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function drawCrack(size = 512) {
  const c = canvas(size);
  const g = c.getContext('2d');
  const rand = rng(0xc4ac);
  const h = size / 2;
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  // G: scorch blotch
  const s = canvas(size);
  const sg = s.getContext('2d');
  for (let k = 0; k < 40; k++) {
    const a = rand() * TAU;
    const d = Math.pow(rand(), 1.5) * h * 0.55;
    const grd = sg.createRadialGradient(h + Math.cos(a) * d, h + Math.sin(a) * d, 0, h + Math.cos(a) * d, h + Math.sin(a) * d, h * (0.2 + rand() * 0.35));
    grd.addColorStop(0, 'rgba(255,255,255,0.22)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    sg.fillStyle = grd;
    sg.fillRect(0, 0, size, size);
  }
  // R: branching fracture lines
  const l = canvas(size);
  const lg = l.getContext('2d');
  lg.strokeStyle = '#fff';
  lg.lineCap = 'round';
  const branch = (x, y, a, len, w, depth) => {
    let px = x;
    let py = y;
    lg.lineWidth = w;
    lg.beginPath();
    lg.moveTo(px, py);
    const steps = 6;
    for (let k = 0; k < steps; k++) {
      a += (rand() - 0.5) * 0.7;
      px += Math.cos(a) * len / steps;
      py += Math.sin(a) * len / steps;
      lg.lineTo(px, py);
      if (depth > 0 && rand() < 0.28) {
        lg.stroke();
        branch(px, py, a + (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 0.6), len * 0.45, w * 0.6, depth - 1);
        lg.lineWidth = w;
        lg.beginPath();
        lg.moveTo(px, py);
      }
    }
    lg.stroke();
  };
  const n = 9;
  for (let k = 0; k < n; k++) branch(h, h, k * TAU / n + rand() * 0.4, h * (0.55 + rand() * 0.35), 5 * size / 512, 2);
  const a = lg.getImageData(0, 0, size, size).data;
  const b = sg.getImageData(0, 0, size, size).data;
  const img = g.createImageData(size, size);
  for (let i = 0; i < a.length; i += 4) {
    img.data[i] = a[i + 3];
    img.data[i + 1] = Math.min(255, b[i + 3] * 1.4);
    img.data[i + 2] = 0;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function drawNoise(size = 256) {
  const c = canvas(size);
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const rand = rng(0x0153);
  const octave = (cells) => {
    const v = Array.from({ length: cells * cells }, rand);
    const at = (x, y) => v[((y % cells) + cells) % cells * cells + (((x % cells) + cells) % cells)];
    return (x, y) => {
      const fx = (x / size) * cells;
      const fy = (y / size) * cells;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = fx - ix;
      const ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
      const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
      return a + (b - a) * sy;
    };
  };
  const os = [octave(4), octave(8), octave(16), octave(32)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let n = 0;
      let amp = 0.5;
      for (const o of os) {
        n += o(x, y) * amp;
        amp *= 0.5;
      }
      const v = Math.round(Math.min(1, n / 0.9375) * 255);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Build THREE textures from the canvases (call once, share everywhere). */
export function buildTextures(THREE) {
  const tex = (cv, { repeat = false, mips = true } = {}) => {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.NoColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.generateMipmaps = mips;
    t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    t.anisotropy = 4;
    return t;
  };
  const sigils = {};
  for (const s of SIGIL_STYLES) sigils[s] = tex(drawSigil(s));
  return { atlas: tex(drawAtlas()), sigils, crack: tex(drawCrack()), noise: tex(drawNoise(), { repeat: true }) };
}
