// Live effects for worn armour with energy channels (Cinderlock Regalia).
//
// The armour GLB carries its channel inlays as separate skinned meshes
// ("<item>__fx", material CL_Channel) whose UV.x is the flow distance from the
// set's energy source (reactor, elbow, hip, calf) and UV.y runs across the
// channel. Here they get an animated shader in the manner of the Severance
// Gate's channels: a breathing base glow, pulses travelling outward along the
// flow, a white-hot core across the channel, flicker, and a surge wavefront
// when the wearer attacks, casts or is struck. Glow anchors baked into the
// GLB ("fxa--<item>--<kind>--<n>", parented to joints; three.js strips colons) become additive halos on
// the wearer's own bones; at full quality the reactor and vents shed embers.
//
// Bounds: one channel material per wearer (shared by every piece), at most
// 14 halos and 36 embers per wearer. Quality 0 keeps the animated channels
// only; reduced motion slows time to 0.15 and drops embers and surges.
import * as THREE from 'three';

let env = { quality: () => 2, reducedMotion: () => false, intensity: () => 1 };
export function attachArmourFxEnv(e) { env = { ...env, ...e }; }

export const CHANNEL_MATERIAL = 'CL_Channel';
const HALO = { core: { size: 0.2, k: 0.95 }, core_s: { size: 0.075, k: 0.75 }, vent: { size: 0.09, k: 0.6 }, spark: { size: 0.05, k: 0.55 } };

let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const n = 64, data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (x + 0.5) / n * 2 - 1, dy = (y + 0.5) / n * 2 - 1, r = Math.hypot(dx, dy);
    const a = Math.max(0, 1 - r);
    const v = Math.min(1, a * a * 0.9 + Math.exp(-r * r * 26) * 0.9);
    const i = (y * n + x) * 4;
    data[i] = 255; data[i + 1] = Math.round(140 + 115 * Math.exp(-r * r * 20)); data[i + 2] = Math.round(90 + 165 * Math.exp(-r * r * 30)); data[i + 3] = Math.round(v * 255);
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
  float breathe = 0.72 + 0.28 * sin(t * 1.7);
  float wave = pow(0.5 + 0.5 * sin(flowD * 22.0 - t * 3.4), 9.0);
  float wave2 = pow(0.5 + 0.5 * sin(flowD * 9.0 - t * 1.3 + 1.7), 6.0);
  float flick = 0.93 + 0.07 * sin(t * 27.0 + flowD * 97.0);
  float front = exp(-pow(flowD - uSurgeAge * 1.4, 2.0) * 90.0) * uSurge;
  float k = ((0.42 * breathe + 0.75 * wave + 0.3 * wave2) * flick * uLevel + front * 1.6) * uGain;
  float core = smoothstep(0.35, 0.95, across);
  vec3 red = vec3(1.0, 0.09, 0.03), hot = vec3(1.0, 0.72, 0.5);
  vec3 col = mix(red, hot, clamp((k - 0.55) * core, 0.0, 1.0));
  diffuseColor.rgb = col * k * (0.35 + 0.65 * across) * 2.6;
`;

function channelMaterial(u) {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  m.name = CHANNEL_MATERIAL;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vFlow;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvFlow = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vFlow;\nuniform float uTime, uLevel, uGain, uMotion, uSurge, uSurgeAge;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + CHANNEL_FRAG);
  };
  m.customProgramCacheKey = () => 'armour-channel-v1';
  return m;
}

function emberSystem(count) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) seed[i] = Math.random();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLevel: { value: 1 }, uTex: { value: glowTexture() } },
    vertexShader: `attribute float seed; uniform float uTime, uLevel; varying float vA;
      void main(){ float life = fract(uTime * (0.35 + seed * 0.3) + seed * 7.0);
        vec3 p = position + vec3(sin(seed * 40.0 + uTime) * 0.03 * life, life * (0.22 + seed * 0.2), cos(seed * 31.0) * 0.03 * life);
        vA = (1.0 - life) * smoothstep(0.0, 0.1, life) * uLevel;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = (10.0 + 14.0 * seed) * (1.0 - life * 0.6) / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uTex; varying float vA; void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(1.0, 0.36, 0.12) * t.a * vA * 1.6, t.a * vA); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

/**
 * Effects for one wearer. `fxMeshes`: the bound channel meshes; `anchors`:
 * [{kind, bone, position}] already resolved to the wearer's bones.
 */
export function createArmourFx(fxMeshes, anchors) {
  const u = { uTime: { value: 0 }, uLevel: { value: 1 }, uGain: { value: 1 }, uMotion: { value: 1 }, uSurge: { value: 0 }, uSurgeAge: { value: 9 } };
  const mat = channelMaterial(u);
  for (const m of fxMeshes) { m.userData.srcMaterial = m.material; m.material = mat; }
  const halos = [], embers = [];
  for (const a of anchors.slice(0, 14)) {
    const h = HALO[a.kind] || HALO.spark;
    const sm = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff3a1c, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
    const sp = new THREE.Sprite(sm);
    sp.position.copy(a.position);
    sp.scale.setScalar(h.size);
    sp.userData = { kind: a.kind, k: h.k, base: h.size, phase: Math.random() * 6.28 };
    a.bone.add(sp);
    halos.push(sp);
    if (a.kind === 'core' || a.kind === 'vent') {
      const e = emberSystem(a.kind === 'core' ? 18 : 9);
      e.position.copy(a.position);
      a.bone.add(e);
      embers.push(e);
    }
  }
  let surgeAge = 9, surgeK = 0, time = Math.random() * 10;
  return {
    material: mat,
    update(dt, st = {}) {
      const reduced = env.reducedMotion(), q = env.quality();
      const motion = reduced ? 0.15 : 1;
      time += dt;
      surgeAge += dt;
      surgeK = Math.max(0, surgeK - dt * 1.2);
      const combat = st.combat ? 1 : 0;
      const level = (0.7 + 0.3 * combat + 0.5 * (st.hit || 0)) * env.intensity();
      u.uTime.value = time; u.uMotion.value = motion; u.uLevel.value = level;
      u.uSurge.value = reduced ? 0 : surgeK; u.uSurgeAge.value = surgeAge;
      u.uGain.value = q === 0 ? 0.8 : 1;
      const showHalo = q > 0;
      for (const h of halos) {
        h.visible = showHalo;
        if (!showHalo) continue;
        const pulse = 0.82 + 0.18 * Math.sin(time * motion * 1.7 + h.userData.phase) + surgeK * 0.6;
        h.material.opacity = Math.min(1, h.userData.k * pulse * level);
        h.scale.setScalar(h.userData.base * (0.9 + 0.2 * pulse));
      }
      const showEmbers = q >= 2 && !reduced && (st.cameraDistance ?? 0) < 18;
      for (const e of embers) {
        e.visible = showEmbers;
        e.material.uniforms.uTime.value = time;
        e.material.uniforms.uLevel.value = (0.55 + 0.45 * combat + surgeK) * env.intensity();
      }
    },
    surge() { surgeAge = 0; surgeK = 1; },
    dispose() {
      for (const h of halos) { h.removeFromParent(); h.material.dispose(); }
      for (const e of embers) { e.removeFromParent(); e.geometry.dispose(); e.material.dispose(); }
      for (const m of fxMeshes) if (m.userData.srcMaterial) m.material = m.userData.srcMaterial;
      mat.dispose();
    },
  };
}
