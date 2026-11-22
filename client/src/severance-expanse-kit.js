// Severance Expanse environment kit at runtime: the colossal ring, eroded spires
// and hoodoos, mineral crystal clusters, boulders and talus, all instanced from
// severance_kit.glb (tools/asset-pipeline/asset_pipeline/blender/severance_kit.py,
// the gate's stone atlas and bake method). Effects follow the gate's engine:
// bounded shader layers, additive halos and particle fields, one pre-created
// light, distance bands and a deterministic mode for captures.
//
// Presentation only. Every placement sits inside a shared collider
// (shared/severance-gate.js); nothing here changes movement or gameplay.
import { SEVERANCE_EXPANSE, SEVERANCE_MASSIFS, SPIRE_HEIGHT, SEVERANCE_CRYSTALS, SEVERANCE_RING, SEVERANCE_OUTCROPS } from '../../shared/severance-gate.js';
import { noiseTexture, particleField } from './severance-gate.js';

export const SEVERANCE_KIT_URL = '/client/assets/severance_kit.glb?v=be3067e11217';
export const KIT_LIMITS = Object.freeze({ lights: 1, crystalFields: 14, crystalMotes: 26, ringMotes: 90, lightRange: 46, fxRange: 150 });

function rng(seed) {
  let s = (seed * 2654435761) % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/**
 * Deterministic placements. Each entry: {kind, variant, x, z, yaw, w (footprint
 * radius), h (height), sink, ...}. Talus, hoodoos and spires stay inside their
 * massif's collider; outcrops and crystals match their own colliders.
 */
export function kitPlacements() {
  const out = [];
  for (const m of SEVERANCE_MASSIFS) {
    const r = rng(m.seed);
    if (m.kind === 'spire') {
      out.push({ kind: 'spire', variant: 'Spire_' + 'ABC'[m.seed % 3], x: m.x, z: m.z, yaw: r() * 6.283, w: m.r * 0.98, h: SPIRE_HEIGHT(m), sink: 1.2 });
      continue;
    }
    if (m.kind === 'ridge') {
      // a broad crest of gate-builder bedrock: two massive blocks and one tooth
      for (let i = 0; i < 3; i++) {
        const tooth = i === 2, a = r() * 6.283, d = m.r * r() * (tooth ? 0.25 : 0.3);
        const w = m.r * (tooth ? 0.3 + r() * 0.08 : 0.46 + r() * 0.12);
        out.push({ kind: 'crag', variant: tooth ? 'Spire_' + 'ABC'[(m.seed + i) % 3] : 'Boulder_' + 'ABCD'[(m.seed + i) % 4], x: m.x + Math.cos(a) * d, z: m.z + Math.sin(a) * d,
          yaw: r() * 6.283, w, h: m.h * (tooth ? 1.0 + r() * 0.3 : 0.6 + r() * 0.25), sink: tooth ? 2 : m.h * 0.08 });
      }
    } else {
      // chimneys on the mesa shoulders break the flat silhouettes
      for (let i = 0; i < 2; i++) {
        const a = r() * 6.283, d = m.r * (0.5 + r() * 0.1), w = Math.min(m.r * 0.18, 3.4);
        out.push({ kind: 'hoodoo', variant: 'Spire_' + 'ABC'[(m.seed + i) % 3], x: m.x + Math.cos(a) * d, z: m.z + Math.sin(a) * d, yaw: r() * 6.283,
          w, h: m.h * (0.9 + r() * 0.35), sink: m.h * 0.7 });
      }
    }
    // talus at the foot of the cliffs
    const n = Math.round(m.r * (m.kind === 'mesa' ? 0.9 : 0.6));
    for (let i = 0; i < n; i++) {
      const a = (i + r() * 0.7) / n * 6.283, size = 1.1 + r() * 2.2;
      const d = Math.min(m.r - size * 0.55, m.r * (0.84 + r() * 0.12));
      out.push({ kind: 'talus', variant: 'Boulder_' + 'ABCD'[Math.floor(r() * 4)], x: m.x + Math.cos(a) * d, z: m.z + Math.sin(a) * d, yaw: r() * 6.283, w: size * 0.5, h: size * (0.6 + r() * 0.4), sink: size * 0.25 });
    }
  }
  // bluffs and teeth along the enclosing ridge, outside the walkable limit
  {
    const E = SEVERANCE_EXPANSE, r = rng(4401);
    const perim = 2 * (E.hw + E.hd) * 2;
    const n = 64;
    for (let i = 0; i < n; i++) {
      let s = (i + r() * 0.6) / n * perim;
      let u, v;
      const W = 2 * E.hw, D = 2 * E.hd;
      if (s < W) { u = -E.hw + s; v = -E.hd; } else if ((s -= W) < D) { u = E.hw; v = -E.hd + s; } else if ((s -= D) < W) { u = E.hw - s; v = E.hd; } else { s -= W; u = -E.hw; v = E.hd - s; }
      const out1 = 34 + r() * 20;                                  // on the crest, metres beyond the region edge
      const nu = Math.abs(u) >= E.hw - 1e-6 ? Math.sign(u) : 0, nv = nu ? 0 : Math.sign(v);
      const big = r() < 0.55;
      out.push({ kind: 'bluff', variant: big ? 'Boulder_' + 'ABCD'[i % 4] : 'Spire_' + 'ABC'[i % 3], x: E.x + u + nu * out1, z: E.z + v + nv * out1, yaw: r() * 6.283,
        w: big ? 7 + r() * 9 : 4 + r() * 3, h: big ? 12 + r() * 14 : 22 + r() * 18, sink: big ? 4 : 3 });
    }
  }
  for (const p of SEVERANCE_OUTCROPS) {
    out.push({ kind: 'outcrop', variant: 'Boulder_' + 'ABCD'[p.seed % 4], x: p.x, z: p.z, yaw: p.seed * 1.7, w: p.r, h: p.h, sink: p.h * 0.15 });
  }
  for (const c of SEVERANCE_CRYSTALS) {
    out.push({ kind: 'crystal', variant: 'Crystal_' + 'ABC'[c.seed % 3], x: c.x, z: c.z, yaw: c.seed * 2.1, w: c.r, h: c.h, sink: 0.2, teal: c.teal, seed: c.seed });
  }
  const R = SEVERANCE_RING;
  out.push({ kind: 'ring', variant: 'Ring_Colossal', x: R.x, z: R.z, yaw: R.yaw, w: R.radius, h: 0, sink: 0 });
  return out;
}

// ----------------------------------------------------------------------------- shaders
const CRYSTAL_VS = `
varying vec3 vW; varying vec3 vN; varying float vH; varying float vFog;
uniform float uBase, uTop;
void main(){
  #include <begin_vertex>
  vec4 w = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vH = clamp((transformed.y - uBase) / (uTop - uBase), 0.0, 1.0);
  vec4 mv = viewMatrix * w; vFog = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const CRYSTAL_FS = `
uniform sampler2D uNoise; uniform float uTime, uGain, uMotion; uniform vec3 uHot, uCore;
uniform vec3 fogColor; uniform float fogNear, fogFar; varying float vFog;
varying vec3 vW; varying vec3 vN; varying float vH;
void main(){
  vec3 V = normalize(cameraPosition - vW), N = normalize(vN);
  float fr = pow(1.0 - abs(dot(N, V)), 2.4);
  float t = uTime * uMotion;
  // slow mineral veins drifting up through the prism
  float n1 = texture2D(uNoise, vec2(vW.x * 0.11 + vW.z * 0.07, vW.y * 0.09 - t * 0.02)).r;
  float n2 = texture2D(uNoise, vec2(vW.z * 0.23 - t * 0.01, vW.y * 0.31 + vW.x * 0.05)).g;
  float vein = pow(1.0 - abs(n1 - 0.5) * 2.0, 7.0);
  float pulse = 0.82 + 0.18 * sin(t * 1.3 + vW.x * 0.4 + vW.z * 0.3);
  float facet = 0.55 + 0.45 * abs(N.y);
  float k = (0.18 + 0.5 * vH * vH + 0.85 * fr + 0.55 * vein * (0.4 + n2)) * pulse * uGain;
  vec3 c = mix(uCore, uHot, clamp(k * 0.8, 0.0, 1.0)) * k * facet + uHot * fr * 0.25 * uGain;
  gl_FragColor = vec4(mix(c, fogColor, smoothstep(fogNear, fogFar, vFog)), 1.0);
}`;
const HALO_VS = `
attribute vec4 aHalo;   // x, y, z, size
attribute vec3 aTint;
varying vec2 vQ; varying vec3 vT; varying float vS;
void main(){
  vec4 mv = viewMatrix * vec4(aHalo.xyz, 1.0);
  mv.xy += position.xy * aHalo.w;
  vQ = position.xy * 2.0; vT = aTint; vS = aHalo.w;
  gl_Position = projectionMatrix * mv;
}`;
const HALO_FS = `
uniform float uGain, uTime, uMotion; varying vec2 vQ; varying vec3 vT; varying float vS;
void main(){
  float r2 = dot(vQ, vQ);
  float k = exp(-r2 * 3.2) * (0.85 + 0.15 * sin(uTime * uMotion * 1.1 + vS * 7.0)) * uGain;
  if (k < 0.003) discard;
  gl_FragColor = vec4(vT * k, k);
}`;
// The ring's inlaid channel: an ancient, faint charge that creeps around the ring.
const RING_FS = `
uniform float uTime, uGain, uMotion; varying vec2 vUv;
uniform vec3 fogColor; uniform float fogNear, fogFar; varying float vFog;
void main(){
  float d = vUv.x * 100.0;
  float wave = 0.5 + 0.5 * sin((d - uTime * uMotion * 3.2) * 0.21);
  float pulse = pow(wave, 12.0);
  float flicker = 0.85 + 0.15 * sin(uTime * uMotion * 7.0 + d * 1.7);
  float k = (0.14 + 0.75 * pulse) * flicker * uGain;
  vec3 c = mix(vec3(0.95, 0.36, 0.07), vec3(1.0, 0.78, 0.5), pulse) * k;
  gl_FragColor = vec4(mix(c, fogColor, smoothstep(fogNear, fogFar, vFog) * 0.85), 1.0);
}`;

const AMBER = { hot: 0xffa548, core: 0x4a1a06, halo: 0xff8a2e, light: 0xffa04a };
const TEAL = { hot: 0x5ef2e2, core: 0x05302f, halo: 0x3fd8cf, light: 0x6ff0e0 };

/**
 * @param T three namespace
 * @param o {group (parent), loader, ground(x,z), url?}
 */
export function createExpanseKit(T, o) {
  const root = new T.Group();
  root.name = 'severance-kit';
  o.group.add(root);
  const place = kitPlacements();
  const noise = noiseTexture(T, 128, 61);
  const U = (v) => ({ value: v });
  const shared = { uTime: U(0), uMotion: U(1) };
  const crystalMats = [];
  const fallbackCrystalMats = [];
  const fields = [];
  const halosGeo = new T.InstancedBufferGeometry();
  let halosMat = null, ringMat = null, ringMotes = null;
  const light = new T.PointLight(AMBER.light, 0, KIT_LIMITS.lightRange, 1.8);
  light.name = 'severance-kit:crystal-light';
  light.castShadow = false;
  root.add(light);
  const crystals = place.filter((p) => p.kind === 'crystal');
  const state = { status: 'idle', instances: 0, draws: 0, gain: 1, lit: null };

  function matrixFor(p, box, node) {
    // node carries the quantization scale/offset; fit its bounding box to the placement
    const size = box.getSize(new T.Vector3());
    const footprint = Math.max(size.x, size.z) / 2;
    const s = p.w / Math.max(footprint, 1e-3);
    const sy = p.h > 0 ? p.h / Math.max(size.y, 1e-3) : s;
    // seat on the lowest ground under the footprint so no edge overhangs a slope
    let g = o.ground(p.x, p.z);
    for (let k = 0; k < 8; k++) g = Math.min(g, o.ground(p.x + Math.cos(k * 0.785) * p.w * 0.8, p.z + Math.sin(k * 0.785) * p.w * 0.8));
    const y = g - p.sink - box.min.y * sy;
    const m = new T.Matrix4().compose(new T.Vector3(p.x, y, p.z), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), p.yaw), new T.Vector3(s, sy, s));
    return m.multiply(node);
  }

  function adopt(gltf) {
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    const byName = {};
    scene.traverse((n) => { if (n.name) byName[n.name] = n; });
    const groups = new Map();
    for (const p of place) {
      const key = p.variant;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    for (const [variant, list] of groups) {
      const top = byName[variant];
      if (!top) continue;
      const box = new T.Box3().setFromObject(top);   // the whole variant (base + shards)
      // every mesh under the variant becomes one InstancedMesh
      top.traverse((n) => {
        if (!n.isMesh) return;
        const local = n.matrixWorld.clone();       // relative to the kit scene root (at origin)
        let material = n.material;
        const isShard = material?.name === 'SG_Crystal';
        const isChannel = material?.name === 'SG_Channel';
        if (isShard) {
          // one material per palette; split instances by palette
          for (const pal of [false, true]) {
            const sub = list.filter((p) => !!p.teal === pal);
            if (!sub.length) continue;
            n.geometry.computeBoundingBox();
            const bb = n.geometry.boundingBox;
            const P = pal ? TEAL : AMBER;
            const mat = new T.ShaderMaterial({
              uniforms: { ...shared, uNoise: U(noise), uGain: U(1), uHot: U(new T.Color(P.hot)), uCore: U(new T.Color(P.core)), uBase: U(bb.min.y), uTop: U(bb.max.y),
                fogColor: U(new T.Color()), fogNear: U(1), fogFar: U(2000) },
              vertexShader: CRYSTAL_VS, fragmentShader: CRYSTAL_FS, fog: true,
            });
            mat.name = 'severance-kit:crystal-' + (pal ? 'teal' : 'amber');
            crystalMats.push(mat);
            add(n.geometry, mat, sub, box, local, `${variant}:${mat.name}`, false);
          }
          return;
        }
        if (isChannel) {
          ringMat = new T.ShaderMaterial({ uniforms: { ...shared, uGain: U(1), fogColor: U(new T.Color()), fogNear: U(1), fogFar: U(2000) },
            vertexShader: `varying vec2 vUv; varying float vFog; void main(){ vUv = uv; vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); vFog = -mv.z; gl_Position = projectionMatrix * mv; }`,
            fragmentShader: RING_FS, fog: true });
          ringMat.name = 'severance-kit:ring-channel';
          material = ringMat;
        } else if (material?.aoMap) material.aoMapIntensity = 1;
        add(n.geometry, material, list, box, local, variant, !isChannel);
      });
    }
    buildCrystalFx();
    buildRingFx();
  }

  function add(geo, material, list, box, local, name, shadows) {
    const mesh = new T.InstancedMesh(geo, material, list.length);
    list.forEach((p, i) => mesh.setMatrixAt(i, matrixFor(p, box, local)));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    mesh.name = 'severance-kit:' + name;
    root.add(mesh);
    state.instances += list.length;
    state.draws++;
  }

  function buildCrystalFx() {
    // one additive halo per cluster (single draw), and a small mote field each
    const quad = new T.PlaneGeometry(1, 1);
    halosGeo.index = quad.index;
    halosGeo.setAttribute('position', quad.getAttribute('position'));
    const data = new Float32Array(crystals.length * 4), tint = new Float32Array(crystals.length * 3);
    const c = new T.Color();
    crystals.forEach((p, i) => {
      data.set([p.x, o.ground(p.x, p.z) + p.h * 0.55, p.z, p.h * 2.3], i * 4);
      c.set(p.teal ? TEAL.halo : AMBER.halo).multiplyScalar(0.55);
      tint.set([c.r, c.g, c.b], i * 3);
      const f = particleField(T, KIT_LIMITS.crystalMotes, { seed: 11 + i, size: 0.12, height: p.h * 1.6, radius: p.w * 1.3, rise: 0.5, color: p.teal ? TEAL.hot : AMBER.hot });
      f.mesh.position.set(p.x, o.ground(p.x, p.z), p.z);
      f.mesh.name = 'severance-kit:crystal-motes';
      f.mesh.visible = false;
      f.mat.uniforms.uMotion = shared.uMotion;
      root.add(f.mesh);
      fields.push({ ...f, at: p });
    });
    halosGeo.setAttribute('aHalo', new T.InstancedBufferAttribute(data, 4));
    halosGeo.setAttribute('aTint', new T.InstancedBufferAttribute(tint, 3));
    halosGeo.instanceCount = crystals.length;
    halosMat = new T.ShaderMaterial({ uniforms: { ...shared, uGain: U(1) }, vertexShader: HALO_VS, fragmentShader: HALO_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
    const halos = new T.Mesh(halosGeo, halosMat);
    halos.frustumCulled = false;
    halos.renderOrder = 6;
    halos.name = 'severance-kit:crystal-halos';
    root.add(halos);
  }

  function buildRingFx() {
    const R = SEVERANCE_RING;
    const f = particleField(T, KIT_LIMITS.ringMotes, { seed: 77, size: 0.2, height: 24, radius: 8, rise: 1.1, spiral: 0.4, color: 0xffb36a });
    f.mesh.position.set(R.x, o.ground(R.x, R.z), R.z);
    f.mesh.scale.set(1, 1, 0.3);                  // a sheet of drifting motes in the ring's plane
    f.mesh.name = 'severance-kit:ring-motes';
    f.mat.uniforms.uMotion = shared.uMotion;
    root.add(f.mesh);
    ringMotes = f;
  }

  function fallback() {
    // Keep mineral clusters recognisable when the authored GLB cannot load.
    // The fallback never replaces the accepted production GLB; retain one
    // shared light and the existing instanced halo/mote budgets.
    const stone = new T.MeshStandardMaterial({ color: 0x4b4648, roughness: 0.92, flatShading: true });
    const amber = new T.MeshStandardMaterial({ color: 0x81502f, emissive: AMBER.hot, emissiveIntensity: 0.55, roughness: 0.38, flatShading: true });
    const teal = new T.MeshStandardMaterial({ color: 0x286f69, emissive: TEAL.hot, emissiveIntensity: 0.55, roughness: 0.38, flatShading: true });
    fallbackCrystalMats.push(amber, teal);
    const cone = new T.ConeGeometry(1, 1, 7, 1);
    cone.translate(0, 0.5, 0);
    const dode = new T.DodecahedronGeometry(1, 0);
    for (const p of place) {
      if (p.kind === 'ring') continue;
      const geo = /^Spire/.test(p.variant) ? cone : dode;
      const mat = p.kind === 'crystal' ? (p.teal ? teal : amber) : stone;
      const m = new T.Mesh(geo, mat);
      m.scale.set(p.w, geo === cone ? p.h : p.h * 0.5, p.w);
      m.position.set(p.x, o.ground(p.x, p.z) - (p.kind === 'hoodoo' ? p.sink : 0), p.z);
      m.name = p.kind === 'crystal' ? 'severance-kit:fallback-crystal' : 'severance-kit:fallback-stone';
      root.add(m);
    }
    if (!halosMat) buildCrystalFx();
    state.status = 'fallback';
  }

  function load() {
    if (state.status !== 'idle') return;
    state.status = 'loading';
    if (!o.loader) { fallback(); return; }
    o.loader.loadAsync(o.url || SEVERANCE_KIT_URL).then((gltf) => {
      if (state.status === 'disposed') return;
      adopt(gltf);
      state.status = 'ready';
    }).catch((err) => {
      if (state.status === 'disposed') return;
      console.warn('[severance-kit] GLB unavailable; using simple silhouettes:', err?.message || err);
      fallback();
    });
  }

  return {
    root, placements: place,
    get status() { return state.status; },
    load,
    /**
     * @param night 0 (day) .. 1 (night): mineral glow carries further in the dark
     */
    update(dt, t, eye, { night = 0, deterministic = false } = {}) {
      if (state.status === 'idle') load();
      shared.uTime.value = t;
      shared.uMotion.value = deterministic ? 0.6 : 1;
      const gain = 0.75 + 0.85 * night;
      state.gain = gain;
      for (const m of crystalMats) m.uniforms.uGain.value = gain;
      for (const m of fallbackCrystalMats) m.emissiveIntensity = 0.55 + 0.9 * night;
      if (halosMat) halosMat.uniforms.uGain.value = 0.35 + 0.9 * night;
      if (ringMat) ringMat.uniforms.uGain.value = 0.7 + 0.8 * night;
      if (ringMotes) { ringMotes.mat.uniforms.uTime.value = t; ringMotes.mat.uniforms.uLevel.value = 0.35 + 0.5 * night; }
      // nearest cluster within range takes the single light; motes only near the eye
      let best = null, bd = KIT_LIMITS.lightRange;
      for (const f of fields) {
        const d = eye ? Math.hypot(eye.x - f.at.x, eye.z - f.at.z) : Infinity;
        f.mesh.visible = d < KIT_LIMITS.fxRange;
        f.mat.uniforms.uTime.value = t;
        f.mat.uniforms.uLevel.value = 0.55 + 0.45 * night;
        if (d < bd) { bd = d; best = f.at; }
      }
      state.lit = best ? best.seed : null;
      if (best) {
        light.position.set(best.x, o.ground(best.x, best.z) + best.h * 0.8, best.z);
        light.color.set(best.teal ? TEAL.light : AMBER.light);
        light.intensity = (14 + 30 * night) * (1 - bd / KIT_LIMITS.lightRange);
      } else light.intensity = 0;
    },
    stats() {
      return { status: state.status, placements: place.length, instances: state.instances, draws: state.draws, crystals: crystals.length, lights: 1, lit: state.lit,
        motes: fields.filter((f) => f.mesh.visible).length * KIT_LIMITS.crystalMotes + (ringMotes ? KIT_LIMITS.ringMotes : 0) };
    },
    dispose() {
      state.status = 'disposed';
      root.traverse((n) => { n.geometry?.dispose?.(); for (const m of [].concat(n.material || [])) m.dispose?.(); });
      noise.dispose();
      root.removeFromParent();
    },
  };
}
