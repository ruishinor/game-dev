// Static world presentation: terrain, sky, lighting and props.
// Collision comes from shared/world.js; nothing here affects gameplay.

import * as THREE from '/vendor/three/three.module.js';
import { WORLD, ZONES, PROPS, groundHeight, mulberry32 } from '../../shared/world.js';

const matCache = new Map();
/** Cached flat-shaded standard material. */
export function mat(color, o = {}) {
  const key = `${color}|${o.rough ?? ''}|${o.metal ?? ''}|${o.emissive ?? ''}|${o.ei ?? ''}|${o.opacity ?? ''}|${o.side ?? ''}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      roughness: o.rough ?? 0.9,
      metalness: o.metal ?? 0.05,
      emissive: o.emissive ?? 0x000000,
      emissiveIntensity: o.ei ?? 1,
      transparent: o.opacity !== undefined,
      opacity: o.opacity ?? 1,
      side: o.side ?? THREE.FrontSide,
    });
    matCache.set(key, m);
  }
  return m;
}

const glowCache = new Map();
/** Unlit, self-luminous material for lights, runes and energy. */
export function glow(color, opacity) {
  const key = `${color}|${opacity ?? ''}`;
  let m = glowCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: opacity !== undefined, opacity: opacity ?? 1, depthWrite: opacity === undefined });
    glowCache.set(key, m);
  }
  return m;
}

export function mesh(geo, material, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  return m;
}

const smooth = (t) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};
const hash = (x, z) => {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();
function groundColor(x, z, out) {
  const n = hash(Math.round(x * 3), Math.round(z * 3));
  out.setHex(0x24443a).lerp(tmpA.setHex(0x3d6e55), n * 0.8);
  const blend = (zone, radius, c1, c2) => {
    const w = smooth(1 - (Math.hypot(x - zone.x, z - zone.z) - radius * 0.55) / (radius * 0.6));
    if (w > 0) out.lerp(tmpB.setHex(c1).lerp(tmpA.setHex(c2), n), w);
  };
  blend(ZONES.sporefield, 24, 0x3a2247, 0x5b2f66);
  blend(ZONES.relay, 20, 0x4a443f, 0x625646);
  blend(ZONES.vault, 19, 0x34334f, 0x4a4870);
  blend(ZONES.obelisk, 9, 0x223f5c, 0x2f5a78);
  blend(ZONES.sanctum, 15, 0x4d6670, 0x5f7c86);
  const edge = smooth((Math.hypot(x, z) - (WORLD.radius - 12)) / 9);
  if (edge > 0) out.lerp(tmpB.setHex(0x2c2b36).lerp(tmpA.setHex(0x45434f), n), edge);
  return out;
}

function buildGround() {
  const size = (WORLD.radius + 34) * 2;
  const seg = 170;
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, Math.min(46, groundHeight(x, z)));
    groundColor(x, z, c);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 }));
  m.receiveShadow = true;
  return m;
}

function buildSky() {
  const group = new THREE.Group();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(420, 24, 14),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x070b22) },
        mid: { value: new THREE.Color(0x253367) },
        low: { value: new THREE.Color(0xc77b8c) },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader:
        'uniform vec3 top; uniform vec3 mid; uniform vec3 low; varying vec3 vP;' +
        'void main(){ float h = normalize(vP).y; vec3 c = mix(low, mid, smoothstep(-0.05, 0.28, h)); c = mix(c, top, smoothstep(0.25, 0.85, h)); gl_FragColor = vec4(c, 1.0); }',
    })
  );
  group.add(sky);

  const rnd = mulberry32(4242);
  const pts = [];
  for (let i = 0; i < 700; i++) {
    const a = rnd() * Math.PI * 2;
    const y = 0.12 + rnd() * 0.88;
    const r = Math.sqrt(1 - y * y);
    pts.push(Math.cos(a) * r * 400, y * 400, Math.sin(a) * r * 400);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  group.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85, depthWrite: false })));

  // A ringed world and a small ember moon hang over the Reach.
  const far = (color) => new THREE.MeshBasicMaterial({ color, fog: false });
  const planet = new THREE.Mesh(new THREE.SphereGeometry(34, 24, 16), far(0x9fd6d0));
  planet.position.set(-210, 150, -260);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(54, 3.2, 2, 48), far(0xd9c7a8));
  ring.rotation.set(1.25, 0.3, 0);
  planet.add(ring);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 12), far(0xffb27a));
  moon.position.set(250, 120, 190);
  group.add(planet, moon);
  return group;
}

/**
 * Image-based lighting generated from a simple sky: metals and glossy surfaces
 * need something to reflect, and a real HDRI is not worth a download here.
 * Brighter and less saturated than the visible sky on purpose.
 */
export function makeEnvironment(renderer) {
  const env = new THREE.Scene();
  const geo = new THREE.SphereGeometry(40, 32, 16);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const stops = [
    [-1, 0x1f1c26],
    [-0.08, 0x3a3340],
    [0.02, 0xe2b0a8],
    [0.3, 0x8f9ad0],
    [1, 0x39508f],
  ];
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / 40;
    let k = 0;
    while (k < stops.length - 2 && h > stops[k + 1][0]) k++;
    const f = Math.min(1, Math.max(0, (h - stops[k][0]) / (stops[k + 1][0] - stops[k][0])));
    c.setHex(stops[k][1]).lerp(tmpA.setHex(stops[k + 1][1]), f);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  env.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const sun = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe2c0).multiplyScalar(6) }));
  sun.position.set(-0.55, 0.72, 0.42).multiplyScalar(36);
  env.add(sun);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(env, 0.03).texture;
  pmrem.dispose();
  geo.dispose();
  return texture;
}

// --- prop builders -----------------------------------------------------------

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  cone5: new THREE.ConeGeometry(1, 1, 5),
  sph: new THREE.SphereGeometry(1, 10, 8),
  ico: new THREE.IcosahedronGeometry(1, 0),
  oct: new THREE.OctahedronGeometry(1, 0),
  torus: new THREE.TorusGeometry(1, 0.05, 6, 28),
};

function scaled(geo, material, sx, sy, sz, x = 0, y = 0, z = 0, shadow = true) {
  const m = mesh(geo, material, x, y, z, shadow);
  m.scale.set(sx, sy, sz);
  return m;
}

function jitteredRock(seed) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const rnd = mulberry32(seed);
  const pos = g.attributes.position;
  // Shared vertices must move together or the rock tears: key by position.
  const moved = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let k = moved.get(key);
    if (k === undefined) {
      k = 0.78 + rnd() * 0.42;
      moved.set(key, k);
    }
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}
const rockGeos = [1, 2, 3, 4, 5].map((s) => jitteredRock(s * 977));

const builders = {
  beacon(p, anim) {
    const g = new THREE.Group();
    g.add(scaled(G.cyl8, mat(0x394750, { metal: 0.4, rough: 0.6 }), 1.9, 1.1, 1.9, 0, 0.55, 0));
    const spire = mesh(new THREE.CylinderGeometry(0.45, 1.05, 8, 6), mat(0x8fa3ad, { metal: 0.3, rough: 0.5 }), 0, 5, 0);
    g.add(spire);
    const core = scaled(G.oct, glow(0x8ff2ff), 0.75, 1.2, 0.75, 0, 10.4, 0, false);
    g.add(core);
    const rings = [];
    for (let i = 0; i < 3; i++) {
      const r = scaled(G.torus, glow(0x6fe6ff), 1.5 + i * 0.35, 1.5 + i * 0.35, 1.5, 0, 4 + i * 2, 0, false);
      r.rotation.x = Math.PI / 2;
      rings.push(r);
      g.add(r);
    }
    const beam = mesh(new THREE.CylinderGeometry(0.22, 0.22, 70, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x7fe8ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 45, 0, false);
    g.add(beam);
    const light = new THREE.PointLight(0x7fe8ff, 90, 36, 1.8);
    light.position.set(0, 6, 0);
    g.add(light);
    anim.push((dt, t) => {
      core.rotation.y = t * 0.8;
      core.position.y = 10.4 + Math.sin(t * 1.3) * 0.2;
      rings.forEach((r, i) => {
        r.rotation.z = t * (0.5 + i * 0.2) * (i % 2 ? -1 : 1);
        r.position.y = 4 + i * 2 + Math.sin(t * 0.9 + i * 2) * 0.25;
      });
    });
    return g;
  },
  pylon(p) {
    const g = new THREE.Group();
    const slab = scaled(G.box, mat(0x7c8d96, { metal: 0.3, rough: 0.6 }), 1.1, p.h, 0.7, 0, p.h / 2, 0);
    g.add(slab);
    g.add(scaled(G.box, glow(0x6fe6ff), 0.14, p.h * 0.7, 0.72, 0, p.h * 0.5, 0, false));
    g.add(scaled(G.box, mat(0x394750, { metal: 0.4 }), 1.5, 0.35, 1.1, 0, 0.17, 0));
    g.rotation.y = p.rot;
    g.rotation.x = -0.08;
    return g;
  },
  console(p) {
    const g = new THREE.Group();
    g.add(scaled(G.box, mat(0x3c4a52, { metal: 0.5, rough: 0.5 }), p.hw * 2, 0.9, p.hd * 2, 0, 0.45, 0));
    const screen = scaled(G.box, glow(0x5fffd0), p.hw * 1.7, 0.6, 0.05, 0, 1.2, -0.1, false);
    screen.rotation.x = -0.5;
    g.add(screen);
    return g;
  },
  crate(p) {
    const g = new THREE.Group();
    g.add(scaled(G.box, mat(0x5b5a4c, { rough: 0.8 }), p.hw * 2, p.h, p.hd * 2, 0, p.h / 2, 0));
    g.add(scaled(G.box, mat(0x2c3338, { metal: 0.5 }), p.hw * 2.06, 0.12, p.hd * 2.06, 0, p.h * 0.75, 0));
    g.add(scaled(G.box, glow(0xffb45c), 0.2, 0.2, 0.05, p.hw * 0.5, p.h * 0.4, p.hd + 0.01, false));
    return g;
  },
  sporetree(p, anim) {
    const g = new THREE.Group();
    const rnd = mulberry32(p.seed);
    const s = p.s;
    const stem = mesh(new THREE.CylinderGeometry(0.22 * s, 0.5 * s, 3.4 * s, 6), mat(0x6d5a7a), 0, 1.7 * s, 0);
    g.add(stem);
    const cap = scaled(G.sph, mat(0x8f3f94, { emissive: 0x3a1040, ei: 0.6 }), 1.9 * s, 0.75 * s, 1.9 * s, 0, 3.5 * s, 0);
    g.add(cap);
    g.add(scaled(G.sph, mat(0xc9a6d6, { emissive: 0x5a2a66, ei: 0.5 }), 1.5 * s, 0.25 * s, 1.5 * s, 0, 3.3 * s, 0, false));
    const spots = [];
    for (let i = 0; i < 6; i++) {
      const a = rnd() * Math.PI * 2;
      const r = (0.5 + rnd() * 1.1) * s;
      const spot = scaled(G.sph, glow(0xffa6f2), 0.12 * s, 0.12 * s, 0.12 * s, Math.sin(a) * r, 3.15 * s - rnd() * 0.5 * s, Math.cos(a) * r, false);
      spots.push(spot);
      g.add(spot);
    }
    g.rotation.z = (rnd() - 0.5) * 0.2;
    g.rotation.y = rnd() * 6;
    const ph = rnd() * 6;
    anim.push((dt, t) => {
      const k = 0.8 + Math.sin(t * 1.4 + ph) * 0.2;
      for (const sp of spots) sp.scale.setScalar(0.12 * s * k);
    });
    return g;
  },
  pod(p, anim) {
    const g = new THREE.Group();
    const s = p.s;
    g.add(scaled(G.sph, mat(0x3f6b52, { rough: 0.7 }), 0.95 * s, 0.75 * s, 0.95 * s, 0, 0.55 * s, 0));
    const eye = scaled(G.sph, glow(0x9dffb0), 0.42 * s, 0.3 * s, 0.42 * s, 0, 1.05 * s, 0, false);
    g.add(eye);
    const ph = p.x;
    anim.push((dt, t) => eye.scale.setScalar(0.38 * s * (0.85 + Math.sin(t * 2 + ph) * 0.15)));
    return g;
  },
  relaytower(p, anim) {
    const g = new THREE.Group();
    const rust = mat(0x6b5a4e, { metal: 0.5, rough: 0.7 });
    g.add(scaled(G.cyl8, mat(0x4a4744, { metal: 0.4 }), 2.5, 1.4, 2.5, 0, 0.7, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.9, 1.4, 9, 8), rust, 0, 5.9, 0));
    const top = mesh(new THREE.CylinderGeometry(0.5, 0.9, 4.5, 8), rust, 0.9, 11.6, 0.3);
    top.rotation.z = -0.55;
    g.add(top);
    for (let i = 0; i < 3; i++) {
      const arm = scaled(G.box, mat(0x3d3b3a, { metal: 0.6 }), 5 - i, 0.18, 0.18, 0, 4 + i * 2.4, 0);
      arm.rotation.y = i * 1.1;
      g.add(arm);
    }
    const lamp = scaled(G.sph, glow(0xff5a4a), 0.28, 0.28, 0.28, 0, 10.6, 0, false);
    g.add(lamp);
    anim.push((dt, t) => {
      lamp.visible = Math.sin(t * 3) > -0.2;
    });
    return g;
  },
  wall(p, anim) {
    const g = new THREE.Group();
    const rnd = mulberry32(Math.round(p.x * 31 + p.z * 17));
    const stone = mat(0x5c5750, { rough: 0.95 });
    g.add(scaled(G.box, stone, p.hw * 2, p.h, p.hd * 2, 0, p.h / 2, 0));
    const long = p.hw > p.hd;
    const len = (long ? p.hw : p.hd) * 2;
    for (let i = 0; i < 4; i++) {
      const o = (rnd() - 0.5) * len * 0.85;
      const h = 0.4 + rnd() * 1.1;
      g.add(scaled(G.box, stone, long ? 1.1 : p.hd * 2, h, long ? p.hd * 2 : 1.1, long ? o : 0, p.h + h / 2 - 0.05, long ? 0 : o));
    }
    const strip = scaled(G.box, glow(0xff8a3c), long ? len * 0.8 : 0.06, 0.08, long ? 0.06 : len * 0.8, long ? 0 : p.hw + 0.02, p.h * 0.45, long ? p.hd + 0.02 : 0, false);
    g.add(strip);
    const ph = rnd() * 9;
    anim.push((dt, t) => {
      strip.visible = Math.sin(t * 7 + ph) + Math.sin(t * 2.3 + ph) > -1.2;
    });
    return g;
  },
  dish(p) {
    const g = new THREE.Group();
    const bowl = mesh(new THREE.SphereGeometry(p.r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x8a8f92, { metal: 0.5, rough: 0.5, side: THREE.DoubleSide }), 0, 1.4, 0);
    bowl.rotation.set(Math.PI * 0.82, 0, 0.3);
    g.add(bowl);
    g.add(scaled(G.cyl6, mat(0x3d3b3a, { metal: 0.6 }), 0.25, 1.6, 0.25, 0, 0.8, 0));
    return g;
  },
  monolith(p, anim) {
    const g = new THREE.Group();
    const stone = mat(0x4d4b68, { rough: 0.8, metal: 0.15 });
    const slab = scaled(G.box, stone, 2.0, p.h, 1.3, 0, p.h / 2, 0);
    g.add(slab);
    const runes = [];
    for (let i = 0; i < 3; i++) {
      const r = scaled(G.box, glow(0xb48cff), 0.5 - i * 0.1, 0.14, 0.05, 0, p.h * (0.35 + i * 0.17), -0.67, false);
      runes.push(r);
      g.add(r);
    }
    const shard = scaled(G.oct, stone, 0.6, 0.9, 0.5, 0, p.h + 1.3, 0);
    g.add(shard);
    g.rotation.y = p.rot;
    g.rotation.x = ((p.h * 13) % 7) * 0.012 - 0.04;
    const ph = p.rot * 3;
    anim.push((dt, t) => {
      shard.position.y = p.h + 1.3 + Math.sin(t * 0.8 + ph) * 0.3;
      shard.rotation.y = t * 0.4 + ph;
      const on = 0.6 + Math.sin(t * 1.6 + ph) * 0.4;
      runes.forEach((r, i) => (r.visible = on > i * 0.25));
    });
    return g;
  },
  rock(p) {
    const m = mesh(rockGeos[p.seed % rockGeos.length], mat(p.s > 2 ? 0x3b4a55 : 0x4c5560, { rough: 1 }));
    m.scale.set(p.r * 1.12, p.h * 0.75, p.r * 1.12);
    m.position.y = p.h * 0.28;
    m.rotation.y = p.seed % 6;
    return m;
  },
  crystal(p, anim) {
    const g = new THREE.Group();
    const rnd = mulberry32(p.seed);
    const m = mat(0x57d6e8, { emissive: 0x1b8fa8, ei: 0.9, rough: 0.3, metal: 0.2, opacity: 0.92 });
    const n = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const h = (1.4 + rnd() * 1.6) * p.s;
      const c = scaled(G.cone5, m, 0.33 * p.s, h, 0.33 * p.s, (rnd() - 0.5) * 0.7 * p.s, h * 0.45, (rnd() - 0.5) * 0.7 * p.s);
      c.rotation.set((rnd() - 0.5) * 0.7, rnd() * 6, (rnd() - 0.5) * 0.7);
      g.add(c);
    }
    return g;
  },
  conduit(p, anim) {
    // A "conduit tree": grown wood threaded with old cabling and light.
    const g = new THREE.Group();
    const rnd = mulberry32(p.seed);
    const s = p.s;
    const bark = mat(0x2c3a35, { rough: 0.9 });
    let y = 0;
    let lean = 0;
    for (let i = 0; i < 3; i++) {
      const h = (1.6 + rnd() * 0.5) * s;
      const seg = mesh(new THREE.CylinderGeometry((0.34 - i * 0.08) * s, (0.44 - i * 0.08) * s, h, 6), bark, lean, y + h / 2, 0);
      seg.rotation.z = (rnd() - 0.5) * 0.25;
      g.add(seg);
      const band = scaled(G.torus, mat(0x8a8f92, { metal: 0.8, rough: 0.3 }), (0.42 - i * 0.08) * s, (0.42 - i * 0.08) * s, 1.5 * s, lean, y + h * 0.9, 0);
      band.rotation.x = Math.PI / 2;
      g.add(band);
      y += h * 0.95;
      lean += (rnd() - 0.5) * 0.3 * s;
    }
    const hue = rnd() < 0.5 ? 0x9dffb0 : 0xffd27a;
    const bulbs = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + rnd();
      const r = 0.9 * s;
      const branch = scaled(G.cyl6, bark, 0.07 * s, 1.2 * s, 0.07 * s, lean + Math.sin(a) * r * 0.5, y + 0.2 * s, Math.cos(a) * r * 0.5);
      branch.rotation.set(Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9);
      g.add(branch);
      const bulb = scaled(G.sph, glow(hue), 0.24 * s, 0.3 * s, 0.24 * s, lean + Math.sin(a) * r, y + 0.55 * s, Math.cos(a) * r, false);
      bulbs.push(bulb);
      g.add(bulb);
    }
    const ph = rnd() * 6;
    anim.push((dt, t) => {
      bulbs.forEach((b, i) => b.scale.setScalar(0.24 * s * (0.9 + Math.sin(t * 1.1 + ph + i) * 0.12)));
    });
    return g;
  },
};

function buildDecor(scene) {
  const rnd = mulberry32(1337);
  // Ground cover: thousands of tiny blades in one draw call.
  const count = 2600;
  const blades = new THREE.InstancedMesh(new THREE.ConeGeometry(0.07, 0.55, 3), new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1 }), count);
  const dummy = new THREE.Object3D();
  const c = new THREE.Color();
  let n = 0;
  let guard = 0;
  while (n < count && guard++ < count * 4) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * (WORLD.radius - 8);
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (Math.hypot(x, z) < 15 || Math.hypot(x - ZONES.vault.x, z - ZONES.vault.z) < 15) continue;
    const s = 0.7 + rnd() * 1.4;
    dummy.position.set(x, groundHeight(x, z) + 0.22 * s, z);
    dummy.rotation.set((rnd() - 0.5) * 0.4, rnd() * 6, (rnd() - 0.5) * 0.4);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    blades.setMatrixAt(n, dummy.matrix);
    const inSpore = Math.hypot(x - ZONES.sporefield.x, z - ZONES.sporefield.z) < 22;
    c.setHex(inSpore ? 0xa84fb0 : 0x4f9a6c).multiplyScalar(0.7 + rnd() * 0.5);
    blades.setColorAt(n, c);
    n++;
  }
  blades.count = n;
  blades.instanceMatrix.needsUpdate = true;
  if (blades.instanceColor) blades.instanceColor.needsUpdate = true;
  scene.add(blades);

  // Way-lights from the Sanctum toward each landmark.
  const post = new THREE.CylinderGeometry(0.06, 0.09, 1.3, 5);
  for (const key of ['sporefield', 'relay', 'vault']) {
    const zn = ZONES[key];
    const d = Math.hypot(zn.x, zn.z);
    const colour = key === 'sporefield' ? 0xffa6f2 : key === 'relay' ? 0xffb45c : 0xb48cff;
    for (let t = 17; t < d - zn.r + 2; t += 8) {
      const side = Math.round(t / 8) % 2 ? 1 : -1;
      const x = (zn.x / d) * t + (-zn.z / d) * side * 1.6;
      const z = (zn.z / d) * t + (zn.x / d) * side * 1.6;
      const y = groundHeight(x, z);
      scene.add(mesh(post, mat(0x394750, { metal: 0.5 }), x, y + 0.65, z, false));
      scene.add(scaled(G.sph, glow(colour), 0.14, 0.14, 0.14, x, y + 1.4, z, false));
    }
  }

  // Drifting spores over the bog.
  const pts = [];
  for (let i = 0; i < 220; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 22;
    const x = ZONES.sporefield.x + Math.sin(a) * r;
    const z = ZONES.sporefield.z + Math.cos(a) * r;
    pts.push(x, groundHeight(x, z) + 0.5 + rnd() * 5, z);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const spores = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffb8f5, size: 0.14, transparent: true, opacity: 0.8, depthWrite: false }));
  scene.add(spores);
  return (dt, t) => {
    spores.position.y = Math.sin(t * 0.4) * 0.4;
    spores.position.x = Math.sin(t * 0.17) * 0.6;
  };
}

/** Build the whole static world. Returns {update, sun}. */
export function buildWorld(scene) {
  scene.fog = new THREE.Fog(0x4c4868, 55, 250);
  scene.add(buildSky());
  scene.add(buildGround());

  scene.add(new THREE.HemisphereLight(0x9db4ff, 0x3a2c44, 1.35));
  const sun = new THREE.DirectionalLight(0xffd9b4, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -42;
  sc.right = 42;
  sc.top = 42;
  sc.bottom = -42;
  sc.near = 1;
  sc.far = 220;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.4;
  scene.add(sun, sun.target);

  // Sanctum floor: a level dais with an inlaid ring of light.
  const dais = mesh(new THREE.CylinderGeometry(13, 13.6, 0.5, 40), mat(0x56666e, { rough: 0.7, metal: 0.2 }), 0, 0.2, 0);
  dais.castShadow = false;
  scene.add(dais);
  const inlay = mesh(new THREE.RingGeometry(8.6, 8.9, 48), glow(0x6fe6ff, 0.7), 0, 0.47, 0, false);
  inlay.rotation.x = -Math.PI / 2;
  scene.add(inlay);
  const safe = mesh(new THREE.RingGeometry(12.7, 12.95, 64), glow(0x6fe6ff, 0.45), 0, 0.47, 0, false);
  safe.rotation.x = -Math.PI / 2;
  scene.add(safe);

  // Vault floor: concentric rune rings.
  for (const [r0, r1] of [[5, 5.2], [10, 10.25], [13.4, 13.6]]) {
    const ring = mesh(new THREE.RingGeometry(r0, r1, 56), glow(0xb48cff, 0.4), ZONES.vault.x, -0.5, ZONES.vault.z, false);
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);
  }
  const vaultLight = new THREE.PointLight(0xa07cff, 70, 34, 1.8);
  vaultLight.position.set(ZONES.vault.x, 6, ZONES.vault.z);
  scene.add(vaultLight);

  const anim = [];
  for (const p of PROPS) {
    const build = builders[p.type];
    if (!build) continue;
    const obj = build(p, anim);
    obj.position.x += p.x;
    obj.position.z += p.z;
    obj.position.y += groundHeight(p.x, p.z) - 0.15;
    scene.add(obj);
  }
  anim.push(buildDecor(scene));

  const dir = new THREE.Vector3(-0.55, 0.72, 0.42).normalize();
  return {
    sun,
    update(dt, t, focus) {
      for (const fn of anim) fn(dt, t);
      // Keep the shadow frustum centred on the player.
      sun.target.position.set(focus.x, focus.y, focus.z);
      sun.position.set(focus.x + dir.x * 90, focus.y + dir.y * 90, focus.z + dir.z * 90);
    },
  };
}
