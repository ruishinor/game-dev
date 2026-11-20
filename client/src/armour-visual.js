// Worn armour: the body-fitted, skinned pieces built by the asset pipeline
// (tools/asset-pipeline route "body-fitted-armour"). Each body has its own
// GLB per armour asset whose skin uses the same joints and inverse binds as
// that body, so every piece is re-bound to the character's own skeleton and
// follows every animation without a second armature. Pieces with energy
// channels get live effects (armour-fx.js).
import * as THREE from 'three';
import { ARMOUR_ASSETS } from '../../shared/armour-visual.js';
import { createArmourFx, isChannelMaterial, isGlassMaterial } from './armour-fx.js';

const BODY_KEY = { humanoid_m: 'm', humanoid_f: 'f' };
/** @param lod use the simplified NPC variant where one exists */
export function armourBundle(body, item, lod = false) {
  const asset = ARMOUR_ASSETS[item], key = BODY_KEY[body];
  if (!asset || !key) return null;
  return lod && LOD_ASSETS.has(asset) ? `${asset}_${key}_lod` : `${asset}_${key}`;
}
const LOD_ASSETS = new Set(['armour_vanguard_set']);
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
/** @param family optional energy family override ('CL'|'VG'|'MY'|'SW') for NPC variants */
export function wearArmour(assets, inst, body, item, family = null, lod = false) {
  const bundle = armourBundle(body, item, lod);
  if (!bundle) return null;
  const src = assets.instance(bundle);
  if (!src) { console.error(`[armour] ${item}: ${bundle} is not loaded`); return null; }
  const host = bodyMesh(inst);
  if (!host) { console.error(`[armour] ${item}: character has no skinned body mesh`); return null; }
  const pieces = [], anchors = [];
  src.traverse((o) => {
    if (o.isSkinnedMesh && (o.name === item || o.name.startsWith(item + '__'))) pieces.push(o);
    const m = /^fxa--(.+?)--([a-z_]+)--\d+$/.exec(o.name);
    if (m && m[1] === item && o.parent) anchors.push({ kind: m[2], joint: o.parent.name, position: o.position.clone() });
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
    piece.castShadow = !lod && !piece.name.endsWith('__fx') && !piece.name.endsWith('__glass');
    piece.userData.armour = item;
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
  const resolved = anchors.map((a) => ({ ...a, bone: inst.getObjectByName(a.joint) })).filter((a) => a.bone);
  const fx = fxMeshes.length || resolved.length || glassMeshes.length ? createArmourFx(fxMeshes, resolved, glassMeshes, family) : null;
  return {
    item,
    mesh: meshes[0],
    meshes,
    fx,
    hidden: hidden.map((o) => o.name),
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
