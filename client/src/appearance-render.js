// Renders a character's appearance (shared/appearance.js) onto a humanoid:
// skin, a race's head features, a face, and hair. Presentation only.
//
// Everything is built in bind-pose model space (T-pose, +Z forward, feet at
// y = 0) and handed to the Head bone, like looks.js gear. Geometry is cached
// per (frame, style) and textures per (race, skin, colour), flagged shared,
// so a crowd of characters costs a handful of draw calls each and no
// per-character geometry.
//
// THREE is injected so the geometry rules are testable in Node; canvas
// textures are skipped there.
import { RACES, HAIR_COLOURS } from '../../shared/appearance.js';
import { mergeGeometries } from './gear-kit.js';

const TAU = Math.PI * 2;

/**
 * Skull ellipsoids per frame, measured from the bind pose of the shipped
 * humanoid bodies (vertices weighted >= 0.9 to Head; see docs/art/CHARACTER-APPEARANCE.md).
 * c = centre, r = radii (x, y, z), all in model metres.
 */
export const HEAD = {
  m: { c: [0, 1.676, -0.018], r: [0.089, 0.107, 0.119], neckY: 1.569 },
  f: { c: [0, 1.692, -0.006], r: [0.09, 0.115, 0.12], neckY: 1.577 },
};

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
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hexCss = (hex, k = 1) => {
  const c = (s) => Math.max(0, Math.min(255, Math.round(((hex >> s) & 255) * k)));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
};

/** Hairline: normalised height above which the scalp carries hair, by direction. */
export function hairline(nz) {
  return nz >= 0 ? -0.08 + 0.5 * smooth(0, 0.75, nz) : -0.08 - 0.5 * smooth(0, -0.9, nz);
}

// --- geometry -----------------------------------------------------------------------

/** A scalp shell: ellipsoid triangles kept by `keep(n)`, pushed out by `lift(n)`. */
function scalp(THREE, head, keep, lift, segs = [40, 26]) {
  const g = new THREE.SphereGeometry(1, segs[0], segs[1]);
  const p = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  const n = new THREE.Vector3();
  const [cx, cy, cz] = head.c;
  const [rx, ry, rz] = head.r;
  const ok = new Uint8Array(p.count);
  for (let i = 0; i < p.count; i++) {
    n.fromBufferAttribute(p, i);
    ok[i] = keep(n) ? 1 : 0;
    const l = lift(n);
    p.setXYZ(i, cx + n.x * (rx + l), cy + n.y * (ry + l), cz + n.z * (rz + l));
    // strands run crown -> tips: u wraps the head, v follows latitude
    uv.setXY(i, (Math.atan2(n.x, n.z) / TAU + 0.5) * 4, 1 - Math.acos(Math.max(-1, Math.min(1, n.y))) / Math.PI);
  }
  const idx = g.index.array;
  const kept = [];
  for (let i = 0; i < idx.length; i += 3) if (ok[idx[i]] && ok[idx[i + 1]] && ok[idx[i + 2]]) kept.push(idx[i], idx[i + 1], idx[i + 2]);
  g.setIndex(kept);
  g.computeVertexNormals();
  return g;
}

/** A tube along points whose radius tapers from r0 to r1; v runs along the tube. */
function taperTube(THREE, points, r0, r1, segs = 14, radial = 6) {
  const curve = new THREE.CatmullRomCurve3(points.map((q) => new THREE.Vector3(...q)));
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const p = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  const frames = curve.computeFrenetFrames(segs, false);
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    curve.getPointAt(i / segs, c);
    const r = r0 + (r1 - r0) * Math.pow(i / segs, 0.8);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(p, k).sub(c).multiplyScalar(r).add(c);
      p.setXYZ(k, v.x, v.y, v.z);
      uv.setXY(k, j / radial, 1 - i / segs);
    }
  }
  void frames;
  g.computeVertexNormals();
  return g;
}

function ellipsoid(THREE, at, s, segs = [16, 12]) {
  const g = new THREE.SphereGeometry(1, segs[0], segs[1]);
  g.scale(...s);
  g.translate(...at);
  return g;
}

/**
 * Hair geometry for a style on a frame: { hair, band } (either may be null).
 * Deterministic; vertices stay within ~0.45 m of the skull centre.
 */
export function hairGeometry(THREE, frame, style) {
  const head = HEAD[frame];
  if (!head || style === 'none') return { hair: null, band: null };
  const [cx, cy, cz] = head.c;
  const [rx, ry, rz] = head.r;
  const r = rng(0x4a1 + style.length * 31 + (frame === 'f' ? 7 : 0));
  const parts = [];
  const bands = [];
  const capKeep = (n) => n.y > hairline(n.z);
  const tight = (n) => 0.006 + 0.004 * (n.y > 0.5 ? 1 : 0);
  const back = (dy, dz) => [cx, cy + dy, cz - rz - dz];
  if (style === 'crop') parts.push(scalp(THREE, head, capKeep, (n) => 0.008 + 0.006 * smooth(0.3, 1, n.y)));
  else if (style === 'undercut') {
    // Long top swept back; the sides are clipped short (a separate tight band).
    parts.push(scalp(THREE, head, (n) => n.y > 0.28 + 0.1 * (n.z > 0 ? 1 : 0) && Math.abs(n.x) < 0.8, (n) => 0.022 + 0.02 * smooth(0.4, 1, n.y) - 0.012 * Math.max(0, -n.z)));
    parts.push(scalp(THREE, head, (n) => capKeep(n) && n.y <= 0.32, () => 0.003));
  } else if (style === 'ponytail' || style === 'bun' || style === 'braids') {
    parts.push(scalp(THREE, head, capKeep, tight));
    if (style === 'ponytail') {
      bands.push(new THREE.TorusGeometry(0.024, 0.008, 6, 14).rotateX(Math.PI / 2.4).translate(...back(-0.005, 0.006)));
      parts.push(taperTube(THREE, [back(0.0, 0.0), back(-0.05, 0.04), back(-0.13, 0.05), back(-0.2, 0.035)], 0.026, 0.008, 16, 8));
    } else if (style === 'bun') {
      parts.push(ellipsoid(THREE, [cx, cy + ry * 0.45, cz - rz * 0.92], [0.05, 0.045, 0.046]));
      bands.push(new THREE.TorusGeometry(0.036, 0.007, 6, 16).rotateX(-0.6).translate(cx, cy + ry * 0.4, cz - rz * 0.86));
    } else {
      for (const s of [-1, 1]) {
        const pts = [[s * rx * 0.72, cy - 0.01, cz - rz * 0.35], [s * rx * 0.95, cy - 0.08, cz - rz * 0.15], [s * 0.1, cy - 0.17, cz + 0.02], [s * 0.115, cy - 0.27, cz + 0.06]];
        parts.push(taperTube(THREE, pts, 0.017, 0.009, 18, 6));
        bands.push(new THREE.TorusGeometry(0.011, 0.004, 6, 10).rotateX(Math.PI / 2).translate(s * 0.115, cy - 0.26, cz + 0.058));
      }
    }
  } else if (style === 'locs') {
    parts.push(scalp(THREE, head, capKeep, (n) => 0.011 + 0.005 * smooth(0.3, 1, n.y)));
    for (let i = 0; i < 16; i++) {
      const a = Math.PI * (0.25 + 1.5 * (i / 15)) + (r() - 0.5) * 0.15; // around the back half
      const nx = Math.sin(a + Math.PI);
      const nz = Math.cos(a + Math.PI);
      const root = [cx + nx * rx * 0.95, cy + ry * (0.15 + r() * 0.3), cz + nz * rz * 0.95];
      const len = 0.17 + r() * 0.08;
      const out = 0.03 + r() * 0.02;
      const pts = [root, [root[0] + nx * out, root[1] - len * 0.4, root[2] + nz * out], [root[0] + nx * out * 1.4, root[1] - len, root[2] + nz * out * 1.2 - 0.01]];
      parts.push(taperTube(THREE, pts, 0.011, 0.007, 10, 5));
    }
  } else if (style === 'mohawk') {
    parts.push(scalp(THREE, head, (n) => capKeep(n) && Math.abs(n.x) < 0.3, (n) => 0.012 + 0.05 * Math.max(0, 1 - Math.abs(n.x) / 0.3) * smooth(-0.6, 0.6, n.y) * (0.75 + 0.25 * Math.sin(Math.acos(Math.max(-1, Math.min(1, n.z))) * 9))));
    parts.push(scalp(THREE, head, (n) => capKeep(n) && Math.abs(n.x) >= 0.28, () => 0.002));
  }
  const out = { hair: mergeGeometries(THREE, parts), band: bands.length ? mergeGeometries(THREE, bands) : null };
  for (const x of [...parts, ...bands]) x.dispose();
  return out;
}

/** Race head features that change silhouette: { skin, chitin, glow } geometries. */
export function featureGeometry(THREE, frame, race) {
  const head = HEAD[frame];
  const [cx, cy, cz] = head.c;
  const [rx, ry, rz] = head.r;
  const skin = [];
  const chitin = [];
  const glow = [];
  if (race === 'human' || race === 'mirekin') {
    // nose and ears break the mannequin egg into a face
    skin.push(ellipsoid(THREE, [cx, cy - ry * 0.18, cz + rz * 0.97], [0.014, 0.026, 0.02]));
    skin.push(ellipsoid(THREE, [cx, cy - ry * 0.33, cz + rz * 0.95], [0.02, 0.012, 0.016]));
    for (const s of [-1, 1]) skin.push(ellipsoid(THREE, [cx + s * rx * 0.99, cy - ry * 0.1, cz - rz * 0.05], [0.011, 0.029, 0.02]));
    // brow ridge
    skin.push(ellipsoid(THREE, [cx, cy + ry * 0.12, cz + rz * 0.86], [rx * 0.82, 0.016, 0.03]));
  }
  if (race === 'veyran') {
    // An elongated, swept-back cranium: the Veyran silhouette.
    skin.push(ellipsoid(THREE, [cx, cy + ry * 0.32, cz - rz * 0.45], [rx * 0.88, ry * 0.78, rz * 1.02], [24, 16]));
    skin.push(ellipsoid(THREE, [cx, cy + ry * 0.55, cz - rz * 0.95], [rx * 0.6, ry * 0.55, rz * 0.7], [20, 14]));
  }
  if (race === 'mirekin') {
    // Chitin crest from brow to nape, cheek plates, and luminous nodules.
    for (let i = 0; i < 6; i++) {
      const t = -0.35 + i * 0.32;
      const ny = Math.cos(t);
      const nz = Math.sin(t);
      const at = [cx, cy + ny * (ry + 0.012), cz - nz * (rz + 0.012) * 1.0 + 0.0];
      const g = ellipsoid(THREE, [0, 0, 0], [0.018 - i * 0.0015, 0.012, 0.034]);
      g.rotateX(-t);
      g.translate(...at);
      chitin.push(g);
    }
    for (const s of [-1, 1]) {
      const g = ellipsoid(THREE, [0, 0, 0], [0.006, 0.03, 0.04]);
      g.rotateY(s * 0.5);
      g.translate(cx + s * rx * 0.93, cy - ry * 0.22, cz + rz * 0.45);
      chitin.push(g);
      for (let k = 0; k < 3; k++) glow.push(ellipsoid(THREE, [cx + s * rx * (0.55 - k * 0.12), cy + ry * (0.5 + k * 0.12), cz - rz * (0.2 + k * 0.25)], [0.006, 0.006, 0.006], [8, 6]));
    }
  }
  const m = (list) => {
    if (!list.length) return null;
    const g = mergeGeometries(THREE, list);
    for (const x of list) x.dispose();
    return g;
  };
  return { skin: m(skin), chitin: m(chitin), glow: m(glow) };
}

/** A face mask: the front of the skull ellipsoid, slightly proud, carrying the painted face. */
export function faceGeometry(THREE, frame) {
  const head = HEAD[frame];
  const [cx, cy, cz] = head.c;
  const [rx, ry, rz] = head.r;
  // phi around Y with +Z at PI/2; theta from the crown.
  const g = new THREE.SphereGeometry(1, 28, 20, Math.PI / 2 - 1.05, 2.1, 0.62, 1.42);
  const p = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    p.setXYZ(i, cx + x * (rx + 0.0025), cy + y * (ry + 0.0025), cz + z * (rz + 0.0025));
    // Map the mask so u spans the face left->right and v forehead->chin.
    uv.setXY(i, 0.5 - Math.atan2(x, z) / 2.1, uv.getY(i));
  }
  g.computeVertexNormals();
  return g;
}

// --- textures (browser) --------------------------------------------------------------

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

/** Painted face for a race/skin; eyes, brows, nose and mouth shading on the skin colour. */
export function paintFace(ap) {
  if (typeof document === 'undefined') return null;
  const R = RACES[ap.race];
  const skin = R.skins[ap.skin];
  const hairHex = HAIR_COLOURS[ap.hairColour].hex;
  const [c, g] = canvas(256);
  const [e, eg] = canvas(256);
  eg.fillStyle = '#000';
  eg.fillRect(0, 0, 256, 256);
  g.fillStyle = hexCss(skin);
  g.fillRect(0, 0, 256, 256);
  const shade = (x, y, rx, ry, a, k = 0.6) => {
    g.save();
    g.translate(x, y);
    g.scale(1, ry / rx);
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    grd.addColorStop(0, `rgba(${k > 1 ? '255,240,225' : '40,22,14'},${a})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(0, 0, rx, 0, TAU);
    g.fill();
    g.restore();
  };
  if (ap.race === 'veyran') {
    // Faceless: fine darker tracery and a faint inner glow along the lines.
    const r = rng(0x7e7 + ap.skin);
    g.strokeStyle = hexCss(skin, 0.55);
    eg.strokeStyle = 'rgba(255,120,90,0.45)';
    for (const ctx of [g, eg]) {
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
    }
    for (let i = 0; i < 9; i++) {
      const x = 128 + (i - 4) * 18 + (r() - 0.5) * 6;
      for (const ctx of [g, eg]) {
        ctx.beginPath();
        ctx.moveTo(128 + (x - 128) * 0.25, 40);
        ctx.bezierCurveTo(x, 90, x + (r() - 0.5) * 30, 150, 128 + (x - 128) * 0.6, 230);
        ctx.stroke();
      }
    }
    shade(128, 120, 80, 60, 0.18);
    return { map: c, emissive: e };
  }
  const mire = ap.race === 'mirekin';
  // structure: temples, eye sockets, cheekbones, nose shadow, jaw
  shade(64, 110, 50, 70, 0.2);
  shade(192, 110, 50, 70, 0.2);
  for (const x of [86, 170]) shade(x, 112, 30, 18, mire ? 0.55 : 0.32);
  for (const x of [80, 176]) shade(x, 150, 28, 14, 0.12, 2);
  shade(128, 150, 12, 26, 0.25);
  shade(128, 236, 120, 36, 0.25);
  // eyes
  const iris = mire ? '#6fe0c8' : ['#4a3322', '#5b4a30', '#3d5a52', '#5a6470'][ap.skin % 4];
  for (const x of [88, 168]) {
    g.fillStyle = mire ? '#1b2422' : '#e7ddd1';
    g.beginPath();
    g.ellipse(x, 114, 15, 6.5, 0, 0, TAU);
    g.fill();
    g.fillStyle = iris;
    g.beginPath();
    g.arc(x, 114, 5.6, 0, TAU);
    g.fill();
    g.fillStyle = '#0c0907';
    g.beginPath();
    g.arc(x, 114, 2.4, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.fillRect(x + 1.5, 111, 2, 2);
    g.strokeStyle = 'rgba(25,14,10,0.85)';
    g.lineWidth = 2.4;
    g.beginPath();
    g.ellipse(x, 115, 16, 7.5, 0, Math.PI * 1.05, Math.PI * 1.95);
    g.stroke();
    if (mire) {
      eg.fillStyle = '#6fe0c8';
      eg.beginPath();
      eg.arc(x, 114, 5, 0, TAU);
      eg.fill();
    }
  }
  // brows in hair colour (Mirekin: bare ridge)
  if (!mire) {
    g.strokeStyle = hexCss(hairHex, 0.9);
    g.lineCap = 'round';
    g.lineWidth = 5;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(128 + s * 18, 96);
      g.quadraticCurveTo(128 + s * 42, 86, 128 + s * 62, 95);
      g.stroke();
    }
  }
  // nose and mouth
  g.strokeStyle = 'rgba(60,32,22,0.35)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(120, 168);
  g.quadraticCurveTo(128, 174, 136, 168);
  g.stroke();
  g.fillStyle = mire ? 'rgba(60,70,72,0.7)' : 'rgba(128,64,56,0.55)';
  g.beginPath();
  g.ellipse(128, 202, 20, 6, 0, 0, TAU);
  g.fill();
  g.strokeStyle = 'rgba(40,18,14,0.7)';
  g.lineWidth = 1.8;
  g.beginPath();
  g.moveTo(108, 202);
  g.quadraticCurveTo(128, 206, 148, 202);
  g.stroke();
  if (mire) {
    // bioluminescent vein lines up the jaw and temples
    const r = rng(0x31e + ap.skin);
    eg.strokeStyle = 'rgba(111,224,200,0.9)';
    g.strokeStyle = 'rgba(30,60,55,0.6)';
    for (const ctx of [g, eg]) ctx.lineWidth = 1.4;
    for (let i = 0; i < 6; i++) {
      const s = i < 3 ? -1 : 1;
      const x0 = 128 + s * (50 + r() * 30);
      for (const ctx of [g, eg]) {
        ctx.beginPath();
        ctx.moveTo(x0, 250);
        ctx.bezierCurveTo(x0 + s * 10, 200, x0 + s * (r() * 20), 150, 128 + s * (70 + r() * 30), 60);
        ctx.stroke();
      }
    }
  }
  // fade every edge to the plain skin so the mask meets the head without a seam
  const edge = g.createRadialGradient(128, 128, 90, 128, 128, 128);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(1, hexCss(skin));
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = edge;
  g.fillRect(0, 0, 256, 256);
  return { map: c, emissive: mire ? e : null };
}

/** Hair strands: grey, multiplied by the hair colour; darker roots, lighter tips. */
export function paintStrands(kind = 'strand') {
  if (typeof document === 'undefined') return null;
  const [c, g] = canvas(256, 256);
  const r = rng(kind === 'braid' ? 0xb4a : 0x57a);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#5c5c5c');
  grd.addColorStop(1, '#b8b8b8');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  if (kind === 'braid') {
    for (let y = -20; y < 276; y += 20) {
      for (const s of [-1, 1]) {
        g.fillStyle = 'rgba(30,30,30,0.5)';
        g.beginPath();
        g.ellipse(128 + s * 40, y, 70, 9, s * 0.5, 0, TAU);
        g.fill();
      }
    }
  }
  for (let i = 0; i < 700; i++) {
    const x = r() * 256;
    const v = 90 + r() * 140;
    g.strokeStyle = `rgba(${v},${v},${v},${0.25 + r() * 0.35})`;
    g.lineWidth = 0.6 + r() * 1.2;
    g.beginPath();
    g.moveTo(x, -5);
    g.bezierCurveTo(x + (r() - 0.5) * 8, 80, x + (r() - 0.5) * 10, 170, x + (r() - 0.5) * 14, 261);
    g.stroke();
  }
  return c;
}

/** Mottled altered skin (Mirekin) for the body: albedo and a sparse vein glow. */
export function paintAlteredSkin(skin) {
  if (typeof document === 'undefined') return null;
  const [c, g] = canvas(256);
  const [e, eg] = canvas(256);
  const r = rng(0xa17 + skin);
  g.fillStyle = hexCss(skin);
  g.fillRect(0, 0, 256, 256);
  eg.fillStyle = '#000';
  eg.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    const x = r() * 256;
    const y = r() * 256;
    const s = 6 + r() * 26;
    const grd = g.createRadialGradient(x, y, 0, x, y, s);
    grd.addColorStop(0, `rgba(${r() < 0.5 ? '40,52,60' : '170,160,190'},${0.18 + r() * 0.2})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - s, y - s, s * 2, s * 2);
  }
  eg.strokeStyle = 'rgba(111,224,200,0.8)';
  g.strokeStyle = 'rgba(30,50,50,0.45)';
  for (let i = 0; i < 14; i++) {
    let x = r() * 256;
    let y = r() * 256;
    for (const ctx of [g, eg]) {
      ctx.lineWidth = 0.8 + r();
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
    for (let k = 0; k < 6; k++) {
      x += (r() - 0.5) * 50;
      y += (r() - 0.5) * 50;
      for (const ctx of [g, eg]) ctx.lineTo(x, y);
    }
    for (const ctx of [g, eg]) ctx.stroke();
  }
  return { map: c, emissive: e };
}

// --- assembly ------------------------------------------------------------------------

export function createAppearanceKit(THREE, { shared = (x) => x } = {}) {
  const geo = new Map();
  const mat = new Map();
  const once = (cache, key, make) => {
    if (!cache.has(key)) cache.set(key, make());
    return cache.get(key);
  };
  const tex = (cv, srgb = true) => {
    if (!cv) return null;
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 4;
    return t;
  };
  // Flag every geometry (including those inside {hair, band} / {skin, chitin, glow}
  // records) shared, so disposing one character never frees what others use.
  const sharedGeo = (key, make) => once(geo, key, () => {
    const g = make();
    if (g?.isBufferGeometry) return shared(g);
    for (const v of Object.values(g || {})) if (v?.isBufferGeometry) shared(v);
    return g;
  });
  const sharedMat = (key, make) => once(mat, key, () => {
    const m = make();
    m.name = `appearance:${key}`;
    return shared(m);
  });

  /** Skin material for exposed race features (and the body tint). */
  function skinMaterial(ap) {
    const R = RACES[ap.race];
    return sharedMat(`skin:${ap.race}:${ap.skin}`, () => {
      const hex = R.skins[ap.skin];
      if (ap.race === 'mirekin') {
        const t = paintAlteredSkin(hex);
        return new THREE.MeshStandardMaterial({ color: t ? 0xffffff : hex, map: tex(t?.map), emissiveMap: tex(t?.emissive), emissive: t ? 0x6fe0c8 : 0x000000, emissiveIntensity: 0.6, roughness: 0.62 });
      }
      return new THREE.MeshStandardMaterial({ color: hex, roughness: ap.race === 'veyran' ? 0.48 : 0.66 });
    });
  }

  /**
   * Attach head features, face and hair to a character.
   * opts.covered: 'helmet' (full head covered: only tails show), 'hood'
   * (the hood shell is hidden when hair is worn), or null.
   */
  function apply(ap, ctx, opts = {}) {
    const frame = ap.frame;
    const meshes = [];
    const add = (g, m, name) => {
      if (!g) return;
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.name = `appearance:${name}`;
      ctx.attach('Head', mesh);
      meshes.push(mesh);
    };
    const helmet = opts.covered === 'helmet';
    if (!helmet) {
      const f = sharedGeo(`feat:${frame}:${ap.race}`, () => featureGeometry(THREE, frame, ap.race));
      add(f.skin, skinMaterial(ap), 'features');
      add(f.chitin, sharedMat('chitin', () => new THREE.MeshStandardMaterial({ color: 0x2c3632, roughness: 0.32, metalness: 0.25 })), 'chitin');
      add(f.glow, sharedMat('nodule', () => new THREE.MeshBasicMaterial({ color: 0x8ff0dc })), 'nodules');
      const faceKey = `${ap.race}:${ap.skin}:${ap.hairColour}`;
      const faceMat = sharedMat(`face:${faceKey}`, () => {
        const t = paintFace(ap);
        return new THREE.MeshStandardMaterial({ color: t ? 0xffffff : RACES[ap.race].skins[ap.skin], map: tex(t?.map), emissiveMap: tex(t?.emissive), emissive: t?.emissive ? (ap.race === 'veyran' ? 0xff6a4a : 0x6fe0c8) : 0x000000, emissiveIntensity: ap.race === 'veyran' ? 0.25 : 0.8, roughness: 0.6 });
      });
      add(sharedGeo(`face:${frame}`, () => faceGeometry(THREE, frame)), faceMat, 'face');
    }
    if (ap.hair !== 'none') {
      const h = sharedGeo(`hair:${frame}:${ap.hair}:${helmet ? 'tails' : 'full'}`, () => {
        const full = hairGeometry(THREE, frame, ap.hair);
        if (!helmet) return full;
        // Under a helmet only what falls below its rim can show.
        const tails = { ...full };
        if (!['ponytail', 'braids', 'locs'].includes(ap.hair)) return { hair: null, band: null };
        const p = full.hair.getAttribute('position');
        const keep = [];
        for (let i = 0; i < p.count; i += 3) {
          if (p.getY(i) < HEAD[frame].c[1] - HEAD[frame].r[1] * 0.4 && p.getY(i + 1) < HEAD[frame].c[1] - HEAD[frame].r[1] * 0.4 && p.getY(i + 2) < HEAD[frame].c[1] - HEAD[frame].r[1] * 0.4) keep.push(i, i + 1, i + 2);
        }
        const g = new THREE.BufferGeometry();
        for (const k of ['position', 'normal', 'uv']) {
          const a = full.hair.getAttribute(k);
          const arr = new Float32Array(keep.length * a.itemSize);
          keep.forEach((v, j) => arr.set(a.array.subarray(v * a.itemSize, v * a.itemSize + a.itemSize), j * a.itemSize));
          g.setAttribute(k, new THREE.BufferAttribute(arr, a.itemSize));
        }
        tails.hair = g;
        return tails;
      });
      const hairHex = HAIR_COLOURS[ap.hairColour].hex;
      const braid = ap.hair === 'braids';
      add(h.hair, sharedMat(`hair:${ap.hairColour}:${braid ? 'braid' : 'strand'}`, () => new THREE.MeshStandardMaterial({ color: hairHex, map: tex(paintStrands(braid ? 'braid' : 'strand')), roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide })), 'hair');
      add(h.band, sharedMat('hairband', () => new THREE.MeshStandardMaterial({ color: 0x3a3226, roughness: 0.8 })), 'hairband');
    }
    return { meshes, skin: skinMaterial(ap) };
  }

  function dispose() {
    for (const g of geo.values()) for (const x of g?.isBufferGeometry ? [g] : Object.values(g || {})) x?.dispose?.();
    for (const m of mat.values()) {
      m.map?.dispose();
      m.emissiveMap?.dispose();
      m.dispose();
    }
    geo.clear();
    mat.clear();
  }
  return { apply, skinMaterial, dispose };
}
