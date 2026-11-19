// Severance Expanse time-of-day PREVIEW: a local, deterministic presentation
// prototype for reviewing how the Severance Gate reads from the Expanse at
// different times. It is not a game clock: nothing is replicated, persisted or
// read by gameplay, and it is off unless a preview asks for it (?tod=… or
// window.__attune.timeOfDay). It changes only the sky, stars, fog, the sun
// (direction, colour, intensity), the ambient fill and a multiplier on the
// gate's existing warm portal light, and only while the camera is in the
// Expanse. Leaving the Expanse restores the scene lighting exactly.
//
// Independent of the gate: the gate's dormant / resonating / active phase
// drives its own effects; time of day never changes the phase.

// Keyframes. Day is a subdued, warm late afternoon (stone, stairs and ruins
// readable); night is indigo with stars and dark ridgelines. Colours are hex
// sRGB; `sunDir` is the direction toward the light (moon at night).
export const TOD_KEYS = Object.freeze(['day', 'dusk', 'night', 'dawn']);
export const TOD = Object.freeze({
  day: {
    skyTop: 0x41557f, skyMid: 0x8f8396, skyLow: 0xd9a27c, stars: 0,
    fog: 0x8a7668, fogNear: 90, fogFar: 420,
    sun: 0xffd6a8, sunI: 3.0, sunDir: [-0.62, 0.42, -0.66],
    hemiSky: 0xd6ccd0, hemiGround: 0x6a5648, hemiI: 1.75,
    spill: 1.25,
  },
  dusk: {
    skyTop: 0x1a2148, skyMid: 0x573c63, skyLow: 0xc96a52, stars: 0.35,
    fog: 0x4b3439, fogNear: 50, fogFar: 300,
    sun: 0xff9a66, sunI: 1.35, sunDir: [-0.82, 0.12, -0.56],
    hemiSky: 0x8e82ad, hemiGround: 0x3d2c32, hemiI: 1.0,
    spill: 1.2,
  },
  night: {
    skyTop: 0x04071a, skyMid: 0x10164a, skyLow: 0x2b2558, stars: 1,
    fog: 0x15131f, fogNear: 45, fogFar: 270,
    sun: 0x8c9cff, sunI: 0.7, sunDir: [0.35, 0.78, -0.52],
    hemiSky: 0x4b5492, hemiGround: 0x1b1720, hemiI: 0.75,
    spill: 1.1,
  },
  dawn: {
    skyTop: 0x1d2a5b, skyMid: 0x635685, skyLow: 0xe59f7c, stars: 0.25,
    fog: 0x56485a, fogNear: 55, fogFar: 310,
    sun: 0xffb48c, sunI: 1.2, sunDir: [0.86, 0.14, -0.49],
    hemiSky: 0x9b92bc, hemiGround: 0x3f3239, hemiI: 1.05,
    spill: 1.2,
  },
});
const ANCHOR = Object.freeze({ day: 0, dusk: 0.25, night: 0.5, dawn: 0.75 });

const ease = (x) => x * x * (3 - 2 * x);

/** Blend weights for a loop position t in [0,1): day 0, dusk .25, night .5, dawn .75. */
export function todSegment(t) {
  const u = (((t % 1) + 1) % 1) * 4;
  const i = Math.min(3, Math.floor(u));
  return { from: TOD_KEYS[i], to: TOD_KEYS[(i + 1) % 4], k: ease(u - i) };
}

/**
 * Parse the preview request from a query string.
 *   ?tod=day|dusk|night|dawn   hold that key
 *   ?tod=0.37                  hold a loop position
 *   ?tod=loop&todperiod=28     run the loop with a period in seconds
 * Anything else (or nothing) leaves the preview off.
 */
export function parseTimeOfDay(search) {
  const p = new URLSearchParams(search || '');
  const v = p.get('tod');
  if (!v) return { mode: 'off' };
  const period = Math.max(4, Math.min(3600, Number(p.get('todperiod')) || 28));
  if (Object.hasOwn(ANCHOR, v)) return { mode: 'hold', t: ANCHOR[v], period };
  if (v === 'loop') return { mode: 'loop', t: Number(p.get('todstart')) || 0, period };
  const t = Number(v);
  if (Number.isFinite(t) && t >= 0 && t <= 1) return { mode: 'hold', t, period };
  return { mode: 'off' };
}

/**
 * @param T three namespace
 * @param o {scene, sky (group from buildSky), ambient (HemisphereLight), sun (DirectionalLight), dir (Vector3 the scene aims the sun along), landmark}
 */
export function createTimeOfDay(T, o) {
  const skyMesh = o.sky?.children.find((c) => c.material?.uniforms?.top);
  const stars = o.sky?.children.find((c) => c.isPoints);
  const C = (hex) => new T.Color(hex);
  const keys = Object.fromEntries(TOD_KEYS.map((k) => {
    const s = TOD[k];
    return [k, { ...s, skyTop: C(s.skyTop), skyMid: C(s.skyMid), skyLow: C(s.skyLow), fog: C(s.fog), sun: C(s.sun), hemiSky: C(s.hemiSky), hemiGround: C(s.hemiGround), sunDir: new T.Vector3(...s.sunDir).normalize() }];
  }));
  const cur = { skyTop: C(0), skyMid: C(0), skyLow: C(0), fog: C(0), sun: C(0), hemiSky: C(0), hemiGround: C(0), sunDir: new T.Vector3(), stars: 0, fogNear: 0, fogFar: 0, sunI: 0, hemiI: 0, spill: 1 };
  const state = { mode: 'off', t: 0, period: 28, applied: false, key: null };
  let saved = null;

  function sample(t) {
    const { from, to, k } = todSegment(t);
    const a = keys[from], b = keys[to];
    for (const c of ['skyTop', 'skyMid', 'skyLow', 'fog', 'sun', 'hemiSky', 'hemiGround']) cur[c].copy(a[c]).lerp(b[c], k);
    for (const n of ['stars', 'fogNear', 'fogFar', 'sunI', 'hemiI', 'spill']) cur[n] = a[n] + (b[n] - a[n]) * k;
    cur.sunDir.copy(a.sunDir).lerp(b.sunDir, k).normalize();
    state.key = k < 0.02 ? from : k > 0.98 ? to : `${from}→${to}`;
    return cur;
  }

  function capture() {
    const f = o.scene.fog, sk = skyMesh?.material.uniforms;
    saved = {
      fog: f ? { color: f.color.clone(), near: f.near, far: f.far } : null,
      sky: sk ? { top: sk.top.value.clone(), mid: sk.mid.value.clone(), low: sk.low.value.clone() } : null,
      skyPos: o.sky?.position.clone(),
      stars: stars ? stars.material.opacity : null,
      sun: o.sun ? { color: o.sun.color.clone(), intensity: o.sun.intensity } : null,
      dir: o.dir ? o.dir.clone() : null,
      hemi: o.ambient ? { sky: o.ambient.color.clone(), ground: o.ambient.groundColor.clone(), intensity: o.ambient.intensity } : null,
    };
  }

  /** Put back exactly what was there before the preview took over. */
  function restore() {
    if (!saved) return;
    const f = o.scene.fog, sk = skyMesh?.material.uniforms;
    if (f && saved.fog) { f.color.copy(saved.fog.color); f.near = saved.fog.near; f.far = saved.fog.far; }
    if (sk && saved.sky) { sk.top.value.copy(saved.sky.top); sk.mid.value.copy(saved.sky.mid); sk.low.value.copy(saved.sky.low); }
    if (o.sky && saved.skyPos) o.sky.position.copy(saved.skyPos);
    if (stars && saved.stars !== null) stars.material.opacity = saved.stars;
    if (o.sun && saved.sun) { o.sun.color.copy(saved.sun.color); o.sun.intensity = saved.sun.intensity; }
    if (o.dir && saved.dir) o.dir.copy(saved.dir);
    if (o.ambient && saved.hemi) { o.ambient.color.copy(saved.hemi.sky); o.ambient.groundColor.copy(saved.hemi.ground); o.ambient.intensity = saved.hemi.intensity; }
    o.landmark?.setLightScale?.(1);
    saved = null;
    state.applied = false;
  }

  function apply(center) {
    if (!saved) capture();
    const c = sample(state.t);
    const f = o.scene.fog, sk = skyMesh?.material.uniforms;
    if (f) { f.color.copy(c.fog); f.near = c.fogNear; f.far = c.fogFar; }
    if (sk) { sk.top.value.copy(c.skyTop); sk.mid.value.copy(c.skyMid); sk.low.value.copy(c.skyLow); }
    // centre the sky dome on the Expanse so the horizon gradient sits on the ridge
    if (o.sky && center) o.sky.position.set(center.x, 0, center.z);
    if (stars) stars.material.opacity = 0.9 * c.stars;
    if (o.sun) { o.sun.color.copy(c.sun); o.sun.intensity = c.sunI; }
    if (o.dir) o.dir.copy(c.sunDir);
    if (o.ambient) { o.ambient.color.copy(c.hemiSky); o.ambient.groundColor.copy(c.hemiGround); o.ambient.intensity = c.hemiI; }
    o.landmark?.setLightScale?.(c.spill);
    state.applied = true;
  }

  return {
    get state() { return { ...state }; },
    get active() { return state.mode !== 'off'; },
    configure(req = {}) {
      const mode = req.mode ?? (Object.hasOwn(ANCHOR, req.key) ? 'hold' : state.mode);
      if (mode === 'off') { state.mode = 'off'; restore(); return this.state; }
      state.mode = mode === 'loop' ? 'loop' : 'hold';
      if (Object.hasOwn(ANCHOR, req.key)) state.t = ANCHOR[req.key];
      else if (Number.isFinite(req.t)) state.t = ((req.t % 1) + 1) % 1;
      if (Number.isFinite(req.period) && req.period > 0) state.period = req.period;
      return this.state;
    },
    /** Advance (loop mode) and apply while the camera is in the Expanse; restore otherwise. */
    update(dt, inside, center) {
      if (state.mode === 'off' || !inside) { restore(); return; }
      if (state.mode === 'loop' && dt > 0) state.t = (state.t + dt / state.period) % 1;
      apply(center);
    },
    restore,
    sample,
  };
}
