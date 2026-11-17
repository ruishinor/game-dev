// Procedural, original character models and their animation.
// Each factory returns {group, height, radius, hover, update(dt, st)} where
// `st` carries presentation state: speed, t, dead, attack, cast, hit, air…

import * as THREE from '/vendor/three/three.module.js';

const std = (color, o = {}) =>
  new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness: o.rough ?? 0.8,
    metalness: o.metal ?? 0.1,
    emissive: o.emissive ?? 0x000000,
    emissiveIntensity: o.ei ?? 1,
  });
const lit = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: opacity !== undefined, opacity: opacity ?? 1 });

const BOX = new THREE.BoxGeometry(1, 1, 1);
const SPH = new THREE.SphereGeometry(1, 12, 9);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 8);
const OCT = new THREE.OctahedronGeometry(1, 0);
const ICO = new THREE.IcosahedronGeometry(1, 0);
const CONE = new THREE.ConeGeometry(1, 1, 6);
const TORUS = new THREE.TorusGeometry(1, 0.07, 6, 24);

function part(geo, material, sx, sy, sz, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function pivot(x, y, z, ...children) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  for (const c of children) g.add(c);
  return g;
}

/** Briefly tint a set of materials toward white when struck. */
function flasher(mats) {
  const base = mats.map((m) => m.emissive.clone());
  const white = new THREE.Color(0xffffff);
  return (k) => {
    mats.forEach((m, i) => m.emissive.copy(base[i]).lerp(white, k * 0.55));
  };
}

const ease = (k) => 1 - (1 - k) * (1 - k);

// --- humanoids ---------------------------------------------------------------

function humanoid(o) {
  const group = new THREE.Group();
  const body = std(o.body, { metal: o.metal ?? 0.2 });
  const trim = std(o.trim, { metal: 0.5, rough: 0.5 });
  const skin = std(o.skin ?? 0xc9a58a);
  const glowMat = lit(o.glow);
  const w = o.bulk;

  const legGeo = (side) => {
    const upper = part(BOX, body, 0.24 * w, 0.5, 0.26 * w, 0, -0.25, 0);
    const lower = part(BOX, trim, 0.2 * w, 0.48, 0.24 * w, 0, -0.7, 0.01);
    const foot = part(BOX, trim, 0.22 * w, 0.12, 0.36, 0, -0.9, 0.07);
    return pivot(side * 0.17 * w, 0.96, 0, upper, lower, foot);
  };
  const legL = legGeo(-1);
  const legR = legGeo(1);

  const torso = pivot(0, 0.96, 0);
  torso.add(part(BOX, body, 0.6 * w, 0.42, 0.34 * w, 0, 0.5, 0));
  torso.add(part(BOX, trim, 0.5 * w, 0.3, 0.3 * w, 0, 0.15, 0));
  const core = part(OCT, glowMat, 0.1, 0.13, 0.06, 0, 0.52, 0.18 * w);
  core.castShadow = false;
  torso.add(core);
  const head = pivot(0, 0.86, 0, part(SPH, skin, 0.17, 0.2, 0.18));
  const visor = part(BOX, glowMat, 0.26, 0.05, 0.1, 0, 0.03, 0.13);
  visor.castShadow = false;
  head.add(visor);
  torso.add(head);

  const armGeo = (side) => {
    const upper = part(BOX, body, 0.17 * w, 0.4, 0.19 * w, 0, -0.2, 0);
    const fore = part(BOX, trim, 0.15 * w, 0.4, 0.17 * w, 0, -0.58, 0);
    return pivot(side * (0.3 * w + 0.1), 0.66, 0, upper, fore);
  };
  const armL = armGeo(-1);
  const armR = armGeo(1);
  torso.add(armL, armR);
  group.add(legL, legR, torso);

  const extras = o.extras ? o.extras({ group, torso, head, armL, armR, body, trim, glowMat, w }) : null;
  const flash = flasher([body, trim, skin]);
  let phase = 0;
  let deadK = 0;

  return {
    group,
    height: 1.95,
    radius: 0.45,
    hover: 0,
    update(dt, st) {
      const moving = Math.min(1, st.speed / 5);
      phase += dt * (4 + st.speed * 1.25) * (moving > 0.05 ? 1 : 0);
      const swing = Math.sin(phase) * 0.85 * moving;
      const breathe = Math.sin(st.t * 1.8) * 0.012;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      armL.rotation.x = -swing * 0.7;
      armR.rotation.x = swing * 0.7;
      armL.rotation.z = 0.08;
      armR.rotation.z = -0.08;
      torso.position.y = 0.96 + Math.abs(Math.sin(phase)) * 0.05 * moving + breathe;
      torso.rotation.x = moving * 0.12;
      torso.rotation.y = 0;
      if (st.air) {
        legL.rotation.x = 0.5;
        legR.rotation.x = -0.25;
        armL.rotation.z = 0.7;
        armR.rotation.z = -0.7;
      }
      if (st.attack > 0) {
        // A committed overhand strike with the right arm.
        const k = ease(st.attack);
        armR.rotation.x = -2.4 * k + 0.5 * (1 - k);
        torso.rotation.y = -0.45 * k;
      }
      if (st.cast > 0) {
        const k = ease(st.cast);
        armL.rotation.x = -1.5 * k;
        armR.rotation.x = -1.5 * k;
        armL.rotation.z = 0.35 * k;
        armR.rotation.z = -0.35 * k;
      }
      deadK += ((st.dead ? 1 : 0) - deadK) * Math.min(1, dt * 6);
      group.rotation.x = -deadK * 1.5;
      group.position.y = deadK * 0.25;
      flash(st.hit);
      if (extras) extras(dt, st);
    },
  };
}

export function makeVanguard() {
  return humanoid({
    body: 0x4a5560,
    trim: 0x8a6a3c,
    glow: 0xffb45c,
    bulk: 1.28,
    metal: 0.6,
    extras({ torso, armL, armR, trim, glowMat, w }) {
      // Heavy pauldrons and capacitor gauntlets instead of a shield.
      for (const side of [-1, 1]) {
        const p = part(BOX, trim, 0.34, 0.16, 0.4, side * (0.3 * w + 0.12), 0.74, 0);
        p.rotation.z = side * -0.25;
        torso.add(p);
      }
      const coils = [];
      for (const arm of [armL, armR]) {
        const coil = part(TORUS, glowMat, 0.14, 0.14, 0.5, 0, -0.62, 0);
        coil.rotation.x = Math.PI / 2;
        coil.castShadow = false;
        arm.add(coil);
        coils.push(coil);
      }
      const spine = part(BOX, glowMat, 0.08, 0.36, 0.05, 0, 0.45, -0.19 * w);
      spine.castShadow = false;
      torso.add(spine);
      return (dt, st) => {
        // Gauntlet coils swell with stored Charge.
        const k = 0.14 + (st.charge ?? 0) * 0.1;
        for (const c of coils) c.scale.set(k, k, 0.5);
      };
    },
  });
}

export function makeSymbiotech() {
  return humanoid({
    body: 0x2f5a52,
    trim: 0x1f3a3c,
    glow: 0x7dffc4,
    bulk: 0.98,
    metal: 0.1,
    extras({ torso, head, glowMat, trim }) {
      // A culture tank on the back, with feed lines to a collar.
      const tank = part(CYL, std(0x1b2e30, { metal: 0.6, rough: 0.4 }), 0.14, 0.42, 0.14, 0, 0.42, -0.26);
      const fluid = part(CYL, glowMat, 0.1, 0.3, 0.1, 0, 0.42, -0.26);
      fluid.castShadow = false;
      torso.add(tank, fluid);
      for (const side of [-1, 1]) {
        const tube = part(CYL, glowMat, 0.022, 0.4, 0.022, side * 0.12, 0.66, -0.14);
        tube.rotation.x = 0.7;
        tube.castShadow = false;
        torso.add(tube);
      }
      head.add(part(BOX, trim, 0.4, 0.07, 0.34, 0, -0.15, 0));
      return (dt, st) => {
        fluid.scale.y = 0.3 * (0.75 + Math.sin(st.t * 2.2) * 0.12);
      };
    },
  });
}

export function makeArchivist() {
  const m = humanoid({ body: 0x5a4f78, trim: 0x2d2a44, glow: 0xffd27a, bulk: 0.95, skin: 0xd9c2a8 });
  const pad = part(BOX, lit(0xffd27a, 0.85), 0.34, 0.24, 0.02, 0.5, 1.35, 0.35);
  pad.castShadow = false;
  m.group.add(pad);
  const robe = part(CONE, std(0x4a4168), 0.42, 0.9, 0.42, 0, 0.5, 0);
  m.group.add(robe);
  const base = m.update;
  m.update = (dt, st) => {
    base(dt, st);
    pad.position.y = 1.35 + Math.sin(st.t * 1.5) * 0.05;
    pad.rotation.y = Math.sin(st.t * 0.7) * 0.3 - 0.3;
  };
  return m;
}

// --- companion ---------------------------------------------------------------

export function makeMender() {
  const group = new THREE.Group();
  const shell = std(0x2a4f4a, { metal: 0.5, rough: 0.4 });
  const coreMat = lit(0x7dffc4);
  const core = part(ICO, coreMat, 0.2, 0.2, 0.2);
  core.castShadow = false;
  const halo = part(SPH, lit(0x7dffc4, 0.22), 0.34, 0.34, 0.34);
  halo.castShadow = false;
  const ribs = [];
  for (let i = 0; i < 3; i++) {
    const rib = part(TORUS, shell, 0.3, 0.3, 0.3);
    rib.rotation.set(Math.PI / 2, 0, (i / 3) * Math.PI);
    ribs.push(rib);
    group.add(rib);
  }
  const tendrils = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const t = pivot(Math.sin(a) * 0.14, -0.12, Math.cos(a) * 0.14, part(CONE, std(0x4fa58c, { emissive: 0x1d5c48, ei: 0.8 }), 0.035, 0.5, 0.035, 0, -0.25, 0));
    t.children[0].rotation.x = Math.PI;
    tendrils.push(t);
    group.add(t);
  }
  group.add(core, halo);
  const colours = { triage: new THREE.Color(0x7dffc4), guard: new THREE.Color(0x7fd0ff), assist: new THREE.Color(0xffc46b), dormant: new THREE.Color(0x56616a) };
  let spin = 0;
  return {
    group,
    height: 0.8,
    radius: 0.4,
    hover: 1.5,
    update(dt, st) {
      const active = st.act === 'mending' || st.act === 'harrying' || st.act === 'bonding';
      spin += dt * (active ? 5 : 1.4);
      ribs.forEach((r, i) => {
        r.rotation.z = (i / 3) * Math.PI + spin * (i % 2 ? -1 : 1);
        r.rotation.y = spin * 0.6;
      });
      tendrils.forEach((t, i) => {
        t.rotation.x = Math.sin(st.t * 2.4 + i) * 0.35 + Math.min(1, st.speed / 6) * 0.9;
        t.rotation.z = Math.cos(st.t * 2 + i * 1.7) * 0.25;
      });
      const c = colours[st.act === 'dormant' ? 'dormant' : st.mode] || colours.triage;
      coreMat.color.lerp(c, Math.min(1, dt * 6));
      halo.material.color.copy(coreMat.color);
      const pulse = 1 + Math.sin(st.t * (active ? 9 : 2.5)) * (active ? 0.22 : 0.08) + st.cast * 0.8;
      core.scale.setScalar(0.2 * pulse);
      halo.scale.setScalar(0.34 * pulse);
      // Bonded: shrink onto the host's shoulder.
      const target = st.act === 'bonded' ? 0.55 : 1;
      group.scale.setScalar(group.scale.x + (target - group.scale.x) * Math.min(1, dt * 8));
      group.position.y = Math.sin(st.t * 2.1) * 0.08;
    },
  };
}

// --- enemies -----------------------------------------------------------------

export function makeSkitter() {
  const group = new THREE.Group();
  const hide = std(0x5a2f66, { rough: 0.6 });
  const plate = std(0x2e1838, { rough: 0.5, metal: 0.2 });
  const body = pivot(0, 0.48, 0);
  body.add(part(SPH, hide, 0.55, 0.3, 0.75));
  body.add(part(SPH, plate, 0.42, 0.26, 0.5, 0, 0.1, -0.12));
  body.add(part(SPH, plate, 0.3, 0.2, 0.3, 0, 0, 0.62));
  const eyes = lit(0xff5ad1);
  for (const s of [-1, 1]) {
    const e = part(SPH, eyes, 0.06, 0.06, 0.06, s * 0.14, 0.06, 0.86);
    e.castShadow = false;
    body.add(e);
    const m = part(CONE, plate, 0.05, 0.3, 0.05, s * 0.12, -0.08, 0.92);
    m.rotation.x = Math.PI / 2 + 0.4;
    body.add(m);
  }
  const sacs = [];
  for (let i = 0; i < 4; i++) {
    const s = part(SPH, lit(0xffa6f2), 0.09, 0.09, 0.09, (i % 2 ? 1 : -1) * 0.2, 0.3, -0.35 + i * 0.16);
    s.castShadow = false;
    sacs.push(s);
    body.add(s);
  }
  const legs = [];
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1;
    const z = -0.4 + Math.floor(i / 2) * 0.4;
    const leg = pivot(side * 0.4, 0.5, z, part(BOX, plate, 0.6, 0.07, 0.08, side * 0.3, 0.12, 0), part(BOX, plate, 0.07, 0.6, 0.07, side * 0.6, -0.15, 0));
    legs.push(leg);
    group.add(leg);
  }
  group.add(body);
  const flash = flasher([hide, plate]);
  let phase = 0;
  let deadK = 0;
  return {
    group,
    height: 1.0,
    radius: 0.7,
    hover: 0,
    update(dt, st) {
      phase += dt * (3 + st.speed * 3.2);
      const amp = 0.12 + Math.min(1, st.speed / 3) * 0.45;
      legs.forEach((l, i) => {
        l.rotation.y = Math.sin(phase + (i % 2 ? Math.PI : 0) + Math.floor(i / 2)) * amp;
        l.rotation.z = Math.cos(phase + i) * amp * 0.3;
      });
      body.position.y = 0.48 + Math.sin(phase * 2) * 0.03 + ease(st.attack) * 0.12;
      body.position.z = ease(st.attack) * 0.45;
      body.rotation.x = -ease(st.attack) * 0.35;
      sacs.forEach((s, i) => s.scale.setScalar(0.09 * (0.85 + Math.sin(st.t * 3 + i) * 0.2)));
      deadK += ((st.dead ? 1 : 0) - deadK) * Math.min(1, dt * 7);
      group.rotation.z = deadK * Math.PI;
      group.position.y = deadK * 0.75;
      group.scale.y = 1 - deadK * 0.35;
      flash(st.hit);
    },
  };
}

export function makeSentinel() {
  const group = new THREE.Group();
  const hull = std(0x6b6e72, { metal: 0.7, rough: 0.35 });
  const dark = std(0x26282c, { metal: 0.6, rough: 0.5 });
  const body = pivot(0, 0, 0);
  body.add(part(OCT, hull, 0.55, 0.7, 0.55));
  body.add(part(CYL, dark, 0.3, 0.3, 0.3, 0, 0, 0));
  const eyeMat = lit(0xff5a4a);
  const eye = part(SPH, eyeMat, 0.14, 0.14, 0.14, 0, 0.05, 0.42);
  eye.castShadow = false;
  body.add(eye);
  const ring = part(TORUS, dark, 0.85, 0.85, 1.2);
  ring.rotation.x = Math.PI / 2;
  const fins = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const fin = part(BOX, hull, 0.08, 0.5, 0.26, Math.sin(a) * 0.85, 0, Math.cos(a) * 0.85);
    fin.rotation.y = a;
    fins.push(fin);
    ring.add(fin);
    fin.position.set(Math.sin(a) * 1, Math.cos(a) * 1, 0);
    fin.rotation.set(0, 0, -a);
    fin.scale.set(0.1, 0.3, 0.45);
  }
  group.add(body, ring);
  const flash = flasher([hull, dark]);
  const cool = new THREE.Color(0xff5a4a);
  const hot = new THREE.Color(0xfff2a0);
  let deadK = 0;
  return {
    group,
    height: 1.4,
    radius: 0.8,
    hover: 1.5,
    update(dt, st) {
      deadK += ((st.dead ? 1 : 0) - deadK) * Math.min(1, dt * 5);
      ring.rotation.z += dt * (st.casting ? 9 : 1.6) * (1 - deadK);
      body.rotation.y = Math.sin(st.t * 0.9) * 0.15 * (1 - deadK);
      const bob = Math.sin(st.t * 2) * 0.12 * (1 - deadK);
      group.position.y = bob - deadK * 1.2;
      group.rotation.z = deadK * 1.1;
      body.position.z = ease(st.attack) * -0.2;
      eyeMat.color.copy(cool).lerp(hot, st.casting ? 0.5 + Math.sin(st.t * 30) * 0.5 : ease(st.attack));
      if (st.dead) eyeMat.color.setHex(0x2a2a2a);
      eye.scale.setScalar(0.14 * (st.casting ? 1.6 : 1));
      flash(st.hit);
    },
  };
}

export function makeWarden() {
  const group = new THREE.Group();
  const stone = std(0x4d4b68, { rough: 0.85, metal: 0.2 });
  const dark = std(0x2b2a3d, { rough: 0.7, metal: 0.4 });
  const runeMat = lit(0xb48cff);
  const legL = pivot(-0.55, 1.5, 0, part(BOX, stone, 0.6, 1.5, 0.7, 0, -0.75, 0));
  const legR = pivot(0.55, 1.5, 0, part(BOX, stone, 0.6, 1.5, 0.7, 0, -0.75, 0));
  const torso = pivot(0, 1.5, 0);
  torso.add(part(BOX, stone, 1.9, 1.3, 1.1, 0, 0.9, 0));
  torso.add(part(BOX, dark, 1.3, 0.6, 0.9, 0, 0.2, 0));
  const core = part(OCT, runeMat, 0.34, 0.44, 0.2, 0, 0.95, 0.52);
  core.castShadow = false;
  torso.add(core);
  const head = part(BOX, dark, 0.6, 0.5, 0.6, 0, 1.85, 0.1);
  const eye = part(BOX, runeMat, 0.42, 0.08, 0.05, 0, 1.88, 0.41);
  eye.castShadow = false;
  torso.add(head, eye);
  const arm = (side) => {
    const a = pivot(side * 1.3, 1.35, 0, part(BOX, stone, 0.55, 1.2, 0.6, 0, -0.6, 0), part(BOX, dark, 0.75, 0.8, 0.8, 0, -1.55, 0));
    const band = part(BOX, runeMat, 0.78, 0.08, 0.83, 0, -1.2, 0);
    band.castShadow = false;
    a.add(band);
    return a;
  };
  const armL = arm(-1);
  const armR = arm(1);
  torso.add(armL, armR);
  const shards = [];
  for (let i = 0; i < 4; i++) {
    const s = part(OCT, stone, 0.22, 0.4, 0.22);
    shards.push(s);
    group.add(s);
  }
  group.add(legL, legR, torso);
  const flash = flasher([stone, dark]);
  const calm = new THREE.Color(0xb48cff);
  const angry = new THREE.Color(0xff6a8a);
  let phase = 0;
  let deadK = 0;
  return {
    group,
    height: 4.0,
    radius: 1.6,
    hover: 0,
    update(dt, st) {
      const moving = Math.min(1, st.speed / 3);
      phase += dt * 3.2 * moving;
      const swing = Math.sin(phase) * 0.5 * moving;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      armL.rotation.x = -swing * 0.6;
      armR.rotation.x = swing * 0.6;
      torso.position.y = 1.5 + Math.abs(Math.sin(phase)) * 0.08 + Math.sin(st.t * 1.2) * 0.02;
      if (st.attack > 0) armR.rotation.x = -2.2 * ease(st.attack);
      if (st.casting) {
        // Both fists rise before a slam.
        armL.rotation.x = -2.6;
        armR.rotation.x = -2.6;
        torso.position.y += Math.sin(st.t * 40) * 0.02;
      }
      runeMat.color.copy(calm).lerp(angry, st.casting ? 0.6 + Math.sin(st.t * 24) * 0.4 : st.combat ? 0.35 : 0);
      shards.forEach((s, i) => {
        const a = st.t * 0.7 + (i / 4) * Math.PI * 2;
        s.position.set(Math.sin(a) * 1.9, 3.6 + Math.sin(st.t * 1.3 + i) * 0.3 - deadK * 3.2, Math.cos(a) * 1.9);
        s.rotation.y = a * 2;
      });
      deadK += ((st.dead ? 1 : 0) - deadK) * Math.min(1, dt * 3);
      group.rotation.x = deadK * 1.45;
      group.position.y = deadK * 0.5;
      if (st.dead) runeMat.color.setHex(0x2a2a33);
      flash(st.hit);
    },
  };
}

// --- world objects -----------------------------------------------------------

export function makeObelisk() {
  const group = new THREE.Group();
  const stone = std(0x26384a, { rough: 0.5, metal: 0.4 });
  const light = lit(0x7fd0ff);
  group.add(part(CYL, stone, 1.3, 0.4, 1.3, 0, 0.2, 0));
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.8, 5.5, 4), stone);
  shaft.position.y = 3.1;
  shaft.castShadow = true;
  group.add(shaft);
  const tip = part(OCT, light, 0.4, 0.8, 0.4, 0, 6.6, 0);
  tip.castShadow = false;
  group.add(tip);
  const seams = [];
  for (let i = 0; i < 4; i++) {
    const s = part(BOX, light, 0.06, 4.2, 0.06, Math.sin((i * Math.PI) / 2 + Math.PI / 4) * 0.47, 3, Math.cos((i * Math.PI) / 2 + Math.PI / 4) * 0.47);
    s.castShadow = false;
    seams.push(s);
    group.add(s);
  }
  const shards = [];
  for (let i = 0; i < 5; i++) {
    const s = part(OCT, stone, 0.14, 0.3, 0.14);
    shards.push(s);
    group.add(s);
  }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 80, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.position.y = 46;
  group.add(beam);
  const lamp = new THREE.PointLight(0x7fd0ff, 60, 26, 1.8);
  lamp.position.y = 4;
  group.add(lamp);
  return {
    group,
    height: 7.4,
    radius: 1.0,
    hover: 0,
    update(dt, st) {
      tip.rotation.y = st.t;
      tip.position.y = 6.6 + Math.sin(st.t * 1.1) * 0.2;
      shards.forEach((s, i) => {
        const a = st.t * 0.5 + (i / 5) * Math.PI * 2;
        s.position.set(Math.sin(a) * 1.7, 2 + i * 0.8 + Math.sin(st.t + i) * 0.25, Math.cos(a) * 1.7);
        s.rotation.set(st.t + i, st.t * 0.7, 0);
      });
      const k = 0.7 + Math.sin(st.t * 2) * 0.3 + st.cast * 2;
      seams.forEach((s) => (s.scale.x = s.scale.z = 0.06 * k));
    },
  };
}

// Low sealed field instrument; distinct housing silhouettes for the two evidence sources.
function makeSurveyTerminal(ledger) {
  const group = new THREE.Group();
  const dark = std(0x303c3c, { rough: 0.78, metal: 0.45 });
  const paint = std(ledger ? 0x98805a : 0x536f70, { rough: 0.68, metal: 0.25 });
  const steel = std(0x737c7a, { rough: 0.48, metal: 0.65 });
  const display = std(ledger ? 0xd5b37b : 0x8bc7bc, { emissive: ledger ? 0x886124 : 0x416e65, ei: 0.6 });
  group.add(part(BOX, dark, 1.4, 0.18, 1.0, 0, 0.09, 0));
  group.add(part(BOX, paint, 1.12, 0.98, 0.8, 0, 0.65, 0));
  group.add(part(BOX, steel, 1.23, 0.15, 0.9, 0, 1.15, 0));
  for (const side of [-1, 1]) {
    group.add(part(BOX, dark, 0.11, 0.9, 0.88, side * 0.55, 0.66, 0));
    for (let i = 0; i < 3; i++) group.add(part(BOX, steel, 0.18, 0.035, 0.025, side * 0.36, 0.55 + i * 0.12, 0.42));
  }
  group.add(part(BOX, dark, 0.85, 0.055, 0.55, 0, 1.24, 0));
  group.add(part(BOX, display, 0.69, 0.02, 0.37, 0, 1.28, 0));
  if (!ledger) {
    group.add(part(CYL, steel, 0.17, 0.62, 0.17, -0.43, 1.55, -0.3));
    group.add(part(SPH, dark, 0.24, 0.15, 0.24, -0.43, 1.88, -0.3));
  } else {
    group.add(part(BOX, dark, 0.9, 0.24, 0.12, 0, 1.41, -0.36));
  }
  return { group, height: ledger ? 1.65 : 2.0, radius: 0.8, hover: 0, update() {} };
}

// Small shared deterministic surface texture: sediment veins and pores,
// sampled through each carapace plate's UVs. No external downloads,
// randomness, extra materials per entity, or per-frame texture generation.
let sinterTexture;
function mineralTexture(){
  if(sinterTexture)return sinterTexture;
  const n=64,data=new Uint8Array(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const i=(y*n+x)*4;
    const band=Math.sin(y*0.61+Math.sin(x*0.35)*1.8);
    const grain=Math.sin(x*19.27+y*73.13)*43758.54;
    const noise=grain-Math.floor(grain);
    const value=Math.round(196+band*19+(noise-0.5)*44);
    data[i]=value;data[i+1]=value;data[i+2]=value;data[i+3]=255;
  }
  sinterTexture=new THREE.DataTexture(data,n,n,THREE.RGBAFormat);
  sinterTexture.colorSpace=THREE.SRGBColorSpace;
  sinterTexture.wrapS=sinterTexture.wrapT=THREE.RepeatWrapping;
  sinterTexture.magFilter=THREE.LinearFilter;
  sinterTexture.minFilter=THREE.LinearMipmapLinearFilter;
  sinterTexture.generateMipmaps=true;
  sinterTexture.needsUpdate=true;
  sinterTexture.name='sinter:mineral-strata';
  return sinterTexture;
}
// Continuous tapered, closed mineral scute, shared across all fauna.
const SHELL_GEO=new THREE.SphereGeometry(1,16,10);
{
 const p=SHELL_GEO.attributes.position;
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
  const width=.85+.15*(1-z)*.5;
  p.setXYZ(i,x*width,y>=0?Math.pow(y,.75):y*.30,z);
 }
 SHELL_GEO.computeVertexNormals();
 SHELL_GEO.computeBoundingSphere();
}
function limbBetween(geo,material,a,b,width,depth=width){
 const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),d=bv.clone().sub(av);
 const m=part(geo,material,width,d.length()*.58,depth);
 m.position.copy(av).add(bv).multiplyScalar(.5);
 m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
 return m;
}
// Different body plans, shared primitive geometry; per-instance materials.
function makeSinterFauna(predator, form = 'adult') {
  const group = new THREE.Group(), rig = new THREE.Group();
  group.name = predator ? 'fauna:faultstalker' : 'fauna:sinter-grazer';
  group.add(rig);
  const juvenile=!predator&&form==='juvenile', shieldback=!predator&&form==='shieldback';
  const shell = std(predator ? 0x675343 : juvenile ? 0x968662 : shieldback ? 0x625c48 : 0xab9a79, { rough: 0.86 });
  const dark = std(predator ? 0x282e2a : 0x414b3f, { rough: 0.91 });
  const facet = std(predator ? 0xb18a59 : juvenile ? 0xbeb485 : shieldback ? 0x938164 : 0xc9b792, { rough: 0.60, metal: 0.14 });
  const membrane = std(predator ? 0x7c4f3d : 0x666d4c,{rough:0.74,metal:0.02});
  const edge = std(predator ? 0xc1a47d : 0xb9aa85,{rough:0.55,metal:0.08});
  const sensory = std(predator ? 0x9c582d : 0x777959, { rough: 0.45 });
  shell.map=facet.map=mineralTexture();
  shell.bumpMap=facet.bumpMap=mineralTexture();
  shell.bumpScale=.045;facet.bumpScale=.025;
  shell.flatShading=facet.flatShading=membrane.flatShading=dark.flatShading=false;
  const y = predator ? 1.12 : 0.61;
  const torso = pivot(0, y, 0);
  rig.name=predator?'fauna:stalker-rig':'fauna:grazer-'+form;
  rig.add(torso);
  torso.add(part(SPH, dark, predator ? 0.38 : 0.43, predator ? 0.36 : 0.27, 0.78));
  torso.add(part(SPH,membrane,predator?.31:.36,predator?.22:.16,.69,0,-.16,-.04));
  // Overlapping scutes follow a continuous tapered ribcage.
  for(let i=0;i<5;i++){
    const taper=[.68,.92,1,.91,.72][i];
    const plate=part(SHELL_GEO,i%2?facet:shell,(predator?.43:.49)*taper,(predator?.26:.23)*taper,.30,0,.18+(1-taper)*.025,-.55+i*.27);
    plate.rotation.x=.10-i*.035;
    torso.add(plate);
  }
  for(const side of [-1,1]){
    for(let i=0;i<4;i++){
      const z=-.46+i*.28;
      const rib=part(SHELL_GEO,shell,.17,.16,.21,side*(predator?.32:.40),.01,z);
      rib.rotation.z=side*.64;torso.add(rib);
    }
  }
  const molt = new THREE.Group();
  molt.name='fauna:mineral-growth';
  molt.visible=false;torso.add(molt);
  // Layered carapace seams, flexible lateral gills and newly deposited
  // mineral ridges; not a rescaled rock on legs.
  for(let i=0;i<5;i++)for(const side of [-1,1]){
    const z=-0.55+i*0.25;
    const gill=part(SPH,membrane,0.09,0.12,0.15,side*(predator?0.40:0.46),-0.04,z);
    gill.rotation.z=side*0.30;torso.add(gill);
    const lip=part(SPH,edge,0.075,0.04,0.22,side*0.32,0.35,z);
    lip.rotation.y=side*0.18;torso.add(lip);
    if(!predator){
      const ridge=part(ICO,edge,0.11,shieldback?0.21:0.12,0.15,side*0.35,0.38,z);
      ridge.rotation.z=-side*0.23;molt.add(ridge);
    }
  }
  if(shieldback)for(const side of [-1,1]){
    const shoulder=part(ICO,shell,0.23,0.33,0.46,side*0.43,0.15,0.32);
    shoulder.rotation.z=-side*0.28;torso.add(shoulder);
  }
  if(predator){
    const tail=pivot(0,-0.03,-0.66);
    tail.add(part(SPH,dark,0.13,0.13,0.35,0,0,-0.20),part(ICO,facet,0.10,0.12,0.28,0,-0.02,-0.56));
    torso.add(tail);
  }
  const head = pivot(0, predator ? 0.03 : -0.13, 0.66);
  torso.add(head);
  torso.add(part(SPH,membrane,predator?.24:.30,predator?.24:.16,.31,0,-.06,.57));
  head.add(part(SHELL_GEO,shell,predator?.29:.35,predator?.32:.18,.40,0,.03,.15));
  head.add(part(SPH,dark,predator?.22:.27,.125,.27,0,-.10,.31));
  const jawRig=pivot(0,-.07,.18);
  head.add(jawRig);
  jawRig.add(part(SPH,membrane,predator?.20:.25,.09,.27,0,-.05,.20));
  for (const side of [-1, 1]) {
    head.add(part(SPH, sensory, 0.055, 0.055, 0.056, side * 0.23, 0.06, 0.26));
    const jaw = part(CONE, dark, 0.10, predator ? 0.52 : 0.26, 0.12, side * 0.17, -0.08, 0.36);
    jaw.rotation.x = Math.PI / 2.7;
    jaw.position.y+=.07;jaw.position.z-=.18;jawRig.add(jaw);
    if(predator){
      const fang=part(CONE,edge,0.064,0.29,0.06,side*0.12,-0.19,0.51);
      fang.rotation.z=Math.PI;head.add(fang);
    }
    if (!predator) for (let i = 0; i < (juvenile?2:4); i++) {
      const rib = part(BOX, dark, 0.025, 0.13, 0.18, side * 0.34, -0.04, i * 0.12);
      rib.rotation.z = side * 0.32;
      head.add(rib);
    }
  }
  const legs = [];
  for (let i = 0; i < (predator ? 2 : 3); i++) for (const side of [-1, 1]) {
    const length = predator ? (i === 0 ? 0.93 : 0.8) : 0.46;
    const leg = pivot(side * 0.31, y - 0.11, 0.45 - i * (predator ? 0.92 : 0.44));
    const kx=side*.24,ky=-length*.52,kz=predator?-.13:.04;
    const knee=pivot(kx,ky,kz);
    const footY=-(y-.11)+.075-ky;
    leg.add(part(SPH,membrane,.14,.15,.15),limbBetween(SPH,shell,[0,0,0],[kx,ky,kz],predator?.135:.105),knee);
    knee.add(part(SPH,dark,.105,.105,.105),limbBetween(SPH,facet,[0,0,0],[side*.055,footY,.19],predator?.09:.07));
    const ankle=pivot(side*.055,footY,.19);
    knee.add(ankle);
    ankle.add(part(SPH,dark,.12,.075,.16));
    for(const dx of [-.065,.065]){
      const toe=part(CONE,edge,.038,.15,.045,dx,-.015,.125);
      toe.rotation.x=Math.PI/2;ankle.add(toe);
    }
    rig.add(leg);
    legs.push({ leg, knee, ankle, side, i });
  }
  if (predator) for (const side of [-1, 1]) {
    const fin = part(ICO, facet, 0.12, 0.38, 0.48, side * 0.33, 0.36, -0.13);
    fin.rotation.z = -side * 0.25;
    torso.add(fin);
  }
  // Juvenile's shorter body/limbs and shieldback's broad shoulder armour
  // differ in silhouette; all three retain the same server combat envelope.
  if(juvenile)rig.scale.set(0.82,0.80,0.84);
  if(shieldback)rig.scale.set(1.07,1.16,1.02);
  let phase = 0, fallen = 0;
  return {
    group, height: predator ? 1.85 : juvenile ? 0.84 : shieldback ? 1.23 : 1.03, radius: predator ? 0.85 : 0.62, hover: 0,
    update(dt, st) {
      const stride = Math.min(1, st.speed / (predator ? 3.4 : 1.7));
      phase += dt * st.speed * (juvenile?5.0:shieldback?3.15:3.8);
      molt.visible=!!st.grown&&!predator;
      for(const {leg,knee,ankle,side,i} of legs){
        const q=phase+i*Math.PI+(side>0?Math.PI:0),swing=Math.sin(q);
        leg.rotation.x=swing*stride*.39;
        knee.rotation.x=Math.max(0,swing)*stride*.46;
        ankle.rotation.x=-leg.rotation.x-knee.rotation.x;
      }
      const brace=st.ecology==='brace',watch=st.ecology==='watch';
      torso.position.y = y + Math.abs(Math.sin(phase)) * stride * 0.055-(brace?0.09:watch?0.07:0);
      head.rotation.x = st.casting ? -0.55 : st.attack > 0.2 ? -0.24 : predator ? (watch?0.31:0.02) : st.ecology==='forage'?0.63+Math.sin(st.t*3)*0.08:st.ecology==='defend'||brace?-0.32:0.24 + Math.sin(st.t * 1.4) * 0.11 * (1 - stride);
      head.rotation.y=watch?Math.sin(st.t*1.5)*0.28:0;
      const bite=st.dead?0:Math.max(0,st.attack||0);
      jawRig.rotation.x=.08+(st.casting?.35:bite*.50);
      torso.rotation.x=-bite*(predator?.19:.10);
      // Small physical recoil; material colours remain stable on damage.
      torso.rotation.z=(st.hit||0)*.08;
      fallen += ((st.dead ? 1 : 0) - fallen) * Math.min(1, dt * 5);
      rig.rotation.z = fallen * 1.22;
      rig.position.y = fallen * 0.16;
    },
    dispose() { for (const m of [shell, dark, facet, sensory,membrane,edge]) m.dispose(); },
  };
}

// Weathered, isolated sample frame with opposing probes and a removable cassette.
function makeSinterSampler() {
  const group = new THREE.Group();
  group.name = 'sinter:interferometer';
  const ceramic = std(0x8f8978, { rough: 0.83, metal: 0.12 });
  const frame = std(0x4b504d, { rough: 0.7, metal: 0.52 });
  const seal = std(0x343c39, { rough: 0.95 });
  const brass = std(0x987e55, { rough: 0.56, metal: 0.52 });
  const glass = std(0x899e8b, { rough: 0.26, metal: 0.16 });
  group.add(part(BOX, frame, 1.27, 0.16, 0.9, 0, 0.08, 0));
  group.add(part(BOX, ceramic, 0.92, 0.72, 0.7, 0, 0.55, 0));
  group.add(part(BOX, seal, 0.85, 0.14, 0.68, 0, 0.95, 0));
  for (const side of [-1,1]) {
    group.add(part(BOX, frame, 0.14, 1.24, 0.26, side * 0.55, 0.78, -0.12));
    group.add(part(BOX, brass, 0.23, 0.22, 0.28, side * 0.48, 1.36, 0.12));
    const fork = part(CYL, frame, 0.095, 0.66, 0.095, side * 0.40, 1.39, 0.12);
    fork.rotation.z = side * Math.PI / 2;
    group.add(fork);
    group.add(part(BOX, seal, 0.12, 0.35, 0.62, side * 0.47, 0.56, 0));
    for (let i=0;i<3;i++) group.add(part(BOX, frame, 0.24, 0.045, 0.028, side * 0.24, 0.42+i*0.13, 0.37));
  }
  group.add(part(BOX, brass, 0.51, 0.15, 0.36, 0, 1.08, 0.1));
  const sample = part(ICO, ceramic, 0.24, 0.16, 0.25, 0, 1.27, 0.10);
  sample.rotation.y = 0.4;
  group.add(sample);
  group.add(part(BOX, seal, 0.52, 0.30, 0.10, 0, 0.79, 0.42));
  const display = part(BOX, glass, 0.43, 0.18, 0.035, 0, 0.79, 0.49);
  display.rotation.x = -0.10;
  group.add(display);
  return { group, height: 1.58, radius: 0.8, hover: 0, update() {},
    dispose() { for(const m of [ceramic, frame, seal, brass, glass]) m.dispose(); } };
}

// Kestrel's maintenance chassis: three articulated walking struts support
// an enclosed rotor pack, an asymmetric inspection arm and a recessed slit.
function makeQuarantineCustodian() {
  const group = new THREE.Group(), torso = pivot(0,1.15,0);
  group.name = 'kestrel:custodian';
  group.add(torso);
  const shell = std(0x7b7d6c, {metal:0.42,rough:0.68});
  const dark = std(0x313c3c, {metal:0.46,rough:0.64});
  const trim = std(0x9b7443, {metal:0.3,rough:0.75});
  const sensor = std(0x8e4e35,{emissive:0x55261a,ei:0.6,rough:0.55});
  torso.add(part(ICO,shell,0.61,0.51,0.55));
  torso.add(part(CYL,dark,0.72,0.2,0.72,0,-0.39,0));
  torso.add(part(BOX,dark,0.73,0.23,0.16,0,0.13,0.49));
  torso.add(part(BOX,sensor,0.53,0.07,0.045,0,0.13,0.59));
  for(let i=0;i<5;i++) torso.add(part(BOX,dark,0.055,0.25,0.36,-0.35+i*0.175,0.38,-0.16));
  const arm=pivot(0.48,-0.12,0.12);
  arm.add(part(BOX,trim,0.18,0.56,0.19,0,-0.23,0));
  arm.add(part(CYL,dark,0.16,0.33,0.16,0,-0.53,0.12));
  torso.add(arm);
  const legs=[];
  for(const angle of [Math.PI,Math.PI/3,-Math.PI/3]){
    const hip=pivot(Math.sin(angle)*0.38,0.86,Math.cos(angle)*0.38);
    hip.rotation.y=angle;
    const knee=pivot(0,-0.32,0.28);
    const strut=part(BOX,shell,0.2,0.47,0.19,0,-0.13,0.14);
    strut.rotation.x=-0.62;
    knee.add(part(SPH,dark,0.16,0.16,0.16),part(BOX,trim,0.135,0.48,0.16,0,-0.23,0.09),
      part(BOX,dark,0.24,0.12,0.32,0,-0.47,0.13));
    hip.add(strut,knee);group.add(hip);legs.push({hip,knee,angle});
  }
  const flash=flasher([shell,dark,trim,sensor]);
  let phase=0,fallen=0;
  return {group,height:1.82,radius:0.72,hover:0,
    update(dt,st){
      const speed=Math.min(1,st.speed/3.6);
      phase+=dt*st.speed*4.3;
      legs.forEach(({hip,knee},i)=>{
        hip.rotation.x=Math.sin(phase+i*2*Math.PI/3)*speed*0.38;
        knee.rotation.x=Math.max(0,Math.sin(phase+i*2*Math.PI/3))*speed*0.22;
      });
      torso.position.y=1.15+Math.sin(phase*3)*speed*0.025;
      arm.rotation.x=st.casting?-0.9:st.attack>0.2?-0.48:0;
      fallen+=((st.dead?1:0)-fallen)*Math.min(1,dt*4);
      torso.rotation.z=fallen*0.95;torso.position.y-=fallen*0.66;
      flash(st.hit||0);
    },
    dispose(){for(const m of [shell,dark,trim,sensor])m.dispose();}
  };
}
function makeKestrelRecorder(){
  const group=new THREE.Group();
  group.name='kestrel:recorder';
  const dark=std(0x374040,{metal:0.5,rough:0.72});
  const shell=std(0x7a8277,{metal:0.25,rough:0.8});
  const brass=std(0x967d54,{metal:0.45,rough:0.65});
  const glass=std(0x789b91,{emissive:0x26473b,ei:0.8,rough:0.38});
  group.add(part(BOX,dark,1.25,0.18,0.95,0,0.09,0));
  group.add(part(BOX,shell,0.98,0.84,0.73,0,0.60,0));
  group.add(part(BOX,dark,1.13,0.17,0.84,0,1.10,0));
  for(const side of [-1,1])group.add(part(BOX,brass,0.12,0.92,0.76,side*0.50,0.62,0));
  const panel=part(BOX,dark,0.87,0.14,0.55,0,1.24,0.05);panel.rotation.x=0.14;group.add(panel);
  const screen=part(BOX,glass,0.75,0.035,0.37,0,1.32,0.05);screen.rotation.x=0.14;group.add(screen);
  for(let i=0;i<3;i++)group.add(part(BOX,brass,0.16,0.05,0.1,-0.24+i*0.24,1.32,0.30));
  group.add(part(CYL,dark,0.16,0.64,0.16,-0.39,1.57,-0.28));
  group.add(part(BOX,brass,0.29,0.16,0.26,-0.39,1.92,-0.28));
  return {group,height:2.0,radius:0.8,hover:0,update(){},dispose(){for(const m of [dark,shell,brass,glass])m.dispose();}};
}

export const MODEL_FACTORIES = {
  vanguard: makeVanguard,
  symbiotech: makeSymbiotech,
  mender: makeMender,
  skitter: makeSkitter,
  sinter_grazer: meta => makeSinterFauna(false,meta?.form),
  faultstalker: () => makeSinterFauna(true),
  quarantine_custodian: makeQuarantineCustodian,
  deep_console: makeKestrelRecorder,
  sentinel: makeSentinel,
  warden: makeWarden,
  obelisk: makeObelisk,
  archivist: makeArchivist,
  survey_signal: () => makeSurveyTerminal(false),
  survey_ledger: () => makeSurveyTerminal(true),
  sinter_sampler: makeSinterSampler,
};
