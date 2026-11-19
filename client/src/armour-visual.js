// Worn chest armour: the body-fitted, skinned pieces built by the asset
// pipeline (tools/asset-pipeline route "body-fitted-armour"). Each body has
// its own GLB whose skin uses the same joints and inverse binds as that
// body, so a piece is re-bound to the character's own skeleton and follows
// every animation without a second armature.
import * as THREE from 'three';

export const ARMOUR_BUNDLES = Object.freeze({ humanoid_m: 'armour_chest_m', humanoid_f: 'armour_chest_f' });

function bodyMesh(inst) {
  let found = null;
  inst.traverse((o) => { if (!found && o.isSkinnedMesh && o.name === 'body') found = o; });
  return found;
}

/**
 * Bind armour `item` to the character instance `inst` built on `body`
 * ('humanoid_m' | 'humanoid_f'). Returns a handle, or null when the bundle is
 * not loaded or the item has no model (the caller retries once loaded).
 */
export function wearArmour(assets, inst, body, item) {
  const bundle = ARMOUR_BUNDLES[body];
  if (!bundle || !item) return null;
  const src = assets.instance(bundle);
  if (!src) return null;
  let piece = null;
  src.traverse((o) => { if (!piece && o.isSkinnedMesh && o.name === item) piece = o; });
  const host = bodyMesh(inst);
  if (!piece || !host) return null;
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
  piece.castShadow = true;
  piece.userData.armour = item;
  return {
    item,
    mesh: piece,
    dispose() {
      piece.removeFromParent();
      piece.skeleton.dispose?.();
    },
  };
}
