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
// A shield may absorb some damage while health still takes the same hit.
// Only a wholly absorbed contact suppresses rod target-ground discharge.
// The event values originate from the authoritative server damage result.
export const fullyBlockedContact = event => event?.a === 0 && event?.sh > 0;

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


// A dedicated rod overlay, independent of the authoritative strike outcome.
// Joined rod uses a larger lever and a left-hand counterbrace; split batons
// emphasize alternating hands. Deliberate attacks start in anticipation;
// confirmed auto attacks enter at release, avoiding a second phantom windup.
export function rodChoreography(stance, age, duration, dual=false) {
  const {anticipation:a,release:r,recovery:f}=strikeMotion(age,duration);
  const left=stance==='left',reverse=left||stance==='backhand'||stance==='right'||stance==='counter';
  const overhead=stance==='overhead'||stance==='heavy';
  const sign=reverse?-1:1, leverage=dual?.72:1;
  return {
    torsoYaw:sign*leverage*(-.21*a+(overhead?.32:.51)*r+.07*f),
    torsoPitch:overhead?(-.13*a+.20*r-.06*f):(-.055*a+.08*r-.02*f),
    rightShoulder:sign*leverage*(-.24*a+(left?.13:.45)*r-.10*f),
    leftShoulder:-sign*(dual?(left?.48:.27):.30)*(-.18*a+.68*r-.14*f),
    rightWrist:sign*leverage*(-.15*a+(overhead?.30:.23)*r-.07*f),
    leftWrist:dual?-sign*(-.08*a+.19*r-.04*f):0,
  };
}
