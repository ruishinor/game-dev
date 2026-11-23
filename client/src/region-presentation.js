// Regional atmospheres share one fog, sky and light rig. Exit the old region
// before entering the new one: each zone snapshots/restores that shared rig.
// Calling the entering zone first silently restores the wrong atmosphere on a
// direct rift/GM transition, and can keep stale light after leaving.
import {inSeverancePocket} from '../../shared/severance-gate.js';
import {inSilentFoundry} from '../../shared/silent-foundry.js';
import {inLumenfen} from '../../shared/lumenfen.js';

/**
 * Advance each zone exactly once. Inactive regions release their previous
 * presentation first; the destination installs its atmosphere last.
 * No renderer state is owned here, and travel/collisions remain server-owned.
 */
export function updateRegionPresentations(severance, foundry, lumenfen, dt, t, eye, worldClock) {
  const valid = Number.isFinite(eye?.x) && Number.isFinite(eye?.z);
  const severanceActive = valid && inSeverancePocket(eye.x, eye.z, 40);
  const foundryActive = valid && inSilentFoundry(eye.x, eye.z, 4);
  const lumenfenActive = valid && inLumenfen(eye.x, eye.z, 35);

  if (!severanceActive) severance.update(dt, t, eye);
  if (!foundryActive) foundry.update(dt, t, eye);
  if (!lumenfenActive) lumenfen.update(dt, t, eye, worldClock);

  if (severanceActive) severance.update(dt, t, eye);
  if (foundryActive) foundry.update(dt, t, eye);
  if (lumenfenActive) lumenfen.update(dt, t, eye, worldClock);
}
