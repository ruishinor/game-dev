// Draft-preview static art: fixed allowlist and a pure, collider-bounded fit.
// No server authority or production manifest changes.
export const STATIC_ART = Object.freeze({
  survey_tower: 'resonance_tower_deployed.glb',
  survey_workstation: 'research_workstation.glb',
});

export function fitStaticArt(bounds, prop, margin = 0.2) {
  const lo = bounds.min, hi = bounds.max;
  const size = [hi.x-lo.x, hi.y-lo.y, hi.z-lo.z];
  const available = [2*prop.hw-margin, prop.h-margin, 2*prop.hd-margin];
  if (![lo.x,lo.y,lo.z,hi.x,hi.y,hi.z,margin].every(Number.isFinite) ||
      margin < 0 || ![...size,...available].every(n => Number.isFinite(n) && n > 0)) {
    throw new Error('invalid static art bounds or envelope');
  }
  const scale = Math.min(...available.map((n,i) => n/size[i]));
  const position = [-(lo.x+size[0]/2)*scale, -lo.y*scale, -(lo.z+size[2]/2)*scale];
  if (!Number.isFinite(scale) || scale <= 0 || !position.every(Number.isFinite)) {
    throw new Error('invalid static art fit');
  }
  return { scale, position };
}

export function staticArtStatus(states) {
  const values = Object.values(states);
  if (!values.length) return 'disabled';
  if (values.includes('loading')) return 'loading';
  return values.every(s => s === 'ready') ? 'ready' : 'fallback';
}
