// Halo Construct NPCs: one shared, pipeline-produced skinned bundle
// (client/assets/halo_construct.glb, see docs/art/HALO-CONSTRUCT-NPC.md) shown
// in occupational roles. A role picks which variant meshes an instance keeps;
// geometry, textures and the wardrobe materials stay shared by every
// instance, and each instance owns only its skeleton, its animation state and
// a cloned body material (per-instance optic tint).
//
// The ring head replaces a face: no humanoid face, skin, hair or appearance
// pipeline applies. Expression is posture, ring orientation and optics.
import * as THREE from 'three';
import { Animator } from './animator.js';
import { disposeInstance } from './assets.js';
import { createWardenRifle, hasWardenRifle, syncWardenWeapon } from './warden-rifles.js';
import { WARDEN_PRIMARY_WEAPONS, createWardenCombatRod, syncWardenCombatRod } from './warden-combat-rod.js';

export const HALO_BUNDLE = 'halo_construct';

// Mesh names authored by tools/asset-pipeline (rig stage).
const ROLES = {
  // Sanctum Wardens: vertical ring, security uniform, alternating rifle and energized combat rod.
  guard: { meshes: ['body', 'ring_vertical', 'security'], idle: 'Guard_Watch_Loop', lookAt: false, height: 1.85 },
  // Vendors (owner direction 2026-11-21): the guard body and vertical ring in
  // the painted livery (white shell, ebony mechanism) with a blue sash only;
  // civilian posture.
  vendor: { meshes: ['body_paint', 'ring_vertical_paint', 'vendor'], idle: 'Idle_Loop', talk: 'Idle_Talking_Loop', lookAt: true, height: 1.85 },
};

// Per-warden variation: equipment carried, optic tint and idle phase/tempo.
// Deliberately restrained; all four read as the same institution.
const GUARD_VARIANTS = [
  { equip: ['equip_pouches', 'equip_radio'], optic: [0.62, 0.86, 0.95], phase: 0.0, tempo: 1.0 },
  { equip: ['equip_pouches'], optic: [0.95, 0.72, 0.38], phase: 2.7, tempo: 0.94 },
  { equip: ['equip_radio', 'equip_baton'], optic: [0.7, 0.92, 0.78], phase: 5.1, tempo: 1.06 },
  { equip: ['equip_pouches', 'equip_radio'], optic: [0.98, 0.84, 0.6], phase: 7.6, tempo: 0.97 },
];
const VENDOR_OPTIC = [0.95, 0.72, 0.38];
const HEAD_TURN_MAX = 0.9; // rad, vendor attention
const UP = new THREE.Vector3(0, 1, 0);

/** Which role a world object presents as, or null if it is not a Halo Construct. */
export function haloRoleFor(meta) {
  if (meta.c === 'sanctum_guard') return 'guard';
  if (meta.c === 'quartermaster') return 'vendor';
  return null;
}

export function createHaloConstruct(assets, role, { variant = 0 } = {}) {
  const spec = ROLES[role];
  if (!spec) throw new Error(`unknown Halo Construct role "${role}"`);
  const inst = assets.instance(HALO_BUNDLE);
  if (!inst) throw new Error('halo_construct bundle is not loaded');
  const v = role === 'guard' ? GUARD_VARIANTS[((variant % GUARD_VARIANTS.length) + GUARD_VARIANTS.length) % GUARD_VARIANTS.length] : null;
  const guardIndex = v ? GUARD_VARIANTS.indexOf(v) : -1;
  const primary = v ? WARDEN_PRIMARY_WEAPONS[guardIndex] : null;
  const armed = primary === 'rifle' && hasWardenRifle(assets, guardIndex);
  // Keep one existing anchored stave as a hidden emergency presentation fallback.
  // A valid download does not guarantee the rifle can be fitted every frame.
  const keep = new Set([...spec.meshes, ...(v ? v.equip : []), ...(v ? ['stave'] : [])]);
  const missing = [...keep].filter((n) => !inst.getObjectByName(n));
  if (missing.length) throw new Error(`halo_construct is missing meshes: ${missing.join(', ')}`);
  // Drop the meshes this role does not wear (they would still be skinned every frame if merely hidden).
  const drop = [];
  inst.traverse((o) => { if (o.isMesh && !keep.has(o.name)) drop.push(o); });
  for (const o of drop) {
    o.removeFromParent();
    o.skeleton?.dispose(); // the clone made one per mesh; geometry and materials stay shared
  }
  // Per-instance optic tint: one cloned body material shared by body and ring.
  let bodyMat = null;
  inst.traverse((o) => {
    if (!o.isMesh || !(o.name === 'body' || o.name === 'body_paint' || o.name.startsWith('ring_'))) return;
    if (!bodyMat) {
      bodyMat = o.material.clone();
      bodyMat.isShared = false;
      bodyMat.emissive.setRGB(...(v ? v.optic : VENDOR_OPTIC));
    }
    o.material = bodyMat;
  });
  const group = new THREE.Group();
  group.name = `halo_construct:${role}`;
  group.add(inst);
  const stave = v ? inst.getObjectByName('stave') : null;
  const rifle = armed ? createWardenRifle(assets, inst, guardIndex, v.optic) : null;
  const combatRod = primary === 'combat-rod' ? createWardenCombatRod(inst,guardIndex) : null;
  const clips = assets.clips(HALO_BUNDLE);
  const anim = new Animator(inst, clips);
  if (!anim.has(spec.idle)) throw new Error(`halo_construct has no clip ${spec.idle}`);
  anim.setBase(spec.idle, { fade: 0, timeScale: v ? v.tempo : 1 });
  // Evaluate the base clip even at phase zero. Previously the first Warden
  // was fitted against the unanimated bind pose and emitted a false failure.
  anim.update(v?.phase ?? 0);
  let weaponPresentation = v ? (primary === 'combat-rod'
    ? syncWardenCombatRod(combatRod,stave,0,{t:v.phase})
    : syncWardenWeapon(rifle,stave,0,{t:v.phase})) : null;
  const head = inst.getObjectByName('Head');
  const neck = inst.getObjectByName('neck_01');
  const lod = { acc: 0 };
  let talking = false;
  let attention = 0;
  const tmpQ = new THREE.Quaternion();
  const tmpV = new THREE.Vector3();
  const tmpW = new THREE.Vector3();

  return {
    kind: 'glb',
    haloRole: role,
    variant: v ? GUARD_VARIANTS.indexOf(v) : 0,
    group,
    animator: anim,
    height: spec.height,
    radius: 0.42,
    hover: 0,
    meshes: [...keep, ...(rifle ? ['warden-rifle:' + rifle.id] : []),
      ...(combatRod ? ['warden-combat-rod:energized'] : [])],
    weaponPrimary: () => primary,
    weaponFit: () => rifle?.inspect() ?? combatRod?.inspect() ?? null,
    weaponPresentation: () => weaponPresentation,
    update(dt, st) {
      if (spec.talk) {
        const want = !!st.talking;
        if (want !== talking) {
          talking = want;
          anim.setBase(talking ? spec.talk : spec.idle, { fade: 0.35 });
        }
      }
      lod.acc += dt;
      if (st.interval === Infinity) { lod.acc = Math.min(lod.acc, 0.1); return; }
      if (lod.acc < (st.interval || 0)) return;
      const step = lod.acc;
      lod.acc = 0;
      anim.update(step);
      if(v)weaponPresentation=primary === 'combat-rod'
        ? syncWardenCombatRod(combatRod,stave,step,st)
        : syncWardenWeapon(rifle,stave,step,st);
      // Vendor attention: turn the ring toward a nearby customer (presentation only).
      const target = spec.lookAt && st.lookAt && !st.dead ? st.lookAt : null;
      attention += ((target ? 1 : 0) - attention) * Math.min(1, step * 4);
      if (attention > 0.01 && head && neck && target) {
        group.updateMatrixWorld(true);
        head.getWorldPosition(tmpV);
        tmpW.copy(target).sub(tmpV);
        const local = tmpW.applyQuaternion(group.getWorldQuaternion(tmpQ).invert());
        const yaw = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -HEAD_TURN_MAX, HEAD_TURN_MAX) * attention;
        for (const [bone, share] of [[neck, 0.45], [head, 0.55]]) {
          const upLocal = tmpV.copy(UP).applyQuaternion(bone.parent.getWorldQuaternion(tmpQ).invert());
          bone.quaternion.premultiply(tmpQ.setFromAxisAngle(upLocal, yaw * share));
        }
      }
    },
    trigger(kind) {
      // Vendors acknowledge an interaction with the shared gesture; wardens never react.
      if (role === 'vendor' && kind === 'interact' && anim.has('Interact')) anim.play('Interact', { kind: 'ability', fadeOut: 0.3 });
    },
    dispose() {
      anim.dispose();
      combatRod?.dispose();
      disposeInstance(group);
    },
  };
}
