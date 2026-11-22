// Static world presentation: terrain, sky, lighting and props.
// Collision comes from shared/world.js; nothing here affects gameplay.

import * as THREE from '/vendor/three/three.module.js';
import { WORLD, ZONES, PROPS, COLLIDERS, groundHeight, mulberry32, DEEP, RIFT_ANNEX } from '../../shared/world.js';
import { cloneMaterials } from './assets.js';
import { Animator } from './animator.js';
import { buildSiteMarkings } from './site-markings.js';
import { buildRelayTower } from './relay-tower.js';
import { createReachRelayFx } from './reach-relay-fx.js';
import { intersectsOccluder } from './occlusion.js';
import { STATIC_ART, fitStaticArt, staticArtStatus } from './prototype-art.js';
import { buildContainmentVessel } from './containment-vessel.js';
import { buildStorageCase } from './storage-case.js';
import { buildPressurePlant } from './pressure-plant.js';
import { buildDeepServicePipes } from './service-pipes.js';
import { buildKestrelDeepVisuals } from './kestrel-deep-visuals.js';
import { buildSinterHabitat } from './sinter-habitat.js';
import { SPOREFIELD_COLONIES, planSporeMotes } from './sporefield-colonies.js';
import { buildSanctumFabricator } from './sanctum-fabricator.js';
import { loadStillpoint } from './stillpoint-world.js';
import { planAnnexRocks } from './annex-rock-fit.js';
import { buildSeverancePocket } from './severance-pocket.js';
import { buildSilentFoundry } from './silent-foundry.js';
import { inSeverancePocket } from '../../shared/severance-gate.js';
import { inSilentFoundry } from '../../shared/silent-foundry.js';

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
// Existing Sanctum gate and Sporefield approach share this axis. Decorative
// path geometry keeps the same heightfield and leaves the center clear.
const spore = ZONES.sporefield;
const roadLength = Math.hypot(spore.x, spore.z);
const roadX = spore.x / roadLength;
const roadZ = spore.z / roadLength;
const roadDistance = (x, z) => x * roadX + z * roadZ;
const roadOffset = (x, z) => Math.abs(x * roadZ - z * roadX);

function groundColor(x, z, out) {
  // Broad, soft variation: the texture supplies the fine detail.
  const n = 0.5 + 0.25 * Math.sin(x * 0.19 + 1.7) * Math.cos(z * 0.23) + 0.25 * Math.sin(x * 0.07 - z * 0.11) + (hash(Math.round(x * 3), Math.round(z * 3)) - 0.5) * 0.12;
  out.setHex(0x24443a).lerp(tmpA.setHex(0x3d6e55), n * 0.8);
  const blend = (zone, radius, c1, c2) => {
    const w = smooth(1 - (Math.hypot(x - zone.x, z - zone.z) - radius * 0.55) / (radius * 0.6));
    if (w > 0) out.lerp(tmpB.setHex(c1).lerp(tmpA.setHex(c2), n), w);
  };
  blend(ZONES.sporefield, 24, 0x3b303d, 0x665063);
  const along = roadDistance(x, z);
  const road = smooth((along - 12) / 4) * smooth((46 - along) / 7) * smooth((2.8 - roadOffset(x, z)) / 1.9);
  out.lerp(tmpA.setHex(0x847567).lerp(tmpB.setHex(0x514748), n), road * 0.8);
  blend(ZONES.relay, 20, 0x4a443f, 0x625646);
  blend(ZONES.vault, 19, 0x34334f, 0x4a4870);
  blend(ZONES.obelisk, 9, 0x223f5c, 0x2f5a78);
  blend(ZONES.sanctum, 15, 0x4d6670, 0x5f7c86);
  blend(ZONES.survey, 20, 0x645043, 0x9b7962);
  blend(ZONES.sinter, 19, 0x827769, 0xbab09a);
  blend(ZONES.deep, 19, 0x484b48, 0x78796e);
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

// A roofed laboratory rather than a surface ruin. Floor, ducts and
// lights share a bounded static kit; the walkable height stays authoritative.
// Low, weathered biological deposits, not another obstacle or harvest node.
// All geometry sits close to shared groundHeight; no invisible collisions.
function buildDeepArchitecture(scene) {
  const g = new THREE.Group();
  g.name = 'kestrel:architecture';
  const concrete = mat(0x585950, { rough: 0.94 });
  const steel = mat(0x3b4647, { metal: 0.52, rough: 0.6 });
  const plate = mat(0x626660, { metal: 0.18, rough: 0.79 });
  const seam = mat(0x222c2c, { rough: 0.85 });
  const ochre = mat(0x927447, { rough: 0.8, metal: 0.18 });
  const ceiling = scaled(G.box, concrete, DEEP.hw * 2, DEEP.roofTop - DEEP.roofBottom, DEEP.hd * 2,
    DEEP.x, (DEEP.roofBottom + DEEP.roofTop) / 2, DEEP.z, true);
  ceiling.name = 'kestrel:roof';
  g.add(ceiling);
  // Long industrial slabs and recessed seams: no holes in the walkable deck.
  g.add(scaled(G.box, plate, 13.2, 0.065, 11.8, DEEP.x, DEEP.floor + 0.035, DEEP.z, false));
  for (let x = -63; x <= -51; x += 2) {
    g.add(scaled(G.box, seam, 0.045, 0.02, 11.5, x, DEEP.floor + 0.08, DEEP.z, false));
    g.add(scaled(G.box, steel, 0.28, 0.31, 12.5, x, DEEP.roofBottom - 0.16, DEEP.z));
  }
  for (const side of [-1,1]) {
    const z = DEEP.z + side * 5.65;
    g.add(scaled(G.box, ochre, 12.7, 0.015, 0.12, DEEP.x, DEEP.floor + 0.08, z, false));

    g.add(scaled(G.box, steel, 12, 0.14, 0.28, DEEP.x, DEEP.roofBottom - 0.42, DEEP.z + side * 3.7));
    for (const x of [-61,-55]) {
      g.add(scaled(G.box, glow(0xd5d4a2), 2.6, 0.035, 0.16, x, DEEP.roofBottom - 0.5, DEEP.z + side * 3.7, false));
    }
  }
  g.add(buildDeepServicePipes(THREE,DEEP).group);
  // Open portal fascia, no doorway collision across the aisle.
  g.add(scaled(G.box, ochre, 0.16, 0.42, 12.7, DEEP.x + DEEP.hw - 0.1, DEEP.roofBottom - 0.18, DEEP.z));
  const lamp = new THREE.PointLight(0xffddb2, 75, 13, 2);
  lamp.position.set(DEEP.x, DEEP.roofBottom - 0.92, DEEP.z);
  lamp.name = 'kestrel:worklight';
  g.add(lamp);
  scene.add(g);
}

const procedural = {
  annex_formation(p, _anim, includeStone=true) {
    const g=new THREE.Group(),rnd=mulberry32(p.seed);
    g.name='annex:mineral-formation';
    const stone=mat(0x39464c,{rough:.96}),seam=mat(0x627078,{rough:.84});
    const crystal=mat(p.z<-9?0x9685b5:p.z>12?0x729b9e:0xb6a285,{rough:.32,metal:.15,emissive:p.z<-9?0x504061:0x28474a,ei:.12});
    for(let i=0;i<4;i++){
      const a=i*Math.PI/2+rnd()*.5,scale=p.r*(.40+rnd()*.18);
      const height=p.h*(.22+rnd()*.15);
      if(!includeStone)continue;
      const chunk=scaled(rockGeos[(p.seed+i)%rockGeos.length],i===2?seam:stone,scale,height,scale,Math.cos(a)*p.r*.34,p.h*.18,Math.sin(a)*p.r*.34);
      chunk.rotation.y=a;g.add(chunk);
    }
    for(let i=0;i<5;i++){
      const a=i*2.4+rnd()*.3,hh=p.h*(.28+rnd()*.38),w=p.r*(.09+rnd()*.07);
      const shard=new THREE.Group();
      shard.add(mesh(new THREE.CylinderGeometry(w*.85,w,hh*.72,5),crystal,0,hh*.36,0));
      shard.add(mesh(new THREE.ConeGeometry(w*.85,hh*.28,5),crystal,0,hh*.86,0));
      shard.position.set(Math.cos(a)*p.r*.40,p.h*.25,Math.sin(a)*p.r*.40);
      shard.rotation.set(Math.sin(a)*.25,a,Math.cos(a)*.25);g.add(shard);
    }
    return g;
  },
  annex_wall(p) {
    const g=new THREE.Group();
    g.name='annex:bulkhead';
    g.add(mesh(new THREE.BoxGeometry(p.hw*2,p.h,p.hd*2),mat(0x41494a,{rough:.69,metal:.52}),0,p.h/2,0));
    for(const z of [-p.hd-.035,p.hd+.035]){
      for(const sign of [-1,1])g.add(mesh(new THREE.BoxGeometry(.22,p.h,.09),mat(0x827050,{metal:.6}),sign*(p.hw-.15),p.h/2,z));
      g.add(mesh(new THREE.BoxGeometry(p.hw*2-.2,.07,.04),mat(0x527c80,{rough:.65,emissive:0x29464a,ei:.18}),0,3.88,z,false));
      for(let x=-p.hw+.7;x<p.hw-.3;x+=2.25)g.add(mesh(new THREE.BoxGeometry(.11,3.2,.10),mat(0x273237,{metal:.5}),x,1.75,z));
    }
    return g;
  },
  arrival_floor() {
    const g=new THREE.Group();g.name='arrival:floor';
    const plate=mat(0x465052,{rough:.78,metal:.3}),seam=mat(0x28363a,{rough:.88}),bronze=mat(0x978464,{rough:.72,metal:.45});
    for(let x=-3;x<=3;x+=1.5)for(let z=-1.5;z<=1.5;z+=1.5)g.add(mesh(new THREE.BoxGeometry(1.47,.035,1.47),plate,x,.025,z,false));
    for(const x of [-3.7,3.7])g.add(mesh(new THREE.BoxGeometry(.16,.035,4.4),bronze,x,.046,0,false));
    for(const z of [-2.25,2.25])g.add(mesh(new THREE.BoxGeometry(7.6,.035,.18),seam,0,.045,z,false));
    for(let i=-2;i<=2;i++)g.add(mesh(new THREE.BoxGeometry(.38,.025,.2),bronze,i*.65,.049,-1.97,false));
    // Recessed survey marks identify the editing bay without narrowing the corridor.
    const bay=mesh(new THREE.RingGeometry(.66,.73,32),mat(0x9eb7a8,{metal:.35,rough:.62}),-2.35,.057,.30,false);
    bay.rotation.x=-Math.PI/2;g.add(bay);
    for(const x of [-2.88,-1.82])for(const z of [-.23,.83]){
      g.add(mesh(new THREE.BoxGeometry(.23,.014,.075),bronze,x,.06,z,false));
    }
    return g;
  },
  arrival_arch() {
    const g=new THREE.Group();g.name='arrival:threshold-arch';
    const frame=mat(0x414d51,{rough:.62,metal:.58}),trim=mat(0x978464,{rough:.58,metal:.52});
    g.add(mesh(new THREE.BoxGeometry(8.25,.34,.68),frame,0,3.72,0));
    g.add(mesh(new THREE.BoxGeometry(7.4,.10,.72),trim,0,3.51,0));
    for(const x of [-3.38,3.38])g.add(mesh(new THREE.BoxGeometry(.72,.44,.52),frame,x,3.39,0));
    return g;
  },
  arrival_pillar(p) {
    const g=new THREE.Group();g.name='arrival:column';
    g.add(mesh(new THREE.CylinderGeometry(.33,.38,p.h,8),mat(0x49545b,{metal:.6,rough:.6}),0,p.h/2,0));
    for(const y of [.18,p.h-.18])g.add(mesh(new THREE.CylinderGeometry(.38,.38,.19,8),mat(0xa18a59,{metal:.7}),0,y,0));
    g.add(mesh(new THREE.BoxGeometry(.08,2.55,.09),mat(0x618b8b,{rough:.65,emissive:0x315153,ei:.20}),0,1.85,.32,false));
    return g;
  },
  arrival_wall(p){
    const g=new THREE.Group();g.name='arrival:side-enclosure';
    g.add(mesh(new THREE.BoxGeometry(p.hw*2,p.h,p.hd*2),mat(0x35434a,{metal:.48,rough:.68}),0,p.h/2,0));
    for(const z of [-1.35,0,1.35]){g.add(mesh(new THREE.BoxGeometry(.41,2.55,.83),mat(0x4b5b60,{metal:.62,rough:.7}),0,1.64,z));g.add(mesh(new THREE.BoxGeometry(.43,.055,.72),mat(0x618b8b,{rough:.65,emissive:0x315153,ei:.20}),0,2.83,z,false));}
    return g;
  },
  arrival_terminal(){
    const g=new THREE.Group();g.name='arrival:orientation-terminal';
    g.add(mesh(new THREE.BoxGeometry(.88,.88,.72),mat(0x34454a,{metal:.55}),0,.44,0));
    const console=new THREE.Group();
    // Face the unobstructed aisle, away from the enclosure wall.
    console.rotation.y=Math.PI/2;
    const screen=mesh(new THREE.BoxGeometry(.69,.42,.09),mat(0x254849,{emissive:0x287a78,ei:.55}),0,1.19,.1);
    screen.rotation.x=-.25;console.add(screen);
    const trace=mat(0x84b6a9,{emissive:0x568674,ei:.48});
    for(const x of [-.18,.18]){
      console.add(mesh(new THREE.SphereGeometry(.037,8,6),trace,x,1.30,.144,false));
      console.add(mesh(new THREE.BoxGeometry(.10,.096,.012),trace,x,1.21,.158,false));
      for(const dx of [-.028,.028])console.add(mesh(new THREE.BoxGeometry(.026,.079,.012),trace,x+dx,1.13,.179,false));
    }
    for(let i=0;i<4;i++)console.add(mesh(new THREE.BoxGeometry(.10,.035,.1),mat(0xb8ac82,{metal:.5}),-.22+i*.145,.96,.29));
    g.add(console);
    g.add(mesh(new THREE.BoxGeometry(.94,.11,.77),mat(0x677671,{metal:.6}),0,.88,0));return g;
  },
  sanctum_fabricator() { return buildSanctumFabricator(THREE); },
  deep_wall(p) {
    const g = new THREE.Group();
    const concrete = mat(0x525750, { rough: 0.94 });
    const rail = mat(0x333e40, { metal: 0.38, rough: 0.75 });
    const longX = p.hw > p.hd;
    g.add(scaled(G.box, concrete, p.hw * 2, p.h, p.hd * 2, 0, p.h / 2, 0));
    for (const along of [-0.65,0,0.65]) {
      g.add(scaled(G.box, rail, longX ? 0.22 : p.hw * 2 + 0.12, p.h, longX ? p.hd * 2 + 0.12 : 0.22,
        longX ? along * p.hw : 0, p.h / 2, longX ? 0 : along * p.hd));
    }
    return g;
  },
  deep_vessel(p) { return buildContainmentVessel(THREE,p); },
  // Wind-cut, laminated mineral fins: broad bases, fractured edges, no emission.
  sinter_ridge(p) {
    const g = new THREE.Group();
    g.name = 'sinter-ridge:' + p.seed;
    const rnd = mulberry32(p.seed);
    const strata = [0x514d48, 0x938572, 0x665c51, 0xb5a88b, 0x807266];
    for (let i = 0; i < strata.length; i++) {
      const taper = 1 - i * 0.115;
      const dx = (rnd() - 0.5) * p.hw * 0.22;
      const dz = (rnd() - 0.5) * p.hd * 0.16;
      const layer = scaled(rockGeos[(p.seed+i)%rockGeos.length], mat(strata[i], {rough:0.96}),
        p.hw*0.75*taper, p.h*0.20, p.hd*0.74*taper, dx, p.h*(0.13+i*0.17), dz);
      g.add(layer);
    }
    return g;
  },
  // A complete grounded fallback if the original biological colony is unavailable.
  sinter_colony(p) {
    const g = new THREE.Group();
    const rind = mat(0x675d50, {rough:0.94});
    const mineral = mat(0x9c9881, {rough:0.73,metal:0.12});
    const dark = mat(0x4b514a, {rough:0.87});
    const rnd = mulberry32(p.seed);
    g.add(scaled(G.sph,rind,1.15,0.17,0.92,0,0.13,0));
    for (let i=0;i<7;i++) {
      const a=i*Math.PI*2/7, r=0.42+rnd()*0.34;
      const x=Math.cos(a)*r,z=Math.sin(a)*r;
      g.add(scaled(G.sph,dark,0.23,0.16,0.20,x,0.24,z));
      const h=0.36+rnd()*0.78;
      const fin=scaled(G.ico,mineral,0.16,h*0.48,0.12,x,0.28+h*.40,z);
      fin.rotation.z=Math.sin(a)*0.24;
      g.add(fin);
    }
    return g;
  },
  survey_tower(p) {
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
  survey_pump(p) { return buildPressurePlant(THREE,p); },
  survey_workstation(p) { return procedural.console(p); },
  survey_engineering(p) {
    const g = new THREE.Group();
    const steel = mat(0x747872, { rough: 0.66, metal: 0.45 });
    const dark = mat(0x353c3d, { rough: 0.8, metal: 0.25 });
    const ochre = mat(0x897049, { rough: 0.82, metal: 0.22 });
    const add = (...a) => g.add(scaled(G.box, ...a));
    for (const side of [-1, 1]) {
      add(dark, 0.22, 0.82, 1.15, side * 0.87, 0.41, 0);
      add(steel, 0.44, 0.12, 1.22, side * 0.82, 0.06, 0);
    }
    add(steel, 2.12, 0.16, 1.32, 0, 0.9, 0);
    add(dark, 0.95, 0.55, 0.95, -0.50, 0.35, -0.05);
    add(ochre, 0.55, 0.26, 0.56, -0.55, 1.1, -0.08);
    add(steel, 0.19, 0.68, 0.2, 0.72, 1.32, -0.46);
    add(dark, 0.58, 0.21, 0.31, 0.47, 1.57, -0.35);
    return g;
  },
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
  crate(p) { return buildStorageCase(THREE,p); },
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
    const m=buildRelayTower(THREE,p);
    anim.push((dt,t)=>m.update(t));
    return m.group;
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
    if(p.foothill){
      // Low-detail equivalent retains a rooted trunk and canopy at the same footprint.
      const g=new THREE.Group(),rnd=mulberry32(p.seed),h=p.h;
      const bark=mat(0x4b3b40,{rough:.98}),leaf=mat(0x663a48,{rough:.95});
      g.add(mesh(new THREE.CylinderGeometry(.20,.72,h*.63,8),bark,0,h*.315-.24,0));
      for(let i=0;i<5;i++){
        const a=i*Math.PI*2/5+rnd()*.4,l=h*(.18+rnd()*.08),y=h*(.52+rnd()*.18);
        const tip=new THREE.Vector3(Math.sin(a)*l,y+l*.64,Math.cos(a)*l);
        const base=new THREE.Vector3(0,y-h*.22,0),delta=tip.clone().sub(base),mid=base.clone().add(tip).multiplyScalar(.5);
        const branch=mesh(new THREE.CylinderGeometry(.065,.18,delta.length(),6),bark,mid.x,mid.y,mid.z);
        branch.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());g.add(branch);
        g.add(scaled(G.sph,leaf,h*.17,h*.13,h*.15,tip.x,tip.y,tip.z));
      }
      g.name='foothill-tree:'+p.seed;return g;
    }
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
/** Sanctum architecture kit (Blender; tools/asset-pipeline/.../sanctum_arch.py). */
export const SANCTUM_ARCH_URL = '/client/assets/sanctum_arch.glb?v=d79184f83fc0';

/** A Sanctum kit piece placed under a holder, keeping the node's own (quantised)
 * transform; null when the kit is unavailable (the generic kit is used). */
function archInstance(c, name, matrix) {
  const src = c.arch?.get(name);
  if (!src) return null;
  const holder = new THREE.Group();
  holder.name = 'sanctum-arch:' + name;
  holder.applyMatrix4(matrix);
  const inst = src.clone(true);
  inst.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.material?.name;
    if (n === 'SA_Channel' || n === 'SA_Lamp') { o.material = c.archGlow(n); o.castShadow = false; }
    else { o.castShadow = true; o.receiveShadow = true; }
  });
  holder.add(inst);
  c.scene.add(holder);
  return holder;
}

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
      const hit = points.some((point) => o.volumes.some((volume) => intersectsOccluder(eye, point, volume)));
      const target = hit ? 0.08 : 1;
      if (o.alpha === target) continue;
      const rate = hit ? 19 : 7;
      o.alpha += (target - o.alpha) * (1 - Math.exp(-dt * rate));
      if (Math.abs(target - o.alpha) < 0.005) o.alpha = target;
      if (!o.mats) {
        // Only occluders that actually fade need private material state.
        o.mats = cloneMaterials(o.object).map((material) => ({
          material,
          opacity: material.opacity,
          alphaTest: material.alphaTest,
          transparent: material.transparent,
          depthWrite: material.depthWrite,
        }));
      }
      const solid = o.alpha === 1;
      for (const base of o.mats) {
        base.material.transparent = base.transparent || !solid;
        base.material.opacity = base.opacity * o.alpha;
        base.material.alphaTest = base.alphaTest * o.alpha;
        base.material.depthWrite = solid && base.depthWrite;
      }
    }
  }

  get faded() {
    return this.list.filter((o) => o.alpha < 0.9).length;
  }
}

// --- kit-built props ---------------------------------------------------------

const TINT = {
  meadow: new THREE.Color(0.75, 1.0, 0.8),
  dusk: new THREE.Color(0.8, 0.72, 0.95),
};

/**
 * Builders that use the GLB kits. `c` is the build context: batchers, the
 * occluder list, the animation list and a piece lookup. Colliders are untouched:
 * every builder sizes its model to the collider shared/world.js already has.
 */
const kit = {
  annex_formation(p,c) {
    // Resolve every donor before adding any instances: incomplete kits retain
    // the entire procedural formation and its existing collision footprint.
    const plan=planAnnexRocks(p,name=>c.pieceMeta('nature',name));
    const placements=plan.map(({name,dx,dz,ry,s,origin})=>({piece:c.piece('nature',name),matrix:at(p.x+dx,p.z+dz,{ground:false,ry,s}).multiply(new THREE.Matrix4().makeTranslation(...origin))}));
    const crystals=procedural.annex_formation(p,c.anim,false);
    const tint=new THREE.Color(p.z<-9?0x9b9eac:p.z>12?0xa5b4b5:0xb5aaa0);
    for(const {piece,matrix} of placements)c.solid.add(piece,matrix,tint);
    return crystals;
  },
  beacon(p, c) {
    if (!archInstance(c, 'SA_Beacon', at(p.x, p.z, { y: 0.47, ground: false }))) {
      c.solid.add(c.piece('sanctum', 'Platform_Round1'), at(p.x, p.z, { y: 0.07 }));
      c.solid.add(c.piece('sanctum', 'Column_Large_Straight'), at(p.x, p.z, { y: 0.1, s: [1.25, 1, 1.05] }));
    }
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
    const y = groundHeight(p.x, p.z);
    const carved = archInstance(c, 'SA_Pylon', at(p.x, p.z, { y: 0, ry: p.rot }));
    if (carved) { c.occluders.add(carved, p.x, p.z, 1.0, y, y + 5.4); return; }
    const obj = c.single('sanctum', 'Column_Hollow', at(p.x, p.z, { y: 0.05, ry: p.rot, s: [1.15, 1.04, 1.15] }));
    c.occluders.add(obj, p.x, p.z, 1.0, y, y + 5.4);
    const cap = scaled(G.box, glow(0x6fe6ff), 0.9, 0.08, 0.9, p.x, y + 5.32, p.z, false);
    c.scene.add(cap);
  },
  gatepost() {},
  console(p, c) {
    // Sanctum service console in the architecture kit's stone and bronze; its
    // panels face the beacon (kit -y front is three +z).
    const carved = archInstance(c, 'SA_Console', at(p.x, p.z, { y: 0, ry: Math.atan2(-p.x, -p.z) }));
    if (carved) {
      carved.name = 'sanctum:service-console';
      // Broad panels use a tone-mapped, dimmer copy of the channel glow: the
      // channel's unmapped strip intensity would read as flat white here.
      const panel = c.archGlow('SA_Channel').clone();
      panel.name = 'SA_Panel';
      panel.toneMapped = true;
      panel.emissiveIntensity = 0.32;
      panel.color?.setHex(0x071416);
      panel.emissive?.setHex(0x3fd6e0);
      carved.traverse((o) => { if (o.isMesh && o.material?.name === 'SA_Channel') o.material = panel; });
      return;
    }
    for (const dx of [-0.55, 0.55]) c.solid.add(c.piece('sanctum', 'Prop_Computer'), at(p.x + dx, p.z, { y: 0.07, ry: dx * 0.25, s: 1.05 }));
    c.cover.add(c.piece('sanctum', 'Prop_Cable_1'), at(p.x - 1.6, p.z + 0.9, { y: 0.09, ry: 0.6 }));
  },
  crate(p, c) { return buildStorageCase(THREE,p); },
  sporetree(p, c) {
    const rnd = mulberry32(p.seed);
    // One mushroom, grown to tree size: a thin stem inside the collider and a
    // cap well above head height.
    const s = p.s * 10.2;
    const spread = roadOffset(p.x, p.z) < 6 ? 0.78 : 0.94;
    const ry = rnd() * 6;
    const obj = c.single('nature', 'Mushroom_Single', at(p.x, p.z, { y: -0.25, ry, rx: (rnd() - 0.5) * 0.12, s: [s * spread, s * 1.05, s * spread] }), { tint: 0xa79cb2, emissive: 0x190f23 });
    const y = groundHeight(p.x, p.z);
    c.occluders.add(obj, p.x, p.z, 1.9 * p.s * spread, y + 2.9 * p.s, y + 5.4 * p.s); // cap
    c.occluders.add(obj, p.x, p.z, 0.55 * p.s, y, y + 3 * p.s); // stem
    // Glowing spore beads under the cap.
    for (let i = 0; i < 3; i++) {
      const a = rnd() * Math.PI * 2;
      const r = (0.35 + rnd() * 0.8) * p.s * spread;
      c.beads.push([p.x + Math.sin(a) * r, y + (3.55 - rnd() * 0.35) * p.s, p.z + Math.cos(a) * r, 0.035 * p.s, 0xe2b9ea]);
    }
  },
  pod(p, c) {
    if (c.detail < 1) return procedural.pod(p, c.anim); // low preset: no extra skinned meshes
    const obj = c.animated('nature', 'pod', at(p.x, p.z, { y: 1.0 * p.s, ry: p.x * 1.7, s: 1.25 * p.s }), 'Alien_Idle', { tint: 0x8fd49a, emissive: 0x12301a, phase: p.x });
    if (!obj) return;
    const y = groundHeight(p.x, p.z);
    c.occluders.add(obj, p.x, p.z, 1.15 * p.s, y + 0.5 * p.s, y + 3.1 * p.s);
    // Keep the emitter with the pod so it follows the same foreground fade.
    const emitter = scaled(G.sph, glow(0xa5c3a5), 0.07, 0.07, 0.07, 0, 0.76, 0, false);
    emitter.name = 'spore-pod:emitter';
    obj.add(emitter);
  },
  rock(p, c) {
    const n = (p.seed % 3) + 1;
    const big = p.s > 2;
    c.solid.add(c.piece('nature', `Rock_Medium_${n}`), at(p.x, p.z, { y: p.foothill ? -0.32 : -0.1, ry: p.seed % 6, s: [(p.r * 2.3) / 3.2, (p.h * (big ? 0.92 : 0.8)) / 2.1, (p.r * 2.3) / 3.2] }), big ? TINT.dusk : null);
  },
  conduit(p, c) {
    if(p.foothill){
      if(c.detail<1)return procedural.conduit(p,c.anim);
      const rnd=mulberry32(p.seed),name=p.seed%2?'TwistedTree_1':'TwistedTree_3';
      // Both source pieces extend 0.201 m below their local origin. Sink the
      // root slightly into the shallow foothill rather than mounting it on a cliff.
      const obj=c.single('nature',name,at(p.x,p.z,{y:.201*p.s-.27,ry:rnd()*Math.PI*2,s:p.s}),{tint:0xbda7ad});
      obj.name='foothill-tree:'+p.seed;
      const y=groundHeight(p.x,p.z);
      c.occluders.add(obj,p.x,p.z,p.r,y,y+p.h*.64);
      c.occluders.add(obj,p.x,p.z,p.h*.49,y+p.h*.44,y+p.h);
      return;
    }
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
  relaytower(p, c) { return procedural.relaytower(p,c.anim); },
};

/** Lattice Sanctum: tiled deck, overhead lattice between the pylons, and gates. */
function buildSanctum(c) {
  const { scene } = c;
  const top = 0.45;
  // Open canopy, integrated landing markings, and visible exit lane.
  const arrival=new THREE.Group();arrival.name='sanctum:initiation-hall';
  for(const z of [5.8,10])arrival.add(mesh(new THREE.BoxGeometry(8,.26,.32),mat(0x52615d,{metal:.6}),0,4.24,z));
  for(const x of [-3.8,3.8])arrival.add(mesh(new THREE.BoxGeometry(.27,.28,4.6),mat(0x52615d,{metal:.6}),x,4.24,7.9));
  // Slatted overhead frame keeps the sky and exit visible with the game camera.
  for(let i=-3;i<=3;i++)arrival.add(mesh(new THREE.BoxGeometry(.18,.14,4.6),mat(0x7b816c,{metal:.48}),i,4.42,7.9));
  // With the kit, a bronze lattice canopy replaces the plain frame and slats.
  if (archInstance(c, 'SA_HallCanopy', at(0, 7.9, { y: 0, ground: false }))) arrival.children.splice(0, arrival.children.length);
  for(const x of [-2.8,2.8])arrival.add(mesh(new THREE.BoxGeometry(.08,.025,4.3),glow(0x6db3b0),x,.51,7.9,false));
  for(let i=-2;i<=2;i++)arrival.add(mesh(new THREE.BoxGeometry(.26,.025,.7),mat(0xc9ad73,{rough:.8}),i*.65,.515,5.4,false));
  scene.add(arrival);
  // Foundation. With the architecture kit: one carved stone deck (curb, flag
  // courses, rosette, inlay ring and spokes) replaces the disc, tiles and rings.
  if (archInstance(c, 'SA_Deck', at(0, 0, { y: 0, ground: false }))) {
    /* deck placed */
  } else {
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
  const inlay = mesh(new THREE.RingGeometry(12.76, 12.88, 72), glow(0x9dc7ce, 0.52), 0, top + 0.03, 0, false);
  inlay.rotation.x = -Math.PI / 2;
  scene.add(inlay);
  const rim = mesh(new THREE.RingGeometry(13.35, 13.46, 72), glow(0x426f77, 0.5), 0, top + 0.03, 0, false);
  rim.rotation.x = -Math.PI / 2;
  scene.add(rim);
  }

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
      if (c.arch) { if (k === 0) { P.set(ax + dx / 2, ay + dy / 2, az + dz / 2); SC.set(1, 1, len / 4); archInstance(c, 'SA_Span', new THREE.Matrix4().compose(P, Q, SC)); } continue; }
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
    const colour = key === 'sporefield' ? 0xffa6f2 : key === 'relay' ? 0xffb45c : 0xb48cff;
    const archGate = archInstance(c, 'SA_Arch', at(x, z, { y: 0, ry: Math.atan2(zn.x, zn.z) }));
    if (archGate) {
      // the lintel lamp carries the road's colour (wayfinding)
      archGate.traverse((o) => { if (o.isMesh && o.material?.name === 'SA_Lamp') { o.material = o.material.clone(); o.material.emissive.setHex(colour); } });
      const ground = groundHeight(x, z), sx = -zn.z / d, sz = zn.x / d;
      for (const side of [-1, 1]) c.occluders.add(archGate, x + sx * side * 2.05, z + sz * side * 2.05, 0.62, ground, ground + 4.25);
      c.occluders.add(archGate, x, z, 2.7, ground + 4.15, ground + 5.2);
      continue;
    }
    const gate = c.single('sanctum', 'Door_Frame_Square', at(x, z, { y: -0.05, ry: Math.atan2(zn.x, zn.z) }));
    // The lintel lamp is part of the gate so that it fades with it.
    const lamp = new THREE.Mesh(G.box, new THREE.MeshBasicMaterial({ color: colour }));
    lamp.scale.set(1.6, 0.1, 0.1);
    lamp.position.set(0, 4.6, 0);
    gate.add(lamp);
    const ground = groundHeight(x, z);
    const sidewaysX = -zn.z / d;
    const sidewaysZ = zn.x / d;
    for (const side of [-1, 1]) {
      c.occluders.add(gate, x + sidewaysX * side * 2.05, z + sidewaysZ * side * 2.05, 0.62, ground, ground + 4.25);
    }
    c.occluders.add(gate, x, z, 2.7, ground + 4.15, ground + 5.2);
  }
  // Loose kit around the working area (inside existing colliders' footprints
  // or flat on the deck, so nothing solid can be walked through).
  c.cover.add(c.piece('sanctum', 'Prop_Vent_Big'), at(-6.2, 3.4, { y: top + 0.1, ground: false, ry: 0.4 }));
  c.cover.add(c.piece('sanctum', 'Prop_Vent_Big'), at(6.8, 5.2, { y: top + 0.1, ground: false, ry: -0.7 }));
  c.cover.add(c.piece('sanctum', 'Prop_Cable_1'), at(-4.2, -5.6, { y: top + 0.04, ground: false, ry: 2.1 }));

  // The western threshold transitions from the tiled station to terrain.
  // Recessed lights sit on the shoulders, outside the line of travel.
  const deck = c.piece('sanctum', 'Platform_Metal');
  const marker = c.piece('sanctum', 'Prop_Light_Floor');
  const steel = new THREE.Color(0x9c9181);
  const yaw = Math.atan2(roadX, roadZ);
  for (const distance of [14.2, 16.3, 18.4]) {
    const x = roadX * distance;
    const z = roadZ * distance;
    const halfLength = 0.98;
    const rear = groundHeight(x - roadX * halfLength, z - roadZ * halfLength);
    const front = groundHeight(x + roadX * halfLength, z + roadZ * halfLength);
    const cross = groundHeight(x + roadZ, z - roadX) - groundHeight(x - roadZ, z + roadX);
    const rx = Math.atan2(rear - front, 2 * halfLength);
    const rz = Math.atan2(cross, 2);
    c.cover.add(deck, at(x, z, { y: 0.07, ry: yaw, rx, rz, s: [0.77, 1, 0.49] }), steel);
    for (const side of [-1, 1]) {
      const edgeX = x - roadZ * side * 1.42;
      const edgeZ = z + roadX * side * 1.42;
      c.cover.add(marker, at(edgeX, edgeZ, { y: 0.08, ry: yaw + Math.PI / 2, s: 0.42 }), steel);
    }
  }
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

/** Low ground cover. Full-size trees and rocks come from shared world props. */
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
  const inMeadow = () => {
    const a = rnd() * Math.PI * 2;
    const r = 16 + Math.sqrt(rnd()) * (WORLD.radius - 24);
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (inRange(x, z, sf, 24) || inRange(x, z, ZONES.vault, 17) || inRange(x, z, ZONES.relay, 15) || inRange(x, z, ZONES.obelisk, 7) || inRange(x, z, ZONES.survey, 17) || inRange(x, z, ZONES.sinter, 18) || inRange(x, z, ZONES.deep, 20)) return null;
    return [x, z];
  };
  const vary = (base, k = 0.25) => base.clone().multiplyScalar(1 - k / 2 + rnd() * k);
  const N = (n) => Math.round(n * detail);

  // Colonies occupy distinct patches under the canopy and on the shoulders
  // of the approach. Taller silhouettes remain away from the playable lane.
  const patches = SPOREFIELD_COLONIES;
  const fungi = c.piece('nature', 'Mushroom_Common');
  const shelves = c.piece('nature', 'Mushroom_Laetiporus');
  const leaves = c.piece('nature', 'Plant_7_Big');
  const reeds = c.piece('nature', 'Grass_Wispy_Tall');
  const gills = new THREE.Color(0xa48796);
  const foliage = new THREE.Color(0x8e9291);
  for (const [cx, cz, radius, wet] of patches) {
    const pick = () => {
      const a = rnd() * Math.PI * 2;
      const r = radius * Math.sqrt(rnd());
      const x = cx + Math.sin(a) * r;
      const z = cz + Math.cos(a) * r;
      return roadOffset(x, z) > 2.6 || roadDistance(x, z) > 46 ? [x, z] : null;
    };
    // Build coherent mixed-growth silhouettes from the production nature GLBs:
    // low, horizontally spreading wet shelves and taller dry fungal caps.
    // Keep all pieces in the existing c.cover batch/distance-culling budget.
    scatter(N(5), pick, (x, z) => {
      const donor = rnd() < (wet ? .77 : .20) ? shelves : fungi;
      const sx = .68 + rnd() * .55;
      const sy = sx * (wet ? .58 + rnd() * .40 : .92 + rnd() * .42);
      const sz = sx * (.72 + rnd() * .50);
      c.cover.add(donor, at(x, z, {
        y: wet ? -.025 : .02, ry: rnd() * 6,
        rx: (rnd() - .5) * (wet ? .17 : .09), s: [sx, sy, sz],
      }), vary(gills, wet ? .18 : .28));
    });
    scatter(N(6), pick, (x, z) => c.cover.add(leaves, at(x, z, { y: -0.025, ry: rnd() * 6, s: 0.9 + rnd() * 0.55 }), vary(foliage)));
    if (wet) scatter(N(4), pick, (x, z) => c.cover.add(reeds, at(x, z, { y: -0.05, ry: rnd() * 6, s: 0.24 + rnd() * 0.18 }), vary(foliage)));
  }

  // The rest of the Reach: short grass, ferns, pebbles, the odd shrub.
  scatter(N(420), inMeadow, (x, z) => c.cover.add(c.piece('nature', 'Grass_Common_Short'), at(x, z, { ry: rnd() * 6, s: 0.55 + rnd() * 0.6 }), vary(TINT.meadow, 0.4)));
  scatter(N(60), inMeadow, (x, z) => c.cover.add(c.piece('nature', 'Grass_Wispy_Tall'), at(x, z, { ry: rnd() * 6, s: 0.4 + rnd() * 0.3 }), vary(TINT.meadow, 0.3)));
  scatter(N(40), inMeadow, (x, z) => c.cover.add(c.piece('nature', 'Fern_1'), at(x, z, { ry: rnd() * 6, s: 0.45 + rnd() * 0.4 }), vary(TINT.meadow)));
  scatter(N(70), inMeadow, (x, z) => c.cover.add(c.piece('nature', rnd() < 0.5 ? 'Pebble_Round_1' : 'Pebble_Round_3'), at(x, z, { ry: rnd() * 6, s: 1 + rnd() * 2.5 })));
  scatter(N(22), inMeadow, (x, z) => c.cover.add(c.piece('nature', 'Clover_1'), at(x, z, { ry: rnd() * 6, s: 0.5 + rnd() * 0.4 }), vary(TINT.meadow)));
  scatter(N(16), inMeadow, (x, z) => c.cover.add(c.piece('nature', 'Flower_3_Group'), at(x, z, { ry: rnd() * 6, s: 0.4 + rnd() * 0.25 })));


}

function buildParticlesAndLights(scene, detail = 1, opts = {}) {
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
  // Spore air follows the actual GLB colonies instead of a uniform floating
  // disk; one Points draw call, bounded by visual detail and reduced motion.
  const moteCount = Math.round(40 + 70 * Math.max(0, Math.min(1, detail)));
  const pts = planSporeMotes(moteCount, groundHeight);
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const spores = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xe0c5e3, size: 0.095, transparent: true, opacity: 0.58, depthWrite: false }));
  scene.add(spores);
  // A soft violet glow pooled in the bog, so the Sporefield is not just dark.
  const bog = new THREE.PointLight(0xb194ce, 51, 46, 1.6);
  bog.position.set(ZONES.sporefield.x, 5, ZONES.sporefield.z);
  scene.add(bog);
  return (dt, t) => {
    if (opts.reducedMotion?.()) {
      spores.position.set(0, 0, 0);
      return;
    }
    spores.position.y = Math.sin(t * 0.4) * 0.16;
    spores.position.x = Math.sin(t * 0.17) * 0.22;
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
    if (Math.hypot(x, z) < 15 || Math.hypot(x - ZONES.vault.x, z - ZONES.vault.z) < 15 || inRange(x, z, ZONES.survey, 17) || inRange(x, z, ZONES.sinter, 18) || inRange(x, z, ZONES.deep, 20)) continue;
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
  const skyGroup = buildSky();
  scene.add(skyGroup);
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
  // Direction toward the sun; the shadow camera follows the player along it.
  const dir = new THREE.Vector3(-0.55, 0.72, 0.42).normalize();

  const anim = [];
  const occluders = new Occluders();
  const animators = [];
  // Sanctum kit emissives (channels pulse slowly; lamps stay steady)
  const archGlowMats = [];
  const c = {
    scene,
    detail,
    anim,
    occluders,
    solid: new Batcher(46), // casts and receives shadows
    cover: new Batcher(30), // ground cover and flat pieces: receives only
    far: new Batcher(60), // backdrop: no shadows at all
    beads: [], // [x, y, z, radius, colour] small glowing spheres
    pieceMeta: (bundle,name) => assets?.pieceMeta(bundle,name),
    arch: assets?.sanctumArch ? new Map(assets.sanctumArch.scene.children.map((o) => [o.name, o])) : null,
    archGlow: (() => { const mats = {}; return (name) => { if (!mats[name]) { let m = null; assets.sanctumArch.scene.traverse((o) => { if (!m && o.isMesh && o.material?.name === name) m = o.material; }); mats[name] = (m || new THREE.MeshStandardMaterial()).clone(); mats[name].toneMapped = false; archGlowMats.push(mats[name]); } return mats[name]; }; })(),
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
  if (archGlowMats.length) anim.push((dt, t) => { for (const m of archGlowMats) if (m.name === 'SA_Channel') m.emissiveIntensity = 2.6 + 0.9 * Math.sin(t * 0.8); });
  if (!kits) {
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
  let stillpointStatus='unavailable',stillpoint=null,startStillpoint=null;
  for (const p of PROPS) {
    if(p.type==='stillpoint_rest'){
      // Ambient creature, not scenery: no phantom mineral collider on failure.
      // Keep the existing deferred load so character creation does not compete for textures.
      if(assets)startStillpoint=()=>{
        startStillpoint=null;stillpointStatus='loading';
        loadStillpoint(THREE,assets.loader,p).then(model=>{
          scene.add(model.group);stillpoint=model;stillpointStatus='ready';
        }).catch(err=>{
          stillpointStatus='unavailable';
          console.warn('[scene] Stillpoint unavailable:',err.message||err);
        });
      };
      continue;
    }
    // Arrival hall in the Sanctum's carved stone and bronze (colliders unchanged)
    // Hall pieces keep the procedural prop's object name: tools and e2e checks
    // look the arrival hall up by these names whichever art is loaded.
    const hall = { arrival_wall: ['SA_HallWall', 'arrival:side-enclosure'], arrival_pillar: ['SA_HallPillar', 'arrival:column'], arrival_arch: ['SA_HallLintel', 'arrival:threshold-arch'] }[p.type];
    const hallHolder = hall && archInstance(c, hall[0], at(p.x, p.z));
    if (hallHolder) { hallHolder.name = hall[1]; hallHolder.userData.archPiece = hall[0]; continue; }
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
    obj.position.y += groundHeight(p.x, p.z) - (Object.hasOwn(STATIC_ART, p.type) || p.type === 'sanctum_fabricator' || p.type.startsWith('sinter_') || (p.type.startsWith('deep_') || p.type.startsWith('arrival_') || p.type.startsWith('annex_')) ? 0 : 0.15);
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

  buildDeepArchitecture(scene);
  const kestrelVisual = buildKestrelDeepVisuals(THREE, DEEP, kits ? assets : null, { detail, reducedMotion: opts.reducedMotion });
  scene.add(kestrelVisual.group);
  // Separate industrial encounter deck; the authoritative rectangular limit
  // matches the visible perimeter, with flat walkable floor and clear lanes.
  const annex=RIFT_ANNEX,annexFloor=new THREE.Group();annexFloor.name='rift:annex-deck';
  const ax=annex.x,az=annex.z;
  annexFloor.add(mesh(new THREE.BoxGeometry(annex.hw*2+.6,.5,annex.hd*2+.6),mat(0x26373e,{rough:.74,metal:.35}),ax,-.27,az));
  if(kits)for(let x=-annex.hw+2;x<annex.hw;x+=4)for(let z=-annex.hd+2;z<annex.hd;z+=4)
    c.cover.add(c.piece('sanctum',(Math.abs(x)+Math.abs(z))%8?'Platform_Metal':'Platform_DarkPlates'),at(ax+x,az+z,{ground:false,y:0}));
  for(const sign of [-1,1]){
    annexFloor.add(mesh(new THREE.BoxGeometry(.5,4.5,annex.hd*2+1),mat(0x303e45,{metal:.5}),ax+sign*(annex.hw+.25),2.25,az));
    annexFloor.add(mesh(new THREE.BoxGeometry(annex.hw*2+1,4.5,.5),mat(0x303e45,{metal:.5}),ax,2.25,az+sign*(annex.hd+.25)));
    annexFloor.add(mesh(new THREE.BoxGeometry(.055,.055,annex.hd*2),mat(0x577a7b,{rough:.65,emissive:0x345455,ei:.2}),ax+sign*annex.hw,1.1,az,false));
    annexFloor.add(mesh(new THREE.BoxGeometry(annex.hw*2,.055,.055),mat(0x577a7b,{rough:.65,emissive:0x345455,ei:.2}),ax,1.1,az+sign*annex.hd,false));
  }
  if(kits)for(const sign of [-1,1])for(const z of [-14,-6,2,10,14]){
    // External supports remain outside the collision perimeter.
    c.single('sanctum','Column_Hollow',at(ax+sign*(annex.hw+1),az+z,{ground:false,s:[.85,1.04,.85]}));
  }
  // Variation is tied to the three actual rooms, not a loading-screen label.
  for(const [z,color,power] of [[23,0x9fcbd4,65],[1,0xd4ae83,78],[-22,0xa79bde,85]]){
    const lamp=new THREE.PointLight(color,power,24,1.7);lamp.position.set(ax,5.5,z);annexFloor.add(lamp);
    for(const x of [-12,12]){
      annexFloor.add(mesh(new THREE.BoxGeometry(1.8,.04,8),mat(color,{rough:.85}),ax+x,.025,z,false));
      annexFloor.add(mesh(new THREE.BoxGeometry(.08,.06,6),mat(color,{rough:.7,emissive:color,ei:.12}),ax+x,.06,z,false));
    }
  }
  // Wide, collision-free floor markings guide the offset route.
  for(const [x,z] of [[6,12],[-6,-9]])for(let i=-2;i<=2;i++)annexFloor.add(mesh(new THREE.BoxGeometry(.24,.035,2.2),mat(0xb9a36b,{rough:.9}),ax+x+i*.8,.035,z,false));
  scene.add(annexFloor);
  // Severance Gate and its (provisional) approach pocket: a separate region.
  const severance = buildSeverancePocket(THREE, scene, { assets: kits ? assets : null, ground: groundHeight, rockGeo: (seed) => rockGeos[seed % rockGeos.length],
    lighting: { sky: skyGroup, ambient, sun, dir } });
  const foundry = buildSilentFoundry(THREE, scene, { lighting: { sky: skyGroup, ambient, sun }, loader: kits ? assets.loader : null });
  // Flush, noninteractive surface details on the excavated flat floor.
  // Explicit positions, no added colliders, no tall geometry in the travel lane.
  const serviceDeck = new THREE.Group();
  serviceDeck.name = 'brineworks-service-deck';
  const deckY = groundHeight(43, -35);
  const deck = mat(0x545753, { rough: 0.93, metal: 0.13 });
  const joint = mat(0x303635, { rough: 0.94 });
  const faded = mat(0x92774d, { rough: 0.93 });
  const flat = (x, z, w, d, material, height = 0.035) => {
    const tile = scaled(G.box, material, w, 0.012, d, x, deckY + height, z, false);
    tile.receiveShadow = true;
    serviceDeck.add(tile);
  };
  // Work areas only; the approach to both evidence terminals stays soil.
  for (const x of [38, 49]) {
    flat(x, -38.4, 2.8, 2.4, deck);
    for (const side of [-1, 1]) flat(x + side * 1.34, -38.4, 0.07, 2.38, faded, 0.048);
    flat(x, -37.22, 2.7, 0.07, joint, 0.048);
  }
  // Recessed-looking service channel on the pump approach, no raised obstruction.
  flat(43, -35.8, 0.53, 4.0, joint);
  for (let i = 0; i < 12; i++) flat(43, -37.65 + i * 0.33, 0.48, 0.045, deck, 0.048);
  scene.add(serviceDeck);
  scene.add(buildSiteMarkings(THREE,deckY).group);

  scene.add(buildSinterHabitat(THREE));
  if (kits) buildVegetation(c, detail);
  else buildProceduralDecor(scene);
  anim.push(buildParticlesAndLights(scene, detail, opts));

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

  const relayStructure = scene.getObjectByName('relay:structural-mast');
  let relayFx = null;
  const points = [];
  const coverRange = 30 + 55 * detail;
  // Static Reach dressing, hidden while the camera is inside the Severance
  // Expanse (700 m south, behind its ridge): nothing of it can be seen there.
  const reachStatic = scene.children.filter((c) => c !== severance.group && c !== foundry.group && c !== skyGroup && !c.isLight && !c.isCamera && !severance.owns(c));
  let reachHidden = null;
  const cullReach = (eye) => {
    const away = !!eye && (inSeverancePocket(eye.x, eye.z, 40) || inSilentFoundry(eye.x, eye.z, 4));
    if (away && !reachHidden) { reachHidden = reachStatic.filter((c) => c.visible); for (const c of reachHidden) c.visible = false; }
    else if (!away && reachHidden) { for (const c of reachHidden) c.visible = true; reachHidden = null; }
  };
  return {
    sun,
    ambient,
    ambientBase: ambient.intensity,
    severance: severance.landmark,
    severancePocket: severance,
    foundry,
    stats: { kits, batches, occluders: occluders.list.length, fallbacks, get prototypeArt() { return staticArtStatus(prototypeStates); }, get prototypeAssets() { return { ...prototypeStates }; }, get stillpoint() { return stillpointStatus; }, get severance() { return severance.landmark.stats(); }, get severanceKit() { return severance.kit.stats(); }, get foundry() { return foundry.stats(); }, get kestrel() { return kestrelVisual.stats; } },
    occluders,
    // Presentation-only fault effects. The object remains usable without VFX,
    // and the shared engine owns transient particle/ribbon lifetimes.
    attachReachFx(engine) {
      relayFx?.dispose();
      relayFx = relayStructure && engine ? createReachRelayFx(THREE, relayStructure, engine) : null;
    },
    /**
     * @param focus the player's feet
     * @param view optional {eye, points}: camera position and the points that
     *   must stay visible (player, target), for occluder fading
     */
    update(dt, t, focus, view) {
      for (const fn of anim) fn(dt, t);
      kestrelVisual.update(dt, t, focus);
      relayFx?.update(dt, focus);
      for (const e of animators) e.a.update(dt);
      if(view&&startStillpoint&&Math.hypot(focus.x-8,focus.z+1.5)<40)startStillpoint();
      if(stillpoint)stillpoint.update(dt,focus,opts.reducedMotion?.()??false,view?.serverSeconds??0);
      severance.update(dt, t, view?.eye ?? focus);
      foundry.update(dt, t, view?.eye ?? focus);
      cullReach(view?.eye ?? focus);
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
