// Entity models built from the GLB bundles: rigged humanoids dressed by a look,
// and rigged creatures. Each factory returns the same shape the procedural
// models in models.js use — {group, height, radius, hover, update(dt, st)} —
// plus trigger(kind, id) for one-shot animation and dispose().
//
// Nothing here decides gameplay: `st` and triggers only mirror what the server
// reported, and model size never feeds back into collision or range.

import { applyEnemyVariant } from './enemy-variants.js';
import * as THREE from '/vendor/three/three.module.js';
import { Animator } from './animator.js';
import {createProductionWork} from './production-work.js';
import { cloneMaterials, disposeInstance, shared } from './assets.js';
import { LOOK_DEFS, lookFor } from './looks.js';
import { appearanceFor, setupFace, veyranMaterial } from './face.js';
import { FRAMES, RENDER_RACES, HAIR_COLOURS, normalizeAppearance, defaultAppearance } from '../../shared/appearance.js';

// Arm reach differs by frame (hand_l x: 0.739 masculine, 0.645 feminine). Gear
// authored for one frame is moved along the arm for the other (shoulder ~0.17).
const HAND_X = { m: 0.739, f: 0.645 };
const SHOULDER_X = 0.17;
const armBone = (bone) => /^(upperarm|lowerarm|hand)_/.test(bone);
export const armRemap = (k) => (x) => Math.sign(x) * (SHOULDER_X + (Math.abs(x) - SHOULDER_X) * k);
import { createGearKit } from './gear-kit.js';
import { createMenderPrototype } from './mender-prototype.js';
import { createSpindle } from './spindle.js';
import { createLongpointPresentation } from './longpoint.js';
import {createWeaponCarry,WEAPON_MODELS} from './weapon-visuals.js';
import { rodPalette } from './rod-palette.js';
import { createSitPose } from './sit-pose.js';
import { createSurveyStrider } from './survey-strider-model.js';
import { createTurretDrone } from './turret-drone.js';
import { createHaloConstruct, haloRoleFor, HALO_BUNDLE } from './halo-construct.js';
import { wearArmour, armourBundle } from './armour-visual.js';
import { createSocialTorso } from './social-torso.js';
import { SIGNATURE_GEAR } from './gear-recipes.js';
import {createHeldElectricalRod,createElectricalRodVfx} from './electrical-rod.js';
import { MODEL_FACTORIES as PROCEDURAL, RIFT_KINDS, riftModel } from './models.js';
import { buildResonantVein } from './resonant-vein.js';
import { HUMANOID_BASE as HB, HUMANOID_ACTIONS, HUMANOID_MELEE_SEQUENCE, HUMANOID_ROD_SEQUENCE, HUMANOID_DUAL_SEQUENCE, HUMANOID_HEAVY_STRIKE, HUMANOID_COUNTER_STRIKE, CREATURES, MENDER_CLIPS as MC } from './anim-tables.js';

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

export function makeHumanoid(assets, lookId, opts = {}) {
  const def = LOOK_DEFS[lookId];
  if (!def) return null;
  // Appearance (frame, race, skin, hair) is chosen per character; the look is
  // the outfit. NPC looks without a stored appearance keep their own body.
  const look = defaultAppearance(lookId);
  const lookFrame = def.body === 'humanoid_f' ? 'f' : 'm';
  const app = opts.appearance ? normalizeAppearance(opts.appearance, lookId) : { ...look, frame: lookFrame };
  const body = FRAMES[app.frame].body;
  const inst = assets.instance(body);
  if (!inst) return null;
  const clips = assets.clips('humanoid_m');
  const group = new THREE.Group();
  inst.scale.setScalar(app.frame === lookFrame ? def.scale || 1 : app.frame === 'm' ? 1.03 : 0.97);
  group.add(inst);
  const armK = HAND_X[app.frame] / HAND_X[lookFrame];
  const remap = armRemap(armK);
  const veyran = app.race === 'veyran';
  // A player's hairstyle is not a hood toggle. Keep customization faces
  // exposed for all hair selections; NPC authored outfit defaults remain.
  const hoodDown = !!opts.appearance;

  const mats = [];
  const shellMats = {};
  const hidden = [], socialShells = [];
  // Face meshes (head, hands, eyes, lashes) are dressed by face.js.
  const faceNode = (o) => {
    for (let n = o; n && n !== inst; n = n.parent) if (/^(head|hands|eyes|lashes|teeth|hair_[a-z]+)(_\d+)?$/.test(n.name)) return n.name.replace(/_\d+$/, '');
    return null;
  };
  inst.traverse((o) => {
    if (!o.isMesh) return;
    if (faceNode(o)) {
      o.userData.facePart = faceNode(o);
      return;
    }
    // Shells are identified by node name: identical placeholder materials are
    // merged by the asset build, so their material names are not reliable.
    const shell = o.name.startsWith('shell_') ? o.name.slice(6) : null;
    const name = shell ? o.name : o.material.name;
    // Faceless looks wear the mannequin's smooth head, shaded like the body.
    const spec = shell ? (shell === 'mannequin_head' && (def.faceless || veyran) ? def.parts.body : shell === 'hood' && hoodDown ? null : def.shells[shell]) : def.parts[name] || {};
    const socialShell = opts.socialCapable && (shell === 'chest' || shell === 'coat');
    if (!spec && !socialShell) {
      hidden.push(o);
      return;
    }
    const shade = spec ?? {};
    const m = new THREE.MeshStandardMaterial({ color: shade.color ?? 0x888888, roughness: shade.roughness ?? 0.7, metalness: shade.metalness ?? 0, side: shell ? THREE.DoubleSide : THREE.FrontSide });
    m.name = name;
    if (shade.map) m.map = assets.texture(shade.map);
    if (shade.emissiveMap) {
      m.emissiveMap = assets.texture(shade.emissiveMap);
      m.emissive.set(shade.emissive ?? 0xffffff);
    }
    o.material = m;
    o.castShadow = true;
    // Bind-pose bounds do not cover every pose; visibility is decided per entity.
    o.frustumCulled = false;
    mats.push(m);
    if (shell && spec) shellMats[shell] = m;
    if (socialShell) { o.visible=!!spec; socialShells.push({mesh:o,shell,original:m,originalVisible:!!spec}); }
  });
  const socialTorso=createSocialTorso(THREE,assets,socialShells);
  socialTorso.apply(opts.socialVisual);
  for (const o of hidden) o.parent.remove(o);
  // A face for bodies that have one. Looks may pin an appearance (NPCs) or
  // hide the face (helmets, faceless characters); players get a stable face
  // derived from their name.
  const female = app.frame === 'f';
  // Name-derived identity (face shape, age, stubble) under the chosen
  // appearance; NPC looks pin a full preset when no appearance is stored.
  const chosen = opts.appearance || !def.face
    ? { tone: RENDER_RACES[app.race].skins[app.skin], hair: HAIR_COLOURS[app.hairColour].hex, hairStyle: app.hair, race: app.race, ...(app.race === 'velari' && { stubble: 0 }) }
    : def.face;
  const ap = appearanceFor(opts.appearanceKey ?? lookId, female, chosen);
  const helmet = !!def.shells.helmet;
  const suit = mats.find((m) => m.name === 'body') || null;
  let faceSuit = null;
  if (def.faceless && suit) {
    faceSuit = suit.clone();
    if (suit.map) {
      faceSuit.map = suit.map.clone();
      faceSuit.map.channel = 1;
      faceSuit.map.needsUpdate = true;
    }
    mats.push(faceSuit);
  }
  const gloves = def.gloves ? mats.find((m) => m.name === 'joints') || null : null;
  // A Veyran in an ordinary outfit: the smooth crimson head, with tracery.
  let veyranMat = null;
  if (veyran && !def.faceless) {
    const vm = (veyranMat = veyranMaterial(ap));
    mats.push(vm);
    inst.traverse((o) => { if (o.isMesh && o.name === 'shell_mannequin_head') o.material = vm; });
    faceSuit = vm;
  }
  const face = setupFace(inst, ap, assets, { faceless: !!def.faceless || veyran, hideHead: helmet || !!def.faceless || veyran, suitMaterial: faceSuit, hood: !!def.shells.hood && !hoodDown, gloveMaterial: gloves });
  if (face) mats.push(...face.materials.filter((m) => m.emissive));
  // A look that names a shell the body does not have would silently lose that
  // piece of clothing; make it loud (automated checks fail on console errors).
  for (const name of Object.keys(def.shells)) if (!shellMats[name] && !(name === 'hood' && hoodDown)) console.error(`[models] look ${lookId}: shell "${name}" is not in ${def.body}`);

  // Gear is positioned in bind pose, then handed to a bone.
  group.updateMatrixWorld(true);
  const ctx = {
    glows: [],
    coils: [],
    fluid: null,
    shellMaterial: (n) => shellMats[n] || mats[0],
    attach(boneName, obj) {
      const bone = inst.getObjectByName(boneName);
      if (!bone) {
        console.error(`[models] look ${lookId}: bone "${boneName}" is not in ${def.body}; gear not attached`);
        return;
      }
      // Legacy gear is authored for the look's own frame: move it along the arm.
      if (armK !== 1 && armBone(boneName) && !obj.userData.frameFitted) {
        if (obj.isGroup && obj.position.x === 0) for (const ch of obj.children) ch.position.x = remap(ch.position.x);
        else obj.position.x = remap(obj.position.x);
      }
      inst.add(obj);
      obj.updateMatrixWorld(true);
      bone.attach(obj);
    },
  };
  for (const build of def.gear || []) build(ctx);
  // Signature equipment (shared static meshes + per-character animated parts).
  let gearUpdate = null;
  if (SIGNATURE_GEAR[lookId]) {
    try {
      gearUpdate = gearKit().instantiate(lookId, SIGNATURE_GEAR[lookId], ctx, { armK });
    } catch (err) {
      console.warn(`[models] signature gear for ${lookId} unavailable`, err);
    }
  }

  const work=createProductionWork(THREE,inst);
  const anim = new Animator(inst, clips, { isUpper: isUpperBone });
  const idle = opts.idle && anim.has(opts.idle) ? opts.idle : HB.idle;
  anim.setBase(idle, { fade: 0 });
  const flash = flasher(mats);
  const lod = { acc: 0 };
  let dead = false;
  let moving = false;
  let landed = true, meleeIndex=0, meleePose=null;
  const meleeShoulderR=inst.getObjectByName('upperarm_r');
  const meleeShoulderL=inst.getObjectByName('upperarm_l');
  const meleeSpine=inst.getObjectByName('spine_02');
  const motionAxis=new THREE.Vector3(0,1,0),motionRoll=new THREE.Vector3(0,0,1);
  // Capture the grip direction in bind pose, not an arbitrary live frame.
  const rodHand=inst.getObjectByName('hand_r');
  const rodAxis=rodHand?new THREE.Vector3(0,0,1).applyQuaternion(rodHand.getWorldQuaternion(new THREE.Quaternion()).invert()):null;
  const rodPalm=rodHand?.children.find(b=>b.isBone&&/^middle_/.test(b.name))?.position.clone().multiplyScalar(.55)??new THREE.Vector3();
  const offHand=inst.getObjectByName('hand_l');
  const offAxis=offHand?new THREE.Vector3(0,0,1).applyQuaternion(offHand.getWorldQuaternion(new THREE.Quaternion()).invert()):null;
  const offPalm=offHand?.children.find(b=>b.isBone&&/^middle_/.test(b.name))?.position.clone().multiplyScalar(.55)??new THREE.Vector3();
  // Stowed rod (ranged weapon active): diagonal across the back, clear of the
  // Vanguard's dorsal stack. Bone-local transform captured once in bind pose.
  const rodBack=inst.getObjectByName('spine_03')||inst.getObjectByName('spine_02');
  let rodStow=null;
  if(rodBack){
    const probe=new THREE.Object3D();
    // Offset beyond the shoulder and clear of the rifle rather than inside the torso.
    probe.position.set(.30,1.34,-.52);
    probe.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(.50,1,0).normalize());
    inst.add(probe);probe.updateMatrixWorld(true);rodBack.attach(probe);
    rodStow={position:probe.position.clone(),quaternion:probe.quaternion.clone()};
    probe.removeFromParent();
  }
  let heldRod=null,rodEffects=null,rodEngine=null,rodHeld=null,rodStowed=false;
  const releaseRod=()=>{rodEffects?.dispose();heldRod?.dispose();heldRod=null;rodEffects=null;rodEngine=null;rodHeld=null;rodStowed=false;};
  function stowRod(stow){
    if(!heldRod||stow===rodStowed)return;
    rodStowed=stow;
    const g=heldRod.group;
    if(stow&&rodStow){rodBack.add(g);g.position.copy(rodStow.position);g.quaternion.copy(rodStow.quaternion);}
    else if(!stow&&rodHeld){rodHand.add(g);g.position.copy(rodHeld.position);g.quaternion.copy(rodHeld.quaternion);}
    g.name=stow?'StowedElectricalCombatRod':'HeldElectricalCombatRod';
  }
  let weapon = null, visual = null, stowedRifle = null, sidearm = null, lastWeaponAim = null;
  // Stowed rifle: across the back, crossing the stowed rod's diagonal. The
  // bone-local transform is captured once in bind pose (like the rod's).
  let rifleStow = null;
  if (rodBack) {
    const probe = new THREE.Object3D();
    probe.position.set(0, 1.22, -.46);
    const x = new THREE.Vector3(-.5, 1, 0).normalize(), y = new THREE.Vector3(0, 0, -1);
    y.addScaledVector(x, -y.dot(x)).normalize();
    probe.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, new THREE.Vector3().crossVectors(x, y)));
    inst.add(probe); probe.updateMatrixWorld(true); rodBack.attach(probe);
    rifleStow = { position: probe.position.clone(), quaternion: probe.quaternion.clone() };
    probe.removeFromParent();
  }
  function setWeaponVisual(next) {
    next = next === 'longpoint' || next === 'longpoint-stowed' || Object.hasOwn(WEAPON_MODELS,next) ? next : null;
    if (next === visual) return;
    weapon?.dispose(); weapon = null;
    sidearm?.apply(null);
    if (stowedRifle) { stowedRifle.removeFromParent(); disposeInstance(stowedRifle); stowedRifle = null; }
    visual = next;
    sidearm?.apply(null);
    if (!next) return;
    if (Object.hasOwn(WEAPON_MODELS,next)) {
      // Keep #155's authored compact firearm models and muzzle/recoil pipeline.
      // Selection is already server-authorized; this only presents the token.
      if (!assets.weaponModels?.has(next)) return;
      sidearm ??= createWeaponCarry(THREE, assets, inst);
      sidearm.apply(next);
      weapon = {
        restore:()=>sidearm.restorePose(),
        update(st,dt){
          lastWeaponAim=st.lookAt?.isVector3?st.lookAt.clone():null;
          sidearm.update(dt,{...st,aimAt:lastWeaponAim,combat:!!st.combat},true);
        },
        fire(){
          const origin=inst.getWorldPosition(new THREE.Vector3());
          const forward=new THREE.Vector3(0,0,1).applyQuaternion(inst.getWorldQuaternion(new THREE.Quaternion()));
          return sidearm.fire(next,lastWeaponAim??origin.addScaledVector(forward,12));
        },
        origin:()=>sidearm.muzzle(),
        dispose:()=>{sidearm.apply(null);lastWeaponAim=null;}
      };
      return;
    }
    const prop = assets.instance('longpoint');
    if (!prop) return;
    if (next === 'longpoint-stowed') {
      if (!rifleStow) { disposeInstance(prop); return; }
      prop.scale.setScalar(.43); prop.name = 'StowedLongpoint';
      prop.position.copy(rifleStow.position); prop.quaternion.copy(rifleStow.quaternion);
      rodBack.add(prop); stowedRifle = prop;
      return;
    }
    weapon = createLongpointPresentation(THREE, inst, prop, disposeInstance);
    if (!weapon) disposeInstance(prop);
  }
  setWeaponVisual(opts.weaponVisual);
  // Sit/stand emote: procedural seated pose layered on the sampled animation.
  const sitPose = createSitPose(THREE, inst);
  let sitBlend = 0;
  // Worn armour (presentation metadata `av`: slot -> item, or a legacy chest
  // id): each slot's piece is loaded on first use and bound to this skeleton.
  const armours = new Map();
  let disposed = false;
  // four worn pieces of one family light the set's restrained signature
  function armourSetSignature() {
    const counts = {};
    for (const h of armours.values()) if (h.handle?.fx) counts[h.handle.fx.family] = (counts[h.handle.fx.family] || 0) + 1;
    for (const h of armours.values()) h.handle?.fx?.setComplete?.(counts[h.handle.fx.family] >= 4);
  }
  function setArmourVisual(next) {
    const want = typeof next === 'string' ? { chest: next } : next && typeof next === 'object' ? next : {};
    for (const [slot, h] of armours) {
      if (h.wanted !== want[slot]) { h.handle?.dispose(); armours.delete(slot); }
    }
    armourSetSignature();
    for (const [slot, item] of Object.entries(want)) {
      if (typeof item !== 'string' || armours.has(slot)) continue;
      const bundle = armourBundle(body, item);
      if (!bundle) continue;
      const entry = { wanted: item, handle: null };
      armours.set(slot, entry);
      const apply = () => {
        if (disposed || armours.get(slot) !== entry || entry.handle) return;
        entry.handle = wearArmour(assets, inst, body, item);
        armourSetSignature();
      };
      if (assets.get(bundle)) apply();
      else assets.bundle(bundle).then(apply);
    }
  }
  setArmourVisual(opts.armourVisual);

  return {
    kind: 'glb',
    group,
    animator: anim,
    height: 1.9 * (def.scale || 1),
    radius: 0.45,
    hover: 0,
    accent: def.accent,
    setWeaponVisual,
    weaponEffectOrigin: () => weapon?.origin() || null,
    setArmourVisual,
    // the worn chest piece (phase-1 contract) and every worn slot
    armourWorn: () => armours.get('chest')?.handle?.item || null,
    armourWornAll: () => Object.fromEntries([...armours].filter(([, h]) => h.handle).map(([s, h]) => [s, h.handle.item])),
    // test/diagnostic summary: slots whose piece runs channel FX, and the body shells it hides
    armourFxInfo: () => Object.fromEntries([...armours].filter(([, h]) => h.handle).map(([s, h]) => [s, { fx: !!h.handle.fx, family: h.handle.fx?.family || null, hides: h.handle.hidden || [] }])),
    setSocialVisual: socialTorso.apply,
    socialWorn: socialTorso.worn,
    rodCharge(){return !!(heldRod?.group.visible&&!rodStowed&&rodEffects?.charge());},
    rodContact(at,ground,blocked=false){
      return !!(heldRod?.group.visible&&!rodStowed&&rodEffects?.impact(at,{ground,blocked}));
    },
    sitState:()=>({blend:sitBlend,available:!!sitPose}),
    rodState:()=>heldRod?{stowed:rodStowed,name:heldRod.group.name,parent:heldRod.group.parent?.name||null,progress:heldRod.progress}:null,
    update(dt, st) {
      const working=work.canPose(st);if(!working)work.clear();
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
      // Both cosmetic systems own the arm rotations. Restore before sampling
      // animation, and give fabrication exclusive priority over weapon carry.
      const seated = !!st.sitting && !st.dead && !st.air;
      sitBlend = st.reducedMotion ? (seated ? 1 : 0) : Math.max(0, Math.min(1, sitBlend + (seated ? 1 : -1) * dt / .5));
      if (step) {
        weapon?.restore();
        work.restorePose();
        anim.update(step);
        // GLB-driven strike base plus weapon-specific additive movement.
        // Work only after the mixer samples the skeleton; never touch hit rules.
        if(meleePose){
          meleePose.age+=step;
          const t=Math.min(1,meleePose.age/meleePose.duration);
          const wave=Math.sin(Math.PI*t),sign=meleePose.stance==='backhand'||meleePose.stance==='right'?-1:1;
          const sweep=meleePose.stance==='overhead'||meleePose.stance==='heavy'?.36:.53;
          if(meleeSpine)meleeSpine.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(motionAxis,sign*sweep*wave));
          if(meleeShoulderR)meleeShoulderR.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(motionRoll,sign*.34*wave));
          if(meleeShoulderL&&['left','cross','heavy'].includes(meleePose.stance))
            meleeShoulderL.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(motionRoll,-sign*.53*wave));
          if(t>=1)meleePose=null;
        }
        if (working) work.pose(st.work, st.t, st.reducedMotion);
        else if (sitBlend > 0) sitPose?.apply(sitBlend * sitBlend * (3 - 2 * sitBlend));
      }
      if (weapon && (step || working || st.dead || st.air || st.casting || anim.busy || sitBlend > 0))
        weapon.update({ ...st, hideWeapon: working || st.casting || anim.busy || sitBlend > 0 },step||dt);
      const stowed=st.electricalRod==='stowed';
      if(st.electricalRod&&!heldRod&&rodHand&&(!stowed||rodStow)){
        heldRod=createHeldElectricalRod(rodHand,{axis:rodAxis,palm:rodPalm,offHand,offAxis:offAxis||undefined,offPalm,palette:rodPalette(st.rodClass)});
        heldRod.setMode(stowed?'rod':st.electricalRod);heldRod.update(0,{reducedMotion:true});
        rodHeld={position:heldRod.group.position.clone(),quaternion:heldRod.group.quaternion.clone()};
        // A rod first seen in hand needs no draw flourish; one first seen stowed starts stowed.
        rodStowed=false;if(stowed)stowRod(true);
      }
      if((!st.electricalRod||(stowed&&!rodStow))&&heldRod)releaseRod();
      if(heldRod){
        const drawn=rodStowed&&!stowed;
        stowRod(stowed);
        const active=!stowed&&!st.dead&&st.attack>.2;
        const live=!stowed&&!st.dead&&!working;
        heldRod.group.visible=!st.dead&&!working;
        // A stowed rod keeps its saved configuration but is carried joined.
        heldRod.setMode(stowed?'rod':st.electricalRod);
        heldRod.update(dt,{energized:live,activity:active?st.attack:0,reducedMotion:st.reducedMotion||active||st.dead||stowed,quality:st.rodQuality,intensity:st.rodIntensity,calm:st.rodCalm,coronaReducedMotion:st.rodCalm,combat:!!st.combat});
        if(stowed&&!st.dead)heldRod.setEnergy(.12);
        if(st.electricalRodVfx!==rodEngine){rodEffects?.dispose();rodEngine=st.electricalRodVfx||null;rodEffects=rodEngine?createElectricalRodVfx(heldRod,rodEngine):null;}
        rodEffects?.update(dt,{energized:live,activity:active?st.attack:0,combat:!!st.combat});
        if(drawn&&live)rodEffects?.draw?.();
      }
      flash(st.hit);
      if (ctx.coils.length) {
        // Gauntlet coils swell with stored Charge.
        const k = 1 + (st.charge ?? 0) * 0.7;
        for (const c of ctx.coils) c.scale.set(k, k, 1 + (st.charge ?? 0) * 1.5);
      }
      if (gearUpdate) gearUpdate(st);
      for (const h of armours.values()) { h.handle?.setDistance?.(st.cameraDistance); h.handle?.fx?.update(dt, st); }
      if (face && (step || st.faceDetail)) face.update(step || dt, st);
      // Veyran tracery brightens with exertion and when struck.
      if (veyranMat) veyranMat.userData.face.trace.value = 0.18 + (st.combat ? 0.22 : 0) + (st.hit || 0) * 0.8;
      if (ctx.fluid) ctx.fluid.scale.y = 0.8 + Math.sin(st.t * 2.2) * 0.14;
    },
    // armour-only response (heals given/received): no animation
    armourReact(kind, id) { if (!dead) for (const h of armours.values()) h.handle?.fx?.surge(kind, id); },
    trigger(kind, id, target, contactMs) {
      if (dead) return;
      for (const h of armours.values()) h.handle?.fx?.surge(kind, id);
      if (kind === 'hit') {
        anim.react(HB.hit);
        return;
      }
      // A mounted rifle retains its two-hand fit and reacts to a confirmed auto hit.
      if (kind === 'cast' && id === 'auto' && weapon?.fire(target)) return;
      if(kind==='guard'){
        anim.play('Sword_Block',{kind:'ability',upper:moving,start:.04,timeScale:1.0,fadeOut:.12});
        return;
      }
      const rodStrike=!!(heldRod&&!rodStowed);
      const sequence=rodStrike?(heldRod.progress<.5?HUMANOID_DUAL_SEQUENCE:HUMANOID_ROD_SEQUENCE):HUMANOID_MELEE_SEQUENCE;
      let a;
      if(kind==='melee'){
        if(id==='heavy')a=HUMANOID_HEAVY_STRIKE;
        else if(id==='counter')a=HUMANOID_COUNTER_STRIKE;
        else a=sequence[(Number(id)-1+sequence.length)%sequence.length]||sequence[0];
      }else if(kind==='attack'&&id==='auto')a=sequence[meleeIndex++%sequence.length];
      else a=(kind==='cast'&&id==='auto'?null:HUMANOID_ACTIONS[id])||(kind==='cast'?HUMANOID_ACTIONS.bolt:HUMANOID_ACTIONS.auto);
      // Align the authored clip's contact marker with authoritative contact,
      // rather than arbitrarily speeding an overhand motion into a phantom hit.
      const marker=a.contact??.55,clipSeconds=anim.duration(a.clip);
      const contactSeconds=Number.isFinite(contactMs)?contactMs/1000:0;
      const authoredScale=kind==='melee'&&contactSeconds>.05&&clipSeconds>0
        ?clipSeconds*Math.max(.1,marker-(a.start||0))/contactSeconds:null;
      const scale=authoredScale?Math.max(.7,Math.min(2.8,authoredScale)):(a.timeScale||1)*(rodStrike?1.08:1);
      if((kind==='melee'||kind==='attack')&&a.stance)
        meleePose={age:0,duration:kind==='melee'?Math.max(.38,contactSeconds*2):.54,stance:a.stance};
      anim.play(a.clip,{kind:'ability',upper:moving,start:a.start||0,timeScale:scale,fadeOut:rodStrike?.12:a.fadeOut??.2});
    },
    dispose() {
      releaseRod();
      weapon?.dispose();
      sidearm?.dispose();
      disposed = true;
      for (const h of armours.values()) h.handle?.dispose();
      armours.clear();
      socialTorso.dispose();
      anim.dispose();
      face?.dispose();
      work.dispose();
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
    if (spec.metalness !== undefined) m.metalness = spec.metalness; // scales the metalness map
  }
  inst.traverse((o) => {
    if (o.isMesh) o.frustumCulled = false;
  });

  // Small living / powered details that carry each creature's identity.
  const extras = [];
  group.updateMatrixWorld(true);
  const body = inst.getObjectByName('Body');
  if(type==='survey_strider'){
    // Original mechanical instrumentation on the existing rigged CC0 tripod.
    const kit=new THREE.Group();kit.name='strider:survey-instruments';kit.position.set(0,2.08,-.25);
    const housing=new THREE.MeshStandardMaterial({color:0x748779,roughness:.64,metalness:.48});
    const frame=new THREE.MeshStandardMaterial({color:0x343d42,roughness:.53,metalness:.65});
    const ferrule=new THREE.MeshStandardMaterial({color:0xa88f60,roughness:.6,metalness:.43});
    const sensor=new THREE.MeshStandardMaterial({color:0x8bcfc5,emissive:0x246e70,emissiveIntensity:.65,roughness:.32,metalness:.3});
    const mesh=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;kit.add(m);return m;};
    mesh(new THREE.BoxGeometry(.78,.16,.42,1,1,1),frame,0,0,0);
    for(const side of [-1,1]){
      const pod=mesh(new THREE.CapsuleGeometry(.16,.36,4,12),housing,side*.39,.18,-.02);pod.rotation.z=side*.18;
      mesh(new THREE.CylinderGeometry(.13,.13,.07,16),ferrule,side*.39,.4,-.02);
      mesh(new THREE.CylinderGeometry(.085,.085,.025,16),sensor,side*.39,.45,-.02);
    }
    mesh(new THREE.CylinderGeometry(.045,.09,.64,12),frame,.08,.35,-.15);
    const dish=mesh(new THREE.SphereGeometry(.27,24,12,0,Math.PI*2,0,Math.PI*.43),housing,.08,.68,-.12);
    dish.rotation.x=Math.PI*.24;
    mesh(new THREE.SphereGeometry(.075,16,10),sensor,.08,.82,-.07);
    inst.add(kit);kit.updateMatrixWorld(true);if(body)body.attach(kit);
    extras.push(st=>{sensor.emissiveIntensity=.55+(st.act==='surveying'? .65+.3*Math.sin(st.t*6):.08);});
  }
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
export const CHARACTER_BUNDLES = ['humanoid_m', 'humanoid_f', 'creatures', 'spindle', 'turret_drone', HALO_BUNDLE];

/**
 * Build the model for an entity. Uses the GLB assets when they are loaded and
 * falls back to the procedural stand-in for that type otherwise, so a missing
 * or broken asset never removes an entity from the world.
 */
export function createModel(assets, meta, glb = true) {
  const model = buildModel(assets, meta, glb);
  return meta.vx ? applyEnemyVariant(THREE, model, meta.vx) : model;
}

function buildModel(assets, meta, glb) {
  if(meta.c==='survey_strider')return createSurveyStrider();
  let model = null;
  const haloRole=haloRoleFor(meta);
  if (glb) try {
    const look = haloRole ? null : lookFor(meta);
    if (haloRole) model=createHaloConstruct(assets,haloRole,{variant:meta.v||0});
    else if (look) model = makeHumanoid(assets, look, { ...(['archivist', 'quartermaster', 'expedition_quartermaster', 'outpost_crew'].includes(meta.c) ? { idle: HB.npcIdle } : {}),
      // NPC looks may wear a fixed armour set (the Severance squads); soldiers get a face per entity
      appearanceKey: LOOK_DEFS[look]?.facePerEntity ? `${meta.c}:${meta.i}` : meta.n || meta.c, appearance: meta.k === 'p' ? meta.ap : LOOK_DEFS[look]?.appearanceFor?.(meta) ?? meta.ap,
      weaponVisual: meta.k === 'p' ? meta.wv : null, armourVisual: meta.k === 'p' ? meta.av : LOOK_DEFS[look]?.armour || null, socialCapable: meta.k === 'p', socialVisual: meta.k === 'p' ? meta.sv : null });
    else if (meta.c === 'spindle') model = createSpindle(assets.instance('spindle'), disposeInstance, assets.instance('spindle', 'distance'));
    else if (meta.c === 'turret_drone') model = createTurretDrone(assets.instance('turret_drone'), disposeInstance);
    else if (meta.c === 'mender') {
      if (assets.menderPrototype) {
        try {
          model = createMenderPrototype(THREE, assets.menderPrototype);
        } catch (err) {
          console.warn('[models] Mender preview instance failed:', err.message || err);
        }
      }
      if (!model) model = makeMender(assets);
    } else if (RIFT_KINDS.has(meta.c)) model=riftModel(meta.c,assets.loader);
    else if (meta.c==='resonant_vein') model=buildResonantVein(THREE,{loader:assets.loader,seed:(meta.id??1)%97});
    else if (CREATURES[meta.c]) model = makeCreature(assets, meta.c);
  } catch (err) {
    console.warn(`[models] ${meta.c}: falling back to the procedural model:`, err.message || err);
    model = null;
  }
  if (model) return model;
  if (meta.c === 'spindle') return createSpindle(null, disposeInstance);
  if (meta.c === 'turret_drone') return createTurretDrone(null, disposeInstance);
  if (haloRole && glb) console.error(`[models] ${meta.c}: Halo Construct unavailable, showing the procedural stand-in`);
  const fallback = (PROCEDURAL[meta.c] || PROCEDURAL.skitter)(meta);
  fallback.kind = 'procedural';
  if(haloRole)fallback.haloRole='fallback';
  return fallback;
}
