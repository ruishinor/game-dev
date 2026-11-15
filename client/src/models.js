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

export const MODEL_FACTORIES = {
  vanguard: makeVanguard,
  symbiotech: makeSymbiotech,
  mender: makeMender,
  skitter: makeSkitter,
  sentinel: makeSentinel,
  warden: makeWarden,
  obelisk: makeObelisk,
  archivist: makeArchivist,
};
