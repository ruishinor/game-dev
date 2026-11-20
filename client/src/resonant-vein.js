// Resonant shard vein (Severance Expanse): a basalt outcrop split by a cluster of
// resonance crystals (resonant_vein.glb, Blender-baked rock atlas) with a runtime
// crystal shader, a ground glow and rising motes.
//
// Presentation only. The server owns eligibility, the extraction channel, yield
// and replenishment; this model shows the player's own state from private
// snapshots (charged, depleted and regrowing, being extracted) and plays the
// authoritative vein_extract / vein_harvest / vein_break events.
import { noiseTexture, particleField } from './severance-gate.js';

export const RESONANT_VEIN_URL = '/client/assets/resonant_vein.glb?v=057405fc0209';
const REPLENISH_HINT_MS = 8 * 60 * 1000;   // only shapes the regrowth glow; the server decides readiness

const CRYSTAL_VS = /* glsl */`
varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW;
void main(){
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const CRYSTAL_FS = /* glsl */`
uniform float uTime; uniform float uCharge; uniform float uExtract; uniform float uFlash; uniform sampler2D uNoise;
uniform vec3 uDeep; uniform vec3 uGlow; uniform vec3 uHot; uniform vec3 uDull;
varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW;
void main(){
  vec3 N = normalize(vN), V = normalize(vV);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 3.0);
  float seed = vUv.x * 13.7;
  float v = vUv.y;
  // internal resonance: bands rising toward the tips, faster while extracting
  float flow = texture2D(uNoise, vec2(seed + vW.x * 0.15, v * 1.4 - uTime * (0.18 + 0.9 * uExtract))).r;
  float bands = pow(0.5 + 0.5 * sin(v * 18.0 - uTime * (1.2 + 5.0 * uExtract) + flow * 6.0 + seed), 6.0);
  float core = smoothstep(0.15, 1.0, v) * (0.35 + 0.65 * flow);
  // facets: a faint specular-like streak from the flat-shaded normal
  float facet = pow(abs(dot(N, normalize(vec3(0.3, 0.8, 0.5)))), 24.0);
  float live = clamp(uCharge, 0.0, 1.0);
  vec3 body = mix(uDull, uDeep, live) * (0.55 + 0.45 * ndv);
  vec3 glow = uGlow * (core * 0.9 + bands * 0.6) * (0.15 + 0.85 * live);
  vec3 rim = mix(uGlow, uHot, 0.5) * fres * (0.25 + 0.75 * live);
  vec3 c = body + glow + rim + facet * 0.25 * vec3(0.9, 0.95, 1.0);
  c += uHot * (uExtract * (0.35 + 0.65 * bands) * smoothstep(0.2, 1.0, v) + uFlash * 1.6);
  float a = clamp(0.62 + 0.3 * fres + 0.25 * core * live, 0.0, 1.0);
  gl_FragColor = vec4(c, a);
}`;
const POOL_VS = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const POOL_FS = /* glsl */`
uniform float uCharge; uniform float uExtract; uniform float uFlash; uniform vec3 uGlow; uniform float uTime;
varying vec2 vUv;
void main(){
  vec2 p = (vUv - 0.5) * 2.0; float r = length(p);
  float k = exp(-r * r * 4.0) * (0.12 + 0.3 * uCharge + 0.5 * uExtract + 0.8 * uFlash);
  k += exp(-pow((r - 0.55 - 0.25 * fract(uTime * 0.6)) * 12.0, 2.0)) * uExtract * 0.35;
  k *= smoothstep(1.0, 0.85, r);
  gl_FragColor = vec4(uGlow * k, k);
}`;

let NOISE = null;
const glbCache = new WeakMap();
function loadShared(loader, url) {
  let m = glbCache.get(loader);
  if (!m) { m = new Map(); glbCache.set(loader, m); }
  if (!m.has(url)) m.set(url, loader.loadAsync(url));
  return m.get(url);
}

function fallbackGeometry(T, group) {
  const rock = new T.MeshStandardMaterial({ color: 0x4a4f50, roughness: 0.92 });
  const g = new T.Group();
  g.name = 'vein:fallback';
  for (const [x, z, s] of [[0, 0.3, 1.1], [-0.9, 0, 0.75], [0.95, 0.1, 0.85]]) {
    const m = new T.Mesh(new T.DodecahedronGeometry(s, 0), rock);
    m.position.set(x, s * 0.45, z); m.scale.y = 0.7; m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
  group.add(g);
  return g;
}
function fallbackCrystals(T, material) {
  const geos = [];
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2, lean = i ? 0.35 : 0.05, L = i ? 1.1 : 2;
    const g = new T.CylinderGeometry(0, L * 0.13, L, 6, 1);
    g.translate(0, L / 2, 0);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (i * 0.618) % 1, g.attributes.position.getY(k) / L);
    g.rotateZ(Math.sin(a) * lean); g.rotateX(Math.cos(a) * lean);
    g.translate(Math.cos(a) * 0.2, 0.7, -0.35 + Math.sin(a) * 0.15);
    geos.push(g);
  }
  const meshes = geos.map((g) => new T.Mesh(g, material));
  const grp = new T.Group(); grp.name = 'vein:fallback-crystals';
  for (const m of meshes) grp.add(m);
  return grp;
}

/**
 * @param T three namespace
 * @param {{loader?:{loadAsync(url:string):Promise<any>}, url?:string, seed?:number}} o
 */
export function buildResonantVein(T, { loader = null, url = RESONANT_VEIN_URL, seed = 1 } = {}) {
  if (!NOISE) NOISE = noiseTexture(T, 128, 77);
  const group = new T.Group();
  group.name = 'vein:resonant';
  const u = {
    uTime: { value: seed * 3.7 }, uCharge: { value: 1 }, uExtract: { value: 0 }, uFlash: { value: 0 }, uNoise: { value: NOISE },
    uDeep: { value: new T.Color(0.05, 0.16, 0.24) }, uGlow: { value: new T.Color(0.25, 0.75, 0.95) }, uHot: { value: new T.Color(0.8, 0.95, 1.0) }, uDull: { value: new T.Color(0.12, 0.13, 0.15) },
  };
  const crystalMat = new T.ShaderMaterial({ uniforms: u, vertexShader: CRYSTAL_VS, fragmentShader: CRYSTAL_FS, transparent: true });
  crystalMat.name = 'vein:crystal';
  const fallback = fallbackGeometry(T, group);
  const fbCrystals = fallbackCrystals(T, crystalMat);
  group.add(fbCrystals);

  const pool = new T.Mesh(new T.PlaneGeometry(4.2, 4.2), new T.ShaderMaterial({ uniforms: u, vertexShader: POOL_VS, fragmentShader: POOL_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.06; pool.name = 'vein:glow'; pool.renderOrder = 4;
  group.add(pool);
  const motes = particleField(T, 26, { size: 0.07, height: 2.6, radius: 0.9, rise: 0.35, spiral: 0.6, color: 0x8fdcff, seed: 41 + seed });
  motes.mesh.name = 'vein:motes'; motes.mesh.position.y = 0.4;
  group.add(motes.mesh);

  let status = loader ? 'loading' : 'fallback';
  if (loader) {
    loadShared(loader, url).then((gltf) => {
      if (status === 'disposed') return;
      const inst = gltf.scene.clone(true);
      inst.name = 'vein:outcrop';
      inst.traverse((n) => {
        if (!n.isMesh) return;
        n.userData.sharedAsset = true;
        if (n.material?.name === 'RV_Crystal') { n.material = crystalMat; n.castShadow = false; }
        else { n.castShadow = n.receiveShadow = true; }
      });
      group.add(inst);
      fallback.visible = false; fbCrystals.visible = false;
      status = 'ready';
    }).catch((err) => {
      if (status === 'disposed') return;
      console.warn('[vein] resonant_vein.glb unavailable; using a simple outcrop:', err?.message || err);
      status = 'fallback';
    });
  }

  let t = seed * 3.7, extractLeft = 0, extractTotal = 1, flash = 0, charge = 1;
  return {
    group, height: 2.6, radius: 0.95, hover: 0,
    get assetStatus() { return status; },
    /** authoritative channel start: crystals intensify for ms */
    extract(ms) { extractTotal = extractLeft = Math.max(0.3, (ms || 3000) / 1000); },
    harvest() { extractLeft = 0; flash = 1; },
    breakOff() { extractLeft = 0; flash = 0.25; },
    update(dt, st) {
      const step = Math.max(0, Math.min(0.1, Number.isFinite(dt) ? dt : 0));
      if (!st.reducedMotion) t = (t + step) % 4096;
      u.uTime.value = st.reducedMotion ? 0 : t;
      // own depletion: dull, then a slow regrowth glow toward readiness
      const target = st.veinMs > 0 ? 0.08 + 0.5 * (1 - Math.min(1, st.veinMs / REPLENISH_HINT_MS)) : 1;
      charge += (target - charge) * (1 - Math.exp(-step * 3));
      u.uCharge.value = charge;
      if (extractLeft > 0) extractLeft = Math.max(0, extractLeft - step);
      const k = extractLeft > 0 ? 1 - extractLeft / extractTotal : 0;
      u.uExtract.value = extractLeft > 0 ? 0.3 + 0.7 * k * k : 0;
      flash = Math.max(0, flash - step * 1.8);
      u.uFlash.value = flash;
      const q = Number.isFinite(st.effectsQuality) ? st.effectsQuality : 1;
      pool.visible = q > 0;
      motes.mesh.visible = q > 0 && !(st.cameraDistance > 70);
      motes.mat.uniforms.uTime.value = u.uTime.value;
      motes.mat.uniforms.uLevel.value = 0.25 + 0.6 * charge + 0.8 * u.uExtract.value;
      motes.mat.uniforms.uMotion.value = st.reducedMotion ? 0 : 1;
    },
    dispose() {
      status = 'disposed';
      group.traverse((n) => {
        if (!n.isMesh || n.userData.sharedAsset && n.material !== crystalMat) return;
        if (!n.userData.sharedAsset) n.geometry?.dispose();
      });
      crystalMat.dispose(); pool.material.dispose(); pool.geometry.dispose(); motes.mat.dispose(); motes.geo.dispose();
      for (const c of fallback.children) c.geometry.dispose();
      fallback.children[0]?.material.dispose();
    },
  };
}
