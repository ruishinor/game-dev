// Live effects for worn class armour: the four families' own energy languages
// (owner VFX family sheets, docs/art/ARMOUR-3D.md).
//
//   Cinderlock (CL)  kinetic containment: crimson flow pulses outward from the
//                    reactor, white-hot core, a surge wavefront on attacks,
//                    embers from the reactor and vents.
//   Vesperglass (VG) resonance: ice-blue lines that pulse *in step* (a
//                    standing wave, not a flow), prisms with a slow
//                    iridescent shimmer, hex motes on barrier casts.
//   Mycelial (MY)    living circulation: slow peristaltic jade pulses along
//                    the capillaries, membranes that breathe with them,
//                    drifting spores at the seed node, a bloom on heals.
//   Strataweave (SW) instruments: small amber displays with a scanning bar
//                    and status blink; nothing else glows. Calibration
//                    ticks and amber tracers on survey casts.
//
// The GLB carries the channel inlays as separate skinned meshes
// ("<item>__fx", material "<FAMILY>_Channel") whose UV.x is the flow distance
// from the set's energy source and UV.y runs across; translucent parts
// ("<item>__glass", "<FAMILY>_Glass"); and glow anchors
// ("fxa--<item>--<kind>--<n>", parented to joints).
//
// Reactions go through the shared combat VFX engine (vfx/engine.js) — the
// same particles, quality budget, intensity and reduced-motion rules as the
// ability effects, the Severance Gate and Stillpoint — so the armour adds
// to the ability effects and never replaces them.
//
// Bounds: one channel material and one glass material per wearer piece, at
// most 14 halos and 36 embers/spores per piece. Quality 0 keeps the animated
// channels and one Cinderlock reactor core halo per piece; full halo fields
// and sparks respect quality budgets. Reduced motion suppresses particles.
import * as THREE from 'three';
import { CELL } from './vfx/textures.js';

let env = { quality: () => 2, reducedMotion: () => false, intensity: () => 1, vfx: () => null };
export function attachArmourFxEnv(e) { env = { ...env, ...e }; }

export const CHANNEL_MATERIAL = 'CL_Channel';
export const isChannelMaterial = (name) => typeof name === 'string' && /^[A-Z]{2}_Channel(\.\d+)?$/.test(name);
export const isGlassMaterial = (name) => typeof name === 'string' && /^[A-Z]{2}_Glass(\.\d+)?$/.test(name);
export const familyOf = (name) => (typeof name === 'string' && /^(CL|VG|MY|SW)_/.test(name) ? name.slice(0, 2) : 'CL');

// mode: 0 flow, 1 standing (in-phase), 2 peristaltic, 3 instrument
export const FAMILIES = Object.freeze({
  CL: { mode: 0, base: [1.0, 0.09, 0.03], hot: [1.0, 0.72, 0.5], gain: 2.6, halo: 0xff3a1c, particles: 'ember', particle: [1.0, 0.36, 0.12],
    react: { cell: 'ember', color: 0xffb070, color2: 0xff3a1c } },
  VG: { mode: 1, base: [0.18, 0.62, 1.0], hot: [0.85, 0.95, 1.0], gain: 2.2, halo: 0x7fd6ff, particles: 'mote', particle: [0.55, 0.85, 1.0],
    glass: { a: [0.45, 0.8, 1.0], b: [0.75, 0.55, 1.0] }, react: { cell: 'hex', color: 0xc5edff, color2: 0x7f9cff } },
  MY: { mode: 2, base: [0.12, 0.95, 0.45], hot: [0.75, 1.0, 0.7], gain: 1.9, halo: 0x52f0a0, particles: 'spore', particle: [0.55, 1.0, 0.6],
    glass: { a: [0.2, 0.9, 0.55], b: [0.6, 1.0, 0.75] }, react: { cell: 'spore', color: 0xb6f06a, color2: 0x52f0a0 } },
  SW: { mode: 3, base: [1.0, 0.45, 0.06], hot: [1.0, 0.85, 0.5], gain: 1.6, halo: 0xffa040, particles: null, particle: [1.0, 0.6, 0.2],
    react: { cell: 'diamond', color: 0xffd08a, color2: 0xff9a3c } },
});

// Which casts the armour answers, and how long a sustained state lasts (s).
const ABILITY_SUSTAIN = Object.freeze({
  discharge: 0.6, kinetic_ward: 4, rending_arc: 0.4, graviton_tether: 1.5,
  hinge_field: 8, lattice_relay: 8, resonant_reversal: 0.8, phase_needle: 0.3, phase_transposition: 1.2, aegis: 2,
  mending_graft: 6, neural_lash: 0.4, overgrowth_surge: 4, spore_snare: 1, shared_pulse: 1.5, surge: 2,
  fault_scan: 9, core_bore: 1.2, field_rig: 12, controlled_blast: 1,
});

const HALO = { core: { size: 0.2, k: 0.95 }, core_s: { size: 0.075, k: 0.75 }, vent: { size: 0.09, k: 0.6 }, spark: { size: 0.05, k: 0.55 },
  display: { size: 0.035, k: 0.5 }, beacon: { size: 0.03, k: 0.8 } };

let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const n = 64, data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (x + 0.5) / n * 2 - 1, dy = (y + 0.5) / n * 2 - 1, r = Math.hypot(dx, dy);
    const a = Math.max(0, 1 - r);
    const v = Math.min(1, a * a * 0.9 + Math.exp(-r * r * 26) * 0.9);
    const i = (y * n + x) * 4;
    data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = Math.round(v * 255);
  }
  glowTex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  glowTex.magFilter = THREE.LinearFilter;
  glowTex.minFilter = THREE.LinearFilter;
  glowTex.needsUpdate = true;
  return glowTex;
}

const CHANNEL_FRAG = `
  float flowD = vFlow.x;
  float across = 1.0 - abs(vFlow.y * 2.0 - 1.0);
  float t = uTime * uMotion;
  float k;
  if (uMode < 0.5) {            // kinetic flow
    float breathe = 0.72 + 0.28 * sin(t * 1.7);
    float wave = pow(0.5 + 0.5 * sin(flowD * 22.0 - t * 3.4), 9.0);
    float wave2 = pow(0.5 + 0.5 * sin(flowD * 9.0 - t * 1.3 + 1.7), 6.0);
    float flick = 0.93 + 0.07 * sin(t * 27.0 + flowD * 97.0);
    k = (0.42 * breathe + 0.75 * wave + 0.3 * wave2) * flick;
  } else if (uMode < 1.5) {     // resonance: lines pulse together, a slow standing ripple
    float beat = pow(0.5 + 0.5 * sin(t * 2.2), 3.0);
    float stand = 0.5 + 0.5 * cos(flowD * 30.0) * sin(t * 0.9);
    k = 0.45 + 0.55 * beat * (0.6 + 0.4 * stand);
  } else if (uMode < 2.5) {     // living circulation: slow peristalsis outward
    float peri = pow(0.5 + 0.5 * sin(flowD * 14.0 - t * 1.1), 5.0);
    float heart = 0.75 + 0.25 * pow(0.5 + 0.5 * sin(t * 1.25), 4.0);
    k = (0.3 + 0.8 * peri) * heart;
  } else {                      // instrument: steady readout, a scan bar, a status blink
    float scan = exp(-pow(fract(vFlow.x * 3.0 - t * 0.35) - 0.5, 2.0) * 160.0);
    float blink = step(0.92, fract(t * 0.55));
    k = 0.55 + 0.5 * scan + 0.35 * blink;
  }
  float front = exp(-pow(flowD - uSurgeAge * 1.4, 2.0) * 90.0) * uSurge;
  k = (k * uLevel + front * 1.6 + uSustain * 0.35) * uGain;
  float core = smoothstep(0.35, 0.95, across);
  vec3 col = mix(uBase, uHot, clamp((k - 0.55) * core, 0.0, 1.0));
  diffuseColor.rgb = col * k * (0.35 + 0.65 * across) * uBright;
`;

function channelMaterial(u, fam) {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  m.name = `${fam}_Channel`;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vFlow;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvFlow = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vFlow;\nuniform float uTime, uLevel, uGain, uMotion, uSurge, uSurgeAge, uMode, uSustain, uBright;\nuniform vec3 uBase, uHot;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + CHANNEL_FRAG);
  };
  m.customProgramCacheKey = () => 'armour-channel-v2';
  return m;
}

// Translucent prisms and membranes: the GLB's alpha-blended material, given
// a view-dependent tint shift and a breath in step with the channels.
const GLASS_FRAG = `
  float fres = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 2.0);
  float sh = 0.5 + 0.5 * sin(uTime * uMotion * 0.7 + vGlassPos.x * 40.0 + vGlassPos.y * 31.0);
  vec3 tint = mix(uGlassA, uGlassB, clamp(fres * 0.8 + sh * 0.3, 0.0, 1.0));
  totalEmissiveRadiance += tint * (0.12 + 0.55 * fres + 0.25 * uSustain + 0.35 * uSurge) * uLevel;
  diffuseColor.a = clamp(diffuseColor.a + fres * 0.35, 0.0, 0.92);
`;

function glassMaterial(src, u) {
  const m = src.clone();
  m.transparent = true;
  m.depthWrite = false;
  m.side = THREE.DoubleSide;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGlassPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlassPos = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGlassPos;\nuniform float uTime, uLevel, uMotion, uSustain, uSurge;\nuniform vec3 uGlassA, uGlassB;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + GLASS_FRAG);
  };
  m.customProgramCacheKey = () => 'armour-glass-v1';
  return m;
}

function particleSystem(count, rgb, kind) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) seed[i] = Math.random();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  // ember: quick rise; spore: slow drifting rise; mote: slow orbit
  const motion = kind === 'spore'
    ? 'float life = fract(uTime * (0.12 + seed * 0.1) + seed * 7.0); vec3 p = position + vec3(sin(seed * 40.0 + uTime * 0.7) * 0.06 * life, life * (0.14 + seed * 0.12), cos(seed * 31.0 + uTime * 0.5) * 0.06 * life);'
    : kind === 'mote'
      ? 'float life = fract(uTime * (0.2 + seed * 0.15) + seed * 7.0); float a = seed * 6.283 + uTime * (0.6 + seed); vec3 p = position + vec3(cos(a) * 0.05, (life - 0.5) * 0.08, sin(a) * 0.05);'
      : 'float life = fract(uTime * (0.35 + seed * 0.3) + seed * 7.0); vec3 p = position + vec3(sin(seed * 40.0 + uTime) * 0.03 * life, life * (0.22 + seed * 0.2), cos(seed * 31.0) * 0.03 * life);';
  const size = kind === 'spore' ? '(12.0 + 10.0 * seed)' : kind === 'mote' ? '(6.0 + 6.0 * seed)' : '(10.0 + 14.0 * seed)';
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLevel: { value: 1 }, uTex: { value: glowTexture() }, uColor: { value: new THREE.Color(...rgb) } },
    vertexShader: `attribute float seed; uniform float uTime, uLevel; varying float vA;
      void main(){ ${motion}
        vA = (1.0 - life) * smoothstep(0.0, 0.1, life) * uLevel;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = ${size} * (1.0 - life * 0.6) / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: 'uniform sampler2D uTex; uniform vec3 uColor; varying float vA; void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(uColor * t.a * vA * 1.6, t.a * vA); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

const _v = new THREE.Vector3();

/**
 * Effects for one worn piece. `fxMeshes`: the bound channel meshes;
 * `anchors`: [{kind, bone, position}] already resolved to the wearer's bones;
 * `glassMeshes`: bound translucent meshes. The family comes from the channel
 * (or glass) material name; Cinderlock when unknown.
 */
export function createArmourFx(fxMeshes, anchors, glassMeshes = []) {
  const famKey = familyOf(fxMeshes[0]?.material?.name || glassMeshes[0]?.material?.name || CHANNEL_MATERIAL);
  const fam = FAMILIES[famKey];
  const u = {
    uTime: { value: 0 }, uLevel: { value: 1 }, uGain: { value: 1 }, uMotion: { value: 1 }, uSurge: { value: 0 }, uSurgeAge: { value: 9 },
    uMode: { value: fam.mode }, uSustain: { value: 0 }, uBright: { value: fam.gain },
    uBase: { value: new THREE.Vector3(...fam.base) }, uHot: { value: new THREE.Vector3(...fam.hot) },
    uGlassA: { value: new THREE.Vector3(...(fam.glass?.a || fam.base)) }, uGlassB: { value: new THREE.Vector3(...(fam.glass?.b || fam.hot)) },
  };
  const mat = channelMaterial(u, famKey);
  for (const m of fxMeshes) { m.userData.srcMaterial = m.material; m.material = mat; }
  const glassMats = [];
  for (const m of glassMeshes) {
    m.userData.srcMaterial = m.material;
    m.material = glassMaterial(m.material, u);
    m.castShadow = false;
    m.renderOrder = 2;
    glassMats.push(m.material);
  }
  const halos = [], particles = [];
  for (const a of anchors.slice(0, 14)) {
    const h = HALO[a.kind] || HALO.spark;
    const sm = new THREE.SpriteMaterial({ map: glowTexture(), color: fam.halo, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
    const sp = new THREE.Sprite(sm);
    sp.position.copy(a.position);
    // Cinderlock uses a recognisable white-hot reactor surrounded by crimson
    // vents; the other armour families retain their distinct colour languages.
    if (famKey === 'CL' && a.kind === 'core') sm.color.setHex(0xffe7ce);
    const coreSize = famKey === 'CL' && a.kind === 'core' ? 1.55 : 1;
    sp.scale.setScalar(h.size * coreSize);
    sp.userData = { kind: a.kind, k: h.k, base: h.size * coreSize, phase: Math.random() * 6.28, bone: a.bone };
    a.bone.add(sp);
    halos.push(sp);
    if (fam.particles && (a.kind === 'core' || a.kind === 'vent')) {
      const e = particleSystem(a.kind === 'core' ? 18 : 9, fam.particle, fam.particles);
      e.position.copy(a.position);
      e.userData.armourEmitter = a.kind;
      a.bone.add(e);
      particles.push(e);
    }
  }
  let surgeAge = 9, surgeK = 0, sustain = 0, sustainLeft = 0, setDone = false, time = Math.random() * 10;
  const anchorAt = (sp) => () => { sp.getWorldPosition(_v); return [_v.x, _v.y, _v.z]; };

  // a family-shaped reaction in the shared engine at this piece's anchors
  function react(kind, id) {
    const v = env.vfx?.();
    if (!v || env.reducedMotion() || env.quality() <= 0 || !halos.length) return;
    const r = fam.react;
    const strong = kind === 'ability' || kind === 'cast';
    for (const sp of halos.slice(0, strong ? 3 : 1)) {
      const at = anchorAt(sp);
      if (famKey === 'VG') v.burst({ at, shape: 'sphere', radius: 0.05, count: strong ? 7 : 3, cell: CELL[r.cell], color: r.color, color2: r.color2, size: [0.03, 0.05], sizeEnd: 0.012, life: [0.35, 0.6], speed: [0.2, 0.5], spin: [-0.6, 0.6], drag: 1.2, alpha: 0.7 });
      else if (famKey === 'MY') v.burst({ at, shape: 'sphere', radius: 0.04, count: strong ? 6 : 2, cell: CELL[r.cell], color: r.color, color2: r.color2, size: [0.03, 0.06], sizeEnd: 0.02, life: [0.8, 1.4], speed: [0.08, 0.25], dir: [0, 1, 0], spread: 1.2, drag: 0.8, gravity: -0.15, alpha: 0.6 });
      else if (famKey === 'SW') v.burst({ at, count: strong ? 4 : 1, exact: !strong, cell: CELL[r.cell], color: r.color, color2: r.color2, size: 0.02, sizeEnd: 0.008, life: [0.25, 0.4], speed: [0.4, 0.8], spread: 0.5, alpha: 0.75 });
      else v.burst({ at, shape: 'sphere', radius: 0.03, count: strong ? 8 : 3, cell: CELL[r.cell], color: r.color, color2: r.color2, size: [0.02, 0.04], sizeEnd: 0.008, life: [0.2, 0.4], speed: [0.8, 1.6], stretch: 0.04, drag: 2, gravity: 2, alpha: 0.8 });
    }
    if (strong && id && famKey !== 'SW') v.flash?.({ at: anchorAt(halos[0]), color: r.color2, intensity: 1.6, life: 0.18, distance: 2.2 });
  }

  return {
    family: famKey,
    material: mat,
    update(dt, st = {}) {
      const reduced = env.reducedMotion(), q = env.quality();
      const motion = reduced ? 0.15 : 1;
      time += dt;
      surgeAge += dt;
      surgeK = Math.max(0, surgeK - dt * 1.2);
      sustainLeft = Math.max(0, sustainLeft - dt);
      sustain += ((sustainLeft > 0 ? 1 : 0) - sustain) * Math.min(1, dt * 3);
      const combat = st.combat ? 1 : 0;
      const level = (0.7 + 0.3 * combat + 0.5 * (st.hit || 0) + (setDone ? 0.12 : 0)) * env.intensity();
      u.uTime.value = time; u.uMotion.value = motion; u.uLevel.value = level;
      u.uSurge.value = reduced ? 0 : surgeK; u.uSurgeAge.value = surgeAge; u.uSustain.value = sustain;
      // At low graphics quality preserve the Cinderlock reactor signature
      // without increasing particle or dynamic-light budgets.
      u.uGain.value = q === 0 ? (famKey === 'CL' ? 1.05 : 0.8) : 1;
      for (const h of halos) {
        const showHalo = q > 0 || (famKey === 'CL' && h.userData.kind === 'core' && (st.cameraDistance ?? 0) < 22);
        h.visible = showHalo;
        if (!showHalo) continue;
        const beat = famKey === 'SW' ? (h.userData.kind === 'beacon' ? (Math.sin(time * motion * 3.1 + h.userData.phase) > 0.85 ? 1 : 0.25) : 0.8)
          : 0.82 + 0.18 * Math.sin(time * motion * (famKey === 'MY' ? 1.25 : 1.7) + (famKey === 'VG' ? 0 : h.userData.phase));
        const pulse = beat + surgeK * 0.6 + sustain * 0.3;
        const reactor = famKey === 'CL' && h.userData.kind === 'core';
        h.material.opacity = Math.min(1, h.userData.k * pulse * level * (reactor ? 1.3 : 1));
        h.scale.setScalar(h.userData.base * (0.9 + 0.2 * pulse + (reactor ? surgeK * 0.22 : 0)));
      }
      const particlesNear = !reduced && (st.cameraDistance ?? 0) < 18;
      for (const e of particles) {
        // One existing core emitter at medium quality; no new emitters,
        // point lights, particle pools or per-frame geometry allocation.
        e.visible = particlesNear && (q >= 2 || (q === 1 && famKey === 'CL' && e.userData.armourEmitter === 'core'));
        e.material.uniforms.uTime.value = time;
        e.material.uniforms.uLevel.value = (0.55 + 0.45 * combat + surgeK + sustain * 0.5) * env.intensity();
      }
    },
    /** kind: 'attack' | 'cast' | 'ability' | 'hit'; id: the ability id, if any. */
    surge(kind, id) {
      surgeAge = 0;
      surgeK = kind === 'hit' ? 0.6 : 1;
      if (id && Object.hasOwn(ABILITY_SUSTAIN, id)) sustainLeft = Math.max(sustainLeft, ABILITY_SUSTAIN[id]);
      if (kind !== 'hit') react(kind, id);
    },
    /** Four pieces of one family worn: a restrained set signature. */
    setComplete(on) { setDone = !!on; u.uBright.value = fam.gain * (on ? (famKey === 'CL' ? 1.35 : 1.12) : 1); },
    get sustain() { return sustain; },
    dispose() {
      for (const h of halos) { h.removeFromParent(); h.material.dispose(); }
      for (const e of particles) { e.removeFromParent(); e.geometry.dispose(); e.material.dispose(); }
      for (const m of fxMeshes) if (m.userData.srcMaterial) m.material = m.userData.srcMaterial;
      for (const m of glassMeshes) if (m.userData.srcMaterial) m.material = m.userData.srcMaterial;
      for (const g of glassMats) g.dispose();
      mat.dispose();
    },
  };
}
