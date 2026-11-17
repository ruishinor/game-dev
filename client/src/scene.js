// Static world presentation: terrain, sky, lighting and props.
// Collision comes from shared/world.js; nothing here affects gameplay.

import * as THREE from '/vendor/three/three.module.js';
import { WORLD, ZONES, PROPS, COLLIDERS, groundHeight, mulberry32 } from '../../shared/world.js';
import { cloneMaterials } from './assets.js';
import { Animator } from './animator.js';
import { STATIC_ART, fitStaticArt, staticArtStatus } from './prototype-art.js';

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
  // Broad, soft variation: the texture supplies the fine detail.
  const n = 0.5 + 0.25 * Math.sin(x * 0.19 + 1.7) * Math.cos(z * 0.23) + 0.25 * Math.sin(x * 0.07 - z * 0.11) + (hash(Math.round(x * 3), Math.round(z * 3)) - 0.5) * 0.12;
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
  blend(ZONES.survey, 20, 0x645043, 0x9b7962);
  const edge = smooth((Math.hypot(x, z) - (WORLD.radius - 12)) / 9);
  if (edge > 0) out.lerp(tmpB.setHex(0x2c2b36).lerp(tmpA.setHex(0x45434f), n), edge);
  return out;
}

function buildGround(assets) {
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
  const albedo = assets && assets.texture('ground_albedo', { repeat: 26 });
  const normal = assets && assets.texture('ground_normal', { repeat: 26, srgb: false });
  let material;
  if (albedo && normal) {
    // Photographic ground detail, tinted per zone by the vertex colours. The
    // albedo is mid-grey and the tints are dark, so lift the product.
    for (let i = 0; i < colors.length; i++) colors[i] = Math.min(1, colors[i] * 3.6 + 0.03);
    material = new THREE.MeshStandardMaterial({ vertexColors: true, map: albedo, normalMap: normal, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.96, metalness: 0, envMapIntensity: 0.35 });
  } else material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });
  const m = new THREE.Mesh(g, material);
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

const procedural = {
  survey_pump(p) {
    const g = new THREE.Group();
    const base = mat(0x494a43, { rough: 0.91 });
    const steel = mat(0x727b78, { rough: 0.57, metal: 0.55 });
    const paint = mat(0x82704f, { rough: 0.82, metal: 0.24 });
    const dark = mat(0x2b3333, { rough: 0.75, metal: 0.4 });
    const add = (geo, material, ...args) => g.add(scaled(geo, material, ...args));
    add(G.box, base, 4.1, 0.45, 2.8, 0, 0.23, 0);
    add(G.box, dark, 3.1, 0.42, 1.9, 0, 0.65, 0);
    const tank = new THREE.CylinderGeometry(0.72, 0.72, 2.1, 20);
    const pipe = new THREE.CylinderGeometry(0.16, 0.16, 1.6, 12);
    for (const side of [-1, 1]) {
      add(tank, paint, 1, 1, 1, side * 0.96, 1.95, 0);
      for (const y of [1.05, 2.72]) add(G.cyl8, steel, 0.77, 0.16, 0.77, side * 0.96, y, 0);
      add(pipe, steel, 1, 1, 1, side * 1.72, 1.28, 0.7);
      add(G.box, dark, 0.23, 1.28, 0.19, side * 1.84, 1.12, -0.75);
    }
    add(G.box, dark, 3.45, 0.28, 0.55, 0, 3.03, 0);
    add(G.box, steel, 1.18, 0.82, 0.66, 0, 2.23, 0.52);
    for (let i = 0; i < 5; i++) add(G.box, dark, 0.84, 0.043, 0.03, 0, 1.96 + i * 0.11, 0.87);
    add(G.box, paint, 0.36, 1.25, 0.34, 0, 3.76, 0);
    add(G.box, steel, 0.83, 0.18, 0.68, 0, 4.46, 0);
    add(G.box, glow(0xe1bc6b), 0.12, 0.055, 0.025, 0.36, 2.55, 0.87, false);
    return g;
  },
  survey_tower(p) { return procedural.survey_pump(p); },
  survey_workstation(p) { return procedural.console(p); },
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


// --- instancing and fading ---------------------------------------------------

/**
 * Collects placements of bundle pieces and emits one InstancedMesh per
 * geometry + material pair, so a prop repeated fifty times is one draw call.
 */
class Batcher {
  /**
   * @param cell side of the square world cells batches are split into, or 0
   *   for one batch per piece. A batch is culled as a whole, so without cells
   *   every instance in the world is submitted every frame (measured: 600k
   *   triangles for a view showing a quarter of them).
   */
  constructor(cell = 0) {
    this.cell = cell;
    this.entries = new Map();
    this.inv = new THREE.Matrix4();
    this.tmp = new THREE.Matrix4();
    this.meshes = [];
  }

  add(piece, matrix, color) {
    piece.updateWorldMatrix(true, true);
    this.inv.copy(piece.matrixWorld).invert();
    const cx = this.cell ? Math.floor(matrix.elements[12] / this.cell) : 0;
    const cz = this.cell ? Math.floor(matrix.elements[14] / this.cell) : 0;
    piece.traverse((o) => {
      if (!o.isMesh) return;
      const key = `${o.geometry.uuid}|${o.material.uuid}|${cx}|${cz}`;
      let e = this.entries.get(key);
      if (!e) {
        e = { geometry: o.geometry, material: o.material, matrices: [], colors: [], tinted: false };
        this.entries.set(key, e);
      }
      e.matrices.push(new THREE.Matrix4().multiplyMatrices(matrix, this.tmp.multiplyMatrices(this.inv, o.matrixWorld)));
      e.colors.push(color || null);
      if (color) e.tinted = true;
    });
  }

  build(scene, { castShadow = true, receiveShadow = true } = {}) {
    const white = new THREE.Color(1, 1, 1);
    let count = 0;
    for (const e of this.entries.values()) {
      const mesh = new THREE.InstancedMesh(e.geometry, e.material, e.matrices.length);
      e.matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
      if (e.tinted) e.colors.forEach((c, i) => mesh.setColorAt(i, c || white));
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      mesh.computeBoundingSphere();
      scene.add(mesh);
      this.meshes.push(mesh);
      count++;
    }
    return count;
  }

  /** Hide batches whose whole cell is farther than `range` from the viewer. */
  cullByDistance(x, z, range) {
    for (const m of this.meshes) {
      const s = m.boundingSphere;
      m.visible = Math.hypot(s.center.x - x, s.center.z - z) - s.radius < range;
    }
  }
}

const P = new THREE.Vector3();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const SC = new THREE.Vector3();
/** Matrix for a prop standing on the terrain at (x, z). */
function at(x, z, { y = 0, ry = 0, rx = 0, rz = 0, s = 1, ground = true } = {}) {
  P.set(x, (ground ? groundHeight(x, z) : 0) + y, z);
  Q.setFromEuler(E.set(rx, ry, rz, 'YXZ'));
  if (Array.isArray(s)) SC.set(s[0], s[1], s[2]);
  else SC.set(s, s, s);
  return new THREE.Matrix4().compose(P, Q, SC);
}

/**
 * Things that may stand between the camera and what the player needs to see
 * (the character, the current target). Each is a vertical cylinder; when the
 * view line passes through it the object turns mostly transparent. The camera
 * itself only collides with terrain and architecture (see camera.js), so
 * vegetation and thin pillars never shove the view around — they fade.
 */
class Occluders {
  constructor() {
    this.list = [];
  }

  add(object, x, z, radius, y0, y1) {
    // One mesh may have multiple occluding volumes (a sporetree cap + stem).
    // Group them so their fading cannot fight over the same materials.
    const existing = this.list.find((o) => o.object === object);
    const volume = { x, z, r2: radius * radius, y0, y1 };
    if (existing) existing.volumes.push(volume);
    else this.list.push({ object, volumes: [volume], alpha: 1, mats: null });
  }

  update(dt, eye, points) {
    for (const o of this.list) {
      let hit = false;
      for (const p of points) {
        // Sample each sight line, skipping its endpoints. Test all volumes of
        // the same mesh, but apply one final opacity to its materials.
        for (let i = 1; i <= 9 && !hit; i++) {
          const k = 0.04 + (i / 10) * 0.9;
          const sx = eye.x + (p.x - eye.x) * k;
          const sz = eye.z + (p.z - eye.z) * k;
          const sy = eye.y + (p.y - eye.y) * k;
          for (const v of o.volumes) {
            const x = sx - v.x;
            const z = sz - v.z;
            if (x * x + z * z <= v.r2 && sy > v.y0 && sy < v.y1) { hit = true; break; }
          }
        }
        if (hit) break;
      }
      const target = hit ? 0.08 : 1;
      if (Math.abs(target - o.alpha) < 0.004) {
        if (o.alpha === target) continue;
        o.alpha = target;
      } else o.alpha += (target - o.alpha) * Math.min(1, dt * 9);
      if (!o.mats) {
        // Only now does this object need materials of its own.
        o.mats = cloneMaterials(o.object);
        for (const m of o.mats) m.userData.alphaTest = m.alphaTest;
      }
      for (const m of o.mats) {
        const solid = o.alpha > 0.995;
        m.transparent = !solid;
        m.opacity = o.alpha;
        m.depthWrite = solid;
        m.alphaTest = m.userData.alphaTest * o.alpha;
      }
    }
  }

  get faded() {
    return this.list.filter((o) => o.alpha < 0.9).length;
  }
}

// --- kit-built props ---------------------------------------------------------

const TINT = {
  spore: new THREE.Color(0.86, 0.5, 1.0),
  sporeLeaf: new THREE.Color(0.62, 0.6, 0.78),
  meadow: new THREE.Color(0.75, 1.0, 0.8),
  dusk: new THREE.Color(0.8, 0.72, 0.95),
};

/**
 * Builders that use the GLB kits. `c` is the build context: batchers, the
 * occluder list, the animation list and a piece lookup. Colliders are untouched:
 * every builder sizes its model to the collider shared/world.js already has.
 */
const kit = {
  beacon(p, c) {
    c.solid.add(c.piece('sanctum', 'Platform_Round1'), at(p.x, p.z, { y: 0.07 }));
    c.solid.add(c.piece('sanctum', 'Column_Large_Straight'), at(p.x, p.z, { y: 0.1, s: [1.25, 1, 1.05] }));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      c.solid.add(c.piece('sanctum', 'Prop_Light_Floor'), at(p.x + Math.sin(a) * 3.6, p.z + Math.cos(a) * 3.6, { y: 0.1, ry: a + Math.PI / 2 }));
    }
    // The beacon's light: a turning core, rings and a beam (pure effect).
    const g = new THREE.Group();
    const core = scaled(G.oct, glow(0x8ff2ff), 0.75, 1.2, 0.75, 0, 11.4, 0, false);
    g.add(core);
    const rings = [];
    for (let i = 0; i < 3; i++) {
      const r = scaled(G.torus, glow(0x6fe6ff), 1.7 + i * 0.35, 1.7 + i * 0.35, 1.5, 0, 4 + i * 2, 0, false);
      r.rotation.x = Math.PI / 2;
      rings.push(r);
      g.add(r);
    }
    g.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 70, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x7fe8ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 46, 0, false));
    const light = new THREE.PointLight(0x7fe8ff, 110, 40, 1.8);
    light.position.set(0, 6.5, 0);
    g.add(light);
    c.anim.push((dt, t) => {
      core.rotation.y = t * 0.8;
      core.position.y = 11.4 + Math.sin(t * 1.3) * 0.2;
      rings.forEach((r, i) => {
        r.rotation.z = t * (0.5 + i * 0.2) * (i % 2 ? -1 : 1);
        r.position.y = 4 + i * 2 + Math.sin(t * 0.9 + i * 2) * 0.25;
      });
    });
    return g;
  },
  pylon(p, c) {
    const obj = c.single('sanctum', 'Column_Hollow', at(p.x, p.z, { y: 0.05, ry: p.rot, s: [1.15, 1.04, 1.15] }));
    const y = groundHeight(p.x, p.z);
    c.occluders.add(obj, p.x, p.z, 1.0, y, y + 5.4);
    const cap = scaled(G.box, glow(0x6fe6ff), 0.9, 0.08, 0.9, p.x, y + 5.32, p.z, false);
    c.scene.add(cap);
  },
  gatepost() {},
  console(p, c) {
    for (const dx of [-0.55, 0.55]) c.solid.add(c.piece('sanctum', 'Prop_Computer'), at(p.x + dx, p.z, { y: 0.07, ry: dx * 0.25, s: 1.05 }));
    c.cover.add(c.piece('sanctum', 'Prop_Cable_1'), at(p.x - 1.6, p.z + 0.9, { y: 0.09, ry: 0.6 }));
  },
  crate(p, c) {
    const big = p.hw > 0.7;
    const name = big ? 'Prop_Crate4' : 'Prop_Crate3';
    const half = big ? 0.56 : 0.5;
    const s = p.hw / half;
    c.solid.add(c.piece('sanctum', name), at(p.x, p.z, { y: half * s + 0.05, ry: ((p.x * 7) % 4) * 0.05, s }));
  },
  sporetree(p, c) {
    const rnd = mulberry32(p.seed);
    // One mushroom, grown to tree size: a thin stem inside the collider and a
    // cap well above head height.
    const s = p.s * 10.2;
    const ry = rnd() * 6;
    const obj = c.single('nature', 'Mushroom_Single', at(p.x, p.z, { y: -0.25, ry, rx: (rnd() - 0.5) * 0.12, s: [s, s * 1.05, s] }), { tint: 0xc98be8, emissive: 0x2c0f38 });
    const y = groundHeight(p.x, p.z);
    c.occluders.add(obj, p.x, p.z, 1.75 * p.s, y + 2.9 * p.s, y + 5.4 * p.s); // cap
    c.occluders.add(obj, p.x, p.z, 0.55 * p.s, y, y + 3 * p.s); // stem
    // Glowing spore beads under the cap.
    for (let i = 0; i < 5; i++) {
      const a = rnd() * Math.PI * 2;
      const r = (0.4 + rnd() * 0.9) * p.s;
      c.beads.push([p.x + Math.sin(a) * r, y + (3.55 - rnd() * 0.35) * p.s, p.z + Math.cos(a) * r, 0.055 * p.s, 0xffa6f2]);
    }
  },
  pod(p, c) {
    if (c.detail < 1) return procedural.pod(p, c.anim); // low preset: no extra skinned meshes
    const obj = c.animated('nature', 'pod', at(p.x, p.z, { y: 1.0 * p.s, ry: p.x * 1.7, s: 1.25 * p.s }), 'Alien_Idle', { tint: 0x8fd49a, emissive: 0x12301a, phase: p.x });
    if (!obj) return;
    const y = groundHeight(p.x, p.z);
    c.occluders.add(obj, p.x, p.z, 1.15 * p.s, y + 0.5 * p.s, y + 3.1 * p.s);
    c.beads.push([p.x, y + 1.95 * p.s, p.z, 0.16 * p.s, 0x9dffb0]);
  },
  rock(p, c) {
    const n = (p.seed % 3) + 1;
    const big = p.s > 2;
    c.solid.add(c.piece('nature', `Rock_Medium_${n}`), at(p.x, p.z, { y: -0.1, ry: p.seed % 6, s: [(p.r * 2.3) / 3.2, (p.h * (big ? 0.92 : 0.8)) / 2.1, (p.r * 2.3) / 3.2] }), big ? TINT.dusk : null);
  },
  conduit(p, c) {
    // A "conduit tree": dead wood threaded with old cabling and light. The
    // tree models are thousands of twigs that do not simplify, so the low
    // preset keeps the light procedural version.
    if (c.detail < 1) return procedural.conduit(p, c.anim);
    const rnd = mulberry32(p.seed);
    const name = rnd() < 0.5 ? 'DeadTree_1' : 'DeadTree_3';
    const s = (3.6 + 2.1 * p.s) / 10;
    const obj = c.single('nature', name, at(p.x, p.z, { y: -0.1, ry: rnd() * 6, s }));
    const hue = rnd() < 0.5 ? 0x9dffb0 : 0xffd27a;
    const y = groundHeight(p.x, p.z);
    c.occluders.add(obj, p.x, p.z, Math.max(0.7, p.r * 1.5), y, y + p.h);
    for (let i = 0; i < 3; i++) {
      const a = rnd() * Math.PI * 2;
      const r = (0.5 + rnd() * 1.2) * s * 2;
      c.beads.push([p.x + Math.sin(a) * r, y + (4 + rnd() * 3.5) * s, p.z + Math.cos(a) * r, 0.2, hue]);
    }
  },
  wall(p, c) {
    const long = p.hw > p.hd;
    const len = (long ? p.hw : p.hd) * 2;
    const n = Math.max(1, Math.round(len / 4));
    const seg = len / n;
    for (let i = 0; i < n; i++) {
      const o = -len / 2 + seg * (i + 0.5);
      const m = at(long ? p.x + o : p.x, long ? p.z : p.z + o, { ry: long ? Math.PI / 2 : 0, s: [3.4, p.h / 3, seg / 4] });
      // The kit's wall slab sits 2.1 m off its origin; bring it onto the collider.
      m.multiply(new THREE.Matrix4().makeTranslation(2.096, 0, 0));
      c.solid.add(c.piece('sanctum', i === n - 1 && n > 1 ? 'WallBand_Straight_Broken' : 'WallBand_Straight'), m);
    }
  },
  dish(p, c) {
    c.solid.add(c.piece('sanctum', 'Prop_SatelliteDish'), at(p.x, p.z, { ry: 2.2, s: 0.78 }));
  },
  relaytower(p, c) {
    c.solid.add(c.piece('sanctum', 'Platform_Round1'), at(p.x, p.z, { y: 0.05, s: 0.95 }));
    c.solid.add(c.piece('sanctum', 'Column_Large_Straight'), at(p.x, p.z, { ry: 0.6, rz: 0.06, s: [1.9, 1.38, 1.6] }));
    for (let i = 0; i < 3; i++) c.solid.add(c.piece('sanctum', 'Column_MetalSupport'), at(p.x, p.z, { y: 5 + i * 3, ry: i * 1.1, s: [1, 1, 1.5 - i * 0.25] }));
    const lamp = scaled(G.sph, glow(0xff5a4a), 0.3, 0.3, 0.3, p.x, groundHeight(p.x, p.z) + 14.2, p.z, false);
    c.scene.add(lamp);
    c.anim.push((dt, t) => {
      lamp.visible = Math.sin(t * 3) > -0.2;
    });
  },
};

/** Lattice Sanctum: tiled deck, overhead lattice between the pylons, and gates. */
function buildSanctum(c) {
  const { scene } = c;
  const top = 0.45;
  // Foundation: a dark machined disc under the deck tiles.
  const base = mesh(new THREE.CylinderGeometry(13.6, 14.3, 0.7, 48), mat(0x23292f, { rough: 0.55, metal: 0.7 }), 0, top - 0.35, 0);
  base.material = base.material.clone();
  base.material.flatShading = false;
  base.castShadow = false;
  scene.add(base);
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      if (Math.abs(i) === 2 && Math.abs(j) === 2) continue;
      if (i === 0 && j === 0) continue;
      const ring = Math.max(Math.abs(i), Math.abs(j));
      const name = ring === 1 ? 'Platform_X' : (i + j) % 2 ? 'Platform_DarkPlates' : 'Platform_Metal';
      c.cover.add(c.piece('sanctum', name), at(i * 4, j * 4, { y: top + 0.02, ground: false, ry: ((i * 3 + j) % 4) * (Math.PI / 2) }));
    }
  }
  c.cover.add(c.piece('sanctum', 'Platform_X'), at(0, 0, { y: top + 0.02, ground: false }));
  const inlay = mesh(new THREE.RingGeometry(12.72, 12.95, 72), glow(0x6fe6ff, 0.75), 0, top + 0.03, 0, false);
  inlay.rotation.x = -Math.PI / 2;
  scene.add(inlay);
  const rim = mesh(new THREE.RingGeometry(13.35, 13.5, 72), glow(0x2f8fa8, 0.6), 0, top + 0.03, 0, false);
  rim.rotation.x = -Math.PI / 2;
  scene.add(rim);

  // Overhead lattice: a hexagon of trusses between the pylon heads, and
  // stays running up to the beacon. This is what gives the place its name.
  const pylons = PROPS.filter((p) => p.type === 'pylon');
  const span = (ax, ay, az, bx, by, bz, n) => {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    const ry = Math.atan2(dx, dz);
    const rx = -Math.asin(dy / len);
    for (let k = 0; k < n; k++) {
      const f = (k + 0.5) / n;
      P.set(ax + dx * f, ay + dy * f, az + dz * f);
      Q.setFromEuler(E.set(rx, ry, 0, 'YXZ'));
      SC.set(0.8, 1, len / n / 4);
      c.cover.add(c.piece('sanctum', 'Column_MetalSupport'), new THREE.Matrix4().compose(P, Q, SC));
    }
  };
  pylons.forEach((a, i) => {
    const b = pylons[(i + 1) % pylons.length];
    const ya = groundHeight(a.x, a.z) + 5.2;
    span(a.x, ya, a.z, b.x, groundHeight(b.x, b.z) + 5.2, b.z, 3);
    span(a.x, ya, a.z, a.x * 0.09, 8.6, a.z * 0.09, 3);
  });

  // Gateways on the three roads out. Their posts are real colliders
  // ('gatepost' in shared/world.js).
  for (const key of ['sporefield', 'relay', 'vault']) {
    const zn = ZONES[key];
    const d = Math.hypot(zn.x, zn.z);
    const x = (zn.x / d) * 14.6;
    const z = (zn.z / d) * 14.6;
    // Single objects, not instanced: a gate fades when the camera is behind it.
    const gate = c.single('sanctum', 'Door_Frame_Square', at(x, z, { y: -0.05, ry: Math.atan2(zn.x, zn.z) }));
    const colour = key === 'sporefield' ? 0xffa6f2 : key === 'relay' ? 0xffb45c : 0xb48cff;
    // The lintel lamp is part of the gate so that it fades with it.
    const lamp = new THREE.Mesh(G.box, new THREE.MeshBasicMaterial({ color: colour }));
    lamp.scale.set(1.6, 0.1, 0.1);
    lamp.position.set(0, 4.6, 0);
    gate.add(lamp);
    c.occluders.add(gate, x, z, 2.7, groundHeight(x, z), groundHeight(x, z) + 5.2);
  }
  // Loose kit around the working area (inside existing colliders' footprints
  // or flat on the deck, so nothing solid can be walked through).
  c.cover.add(c.piece('sanctum', 'Prop_Vent_Big'), at(-6.2, 3.4, { y: top + 0.1, ground: false, ry: 0.4 }));
  c.cover.add(c.piece('sanctum', 'Prop_Vent_Big'), at(6.8, 5.2, { y: top + 0.1, ground: false, ry: -0.7 }));
  c.cover.add(c.piece('sanctum', 'Prop_Cable_1'), at(-4.2, -5.6, { y: top + 0.04, ground: false, ry: 2.1 }));
}

const inRange = (x, z, zone, r) => Math.hypot(x - zone.x, z - zone.z) < r;
function clearOfColliders(x, z, pad) {
  for (const col of COLLIDERS) {
    if (col.r !== undefined) {
      if (Math.hypot(x - col.x, z - col.z) < col.r + pad) return false;
    } else if (Math.abs(x - col.x) < col.hw + pad && Math.abs(z - col.z) < col.hd + pad) return false;
  }
  return true;
}

/** Ground cover and the unreachable backdrop ring. Decorative only. */
function buildVegetation(c, detail) {
  const rnd = mulberry32(7331);
  const sf = ZONES.sporefield;
  const scatter = (count, pick, place) => {
    let n = 0;
    let guard = 0;
    while (n < count && guard++ < count * 12) {
      const pos = pick();
      if (!pos || !clearOfColliders(pos[0], pos[1], 0.35)) continue;
      place(pos[0], pos[1]);
      n++;
    }
  };
  const inSpore = () => {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 23;
    return [sf.x + Math.sin(a) * r, sf.z + Math.cos(a) * r];
  };
  const inMeadow = () => {
    const a = rnd() * Math.PI * 2;
    const r = 16 + Math.sqrt(rnd()) * (WORLD.radius - 24);
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (inRange(x, z, sf, 24) || inRange(x, z, ZONES.vault, 17) || inRange(x, z, ZONES.relay, 15) || inRange(x, z, ZONES.obelisk, 7) || inRange(x, z, ZONES.survey, 17)) return null;
    return [x, z];
  };
  const vary = (base, k = 0.25) => base.clone().multiplyScalar(1 - k / 2 + rnd() * k);
  const N = (n) => Math.round(n * detail);

  // The Sporefield: low purple growth, small fungi, a few pale flowers.
  scatter(N(52), inSpore, (x, z) => c.cover.add(c.piece('nature', 'Plant_7_Big'), at(x, z, { y: -0.03, ry: rnd() * 6, s: 1 + rnd() * 0.9 }), vary(TINT.sporeLeaf)));
  scatter(N(30), inSpore, (x, z) => c.cover.add(c.piece('nature', 'Mushroom_Common'), at(x, z, { ry: rnd() * 6, s: 0.8 + rnd() * 1.0 }), vary(TINT.spore)));
  scatter(N(12), inSpore, (x, z) => c.cover.add(c.piece('nature', 'Mushroom_Laetiporus'), at(x, z, { y: 0.1, ry: rnd() * 6, s: 0.9 + rnd() * 0.8 }), vary(TINT.spore)));
  scatter(N(36), inSpore, (x, z) => c.cover.add(c.piece('nature', 'Grass_Wispy_Tall'), at(x, z, { ry: rnd() * 6, s: 0.35 + rnd() * 0.22 }), vary(TINT.spore)));
  scatter(N(14), inSpore, (x, z) => c.cover.add(c.piece('nature', 'Fern_1'), at(x, z, { ry: rnd() * 6, s: 0.4 + rnd() * 0.3 }), vary(TINT.sporeLeaf)));
  scatter(N(16), inSpore, (x, z) => c.cover.add(c.piece('nature', 'Flower_3_Group'), at(x, z, { ry: rnd() * 6, s: 0.45 + rnd() * 0.25 }), vary(TINT.spore, 0.1)));

  // The rest of the Reach: short grass, ferns, pebbles, the odd shrub.
  scatter(N(420), inMeadow, (x, z) => c.cover.add(c.piece('nature', 'Grass_Common_Short'), at(x, z, { ry: rnd() * 6, s: 0.55 + rnd() * 0.6 }), vary(TINT.meadow, 0.4)));
  scatter(N(60), inMeadow, (x, z) => c.cover.add(c.piece('nature', 'Grass_Wispy_Tall'), at(x, z, { ry: rnd() * 6, s: 0.4 + rnd() * 0.3 }), vary(TINT.meadow, 0.3)));
  scatter(N(40), inMeadow, (x, z) => c.cover.add(c.piece('nature', 'Fern_1'), at(x, z, { ry: rnd() * 6, s: 0.45 + rnd() * 0.4 }), vary(TINT.meadow)));
  scatter(N(70), inMeadow, (x, z) => c.cover.add(c.piece('nature', rnd() < 0.5 ? 'Pebble_Round_1' : 'Pebble_Round_3'), at(x, z, { ry: rnd() * 6, s: 1 + rnd() * 2.5 })));
  scatter(N(22), inMeadow, (x, z) => c.cover.add(c.piece('nature', 'Clover_1'), at(x, z, { ry: rnd() * 6, s: 0.5 + rnd() * 0.4 }), vary(TINT.meadow)));
  scatter(N(16), inMeadow, (x, z) => c.cover.add(c.piece('nature', 'Flower_3_Group'), at(x, z, { ry: rnd() * 6, s: 0.4 + rnd() * 0.25 })));

  // Backdrop on the basin wall, beyond where anyone can walk (the world limit
  // is radius 86): big twisted trees and boulders that close the horizon
  // without ever standing in a sight line.
  const ring = detail < 1 ? 0 : 18;
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2 + rnd() * 0.2;
    const r = 88.5 + rnd() * 5;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (i % 3 === 2) c.solid.add(c.piece('nature', `Rock_Medium_${(i % 3) + 1}`), at(x, z, { y: -0.6, ry: rnd() * 6, s: 2.6 + rnd() * 2.4 }), TINT.dusk);
    else c.far.add(c.piece('nature', i % 2 ? 'TwistedTree_1' : 'TwistedTree_3'), at(x, z, { y: -0.5, ry: rnd() * 6, s: 0.75 + rnd() * 0.45 }), vary(TINT.spore, 0.3));
  }
}

function buildParticlesAndLights(scene) {
  const rnd = mulberry32(1337);
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
  for (let i = 0; i < 260; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 23;
    const x = ZONES.sporefield.x + Math.sin(a) * r;
    const z = ZONES.sporefield.z + Math.cos(a) * r;
    pts.push(x, groundHeight(x, z) + 0.5 + rnd() * 5.5, z);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const spores = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffb8f5, size: 0.14, transparent: true, opacity: 0.8, depthWrite: false }));
  scene.add(spores);
  // A soft violet glow pooled in the bog, so the Sporefield is not just dark.
  const bog = new THREE.PointLight(0xc070ff, 60, 46, 1.6);
  bog.position.set(ZONES.sporefield.x, 5, ZONES.sporefield.z);
  scene.add(bog);
  return (dt, t) => {
    spores.position.y = Math.sin(t * 0.4) * 0.4;
    spores.position.x = Math.sin(t * 0.17) * 0.6;
  };
}

/** The original procedural ground cover, used only when the kits are missing. */
function buildProceduralDecor(scene) {
  const rnd = mulberry32(1337);
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
    if (Math.hypot(x, z) < 15 || Math.hypot(x - ZONES.vault.x, z - ZONES.vault.z) < 15 || inRange(x, z, ZONES.survey, 17)) continue;
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
}

/**
 * Build the whole static world. Returns {update, sun, stats}.
 * @param assets loaded Assets, or null to build the procedural world
 * @param opts {detail: 0..1} scales decorative density (not gameplay props)
 */
export function buildWorld(scene, assets = null, opts = {}) {
  const detail = opts.detail ?? 1;
  const kits = !!(assets && assets.get('sanctum') && assets.get('nature'));
  scene.fog = new THREE.Fog(0x4c4868, 60, 260);
  scene.add(buildSky());
  scene.add(buildGround(kits ? assets : null));

  const ambient = kits ? new THREE.HemisphereLight(0xb0bcff, 0x5c4c6a, 1.55) : new THREE.HemisphereLight(0x9db4ff, 0x3a2c44, 1.35);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffd9b4, kits ? 2.9 : 2.4);
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

  const anim = [];
  const occluders = new Occluders();
  const animators = [];
  const c = {
    scene,
    detail,
    anim,
    occluders,
    solid: new Batcher(46), // casts and receives shadows
    cover: new Batcher(30), // ground cover and flat pieces: receives only
    far: new Batcher(60), // backdrop: no shadows at all
    beads: [], // [x, y, z, radius, colour] small glowing spheres
    piece: (bundle, name) => {
      const p = assets.get(bundle).pieces.get(name);
      if (!p) throw new Error(`piece ${bundle}:${name} is not in the bundle`);
      return p;
    },
    /** A piece as its own object (fadeable, tintable). */
    single(bundle, name, matrix, { tint, emissive } = {}) {
      const obj = assets.instance(bundle, name);
      obj.applyMatrix4(matrix);
      if (tint !== undefined) {
        for (const m of cloneMaterials(obj)) {
          m.color.multiply(tmpA.setHex(tint));
          if (emissive !== undefined) m.emissive.setHex(emissive);
        }
      }
      scene.add(obj);
      return obj;
    },
    /** A skinned piece playing one looping clip. */
    animated(bundle, name, matrix, clip, { tint, emissive, phase = 0 } = {}) {
      const obj = c.single(bundle, name, matrix, { tint, emissive });
      obj.traverse((o) => {
        if (o.isSkinnedMesh) o.frustumCulled = false;
      });
      const a = new Animator(obj, assets.clips(bundle, name));
      a.setBase(clip, { fade: 0, timeScale: 0.7 });
      a.update(Math.abs(phase) % 3);
      animators.push({ a, obj });
      return obj;
    },
  };

  if (kits) buildSanctum(c);
  else {
    // Sanctum floor: a level dais with an inlaid ring of light.
    const dais = mesh(new THREE.CylinderGeometry(13, 13.6, 0.5, 40), mat(0x56666e, { rough: 0.7, metal: 0.2 }), 0, 0.2, 0);
    dais.castShadow = false;
    scene.add(dais);
    for (const [r0, r1, o] of [[8.6, 8.9, 0.7], [12.7, 12.95, 0.45]]) {
      const ring = mesh(new THREE.RingGeometry(r0, r1, 64), glow(0x6fe6ff, o), 0, 0.47, 0, false);
      ring.rotation.x = -Math.PI / 2;
      scene.add(ring);
    }
  }

  // Vault floor: concentric rune rings.
  for (const [r0, r1] of [[5, 5.2], [10, 10.25], [13.4, 13.6]]) {
    const ring = mesh(new THREE.RingGeometry(r0, r1, 56), glow(0xb48cff, 0.4), ZONES.vault.x, -0.5, ZONES.vault.z, false);
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);
  }
  const vaultLight = new THREE.PointLight(0xa07cff, 70, 34, 1.8);
  vaultLight.position.set(ZONES.vault.x, 6, ZONES.vault.z);
  scene.add(vaultLight);

  const prototypeStates = Object.create(null);
  const enablePrototypeArt = !!(opts.prototypeArt && assets);
  if (enablePrototypeArt) for (const p of PROPS) {
    if (Object.hasOwn(STATIC_ART, p.type)) prototypeStates[p.type] = 'loading';
  }
  let fallbacks = 0;
  for (const p of PROPS) {
    let obj;
    if (kits && kit[p.type]) {
      try {
        obj = kit[p.type](p, c);
      } catch (err) {
        // A missing piece must not remove the prop (its collider still exists).
        console.warn(`[scene] ${p.type}: using the procedural prop:`, err.message || err);
        fallbacks++;
        obj = procedural[p.type] ? procedural[p.type](p, anim) : null;
      }
    } else if (procedural[p.type]) obj = procedural[p.type](p, anim);
    if (!obj) continue;
    obj.position.x += p.x;
    obj.position.z += p.z;
    obj.position.y += groundHeight(p.x, p.z) - (p.type === 'survey_workstation' ? 0 : 0.15);
    scene.add(obj);
    if (enablePrototypeArt && Object.hasOwn(STATIC_ART, p.type)) {
      // Keep the complete fallback until the fitted model is ready.
      const fallback = obj;
      fallback.name = 'prototype-fallback:' + p.type;
      const url = '/client/art-assets/' + STATIC_ART[p.type];
      assets.loader.loadAsync(url).then(gltf => {
        const root = gltf.scene;
        root.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(root);
        const fit = fitStaticArt(bounds, p);
        const fitted = new THREE.Group();
        fitted.name = 'prototype-art:' + p.type;
        fitted.add(root);
        fitted.scale.setScalar(fit.scale);
        fitted.position.fromArray(fit.position);
        root.traverse(node => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
        fallback.clear();
        fallback.add(fitted);
        prototypeStates[p.type] = 'ready';
      }).catch(err => {
        prototypeStates[p.type] = 'fallback';
        console.warn('[scene] prototype ' + p.type + ' unavailable; retaining procedural structure:', err.message || err);
      });
    }
  }

  if (kits) buildVegetation(c, detail);
  else buildProceduralDecor(scene);
  anim.push(buildParticlesAndLights(scene));

  let batches = c.solid.build(scene) + c.cover.build(scene, { castShadow: false }) + c.far.build(scene, { castShadow: false, receiveShadow: false });
  if (c.beads.length) {
    const beads = new THREE.InstancedMesh(G.sph, new THREE.MeshBasicMaterial(), c.beads.length);
    const col = new THREE.Color();
    c.beads.forEach(([x, y, z, r, hex], i) => {
      P.set(x, y, z);
      Q.identity();
      SC.set(r, r, r);
      beads.setMatrixAt(i, new THREE.Matrix4().compose(P, Q, SC));
      beads.setColorAt(i, col.setHex(hex));
    });
    beads.computeBoundingSphere();
    scene.add(beads);
    batches++;
  }

  const dir = new THREE.Vector3(-0.55, 0.72, 0.42).normalize();
  const points = [];
  const coverRange = 30 + 55 * detail;
  return {
    sun,
    ambient,
    ambientBase: ambient.intensity,
    stats: { kits, batches, occluders: occluders.list.length, fallbacks, get prototypeArt() { return staticArtStatus(prototypeStates); }, get prototypeAssets() { return { ...prototypeStates }; } },
    occluders,
    /**
     * @param focus the player's feet
     * @param view optional {eye, points}: camera position and the points that
     *   must stay visible (player, target), for occluder fading
     */
    update(dt, t, focus, view) {
      for (const fn of anim) fn(dt, t);
      for (const e of animators) e.a.update(dt);
      // Small ground cover is not worth drawing across the valley.
      c.cover.cullByDistance(focus.x, focus.z, coverRange);
      if (view) {
        points.length = 0;
        for (const p of view.points) if (p) points.push(p);
        occluders.update(dt, view.eye, points);
      }
      // Keep the shadow frustum centred on the player.
      sun.target.position.set(focus.x, focus.y, focus.z);
      sun.position.set(focus.x + dir.x * 90, focus.y + dir.y * 90, focus.z + dir.z * 90);
    },
  };
}
