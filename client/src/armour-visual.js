// Worn armour: the body-fitted, skinned pieces built by the asset pipeline
// (tools/asset-pipeline route "body-fitted-armour"). Each body has its own
// GLB per armour asset whose skin uses the same joints and inverse binds as
// that body, so every piece is re-bound to the character's own skeleton and
// follows every animation without a second armature. Pieces with energy
// channels get live effects (armour-fx.js).
import * as THREE from 'three';
import { ARMOUR_ASSETS, ARMOUR_MODULE_ASSETS, modulesOf } from '../../shared/armour-visual.js';
import { createArmourFx, isChannelMaterial, isGlassMaterial, isGlowMaterial } from './armour-fx.js';

const BODY_KEY = { humanoid_m: 'm', humanoid_f: 'f' };
export function armourBundle(body, item) {
  const asset = Object.hasOwn(ARMOUR_ASSETS, item) ? ARMOUR_ASSETS[item] : Object.hasOwn(ARMOUR_MODULE_ASSETS, item) ? ARMOUR_MODULE_ASSETS[item] : null;
  const key = BODY_KEY[body];
  return asset && key ? `${asset}_${key}` : null;
}

// Distance levels for budgeted sets (nodes "<module>__lod1", "__lod2"): the
// animated channel strips stay on LOD0; the distance levels carry the
// channels as a static emissive map (material "<atlas>_far", HDR intensity).
export const ARMOUR_LOD_DISTANCE = Object.freeze([14, 32]);
export const FAR_EMISSIVE_INTENSITY = 3.6;
const lodOf = (name) => { const m = /__lod(\d)$/.exec(name); return m ? Number(m[1]) : 0; };
export function armourLodFor(distance, current = 0) {
  if (!Number.isFinite(distance)) return current;
  // a little hysteresis so a wearer at the boundary does not flicker
  const [a, b] = ARMOUR_LOD_DISTANCE;
  const up = (d, edge, lvl) => (current >= lvl ? d > edge - 1.5 : d > edge + 1.5);
  return up(distance, b, 2) ? 2 : up(distance, a, 1) ? 1 : 0;
}
// Phase-1 name, kept for callers that only know the chest asset.
export const ARMOUR_BUNDLES = Object.freeze({ humanoid_m: 'armour_chest_m', humanoid_f: 'armour_chest_f' });

function bodyMesh(inst) {
  // the body mesh (any skinned mesh of the character shares its skeleton and bind)
  let found = null, any = null;
  inst.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    if (!found && /^body(_\d+)?$/.test(o.name)) found = o;
    if (!any) any = o;
  });
  return found || any;
}

/**
 * Bind armour `item` to the character instance `inst` built on `body`
 * ('humanoid_m' | 'humanoid_f'). Returns a handle, or null when the bundle is
 * not loaded or the item has no model (the caller retries once loaded).
 */
export function wearArmour(assets, inst, body, item) {
  const bundle = armourBundle(body, item);
  if (!bundle) return null;
  const src = assets.instance(bundle);
  if (!src) { console.error(`[armour] ${item}: ${bundle} is not loaded`); return null; }
  const host = bodyMesh(inst);
  if (!host) { console.error(`[armour] ${item}: character has no skinned body mesh`); return null; }
  const pieces = [], anchors = [];
  const mods = modulesOf(item);
  const ofModule = (name) => mods.some((id) => name === id || name.startsWith(id + '__'));
  src.traverse((o) => {
    if (o.isSkinnedMesh && ofModule(o.name)) pieces.push(o);
    const m = /^fxa--(.+?)--([a-z_]+)--\d+$/.exec(o.name);
    if (m && mods.includes(m[1]) && o.parent) anchors.push({ kind: m[2], joint: o.parent.name, position: o.position.clone() });
  });
  if (!pieces.length) {
    const names = [];
    src.traverse((o) => { if (o.isMesh) names.push(`${o.type}:${o.name}`); });
    console.error(`[armour] ${item}: no skinned piece in ${bundle} (${names.join(', ')})`);
    return null;
  }
  const meshes = [];
  for (const piece of pieces) {
    const bones = piece.skeleton.bones.map((b) => inst.getObjectByName(b.name));
    if (bones.some((b) => !b)) {
      console.error(`[armour] ${item}: skeleton of ${body} is missing joints`);
      return null;
    }
    piece.removeFromParent();
    piece.position.copy(host.position);
    piece.quaternion.copy(host.quaternion);
    piece.scale.copy(host.scale);
    host.parent.add(piece);
    piece.bind(new THREE.Skeleton(bones, piece.skeleton.boneInverses.map((m) => m.clone())), host.bindMatrix.clone());
    piece.frustumCulled = false; // bind-pose bounds do not cover every pose
    piece.castShadow = !piece.name.endsWith('__fx') && !piece.name.endsWith('__glass') && !piece.name.endsWith('__glow');
    piece.userData.armour = item;
    piece.userData.lod = lodOf(piece.name);
    piece.visible = piece.userData.lod === 0;
    if (/_far$/.test(piece.material?.name || '') && piece.material.emissiveIntensity !== FAR_EMISSIVE_INTENSITY) piece.material.emissiveIntensity = FAR_EMISSIVE_INTENSITY;
    meshes.push(piece);
  }
  // Body shells (coat, sleeves, ...) the piece replaces are hidden while it is
  // worn; a shell hidden by several pieces is restored when the last one goes.
  const hides = new Set(pieces.flatMap((o) => (Array.isArray(o.userData?.hides) ? o.userData.hides : [])));
  const hidden = [];
  if (hides.size) {
    inst.traverse((o) => {
      if (!o.isMesh || o.userData.armour || !hides.has(o.name.replace(/_\d+$/, ''))) return;
      if (!o.userData.armourHides) o.userData.armourShown = o.visible;
      o.userData.armourHides = (o.userData.armourHides || 0) + 1;
      o.visible = false;
      hidden.push(o);
    });
  }
  const fxMeshes = meshes.filter((m) => isChannelMaterial(m.material?.name) || m.name.endsWith('__fx'));
  const glassMeshes = meshes.filter((m) => isGlassMaterial(m.material?.name) || m.name.endsWith('__glass'));
  const glowMeshes = meshes.filter((m) => isGlowMaterial(m.material?.name) || m.name.endsWith('__glow'));
  const resolved = anchors.map((a) => ({ ...a, bone: inst.getObjectByName(a.joint) })).filter((a) => a.bone);
  const fx = fxMeshes.length || resolved.length || glassMeshes.length || glowMeshes.length ? createArmourFx(fxMeshes, resolved, glassMeshes, glowMeshes) : null;
  let level = 0;
  const maxLod = Math.max(0, ...meshes.map((m) => m.userData.lod));
  const hasLods = maxLod > 0;
  return {
    item,
    mesh: meshes[0],
    meshes,
    fx,
    hidden: hidden.map((o) => o.name),
    get lod() { return level; },
    /** Show the level for this camera distance (no-op for sets without LODs). */
    setDistance(distance) {
      if (!hasLods) return level;
      const next = Math.min(maxLod, armourLodFor(distance, level));
      if (next === level) return level;
      level = next;
      for (const m of meshes) {
        // the glow ribbons carry the channels at every distance; the strips only up close
        if (m.name.endsWith('__glow')) continue;
        const fxStrip = m.name.endsWith('__fx') || m.name.endsWith('__glass');
        m.visible = fxStrip ? level === 0 : m.userData.lod === level;
      }
      return level;
    },
    dispose() {
      fx?.dispose();
      for (const o of hidden) {
        o.userData.armourHides -= 1;
        if (!o.userData.armourHides) o.visible = o.userData.armourShown !== false;
      }
      for (const m of meshes) { m.removeFromParent(); m.skeleton.dispose?.(); }
    },
  };
}
