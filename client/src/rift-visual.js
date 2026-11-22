// The Phase Scar rift: a sculpted rupture (phase_scar.glb, Blender-baked) with an
// interference instrument, and a layered membrane built at runtime. Used by the
// Reach Phase Scar and both return rifts (Expanse, Foundry).
//
// Presentation only: the membrane shows the authoritative snapshot phase
// (riftPhase/riftWarning); it owns no timer, hazard, target or travel logic.
//
// Membrane layers (one draw call each, all bounded):
//   rift:interference-membrane  lens-shaped surface: screen-space refraction of
//                               the scene behind (shared grab, quality 2), a
//                               parallax interior of receding depth layers, an
//                               inward log-spiral flow of filaments, noise-eroded
//                               edge with a hot dissolve fringe, phase-driven
//                               opening width, agitation and flares
//   rift:depth-veil             soft corona behind the lens (light bleed)
//   rift:filaments              GPU ribbons: rim crawlers and emitter tethers,
//                               paths evaluated in the vertex shader
//   rift:field-motes            soft billboards spiralling into the throat
//   rift:footprint-halo         ground light pool conforming to the terrain
//   rift:ambient-light          one bounded point light (quality 2, close)
// The GLB adds emissive seams, rails and emitter lenses driven by the phase.
import { PHASE_RIFT_RADIUS } from '../../shared/world.js';
import { noiseTexture } from './severance-gate.js';
import { sceneColor, sceneColorUniforms } from './vfx/scene-color.js';

export const PHASE_SCAR_URL = '/client/assets/phase_scar.glb?v=6121737a1936';
export const RIFT_FIELD_LIMITS = Object.freeze({ motes: 32, filaments: 10, segments: 24, lights: 1 });
// Phase -> [presence, opening, agitation]. Presence drives brightness; opening
// widens the lens from a seam; agitation adds turbulence, tears and flicker.
const PHASES = {
  dormant: [0.18, 0.2, 0.05], opening: [0.62, 0.7, 0.55], unstable: [1, 1, 1], stabilized: [0.8, 0.92, 0.12], cooling: [0.25, 0.38, 0.2],
};
const LEVEL = Object.fromEntries(Object.entries(PHASES).map(([k, v]) => [k, v[0]]));

// Membrane silhouette, shared with the GLB's vanes (Blender x across, z up).
const M_Y0 = 0.32, M_Y1 = 4.62, M_W = 1.16;
function lensCenter(v) { return -0.14 * v + 0.07 * Math.sin(v * 4.2); }
function lensHalf(v) { return M_W * Math.pow(Math.sin(Math.PI * v), 0.62) * (1 + 0.06 * Math.sin(v * 13)); }

function palette(T) {
  const std = (color, roughness = 0.68, metalness = 0.4) => new T.MeshStandardMaterial({ color, roughness, metalness });
  return { stone: std(0x3d4645, 0.93, 0.1), steel: std(0x66716d, 0.59, 0.62), dark: std(0x283536, 0.72, 0.52), brass: std(0x977d56, 0.62, 0.52), glass: new T.MeshStandardMaterial({ color: 0x96bfb1, emissive: 0x335f57, emissiveIntensity: 0.65, roughness: 0.34, metalness: 0.34 }) };
}
function dispose(group) {
  const mats = new Set(), geos = new Set(), texs = new Set();
  group.traverse((o) => {
    if (!o.isMesh && !o.isLine) return;
    if (!o.userData.sharedAsset) geos.add(o.geometry);
    for (const m of [].concat(o.material)) {
      mats.add(m);
      for (const u of Object.values(m.uniforms || {})) if (u?.value?.isTexture && !u.value.isFramebufferTexture && u.shared !== true) texs.add(u.value);
    }
    if (o.isInstancedMesh) o.dispose?.();
  });
  for (const g of geos) g.dispose();
  for (const m of mats) m.dispose();
  for (const t of texs) t.dispose();
}
function mesh(T, root, geometry, material, x = 0, y = 0, z = 0) { const m = new T.Mesh(geometry, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; root.add(m); return m; }
function tube(T, pts, r, mat, root) { const curve = new T.CatmullRomCurve3(pts.map((p) => new T.Vector3(...p))); return mesh(T, root, new T.TubeGeometry(curve, 30, r, 8, false), mat); }

function membraneGeometry(T, scale = 1, bow = 0.22) {
  const rows = 56, cols = 28, vertices = [], uv = [], index = [];
  for (let j = 0; j <= rows; j++) {
    const v = j / rows, y = (M_Y0 + M_Y1) / 2 + (v - 0.5) * (M_Y1 - M_Y0) * scale, half = lensHalf(v) * scale, c = lensCenter(v);
    for (let i = 0; i <= cols; i++) {
      const u = i / cols, s = u * 2 - 1;
      // bowed back into a shallow throat; the shader narrows/widens x by phase
      vertices.push(c + s * half, y, -bow * (1 - s * s) * Math.sin(Math.PI * v));
      uv.push(u, v);
      if (j < rows && i < cols) { const a = j * (cols + 1) + i; index.push(a, a + 1, a + cols + 1, a + 1, a + cols + 2, a + cols + 1); }
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// ----------------------------------------------------------------------------- shaders
const COMMON = /* glsl */`
uniform float uTime; uniform float uPhase; uniform float uOpen; uniform float uAgit; uniform float uStable; uniform float uFlare; uniform float uMotion; uniform float uLayers;
uniform sampler2D uNoise;
float nz(vec2 p){ return texture2D(uNoise, p).r; }
float nz2(vec2 p){ return texture2D(uNoise, p).g; }
float nz3(vec2 p){ return texture2D(uNoise, p).b; }
`;
const MEMBRANE_VS = /* glsl */`
${COMMON}
varying vec2 vUv; varying vec3 vView; varying vec4 vClip; varying float vFace;
void main(){
  vUv = uv;
  vec3 p = position;
  float s = uv.x * 2.0 - 1.0;
  float centre = -0.14 * uv.y + 0.07 * sin(uv.y * 4.2);
  // opening: the lens widens from a seam; agitation ripples its surface
  p.x = centre + (p.x - centre) * mix(0.16, 1.0, uOpen);
  float w = sin(3.14159 * uv.x) * sin(3.14159 * uv.y);
  p.z += w * (0.05 * sin(p.y * 4.7 + uTime * 1.3) + 0.09 * uAgit * sin(p.y * 9.0 - uTime * 4.1 + s * 3.0)) * uMotion;
  p.z -= w * 0.18 * uFlare;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // view direction in object space (the lens faces +z) for the parallax interior
  vView = normalize((inverse(modelViewMatrix) * vec4(0.0, 0.0, 0.0, 1.0)).xyz - p);
  vClip = projectionMatrix * mv;
  gl_Position = vClip;
}`;
const MEMBRANE_FS = /* glsl */`
${COMMON}
uniform sampler2D uScene; uniform vec2 uRes; uniform float uSceneOn; uniform float uRefract;
uniform vec3 uCalm; uniform vec3 uWild; uniform vec3 uHot; uniform vec3 uVoid;
varying vec2 vUv; varying vec3 vView; varying vec4 vClip;
void main(){
  vec2 uv = vUv; float t = uTime;
  float x = uv.x * 2.0 - 1.0;
  // ---- edge: distance inside the lens, eroded by drifting noise (dissolve fringe)
  float ed = min(1.0 - abs(x), min(uv.y * 3.2, (1.0 - uv.y) * 2.6));
  float erode = (nz(uv * vec2(1.6, 3.2) + vec2(0.0, -t * 0.045)) - 0.5) * 0.42 + (nz2(uv * 6.5 + vec2(t * 0.09, -t * 0.12)) - 0.5) * (0.16 + 0.22 * uAgit);
  float e = ed + erode * (0.3 + 0.35 * uAgit) - 0.05 - 0.12 * (1.0 - uOpen);
  if (e < 0.0) discard;
  float body = smoothstep(0.0, 0.035, e);
  float rim = smoothstep(0.0, 0.012, e) * (1.0 - smoothstep(0.016, 0.07, e));
  // ---- throat: polar coordinates around the lens centre
  vec2 c = vec2(0.5, 0.47);
  vec2 q = (uv - c) * vec2(1.55, 1.0);
  float r = length(q) + 1e-3, a = atan(q.y, q.x);
  float warp = nz(uv * 1.3 + vec2(t * 0.021, -t * 0.034)) * 2.0 - 1.0;
  // inward logarithmic spirals: two arm sets at different pitch and speed
  float sp1 = sin(a * 3.0 + log(r) * 5.5 + t * (0.7 + 1.2 * uAgit) + warp * 2.4);
  float sp2 = sin(a * 5.0 - log(r) * 8.0 + t * (1.1 + 2.0 * uAgit) + warp * 3.1 + 1.7);
  float fil = pow(max(0.0, sp1), 30.0) * 0.8 + pow(max(0.0, sp2), 48.0) * 0.55;
  float sh = nz(vec2(x * 2.2 + warp * 0.3, uv.y * 0.6 - t * 0.16));
  fil += pow(1.0 - abs(sh * 2.0 - 1.0), 26.0) * 0.4;
  fil *= smoothstep(0.05, 0.2, r) * smoothstep(0.08, 0.3, e);
  // ---- parallax interior: three receding layers, dark and deep
  vec3 V = normalize(vView);
  vec2 par = V.xy / max(0.25, V.z);
  vec3 interior = vec3(0.0);
  for (int k = 0; k < 3; k++) {
    if (float(k) >= uLayers) break;
    float d = 0.2 + float(k) * 0.35;
    vec2 iu = uv - par * d * 0.35;
    vec2 iq = (iu - c) * vec2(1.55, 1.0);
    float ir = length(iq), ia = atan(iq.y, iq.x);
    float neb = nz(vec2(ia * 0.32 + t * 0.012 * float(k + 1), log(ir + 0.02) * 0.6 - t * 0.05 * float(k + 1)));
    float neb2 = nz3(iu * (2.5 + float(k)) + vec2(0.0, t * 0.03));
    float stars = smoothstep(0.88, 0.96, nz2(iu * (11.0 + float(k) * 7.0) + float(k) * 0.37)) * smoothstep(0.5, 0.9, neb2);
    float fall = 1.0 / (1.0 + float(k) * 1.6);
    vec3 tint = mix(uVoid, mix(uCalm, uWild, uAgit) * 0.55, smoothstep(0.35, 0.85, neb) * 0.6);
    interior += tint * (0.35 + 0.65 * neb * neb2) * fall * 0.5 + vec3(0.75, 0.85, 1.0) * stars * fall * 0.6;
  }
  float throat = 1.0 - smoothstep(0.05, 0.4, r);
  interior *= 1.0 - throat * 0.6;
  // ---- refraction: the world behind bends around the lens, strongest at the rim
  vec2 suv = vClip.xy / vClip.w * 0.5 + 0.5;
  vec2 bend = vec2(nz(uv * 2.4 + vec2(t * 0.05, 0.0)), nz2(uv * 2.4 - vec2(0.0, t * 0.06))) - 0.5;
  vec2 swirl = vec2(-q.y, q.x) / r;
  float lensK = 1.0 - smoothstep(0.0, 0.4, e);
  vec2 off = (bend * 0.5 + swirl * 0.35) * uRefract * (0.4 + 1.6 * lensK + 0.8 * uAgit);
  vec3 behind;
  behind.r = texture2D(uScene, clamp(suv + off * 1.1, vec2(0.001), vec2(0.999))).r;
  behind.g = texture2D(uScene, clamp(suv + off, vec2(0.001), vec2(0.999))).g;
  behind.b = texture2D(uScene, clamp(suv + off * 0.9, vec2(0.001), vec2(0.999))).b;
  vec3 bent = behind * mix(vec3(0.72, 0.82, 0.95), vec3(0.88, 0.72, 0.9), uAgit * 0.5);
  // bent world in the outer band, the void inside; without a scene copy the
  // outer band is a darker translucent veil instead
  float inner = smoothstep(0.16, 0.42, e);
  vec3 outer = mix(interior * 1.4 + uVoid, bent, uSceneOn);
  vec3 base = mix(outer, interior, inner);
  vec3 hue = mix(uCalm, uWild, uAgit);
  float horizon = exp(-pow((e - 0.29) * 10.0, 2.0));
  float flick = 1.0 + uAgit * 0.3 * (nz(vec2(t * 3.1, 0.3)) - 0.5);
  vec3 col = base;
  col += hue * fil * (0.25 + 0.45 * uPhase) * flick;
  col += hue * horizon * (0.12 + 0.3 * uPhase + 0.5 * uFlare);
  col += hue * exp(-e * 14.0) * 0.35 * (0.4 + uPhase);
  col += uHot * rim * (0.7 + 0.9 * uAgit + 2.0 * uFlare) * (0.5 + 0.5 * uPhase);
  col += mix(hue, uHot, 0.5) * uFlare * 0.4 * throat;
  float alpha = body * mix(0.82, 1.0, uSceneOn) * clamp(0.45 + uPhase, 0.0, 1.0);
  alpha = max(alpha, rim * 0.9);
  gl_FragColor = vec4(col, alpha);
}`;
const CORONA_VS = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CORONA_FS = /* glsl */`
${COMMON}
uniform vec3 uCalm; uniform vec3 uWild;
varying vec2 vUv;
void main(){
  vec2 p = (vUv - vec2(0.5, 0.48)) * vec2(2.1, 1.25);
  float r = length(p);
  float k = exp(-r * r * 3.2) - 0.06;
  float rays = 0.75 + 0.25 * nz(vec2(atan(p.y, p.x) * 0.5, r * 0.6 - uTime * 0.08));
  k = max(0.0, k) * rays * (0.18 + 0.32 * uPhase + 0.4 * uFlare);
  vec3 c = mix(uCalm, uWild, uAgit) * k;
  gl_FragColor = vec4(c, k);
}`;
// Ribbon filaments: each vertex knows its filament (aF), position along it (aT)
// and side (aS); the path is evaluated here, so the CPU never touches them.
const RIBBON_VS = /* glsl */`
${COMMON}
attribute vec3 aF; attribute float aT; attribute float aS;
uniform vec3 uTipL; uniform vec3 uTipR;
varying float vA; varying float vS; varying float vKind;
float lensHalf(float v){ return ${M_W.toFixed(3)} * pow(max(0.0, sin(3.14159 * v)), 0.62) * mix(0.16, 1.0, uOpen); }
vec3 rimPoint(float v, float side){
  v = clamp(v, 0.0, 1.0);
  float c = -0.14 * v + 0.07 * sin(v * 4.2);
  return vec3(c + side * lensHalf(v), ${M_Y0.toFixed(3)} + v * ${(M_Y1 - M_Y0).toFixed(3)}, 0.04);
}
vec3 path(float s){
  float id = aF.x, seed = aF.y, speed = aF.z;
  if (id < 6.0) {
    // rim crawler: a short window sliding along one side of the lens
    float side = mod(id, 2.0) < 0.5 ? -1.0 : 1.0;
    float head = fract(seed + uTime * speed * (0.6 + uAgit));
    float v = head - (1.0 - s) * 0.22;
    vec3 p = rimPoint(v, side);
    float j = (nz(vec2(s * 1.7 + seed, uTime * 0.6)) - 0.5) * (0.12 + 0.2 * uAgit);
    p.x += side * j; p.z += j * 0.8;
    return p;
  }
  // tether: emitter lens to the membrane, jagged and re-struck in steps
  vec3 a = mod(id, 2.0) < 0.5 ? uTipL : uTipR;
  float strike = floor(uTime * (5.0 + 7.0 * uAgit) + seed * 13.0);
  vec3 b = vec3(-0.05 + (fract(sin(strike * 12.9898) * 43758.5) - 0.5) * 0.9, 2.3 + fract(sin(strike * 78.233) * 43758.5) * 1.6, 0.05);
  vec3 p = mix(a, b, s);
  float amp = sin(3.14159 * s) * (0.12 + 0.18 * uAgit);
  p.x += (nz(vec2(s * 2.3, strike * 0.137 + seed)) - 0.5) * amp * 2.0;
  p.y += (nz2(vec2(s * 2.3, strike * 0.211 + seed)) - 0.5) * amp * 2.0;
  p.z += (nz3(vec2(s * 1.9, strike * 0.071)) - 0.5) * amp;
  return p;
}
void main(){
  vec3 p = path(aT), n = path(min(1.0, aT + 0.02)) - path(max(0.0, aT - 0.02));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec3 tv = (modelViewMatrix * vec4(n, 0.0)).xyz;
  vec3 side = normalize(cross(normalize(tv + 1e-5), normalize(-mv.xyz)));
  float tether = step(6.0, aF.x);
  float width = mix(0.035, 0.022, tether) * (1.0 + uFlare) * sin(3.14159 * aT);
  mv.xyz += side * aS * width;
  gl_Position = projectionMatrix * mv;
  // tethers only during agitation or a flare; crawlers scale with presence
  float on = mix(0.35 + 0.65 * uPhase, smoothstep(0.25, 0.7, uAgit + uFlare) * step(0.45, fract(uTime * 3.3 + aF.y * 7.0)), tether);
  vA = on * sin(3.14159 * aT);
  vS = aS; vKind = tether;
}`;
const RIBBON_FS = /* glsl */`
uniform vec3 uCalm; uniform vec3 uHot;
varying float vA; varying float vS; varying float vKind;
void main(){
  float core = exp(-vS * vS * 6.0);
  float k = vA * core;
  if (k < 0.01) discard;
  vec3 c = mix(uCalm * 1.4, uHot * 1.6, vKind * 0.7 + core * 0.3);
  gl_FragColor = vec4(c * k, k);
}`;
const MOTE_VS = /* glsl */`
varying vec2 vQ; varying vec3 vC;
void main(){
  vQ = position.xy * 2.0;
  #ifdef USE_INSTANCING_COLOR
  vC = instanceColor;
  #else
  vC = vec3(1.0);
  #endif
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float s = length(instanceMatrix[0].xyz);
  mv.xy += position.xy * s;
  gl_Position = projectionMatrix * mv;
}`;
const MOTE_FS = /* glsl */`
uniform float uK;
varying vec2 vQ; varying vec3 vC;
void main(){
  float r = length(vQ);
  float k = (exp(-r * r * 9.0) + 0.35 * exp(-r * r * 40.0)) * uK;
  if (k < 0.005) discard;
  gl_FragColor = vec4(vC * k, k);
}`;
// Ground contact is an inward-flowing, fractured field, NOT an enlarged
// warning ring. The orange telegraph remains a separate authoritative layer.
const POOL_FS = /* glsl */`
${COMMON}
uniform vec3 uCalm; uniform vec3 uWild; uniform float uDetail;
varying vec2 vUv;
void main(){
  vec2 p = (vUv - 0.5) * 2.0;
  p.x *= 0.82;
  float r = length(p), edge = 1.0 - smoothstep(0.72, 0.98, r);
  float swell = 0.88 + 0.12 * sin(uTime * (0.9 + uAgit));
  float k = exp(-r * r * 2.7) * (0.23 + 0.55 * uPhase + 0.48 * uFlare) * swell;
  // The low preset retains one cheap luminous footprint with no extra pass.
  if (uDetail > 0.5) {
    float a = atan(p.y, p.x), depth = log(r + 0.16);
    float spiral = sin(a * 4.0 + depth * 5.4 + uTime * (0.6 + uAgit));
    float w = nz(p * 2.8 + vec2(uTime * 0.07, -uTime * 0.09));
    float charged = pow(max(0.0, spiral), 16.0) * (0.5 + 0.5 * w);
    k += charged * smoothstep(0.13, 0.3, r) * (0.2 + 0.38 * uPhase + 0.35 * uFlare);
  }
  k *= edge; // reversed smoothstep edges were undefined on some GLSL drivers
  vec3 hue = mix(uCalm, uWild, clamp(uAgit * 0.8 + uFlare * 0.15, 0.0, 1.0));
  gl_FragColor = vec4(hue * k * 1.3, clamp(k, 0.0, 0.92));
}`;

// Distinct from the Listening Stone's expanding rings: energy migrates along
// paired ground seams into the two portal roots, rather than travelling out.
const GROUND_THREADS_FS = /* glsl */`
${COMMON}
uniform vec3 uCalm; uniform vec3 uWild; uniform vec3 uHot;
varying vec2 vUv;
void main(){
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p), x = abs(p.x);
  float edge = 1.0 - smoothstep(0.75, 0.98, r);
  float drift = uTime * (0.35 + 0.5 * uAgit);
  float pathA = 0.12 * sin(p.x * 5.2 + drift * 0.75) - 0.13;
  float pathB = -0.15 * sin(p.x * 6.1 - drift * 0.6) + 0.14;
  float traces = exp(-pow((p.y - pathA) * 24.0, 2.0))
               + exp(-pow((p.y - pathB) * 27.0, 2.0));
  float roots = smoothstep(0.09, 0.32, x) * (1.0 - smoothstep(0.78, 0.98, x));
  float crawl = 0.58 + 0.42 * pow(0.5 + 0.5 * sin(x * 31.0 + drift * 3.0), 4.0);
  float k = traces * roots * edge * crawl * (0.16 + 0.62 * uPhase + 0.65 * uFlare);
  if (k < 0.007) discard;
  vec3 hue = mix(uCalm, uWild, uAgit);
  hue = mix(hue, uHot, 0.15 + 0.25 * uFlare);
  gl_FragColor = vec4(hue * k * 1.5, clamp(k, 0.0, 0.85));
}`;

// ----------------------------------------------------------------------------- builders
let NOISE = null;
function noise(T) { if (!NOISE) NOISE = noiseTexture(T, 128, 61); return NOISE; }

function ribbonGeometry(T) {
  const { filaments: F, segments: S } = RIFT_FIELD_LIMITS;
  const aF = [], aT = [], aS = [], pos = [], index = [];
  for (let f = 0; f < F; f++) {
    const seed = (f * 0.618034) % 1, speed = 0.11 + (f % 3) * 0.035;
    for (let s = 0; s <= S; s++) for (const side of [-1, 1]) { aF.push(f, seed, speed); aT.push(s / S); aS.push(side); pos.push(0, 0, 0); }
    const o = f * (S + 1) * 2;
    for (let s = 0; s < S; s++) { const a = o + s * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('aF', new T.Float32BufferAttribute(aF, 3));
  g.setAttribute('aT', new T.Float32BufferAttribute(aT, 1));
  g.setAttribute('aS', new T.Float32BufferAttribute(aS, 1));
  g.setIndex(index);
  g.boundingSphere = new T.Sphere(new T.Vector3(0, 2.5, 0), 4);
  return g;
}

function groundDisc(T, radius, site, ground, yaw = 0.9) {
  const g = new T.PlaneGeometry(radius * 2, radius * 2, 16, 16);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  if (site && ground) {
    const h = ground(site.x, site.z), co = Math.cos(yaw), si = Math.sin(yaw);
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, ground(site.x + x * co + z * si, site.z - x * si + z * co) - h + 0.08); }
  } else for (let i = 0; i < pos.count; i++) pos.setY(i, 0.08);
  pos.needsUpdate = true;
  return g;
}

function createRiftField(T, group, site, ground, u, returning) {
  const sc = sceneColorUniforms(T);
  // stable uniform objects; values are copied from the shared grab each frame
  const membraneUniforms = { ...u, uScene: { value: sc.uScene.value }, uRes: { value: sc.uRes.value.clone() }, uSceneOn: { value: 0 } };
  const skin = new T.ShaderMaterial({ uniforms: membraneUniforms, vertexShader: MEMBRANE_VS, fragmentShader: MEMBRANE_FS, transparent: true, depthWrite: false, side: T.DoubleSide });
  skin.name = 'rift:membrane';
  const surface = new T.Mesh(membraneGeometry(T), skin);
  surface.name = 'rift:interference-membrane'; surface.renderOrder = 6;
  surface.onBeforeRender = (renderer) => {
    if (u.uRefract.value <= 0) { membraneUniforms.uSceneOn.value = 0; return; }
    const g = sceneColor(T, renderer);
    const ok = g.grab(renderer);
    membraneUniforms.uScene.value = g.uniforms.uScene.value;
    membraneUniforms.uRes.value.copy(g.uniforms.uRes.value);
    membraneUniforms.uSceneOn.value = ok ? 1 : 0;
  };
  group.add(surface);

  const veil = new T.Mesh(membraneGeometry(T, 1.45, 0.1), new T.ShaderMaterial({ uniforms: u, vertexShader: CORONA_VS, fragmentShader: CORONA_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
  veil.name = 'rift:depth-veil'; veil.position.z = -0.32; veil.renderOrder = 5;
  group.add(veil);

  // Edge-on, the membrane and veil are planes and vanish; a narrow additive
  // corona turned 90 degrees keeps a glowing lens of depth in profile views.
  const core = new T.Mesh(membraneGeometry(T, 1.05, 0), veil.material);
  core.name = 'rift:profile-core'; core.rotation.y = Math.PI / 2; core.scale.set(1, 1, 1); core.renderOrder = 5;
  group.add(core);

  const halo = new T.Mesh(groundDisc(T, 3.3, site, ground), new T.ShaderMaterial({ uniforms: { ...u, uDetail: { value: 2 } }, vertexShader: CORONA_VS, fragmentShader: POOL_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 }));
  halo.name = 'rift:footprint-halo'; halo.renderOrder = 4;
  group.add(halo);
  // One extra terrain-conforming emissive pass on medium/high presets.
  // It adds no lights or colliders and never changes the rift foundation.
  const threads = new T.Mesh(groundDisc(T, 3.3, site, ground), new T.ShaderMaterial({ uniforms: u, vertexShader: CORONA_VS, fragmentShader: GROUND_THREADS_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 }));
  threads.name = 'rift:ground-threads'; threads.position.y = 0.018; threads.renderOrder = 4.1;
  group.add(threads);

  const filaments = new T.Mesh(ribbonGeometry(T), new T.ShaderMaterial({ uniforms: u, vertexShader: RIBBON_VS, fragmentShader: RIBBON_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
  filaments.name = 'rift:filaments'; filaments.frustumCulled = false; filaments.renderOrder = 8;
  group.add(filaments);

  const moteMat = new T.ShaderMaterial({ uniforms: { uK: { value: 1 } }, vertexShader: MOTE_VS, fragmentShader: MOTE_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
  const motes = new T.InstancedMesh(new T.PlaneGeometry(1, 1), moteMat, RIFT_FIELD_LIMITS.motes);
  motes.name = 'rift:field-motes'; motes.instanceMatrix.setUsage(T.DynamicDrawUsage); motes.frustumCulled = false; motes.renderOrder = 9;
  const tones = [0xc6a6ff, 0x74cfc4, 0xdce6ff, 0x9fd8ff];
  for (let i = 0; i < RIFT_FIELD_LIMITS.motes; i++) motes.setColorAt(i, new T.Color(tones[i % tones.length]));
  motes.instanceColor.needsUpdate = true;
  group.add(motes);
  const dummy = new T.Object3D();

  const light = new T.PointLight(0x86acdb, 0, 13, 2);
  light.name = 'rift:ambient-light'; light.position.set(0, 2.9, 1.3); light.castShadow = false;
  group.add(light);
  const calm = new T.Color(), wild = new T.Color();

  function update(t, phase, st, q) {
    const [level, , agit] = PHASES[phase] ?? PHASES.dormant;
    const motion = st.reducedMotion ? 0 : 1;
    veil.visible = filaments.visible = core.visible = q > 0;
    // Keep the inexpensive footprint on q=0. Higher quality adds inward
    // energy filaments; only explicit reduced motion freezes their travel.
    halo.visible = true;
    halo.material.uniforms.uDetail.value = q;
    threads.visible = q > 0;
    const count = q === 0 ? 0 : q === 1 ? 14 : RIFT_FIELD_LIMITS.motes;
    motes.count = count;
    // motes are drawn into the throat on a tightening spiral; agitation ejects some
    for (let i = 0; i < count; i++) {
      const seed = (i * 0.61803398875) % 1;
      const life = (seed + t * (0.07 + (i % 5) * 0.018) * motion) % 1;
      const eject = agit > 0.5 && i % 4 === 0;
      const rr = eject ? 0.25 + life * 2.6 : (1 - life) * (1.35 + (i % 7) * 0.12) + 0.08;
      const ang = i * 2.39996 + (eject ? 0 : life * (5 + (i % 3))) * (i % 2 ? 1 : -1);
      const y = 2.45 + Math.sin(ang) * rr * 1.35;
      dummy.position.set(Math.cos(ang) * rr * 0.95 - 0.1, y, (eject ? life * 1.2 : 0.35 * (1 - life)) + 0.06);
      const size = (0.05 + (i % 4) * 0.025) * (eject ? 1.4 : 0.5 + (1 - life));
      dummy.scale.setScalar(size * (0.8 + 0.2 * Math.sin(i * 1.6 + t * 2.3 * motion)));
      dummy.updateMatrix();
      motes.setMatrixAt(i, dummy.matrix);
    }
    if (count) motes.instanceMatrix.needsUpdate = true;
    moteMat.uniforms.uK.value = 0.35 + level * 0.9;
    calm.copy(u.uCalm.value); wild.copy(u.uWild.value);
    light.color.copy(calm).lerp(wild, agit);
    light.intensity = q >= 2 && st.cameraDistance < 24 && !st.reducedMotion ? level * (14 + 18 * u.uFlare.value) : 0;
  }
  return { update, surface, skin };
}

// Procedural stand-in frame, shown until the GLB arrives (or if it fails, and in
// node tests). Simplified from the previous rift.
function buildFallbackFrame(T, group) {
  const m = palette(T), frame = new T.Group();
  frame.name = 'rift:fallback-frame';
  mesh(T, frame, new T.CylinderGeometry(2.24, 2.43, 0.58, 12), m.stone, 0, -0.2, 0);
  mesh(T, frame, new T.CylinderGeometry(1.75, 2.05, 0.16, 12), m.dark, 0, 0.13, 0);
  for (const sign of [-1, 1]) {
    const x = sign * 1.6;
    mesh(T, frame, new T.BoxGeometry(0.92, 0.31, 1.48), m.steel, x, 0.26, 0);
    const pts = sign < 0 ? [[-1.75, 0.37, 0.05], [-1.68, 1.4, 0.1], [-1.4, 2.8, 0.05], [-0.95, 4.1, 0], [-0.62, 4.72, 0.04]] : [[1.78, 0.37, -0.05], [1.64, 1.6, 0], [1.3, 3.1, 0.08], [0.8, 4.45, 0.02], [0.3, 5.02, -0.02]];
    tube(T, pts, 0.16, m.dark, frame);
  }
  group.add(frame);
  return { frame, materials: m };
}

/**
 * @param {{returning?:boolean, loader?:{loadAsync(url:string):Promise<any>}, url?:string}} opts
 */
export function buildRift(T, site, ground, { returning = false, loader = null, url = PHASE_SCAR_URL } = {}) {
  const group = new T.Group();
  group.name = returning ? 'rift:severance-return' : 'rift:phase-scar';
  const start = returning ? 'stabilized' : 'dormant';
  const u = {
    uTime: { value: 0 }, uPhase: { value: LEVEL[start] }, uOpen: { value: PHASES[start][1] }, uAgit: { value: PHASES[start][2] }, uStable: { value: returning ? 1 : 0 },
    uFlare: { value: 0 }, uMotion: { value: 1 }, uRefract: { value: 0.035 }, uLayers: { value: 3 },
    uNoise: { value: noise(T), shared: true },
    uCalm: { value: new T.Color(0.3, 0.72, 0.8) }, uWild: { value: new T.Color(0.68, 0.4, 0.86) }, uHot: { value: new T.Color(0.72, 0.92, 1.0) }, uVoid: { value: new T.Color(0.012, 0.012, 0.035) },
    uTipL: { value: new T.Vector3(-0.56, 4.53, -0.04) }, uTipR: { value: new T.Vector3(0.28, 4.82, 0.02) },
  };
  const fallback = buildFallbackFrame(T, group);
  const field = createRiftField(T, group, site, ground, u, returning);
  // emissive inserts in the GLB (driven per phase); null until loaded
  const fx = { seam: null, rail: null, lens: null };
  let assetStatus = loader ? 'loading' : 'fallback';
  let asset = null;
  if (loader) {
    loader.loadAsync(url).then((gltf) => {
      if (assetStatus === 'disposed') return;
      asset = gltf.scene;
      asset.name = 'rift:foundation';
      asset.traverse((n) => {
        if (!n.isMesh) return;
        const name = n.material?.name;
        if (name === 'PS_Seam' || name === 'PS_Rail' || name === 'PS_Lens') {
          n.material = n.material.clone();
          n.material.toneMapped = false;
          fx[name === 'PS_Seam' ? 'seam' : name === 'PS_Rail' ? 'rail' : 'lens'] = n.material;
          n.castShadow = false;
          n.receiveShadow = false;
        } else {
          n.castShadow = n.receiveShadow = true;
          if (n.material?.aoMap) n.material.aoMapIntensity = 1;
        }
      });
      group.add(asset);
      fallback.frame.visible = false;
      assetStatus = 'ready';
    }).catch((err) => {
      if (assetStatus === 'disposed') return;
      console.warn('[rift] phase_scar.glb unavailable; using the procedural frame:', err?.message || err);
      assetStatus = 'fallback';
    });
  }

  // Only the original Reach anomaly owns hazardous phases and a warning ring.
  let ring = null;
  if (!returning) {
    const r = site?.hazard ?? 5.5, geo = new T.RingGeometry(r - 0.16, r, 96);
    geo.rotateX(-Math.PI / 2);
    // Existing object yaw is .9 radians; match its local-to-world transform.
    if (site && ground) {
      const pos = geo.attributes.position, h = ground(site.x, site.z), co = Math.cos(0.9), si = Math.sin(0.9);
      for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, ground(site.x + x * co + z * si, site.z - x * si + z * co) - h + 0.085); }
      pos.needsUpdate = true; geo.computeVertexNormals();
    } else geo.translate(0, 0.09, 0);
    ring = mesh(T, group, geo, new T.MeshBasicMaterial({ color: 0xe2a07c, transparent: true, opacity: 0.88, side: T.DoubleSide, depthWrite: false }));
    ring.name = 'rift:persistent-warning'; ring.visible = false; ring.castShadow = false; ring.receiveShadow = false; ring.renderOrder = 8;
  }

  let time = 0, flare = 0, flareRate = 1.6, charge = 0, chargeLeft = 0;
  const cur = { open: u.uOpen.value, agit: u.uAgit.value, phase: u.uPhase.value };
  const seamCol = new T.Color(), tmp = new T.Color();
  return {
    group, height: 5.15, radius: PHASE_RIFT_RADIUS, hover: 0,
    get assetStatus() { return assetStatus; },
    /** A presentation flare for an authoritative rift event (rift_open/pulse/stabilize/collapse). */
    flare(kind) {
      flare = kind === 'rift_pulse' ? 1 : kind === 'rift_open' ? 0.85 : 0.6;
      flareRate = kind === 'rift_pulse' ? 2.4 : 1.1;
    },
    /** Visible build-up during a server-announced discharge warning (ms). */
    charge(ms) { chargeLeft = charge = Math.max(0.2, Math.min(8, (ms || 1000) / 1000)); },
    update(dt, st) {
      const phase = returning ? 'stabilized' : Object.hasOwn(PHASES, st.riftPhase) ? st.riftPhase : 'dormant';
      const step = Math.max(0, Math.min(0.1, Number.isFinite(dt) ? dt : 0));
      if (!st.reducedMotion) time = (time + step) % 4096;
      const q = Math.min(2, Math.max(0, Number.isFinite(st.effectsQuality) ? st.effectsQuality : 1));
      const [level, open, agit] = PHASES[phase];
      // ease between phases so transitions read as the lens opening/closing
      const k = 1 - Math.exp(-step * 2.2);
      cur.open += (open - cur.open) * k; cur.agit += (agit - cur.agit) * k; cur.phase += (level - cur.phase) * k;
      if (chargeLeft > 0) chargeLeft = Math.max(0, chargeLeft - step);
      const build = charge > 0 && chargeLeft > 0 ? Math.pow(1 - chargeLeft / charge, 2) : 0;
      flare = Math.max(0, flare - step * flareRate);
      u.uTime.value = st.reducedMotion ? 0 : time;
      u.uMotion.value = st.reducedMotion ? 0 : 1;
      u.uPhase.value = level;      // authoritative level (tests and late joiners see it at once)
      u.uOpen.value = st.reducedMotion ? open : cur.open;
      u.uAgit.value = Math.min(1, (st.reducedMotion ? agit : cur.agit) + build * 0.6);
      u.uFlare.value = Math.min(1.2, (st.reducedMotion ? 0 : flare) + build * 0.5);
      u.uStable.value = phase === 'stabilized' ? 1 : 0;
      u.uLayers.value = q >= 2 ? 3 : q === 1 ? 2 : 1;
      u.uRefract.value = q >= 2 && !(st.cameraDistance > 60) ? 0.035 * (1 + 0.8 * u.uAgit.value) : 0;
      if (ring) ring.visible = phase === 'unstable' && st.riftWarning > 0;
      field.update(time, phase, st, q);
      if (fx.seam) {
        const glow = 0.35 + cur.phase * 2.6 + u.uFlare.value * 3;
        seamCol.copy(u.uCalm.value).lerp(u.uWild.value, u.uAgit.value);
        fx.seam.emissive.copy(seamCol); fx.seam.emissiveIntensity = glow;
        tmp.copy(seamCol).lerp(u.uHot.value, 0.5);
        fx.rail.emissive.copy(tmp); fx.rail.emissiveIntensity = 0.7 + cur.phase * 3.2 + build * 3;   // the rails outline the vanes after dark
        fx.lens.emissive.copy(u.uHot.value); fx.lens.emissiveIntensity = 0.6 + cur.phase * 3 + (u.uAgit.value > 0.5 ? 2 * (0.5 + 0.5 * Math.sin(time * 23)) : 0) + build * 5;
      }
    },
    dispose() { assetStatus = 'disposed'; dispose(group); },
  };
}

export { buildPhaseInstrument as buildRiftControl } from './rift-instruments.js';
