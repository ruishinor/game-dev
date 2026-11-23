// P05 client presentation only. Authoritative combat and impact events live on the server.
const finiteAim = p => p?.isVector3 === true && [p.x, p.y, p.z].every(Number.isFinite);

// Eye/head tracking is not weapon targeting. The render loop supplies a separate
// server/selection-derived weaponAimAt for equipped firearms.
export function weaponAimFromState(st) {
  return finiteAim(st?.weaponAimAt) ? st.weaponAimAt.clone() : null;
}

// A confirmed damage event can provide a target even when remote snapshots are
// interpolated or the current selection has changed. This affects only the pose;
// it must never create damage, muzzle flashes or an independent hit.
export function confirmedWeaponAim(target, lastAim, forwardFallback) {
  if (finiteAim(target)) return target.clone();
  if (finiteAim(lastAim)) return lastAim.clone();
  return forwardFallback();
}

// Weapons must not blink out for ordinary casting/attack clips. Fabrication and
// the sit transition intentionally reserve the arms. Death/air are handled by
// each weapon adapter's existing visibility contract.
export function heldWeaponOccluded({ working = false, sitBlend = 0 } = {}) {
  return !!working || sitBlend > 0;
}

const clamp = x => Math.min(1, Math.max(0, x));
const smooth = (a, b, t) => { const u = clamp((t - a) / (b - a)); return u * u * (3 - 2 * u); };

// Small bounded additive torso/arm motion after the authored GLB clip. Release
// peaks halfway through the pose, at the server-reported windup contact time.
// The overlay changes no collision/hit windows and never emits contact VFX.
export function strikeMotion(age, duration) {
  if (!Number.isFinite(age) || !Number.isFinite(duration) || duration <= 0) {
    return { anticipation: 0, release: 0, recovery: 0 };
  }
  const t = clamp(age / duration);
  return {
    anticipation: smooth(0.02, 0.25, t) * (1 - smooth(0.30, 0.46, t)),
    release: smooth(0.30, 0.50, t) * (1 - smooth(0.56, 0.89, t)),
    recovery: smooth(0.52, 0.75, t) * (1 - smooth(0.78, 1, t)),
  };
}
