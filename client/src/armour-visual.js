// Worn armour: the body-fitted, skinned pieces built by the asset pipeline
// (tools/asset-pipeline route "body-fitted-armour"). Each body has its own
// GLB per armour asset whose skin uses the same joints and inverse binds as
// that body, so every piece is re-bound to the character's own skeleton and
// follows every animation without a second armature. Pieces with energy
// channels get live effects (armour-fx.js).
import * as THREE from 'three';
import { ARMOUR_ASSETS } from '../../shared/armour-visual.js';
import { CHANNEL_MATERIAL, createArmourFx } from './armour-fx.js';

const BODY_KEY = { humanoid_m: 'm', humanoid_f: 'f' };
export function armourBundle(body, item) {
  const asset = ARMOUR_ASSETS[item], key = BODY_KEY[body];
  return asset && key ? `${asset}_${key}` : null;
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
    piece.castShadow = !piece.name.endsWith('__fx');
    piece.userData.armour = item;
    meshes.push(piece);
  }
  const fxMeshes = meshes.filter((m) => m.material?.name === CHANNEL_MATERIAL || m.name.endsWith('__fx'));
  const resolved = anchors.map((a) => ({ ...a, bone: inst.getObjectByName(a.joint) })).filter((a) => a.bone);
  const fx = fxMeshes.length || resolved.length ? createArmourFx(fxMeshes, resolved) : null;
  return {
    item,
    mesh: meshes[0],
    meshes,
    fx,
    dispose() {
      fx?.dispose();
      for (const m of meshes) { m.removeFromParent(); m.skeleton.dispose?.(); }
    },
  };
}
