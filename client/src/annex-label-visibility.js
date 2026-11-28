// Phase Annex nameplates are UI hints, not wall-penetrating sensors.
// Hide hostile/object labels behind the existing authoritative partitions
// while leaving party, companion, and out-of-region UI behavior unchanged.
import { inRiftAnnex, deepLineClear } from '../../shared/world.js';

export function annexPlateUnobstructed(viewer, target, kind) {
  if (!viewer || !target || (kind !== 'o' && kind !== 'e')) return true;
  if (!inRiftAnnex(viewer.x, viewer.z) || !inRiftAnnex(target.x, target.z)) return true;
  return deepLineClear(viewer, target);
}
