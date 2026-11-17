// Entity models built from the GLB bundles: rigged humanoids dressed by a look,
// and rigged creatures. Each factory returns the same shape the procedural
// models in models.js use — {group, height, radius, hover, update(dt, st)} —
// plus trigger(kind, id) for one-shot animation and dispose().
//
// Nothing here decides gameplay: `st` and triggers only mirror what the server
// reported, and model size never feeds back into collision or range.

import * as THREE from '/vendor/three/three.module.js';
import { Animator } from './animator.js';
import { cloneMaterials, disposeInstance, shared } from './assets.js';
import { LOOK_DEFS, lookFor } from './looks.js';
import { createGearKit } from './gear-kit.js';
import { SIGNATURE_GEAR } from './gear-recipes.js';
import { FRAMES, RACES, normalizeAppearance, defaultAppearance } from '../../shared/appearance.js';
import { createAppearanceKit } from './appearance-render.js';
import { MODEL_FACTORIES as PROCEDURAL } from './models.js';
import { HUMANOID_BASE as HB, HUMANOID_ACTIONS, CREATURES, MENDER_CLIPS as MC } from './anim-tables.js';

const WHITE = new THREE.Color(0xffffff);
const UPPER_BODY = /^(spine_|neck_|Head|clavicle_|upperarm_|lowerarm_|hand_|index_|middle_|ring_|pinky_|thumb_)/;
const isUpperBone = (name) => UPPER_BODY.test(name);

/** Briefly push materials toward white when struck. */
function flasher(mats) {
  const base = mats.map((m) => (m.emissive ? m.emissive.clone() : null));
  let last = 0;
  return (k) => {
    if (k === last) return;
    last = k;
    mats.forEach((m, i) => base[i] && m.emissive.copy(base[i]).lerp(WHITE, k * 0.5));
  };
}

/**
 * Run the skeleton only as often as `st.interval` asks (see animationInterval);
 * returns the time step to apply now, or 0 to skip this frame.
 */
function throttle(state, dt, interval) {
  state.acc += dt;
  if (interval === Infinity) {
    state.acc = Math.min(state.acc, 0.1);
    return 0;
  }
  if (state.acc < (interval || 0)) return 0;
  const step = state.acc;
  state.acc = 0;
  return step;
}

// --- humanoids ---------------------------------------------------------------

let kit = null;
export const gearKit = () => (kit ??= createGearKit(THREE, { shared }));
let appearanceKit = null;
const appearance = () => (appearanceKit ??= createAppearanceKit(THREE, { shared }));

// Arm reach differs by frame (hand_l x: 0.739 masculine, 0.645 feminine). Gear
// authored for one frame is remapped along the arm for the other.
const HAND_X = { m: 0.739, f: 0.645 };
const SHOULDER_X = 0.17;
const armBone = (bone) => /^(upperarm|lowerarm|hand)_/.test(bone);
export const armRemap = (k) => (x) => Math.sign(x) * (SHOULDER_X + (Math.abs(x) - SHOULDER_X) * k);

/**
 * Skull ellipsoid in the instance's model space, from the rest-pose skinned
 * vertices weighted to Head (measured once per body; the bones are at rest
 * while a character is being built).
 */
function measureSkull(inst) {
  let body = null;
  inst.traverse((o) => {
    if (!body && o.isSkinnedMesh && !o.name.startsWith('shell_') && o.material?.name === 'body') body = o;
  });
  const hi = body?.skeleton.bones.findIndex((b) => b.name === 'Head') ?? -1;
  if (!body || hi < 0 || typeof body.applyBoneTransform !== 'function') return null;
  inst.updateMatrixWorld(true);
  body.skeleton.update();
  const toInst = inst.matrixWorld.clone().invert().multiply(body.matrixWorld);
  const P = body.geometry.getAttribute('position');
  const I = body.geometry.getAttribute('skinIndex');
  const W = body.geometry.getAttribute('skinWeight');
  const v = new THREE.Vector3();
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  let n = 0;
  for (let i = 0; i < P.count; i++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (I.getComponent(i, k) === hi) w += W.getComponent(i, k);
    if (w < 0.9) continue;
    v.fromBufferAttribute(P, i);
    body.applyBoneTransform(i, v);
    v.applyMatrix4(toInst);
    ['x', 'y', 'z'].forEach((a, j) => {
      mn[j] = Math.min(mn[j], v[a]);
      mx[j] = Math.max(mx[j], v[a]);
    });
    n++;
  }
  if (n < 20) return null;
  const c = mn.map((x, j) => (x + mx[j]) / 2);
  // Radial map: the furthest head vertex in each direction bin from the centre,
  // so hair and the face mask follow the real skull rather than an ellipsoid.
  const nb = 36;
  const nt = 18;
  const radial = new Float32Array(nb * nt);
  for (let i = 0; i < P.count; i++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (I.getComponent(i, k) === hi) w += W.getComponent(i, k);
    if (w < 0.5) continue;
    v.fromBufferAttribute(P, i);
    body.applyBoneTransform(i, v);
    v.applyMatrix4(toInst);
    const dx = v.x - c[0];
    const dy = v.y - c[1];
    const dz = v.z - c[2];
    const d = Math.hypot(dx, dy, dz);
    if (d < 1e-4) continue;
    const a = Math.min(nb - 1, Math.floor((Math.atan2(dx, dz) / (Math.PI * 2) + 0.5) * nb));
    const t = Math.min(nt - 1, Math.floor((Math.acos(Math.max(-1, Math.min(1, dy / d))) / Math.PI) * nt));
    radial[a + t * nb] = Math.max(radial[a + t * nb], d);
  }
  // Fill empty bins from the ring above/below (lower neck bins may stay empty -> ellipsoid).
  for (let t = 0; t < nt; t++) for (let a = 0; a < nb; a++) {
    if (radial[a + t * nb]) continue;
    const nbrs = [radial[((a + 1) % nb) + t * nb], radial[((a + nb - 1) % nb) + t * nb], t > 0 ? radial[a + (t - 1) * nb] : 0].filter(Boolean);
    if (nbrs.length) radial[a + t * nb] = Math.max(...nbrs);
  }
  return { c, r: mn.map((x, j) => (mx[j] - x) / 2), radial, nb, nt };
}
const skulls = new Map();

export function makeHumanoid(assets, lookId, opts = {}) {
  const def = LOOK_DEFS[lookId];
  if (!def) return null;
  // Appearance (frame, race, hair) is chosen per character; the look is the outfit.
  const ap = normalizeAppearance(opts.appearance, lookId);
  const lookFrame = defaultAppearance(lookId).frame;
  const body = FRAMES[ap.frame].body;
  const inst = assets.instance(body);
  if (!inst) return null;
  const clips = assets.clips('humanoid_m');
  const group = new THREE.Group();
  inst.scale.setScalar(ap.frame === lookFrame ? def.scale || 1 : ap.frame === 'm' ? 1.03 : 0.97);
  group.add(inst);

  const mats = [];
  const shellMats = {};
  const hidden = [];
  inst.traverse((o) => {
    if (!o.isMesh) return;
    // Shells are identified by node name: identical placeholder materials are
    // merged by the asset build, so their material names are not reliable.
    const shell = o.name.startsWith('shell_') ? o.name.slice(6) : null;
    const name = shell ? o.name : o.material.name;
    const spec = shell ? def.shells[shell] : def.parts[name] || {};
    if (!spec) {
      hidden.push(o);
      return;
    }
    const m = new THREE.MeshStandardMaterial({ color: spec.color ?? 0x888888, roughness: spec.roughness ?? 0.7, metalness: spec.metalness ?? 0, side: shell ? THREE.DoubleSide : THREE.FrontSide });
    m.name = name;
    if (spec.map) m.map = assets.texture(spec.map);
    if (spec.emissiveMap) {
      m.emissiveMap = assets.texture(spec.emissiveMap);
      m.emissive.set(spec.emissive ?? 0xffffff);
    }
    o.material = m;
    o.castShadow = true;
    // Bind-pose bounds do not cover every pose; visibility is decided per entity.
    o.frustumCulled = false;
    mats.push(m);
    if (shell) shellMats[shell] = m;
  });
  for (const o of hidden) o.parent.remove(o);
  // A look that names a shell the body does not have would silently lose that
  // piece of clothing; make it loud (automated checks fail on console errors).
  for (const name of Object.keys(def.shells)) if (!shellMats[name]) console.error(`[models] look ${lookId}: shell "${name}" is not in ${body}`);

  // Skin by race. Mirekin carry mottled skin and a faint vein glow.
  const race = RACES[ap.race];
  const skinHex = race.skins[ap.skin];
  const skinMat = appearance().skinMaterial(ap);
  for (const m of mats) {
    if (m.name === 'body') {
      if (ap.race === 'mirekin') {
        m.color.set(0xffffff);
        m.map = skinMat.map;
        m.emissiveMap = skinMat.emissiveMap;
        m.emissive.copy(skinMat.emissive);
        m.emissiveIntensity = skinMat.emissiveIntensity;
      } else {
        // Veyran keep the crimson body texture where the look has one.
        if (!(ap.race === 'veyran' && m.map)) m.map = null;
        m.color.set(m.map ? 0xffffff : skinHex);
      }
      m.roughness = ap.race === 'veyran' ? 0.5 : 0.62;
    } else if (m.name === 'joints') m.color.set(skinHex).multiplyScalar(0.62);
  }
  // Head coverings: a helmet hides hair except what falls below its rim; a
  // hood is lowered (hidden, with a collar) when the character wears hair.
  const helmet = !!def.shells.helmet;
  const lowerHood = !!shellMats.hood && ap.hair !== 'none' && !helmet;
  if (lowerHood) inst.traverse((o) => { if (o.name === 'shell_hood') o.visible = false; });

  // Gear is positioned in bind pose, then handed to a bone.
  group.updateMatrixWorld(true);
  const armK = HAND_X[ap.frame] / HAND_X[lookFrame];
  const remap = armRemap(armK);
  const attachRaw = (boneName, obj) => {
    const bone = inst.getObjectByName(boneName);
    if (!bone) return;
    inst.add(obj);
    obj.updateMatrixWorld(true);
    bone.attach(obj);
  };
  const ctx = {
    glows: [],
    coils: [],
    fluid: null,
    shellMaterial: (n) => shellMats[n] || mats[0],
    attach(boneName, obj) {
      // Legacy gear is authored for the look's own frame: move it along the arm.
      if (armK !== 1 && armBone(boneName)) {
        if (obj.isGroup) for (const ch of obj.children) ch.position.x = remap(ch.position.x);
        else obj.position.x = remap(obj.position.x);
      }
      attachRaw(boneName, obj);
    },
    // For parts already built for this frame (merged gear, head features).
    withoutArmRemap: { attach: (boneName, obj) => attachRaw(boneName, obj) },
  };
  for (const build of def.gear || []) build(ctx);
  // Signature equipment (shared static meshes + per-character animated parts).
  let gearUpdate = null;
  if (SIGNATURE_GEAR[lookId]) {
    try {
      // Merged gear is remapped along the arms inside the kit (variant per armK).
      gearUpdate = gearKit().instantiate(lookId, SIGNATURE_GEAR[lookId], ctx.withoutArmRemap, { armK });
    } catch (err) {
      console.warn(`[models] signature gear for ${lookId} unavailable`, err);
    }
  }

  // Head, face and hair, fitted to this body's measured skull.
  try {
    if (!skulls.has(body)) skulls.set(body, measureSkull(inst));
    const skull = skulls.get(body);
    if (skull) appearance().setHead(ap.frame, skull);
    appearance().apply(ap, ctx.withoutArmRemap, { covered: helmet ? 'helmet' : null });
    if (lowerHood) {
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.03, 8, 20), shellMats.hood);
      collar.position.set(0, 1.5, -0.01);
      collar.rotation.x = Math.PI / 2 - 0.25;
      collar.scale.set(1.15, 1, 0.9);
      collar.castShadow = true;
      ctx.attach('neck_01', collar);
    }
  } catch (err) {
    console.warn(`[models] appearance for ${lookId} unavailable`, err);
  }

  const anim = new Animator(inst, clips, { isUpper: isUpperBone });
  const idle = opts.idle && anim.has(opts.idle) ? opts.idle : HB.idle;
  anim.setBase(idle, { fade: 0 });
  const flash = flasher(mats);
  const lod = { acc: 0 };
  let dead = false;
  let moving = false;
  let landed = true;

  return {
    kind: 'glb',
    group,
    animator: anim,
    height: 1.9 * (def.scale || 1),
    radius: 0.45,
    hover: 0,
    accent: def.accent,
    update(dt, st) {
      if (st.dead !== dead) {
        dead = st.dead;
        if (dead) anim.play(HB.death, { kind: 'death', hold: true, fadeIn: 0.12 });
        else anim.release(0.3);
      }
      moving = st.speed > 0.5;
      if (st.air) {
        anim.setBase(HB.air, { fade: 0.12 });
        landed = false;
      } else if (moving) {
        const s = st.speed;
        if (st.fwd < -0.35) anim.setBase(HB.jog, { timeScale: -Math.min(1.6, s / 3.4), sync: true });
        else if (s > 5.2) anim.setBase(HB.run, { timeScale: Math.max(0.75, Math.min(1.5, s / 6.6)), sync: true });
        else if (s > 2.2) anim.setBase(HB.jog, { timeScale: Math.max(0.7, Math.min(1.5, s / 3.4)), sync: true });
        else anim.setBase(HB.walk, { timeScale: Math.max(0.6, Math.min(1.6, s / 1.45)), sync: true });
        landed = true;
      } else {
        anim.setBase(idle, { fade: landed ? 0.22 : 0.12 });
        landed = true;
      }
      const step = throttle(lod, dt, st.interval);
      if (step) anim.update(step);
      flash(st.hit);
      if (ctx.coils.length) {
        // Gauntlet coils swell with stored Charge.
        const k = 1 + (st.charge ?? 0) * 0.7;
        for (const c of ctx.coils) c.scale.set(k, k, 1 + (st.charge ?? 0) * 1.5);
      }
      if (gearUpdate) gearUpdate(st);
      if (ctx.fluid) ctx.fluid.scale.y = 0.8 + Math.sin(st.t * 2.2) * 0.14;
    },
    trigger(kind, id) {
      if (dead) return;
      if (kind === 'hit') {
        anim.react(HB.hit);
        return;
      }
      // A ranged class's basic attack is a bolt, not a punch.
      const a = (kind === 'cast' && id === 'auto' ? null : HUMANOID_ACTIONS[id]) || (kind === 'cast' ? HUMANOID_ACTIONS.bolt : HUMANOID_ACTIONS.auto);
      anim.play(a.clip, { kind: 'ability', upper: moving, start: a.start || 0, timeScale: a.timeScale || 1, fadeOut: a.fadeOut ?? 0.2 });
    },
    dispose() {
      anim.dispose();
      disposeInstance(group);
    },
  };
}

// --- creatures ---------------------------------------------------------------

const SPH = shared(new THREE.SphereGeometry(1, 10, 8));
const OCT = shared(new THREE.OctahedronGeometry(1, 0));
const TENDRIL = (() => {
  const cone = new THREE.ConeGeometry(0.03, 0.46, 6);
  cone.rotateX(Math.PI);
  cone.translate(0, -0.23, 0);
  return shared(cone);
})();

export function makeCreature(assets, type) {
  const spec = CREATURES[type];
  const inst = spec && assets.instance('creatures', spec.piece);
  if (!inst) return null;
  const clips = assets.clips('creatures', spec.piece);
  const group = new THREE.Group();
  inst.scale.setScalar(spec.scale);
  group.add(inst);
  const mats = cloneMaterials(inst);
  for (const m of mats) {
    m.color.set(spec.tint);
    m.emissive.set(spec.emissive);
    m.emissiveMap = null;
  }
  inst.traverse((o) => {
    if (o.isMesh) o.frustumCulled = false;
  });

  // Small living / powered details that carry each creature's identity.
  const extras = [];
  group.updateMatrixWorld(true);
  const body = inst.getObjectByName('Body');
  if (spec.sacs && body) {
    const mat = new THREE.MeshBasicMaterial({ color: spec.sacs });
    for (let i = 0; i < 5; i++) {
      const sac = new THREE.Mesh(SPH, mat);
      const a = (i / 5) * Math.PI * 2;
      sac.position.set(Math.sin(a) * 0.3, 1.28, Math.cos(a) * 0.3 - 0.05);
      sac.scale.setScalar(0.1);
      inst.add(sac);
      sac.updateMatrixWorld(true);
      body.attach(sac);
      const base = sac.scale.x;
      extras.push((st) => sac.scale.setScalar(base * (0.85 + Math.sin(st.t * 3 + i * 1.7) * 0.22)));
    }
  }
  let eyeMat = null;
  if (spec.eye && body) {
    eyeMat = new THREE.MeshBasicMaterial({ color: spec.eye });
    const eye = new THREE.Mesh(SPH, eyeMat);
    eye.position.set(0, 2.08, 0.42);
    eye.scale.set(0.16, 0.07, 0.07);
    inst.add(eye);
    eye.updateMatrixWorld(true);
    body.attach(eye);
  }
  const shards = [];
  if (spec.shards) {
    const stone = new THREE.MeshStandardMaterial({ color: 0x4d4b68, roughness: 0.8, metalness: 0.2, emissive: 0x2a1a55 });
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(OCT, stone);
      s.scale.set(0.22, 0.42, 0.22);
      s.castShadow = true;
      shards.push(s);
      group.add(s);
    }
  }

  const anim = new Animator(inst, clips);
  const c = spec.clips;
  anim.setBase(c.idle, { fade: 0 });
  const flash = flasher(mats);
  const lod = { acc: 0 };
  const calm = new THREE.Color(spec.eye || 0xffffff);
  const hot = new THREE.Color(0xfff2a0);
  let dead = false;
  let sink = 0;

  return {
    kind: 'glb',
    group,
    animator: anim,
    height: spec.height,
    radius: spec.radius,
    hover: 0,
    update(dt, st) {
      if (st.dead !== dead) {
        dead = st.dead;
        if (dead) anim.play(c.death, { kind: 'death', hold: true, fadeIn: 0.1 });
        else anim.release(0.2);
      }
      if (st.casting && c.cast) anim.setBase(c.cast, { fade: 0.15 });
      else if (st.speed > spec.runAbove) anim.setBase(c.run, { timeScale: Math.max(0.7, Math.min(1.8, st.speed / spec.runRate)), sync: true });
      else if (st.speed > 0.3) anim.setBase(c.walk, { timeScale: Math.max(0.6, Math.min(1.8, st.speed / spec.walkRate)), sync: true });
      else anim.setBase(c.idle, { fade: 0.25 });
      const step = throttle(lod, dt, st.interval);
      if (step) anim.update(step);
      // Hold a readable death pose throughout the corpse lifetime. A shallow
      // settle avoids burying much of the model below uneven ground.
      sink += ((dead ? 1 : 0) - sink) * Math.min(1, dt * 2.5);
      inst.position.y = -sink * spec.height * 0.07;
      inst.rotation.z = sink * 0.22;
      flash(st.hit);
      for (const fn of extras) fn(st);
      if (eyeMat) {
        if (dead) eyeMat.color.setHex(0x1a1a1a);
        else eyeMat.color.copy(calm).lerp(hot, st.casting ? 0.5 + Math.sin(st.t * 30) * 0.5 : st.combat ? 0.25 : 0);
      }
      shards.forEach((s, i) => {
        const a = st.t * 0.7 + (i / 4) * Math.PI * 2;
        s.position.set(Math.sin(a) * 2.1, spec.height * 0.9 + Math.sin(st.t * 1.3 + i) * 0.3 - sink * 3, Math.cos(a) * 2.1);
        s.rotation.y = a * 2;
      });
    },
    trigger(kind) {
      if (dead) return;
      if (kind === 'hit') anim.react(c.hit, { upper: false });
      else anim.play(c.attack, { kind: 'ability', start: 0.1, timeScale: 1.2 });
    },
    dispose() {
      anim.dispose();
      disposeInstance(group);
    },
  };
}

// --- companion ---------------------------------------------------------------

const MODE_COLOURS = { triage: 0x7dffc4, guard: 0x7fd0ff, assist: 0xffc46b, dormant: 0x56616a };

/**
 * Mender Symbiote: a salvaged survey drone colonised by a living culture — a
 * hard shell around a glowing core, trailing tendrils. The core colour shows
 * its mode; it visibly charges while mending and lunges while harrying.
 */
export function makeMender(assets) {
  const inst = assets.instance('creatures', 'drone');
  if (!inst) return null;
  const clips = assets.clips('creatures', 'drone');
  const group = new THREE.Group();
  const scaled = new THREE.Group();
  group.add(scaled);
  inst.scale.setScalar(0.62);
  scaled.add(inst);
  const mats = cloneMaterials(inst);
  for (const m of mats) {
    m.color.set(0x9fd8c8);
    m.emissive.set(0x0c2a24);
  }
  inst.traverse((o) => {
    if (o.isMesh) o.frustumCulled = false;
  });
  const coreMat = new THREE.MeshBasicMaterial({ color: MODE_COLOURS.triage });
  const core = new THREE.Mesh(SPH, coreMat);
  core.position.set(0, 0.01, 0.2);
  core.scale.setScalar(0.1);
  const halo = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color: MODE_COLOURS.triage, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(0.4);
  scaled.add(core, halo);
  const tendrilMat = new THREE.MeshStandardMaterial({ color: 0x4fa58c, emissive: 0x1d5c48, roughness: 0.6 });
  const tendrils = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const t = new THREE.Mesh(TENDRIL, tendrilMat);
    t.position.set(Math.sin(a) * 0.14, -0.2, Math.cos(a) * 0.14 - 0.03);
    t.castShadow = true;
    tendrils.push(t);
    scaled.add(t);
  }

  const anim = new Animator(inst, clips);
  anim.setBase(MC.idle, { fade: 0 });
  const colour = new THREE.Color();
  const lod = { acc: 0 };
  let lastAct = '';
  let lastMode = '';

  return {
    kind: 'glb',
    group,
    animator: anim,
    height: 0.8,
    radius: 0.4,
    hover: 1.5,
    update(dt, st) {
      const mending = st.act === 'mending' || st.act === 'bonding';
      if (st.act !== lastAct) {
        if (st.act === 'harrying') anim.play(MC.attack, { kind: 'ability', timeScale: 1.2 });
        lastAct = st.act;
      }
      if (st.mode !== lastMode) {
        // A flourish acknowledges a new order from its conductor.
        if (lastMode) anim.play(MC.order, { kind: 'ability', timeScale: 1.4 });
        lastMode = st.mode;
      }
      anim.setBase(mending ? MC.mend : st.act === 'dormant' ? MC.dormant : MC.idle, { fade: 0.2, timeScale: st.act === 'dormant' ? 0.3 : 1 });
      const step = throttle(lod, dt, st.interval);
      if (step) anim.update(step);
      colour.setHex(MODE_COLOURS[st.act === 'dormant' ? 'dormant' : st.mode] || MODE_COLOURS.triage);
      coreMat.color.lerp(colour, Math.min(1, dt * 6));
      halo.material.color.copy(coreMat.color);
      const active = mending || st.act === 'harrying';
      const pulse = 1 + Math.sin(st.t * (active ? 9 : 2.5)) * (active ? 0.25 : 0.08) + st.cast * 0.9;
      core.scale.setScalar(0.1 * pulse);
      halo.scale.setScalar(0.4 * (0.9 + pulse * 0.12));
      halo.material.opacity = active ? 0.22 : 0.1;
      tendrils.forEach((t, i) => {
        t.rotation.x = Math.sin(st.t * 2.4 + i) * 0.3 + Math.min(1, st.speed / 6) * 0.9;
        t.rotation.z = Math.cos(st.t * 2 + i * 1.7) * 0.22;
      });
      // Bonded: shrink onto the host's shoulder.
      const target = st.act === 'bonded' ? 0.5 : 1;
      scaled.scale.setScalar(scaled.scale.x + (target - scaled.scale.x) * Math.min(1, dt * 8));
      scaled.position.y = Math.sin(st.t * 2.1) * 0.07;
    },
    trigger(kind) {
      if (kind === 'cast') anim.play(MC.attack, { kind: 'ability', timeScale: 1.3 });
    },
    dispose() {
      anim.dispose();
      disposeInstance(group);
    },
  };
}

// --- registry ----------------------------------------------------------------

/** Bundles that must be ready before characters can be drawn from GLB. */
export const CHARACTER_BUNDLES = ['humanoid_m', 'humanoid_f', 'creatures'];

/**
 * Build the model for an entity. Uses the GLB assets when they are loaded and
 * falls back to the procedural stand-in for that type otherwise, so a missing
 * or broken asset never removes an entity from the world.
 */
export function createModel(assets, meta, glb = true) {
  let model = null;
  if (glb) try {
    const look = lookFor(meta);
    if (look) model = makeHumanoid(assets, look, { appearance: meta.ap, ...(meta.c === 'archivist' ? { idle: HB.npcIdle } : {}) });
    else if (meta.c === 'mender') model = makeMender(assets);
    else if (CREATURES[meta.c]) model = makeCreature(assets, meta.c);
  } catch (err) {
    console.warn(`[models] ${meta.c}: falling back to the procedural model:`, err.message || err);
    model = null;
  }
  if (model) return model;
  const fallback = (PROCEDURAL[meta.c] || PROCEDURAL.skitter)();
  fallback.kind = 'procedural';
  return fallback;
}
