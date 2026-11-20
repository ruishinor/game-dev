// The Severance Gate in the world: the exported GLB in three detail bands, and a
// coordinated, bounded family of environmental effects driven by the gate's
// replicated phase. Presentation only: nothing here moves, blocks or rewards.
//
// Detail bands (camera distance to the gate, with hysteresis):
//   near  < 60 m   full geometry, every effect layer
//   mid   < 160 m  simplified geometry; no ground mist, embers or discharges
//   far            silhouette, emissive channels, runes and the celestial column
// Outside the gate's travel region the whole landmark is hidden and not updated.
import { SEVERANCE_GATE, GATE_FRAME, inSeverancePocket } from '../../shared/severance-gate.js';

export const SEVERANCE_GATE_URL = '/client/assets/severance_gate.glb?v=49901e09a6cb';
export const BANDS = Object.freeze({ near: 60, mid: 160, hysteresis: 8 });
export const LIMITS = Object.freeze({ embers: 240, motes: 260, rings: 3, mist: 3, lights: 1, discharges: 3 });
// Target presentation level for each authoritative phase.
export const PHASE_LEVEL = Object.freeze({ dormant: 0.12, resonating: 0.6, active: 1 });

// Shared registry so the gate's interaction entity (models.js) can forward the
// replicated phase to the landmark that scene.js owns.
export const severanceLink = { controller: null };

const TAU = Math.PI * 2;
const AMBER = 0xff8a2c;

// ----------------------------------------------------------------------------- textures
function hash2(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Tileable value-noise fBm in RGBA (four independent octave sets). */
export function noiseTexture(T, size = 128, seed = 23) {
  const data = new Uint8Array(size * size * 4);
  for (let c = 0; c < 4; c++) {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let v = 0, amp = 0.5, tot = 0;
      for (let o = 0; o < 4; o++) {
        const cells = 4 << o, fx = x / size * cells, fy = y / size * cells;
        const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const g = (i, j) => hash2((x0 + i) % cells, (y0 + j) % cells, seed + c * 31 + o * 7);
        const a = g(0, 0) + (g(1, 0) - g(0, 0)) * sx, b = g(0, 1) + (g(1, 1) - g(0, 1)) * sx;
        v += (a + (b - a) * sy) * amp; tot += amp; amp *= 0.5;
      }
      data[(y * size + x) * 4 + c] = Math.round(v / tot * 255);
    }
  }
  const t = new T.DataTexture(data, size, size, T.RGBAFormat);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.magFilter = T.LinearFilter;
  t.minFilter = T.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// ----------------------------------------------------------------------------- shaders
const NOISE = `uniform sampler2D uNoise; float nz(vec2 p){ return texture2D(uNoise, p).r; } float nz2(vec2 p){ return texture2D(uNoise, p).g; }`;
const VS_UV = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const RUNE_FS = `
uniform float uTime, uLevel, uSeq, uFlare, uDim, uGain;
varying vec2 vUv;
void main(){
  float panel = floor(vUv.x / 0.1875 + 0.01);
  // Lower panels wake first, then the upper pair; each column climbs glyph by glyph.
  float order = panel < 2.0 ? panel + 2.0 : panel - 2.0;
  float start = order * 0.6 + vUv.y * 1.1;
  float lit = smoothstep(start, start + 0.45, uSeq);
  float flick = 0.9 + 0.1 * sin(uTime * 6.3 + vUv.y * 41.0 + panel * 2.3);
  float k = (uDim + (1.0 - uDim) * uLevel * lit) * flick + uFlare * 0.45;
  vec3 hotc = vec3(1.0, 0.86, 0.6), warm = vec3(1.0, 0.45, 0.12);
  gl_FragColor = vec4(mix(warm, hotc, clamp(k - 0.7, 0.0, 1.0)) * k * uGain, 1.0);
}`;
const CHANNEL_FS = `
uniform float uTime, uLevel, uFlare, uFlareAge, uAlpha, uMotion;
varying vec2 vUv;
void main(){
  float d = vUv.x * 42.0;                         // metres from the passage mouth
  float wave = 0.5 + 0.5 * sin((d - uTime * 5.5 * uMotion) * 0.42);
  float pulse = pow(wave, 14.0);
  float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
  float front = exp(-pow(d - uFlareAge * 14.0, 2.0) * 0.08) * uFlare;
  float k = (0.16 + 0.7 * pulse) * uLevel + front;
  vec3 c = mix(vec3(0.95, 0.36, 0.07), vec3(1.0, 0.8, 0.52), clamp(pulse * uLevel + front, 0.0, 1.0));
  gl_FragColor = vec4(c * k * (0.55 + 0.45 * across), uAlpha * clamp(k, 0.0, 1.0));
}`;
const FLAT_FS = `uniform vec3 uColor; uniform float uK; void main(){ gl_FragColor = vec4(uColor * uK, 1.0); }`;

const VORTEX_FS = `
${NOISE}
uniform float uTime, uLevel, uFlare, uLayer, uMotion;
varying vec2 vUv;
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float a = atan(p.y, p.x) / 6.2831853;
  float t = uTime * uMotion;
  // Tunnel coordinates: rings recede toward the centre (apparent depth).
  float depth = 0.22 / (r + 0.08);
  float s1 = nz(vec2(a * 3.0 + depth * 0.35 + t * (0.05 + 0.03 * uLayer), depth * 0.6 - t * 0.35));
  float s2 = nz2(vec2(a * 5.0 - depth * 0.55 - t * (0.09 + 0.02 * uLayer), depth * 0.9 - t * 0.6));
  float swirl = s1 * 0.6 + s2 * 0.4;
  float fil = pow(1.0 - abs(s2 - 0.5) * 2.0, 9.0);                    // plasma filaments
  float core = exp(-r * r * (18.0 + 6.0 * uLayer));                    // luminous convergence
  float rim = smoothstep(0.8, 0.97, r) * (1.0 - smoothstep(0.97, 1.0, r));
  float arms = smoothstep(0.45, 0.8, swirl);                            // spiral arms, dark lanes between
  float body = (0.12 + 0.88 * arms) * (1.0 - smoothstep(0.84, 1.0, r)) * (0.45 + 0.55 * r);
  float k = (body * 0.32 + fil * 0.42 * (1.0 - r) + core * 0.62 + rim * 0.3) * uLevel + uFlare * (core * 0.9 + body * 0.25);
  vec3 col = mix(vec3(0.62, 0.15, 0.03), vec3(1.0, 0.55, 0.16), clamp(arms + fil * 0.6, 0.0, 1.0));
  col = mix(col, vec3(1.0, 0.9, 0.72), clamp(core + uFlare * core, 0.0, 1.0));
  gl_FragColor = vec4(col * k, clamp(k, 0.0, 1.0) * (0.7 - 0.2 * uLayer));
}`;

const COLUMN_VS = `varying vec2 vUv; varying float vFacing; void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vec3 n = normalize(mat3(modelMatrix) * normal); vec3 v = normalize(cameraPosition - wp.xyz); vFacing = abs(dot(n, v)); gl_Position = projectionMatrix * viewMatrix * wp; }`;
const COLUMN_FS = `
${NOISE}
uniform float uTime, uLevel, uAlpha, uFlare, uScroll, uMotion, uHot;
varying vec2 vUv; varying float vFacing;
void main(){
  float y = vUv.y;
  float flow = nz(vec2(vUv.x * 2.0, y * 6.0 - uTime * uScroll * uMotion));
  float flow2 = nz2(vec2(vUv.x * 4.0 + 0.3, y * 13.0 - uTime * uScroll * 1.7 * uMotion));
  float base = smoothstep(0.0, 0.025, y);
  float top = 1.0 - smoothstep(0.35, 1.0, y);
  float core = pow(vFacing, 3.0);
  float k = core * (0.55 + 0.45 * flow) * (0.75 + 0.5 * flow2) * base * top * uLevel * (1.0 + uFlare * 0.8);
  vec3 c = mix(vec3(1.0, 0.45, 0.1), vec3(1.0, 0.86, 0.62), clamp(core * uHot, 0.0, 1.0));
  gl_FragColor = vec4(c * k, k * uAlpha);
}`;
const RING_FS = `
uniform float uTime, uLevel, uSeed, uSegments;
varying vec2 vUv;
float h(float n){ return fract(sin(n * 12.9898 + uSeed) * 43758.5453); }
void main(){
  float a = vUv.x * uSegments;                 // around the ring
  float seg = floor(a), f = fract(a);
  float across = vUv.y;                        // 0 inner .. 1 outer
  float glyph = step(0.3, h(seg)) * step(0.12, f) * step(f, 0.12 + 0.5 * h(seg + 7.0));
  float tick = step(0.86, f) * step(0.45, across) * step(across, 0.75);
  float band = smoothstep(0.0, 0.08, across) * (1.0 - smoothstep(0.92, 1.0, across));
  float edge = exp(-pow((across - 0.08) * 22.0, 2.0)) + exp(-pow((across - 0.92) * 22.0, 2.0));
  float inner = step(0.32, across) * step(across, 0.68);
  float k = (edge * 0.55 + glyph * inner * 0.9 + tick * 0.5) * band;
  float flicker = 0.8 + 0.2 * sin(uTime * 2.1 + seg * 0.7);
  gl_FragColor = vec4(vec3(1.0, 0.58, 0.2) * k * flicker * uLevel, k * uLevel);
}`;
const MIST_FS = `
${NOISE}
uniform float uTime, uLevel, uAlpha, uMotion;
varying vec2 vUv;
void main(){
  vec2 p = vUv * 2.0 - 1.0; float r = length(p);
  float fade = (1.0 - smoothstep(0.45, 1.0, r)) * smoothstep(0.1, 0.32, r);
  float n = nz(vUv * 2.3 + vec2(uTime * 0.012, uTime * 0.008) * uMotion) * 0.6 + nz2(vUv * 5.1 - vec2(uTime * 0.02, 0.0) * uMotion) * 0.4;
  float k = smoothstep(0.38, 0.85, n) * fade;
  vec3 c = mix(vec3(0.42, 0.38, 0.38), vec3(0.95, 0.55, 0.28), (0.25 + 0.5 * uLevel) * (1.0 - smoothstep(0.15, 0.55, r)));
  gl_FragColor = vec4(c, k * uAlpha * (0.6 + 0.4 * uLevel));
}`;
const GROUND_FS = `
${NOISE}
uniform float uTime, uLevel, uWave, uMotion, uFlare, uCos, uSin;
varying vec2 vUv;
void main(){
  vec2 p = (vUv - 0.5) * 64.0;                 // metres around the gate centre (x, -z)
  float r = length(p);
  // asset frame: bx right, by toward the rear; the footprint stays clear of ground effects
  vec2 w = vec2(p.x, -p.y);
  float bx = uCos * w.x - uSin * w.y, by = -(uSin * w.x + uCos * w.y);
  float outside = max(smoothstep(9.3, 10.2, abs(bx)), max((1.0 - smoothstep(-18.2, -17.3, by)), smoothstep(8.0, 8.9, by)));
  // fissures: noise ridges, only near the foundation
  float ridge = 1.0 - abs(nz(vUv * 3.1) - 0.5) * 2.0;
  ridge = pow(ridge, 26.0) * smoothstep(0.42, 0.62, nz2(vUv * 1.7));
  float near = (1.0 - smoothstep(13.0, 26.0, r)) * smoothstep(9.5, 11.5, r);
  float throb = 0.75 + 0.25 * sin(uTime * 1.7 * uMotion - r * 0.35);
  float fis = ridge * near * throb * (0.25 + 0.75 * uLevel);
  // resonance waves rolling outward across the apron
  float wv = 0.0;
  for (int i = 0; i < 2; i++) {
    float rr = mod(uTime * 4.0 * uMotion + float(i) * 14.0, 28.0) + 9.0;
    wv += exp(-pow(r - rr, 2.0) * 0.35) * (1.0 - smoothstep(20.0, 37.0, rr));
  }
  wv *= uWave * uLevel;
  float k = (fis * 1.4 + wv * 0.35 + uFlare * exp(-pow(r - 12.0, 2.0) * 0.05) * 0.4) * outside;
  gl_FragColor = vec4(vec3(1.0, 0.48, 0.12) * k, clamp(k, 0.0, 1.0));
}`;
const PARTICLE_VS = `
attribute vec4 aSeed;
uniform float uTime, uLevel, uSize, uHeight, uRadius, uRise, uMotion, uSpiral;
varying float vA;
void main(){
  float t = uTime * uMotion;
  float life = fract(aSeed.x + t * uRise / uHeight);
  float ang = aSeed.y * 6.2831853 + t * (0.05 + 0.25 * aSeed.z) * uSpiral + life * uSpiral * 2.0;
  float rad = uRadius * mix(0.25, 1.0, aSeed.w) * (1.0 + life * (1.0 - uSpiral) * 0.3);
  vec3 c = vec3(cos(ang) * rad, life * uHeight, sin(ang) * rad);
  c.x += sin(t * 0.7 + aSeed.z * 20.0) * 0.4;
  vec4 mv = modelViewMatrix * vec4(c, 1.0);
  float s = uSize * (0.5 + aSeed.z);
  mv.xy += position.xy * s;
  vA = smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.7, 1.0, life)) * uLevel;
  gl_Position = projectionMatrix * mv;
}`;
const SPRITE_FS = `uniform vec3 uColor; varying float vA; varying vec2 vQ; void main(){ float r = length(vQ); float k = exp(-r * r * 7.0) * vA; if (k < 0.004) discard; gl_FragColor = vec4(uColor * k, k); }`;
const HALO_FS = `uniform float uK; varying vec2 vUv; void main(){ vec2 p = vUv * 2.0 - 1.0; float k = exp(-(p.x * p.x * 3.2 + p.y * p.y * 1.4)) * uK; gl_FragColor = vec4(vec3(1.0, 0.5, 0.15) * k, k); }`;

// ----------------------------------------------------------------------------- helpers
function disposeTree(root) {
  const geos = new Set(), mats = new Set(), texs = new Set();
  root.traverse((o) => {
    if (o.geometry) geos.add(o.geometry);
    for (const m of [].concat(o.material || [])) {
      mats.add(m);
      for (const v of Object.values(m)) if (v && v.isTexture) texs.add(v);
      for (const u of Object.values(m.uniforms || {})) if (u?.value?.isTexture) texs.add(u.value);
    }
  });
  for (const g of geos) g.dispose();
  for (const m of mats) m.dispose();
  for (const t of texs) t.dispose();
}

export function particleField(T, count, opts) {
  const quad = new T.PlaneGeometry(1, 1);
  const geo = new T.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  const seeds = new Float32Array(count * 4);
  let s = opts.seed || 1;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < seeds.length; i++) seeds[i] = rnd();
  geo.setAttribute('aSeed', new T.InstancedBufferAttribute(seeds, 4));
  geo.instanceCount = count;
  const mat = new T.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLevel: { value: 0 }, uSize: { value: opts.size }, uHeight: { value: opts.height }, uRadius: { value: opts.radius },
      uRise: { value: opts.rise }, uMotion: { value: 1 }, uSpiral: { value: opts.spiral || 0 }, uColor: { value: new T.Color(opts.color) } },
    vertexShader: PARTICLE_VS.replace('varying float vA;', 'varying float vA; varying vec2 vQ;').replace('mv.xy += position.xy * s;', 'mv.xy += position.xy * s; vQ = position.xy * 2.0;'),
    fragmentShader: SPRITE_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
  });
  const mesh = new T.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 7;
  return { mesh, mat, geo, count };
}

function conformingDisc(T, radius, seg, at, ground) {
  const g = new T.PlaneGeometry(radius * 2, radius * 2, seg, seg);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, ground(at.x + pos.getX(i), at.z + pos.getZ(i)) + 0.06);
  pos.needsUpdate = true;
  return g;
}

// ----------------------------------------------------------------------------- controller
/**
 * @param T three namespace
 * @param o {scene, loader, groundHeight, url?}
 */
export function createSeveranceGateLandmark(T, o) {
  const G = SEVERANCE_GATE;
  const root = new T.Group();
  root.name = 'severance-gate';
  root.position.set(G.x, 0, G.z);
  root.rotation.y = G.yaw;
  root.visible = false;
  o.scene.add(root);
  const noise = noiseTexture(T);
  const state = {
    status: 'idle', phase: 'dormant', level: PHASE_LEVEL.dormant, target: PHASE_LEVEL.dormant, seq: 99, flare: 0, flareAge: 9, minorFlare: 0,
    band: 'far', time: 0, column: 0, discharges: 0, nextDischarge: 2, ringLinkAt: 4, seenPhase: null, lightScale: 1, deterministic: false,
  };
  let env = { vfx: null, quality: () => 2, reducedMotion: () => false, intensity: () => 1, calm: () => false };
  const bands = { near: new T.Group(), mid: new T.Group(), far: new T.Group() };
  for (const [k, g] of Object.entries(bands)) { g.name = 'severance-gate:' + k; root.add(g); }
  const fx = new T.Group();
  fx.name = 'severance-gate:vfx';
  root.add(fx);
  const U = (v) => ({ value: v });
  const shared = { uTime: U(0), uLevel: U(state.level), uNoise: U(noise), uMotion: U(1), uFlare: U(0) };

  // emissive materials that replace the exported fallbacks
  const runeMat = new T.ShaderMaterial({ uniforms: { uTime: shared.uTime, uLevel: shared.uLevel, uSeq: U(99), uFlare: shared.uFlare, uDim: U(0.14), uGain: U(1) }, vertexShader: VS_UV, fragmentShader: RUNE_FS });
  const runeFar = runeMat.clone();
  runeFar.uniforms = { ...runeMat.uniforms, uGain: U(1.25) };
  const chanMat = new T.ShaderMaterial({ uniforms: { uTime: shared.uTime, uLevel: shared.uLevel, uFlare: shared.uFlare, uFlareAge: U(9), uAlpha: U(1), uMotion: shared.uMotion }, vertexShader: VS_UV, fragmentShader: CHANNEL_FS });
  const chanFar = new T.ShaderMaterial({ uniforms: { ...chanMat.uniforms, uAlpha: U(0.7) }, vertexShader: VS_UV, fragmentShader: CHANNEL_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
  const lampMat = new T.ShaderMaterial({ uniforms: { uColor: U(new T.Color(1.0, 0.62, 0.32)), uK: U(0.5) }, vertexShader: VS_UV, fragmentShader: FLAT_FS });
  const dimMat = new T.ShaderMaterial({ uniforms: { uColor: U(new T.Color(0.55, 0.24, 0.08)), uK: U(0.3) }, vertexShader: VS_UV, fragmentShader: FLAT_FS });
  const EMISSIVE = { SG_Rune: runeMat, SG_Channel: chanMat, SG_Lamp: lampMat, SG_RuneDim: dimMat };

  // light spill: one warm point light at the passage mouth (created once, so no
  // shader recompiles when the gate wakes)
  const light = new T.PointLight(0xffa765, 0, 28, 1.8);
  light.position.set(0, 8.5, 6.6);
  light.name = 'severance-gate:portal-light';
  root.add(light);

  // ---- vortex: three stacked discs give parallax depth inside the chamber
  const P = GATE_FRAME.portal;
  const vortex = new T.Group();
  vortex.name = 'severance-gate:vortex';
  vortex.position.set(0, P.z, -P.y);
  const discGeo = new T.PlaneGeometry(P.rx * 2, P.rz * 2);
  const vortexMats = [0, 1, 2].map((layer) => {
    const m = new T.ShaderMaterial({ uniforms: { uTime: shared.uTime, uLevel: shared.uLevel, uFlare: shared.uFlare, uNoise: shared.uNoise, uMotion: shared.uMotion, uLayer: U(layer) },
      vertexShader: VS_UV, fragmentShader: VORTEX_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
    const mesh = new T.Mesh(discGeo, m);
    mesh.position.z = -0.35 * layer;
    mesh.scale.setScalar(1 - 0.12 * layer);
    mesh.renderOrder = 8 - layer;
    vortex.add(mesh);
    return m;
  });
  fx.add(vortex);

  // ---- celestial column out of the hollow crown
  const column = new T.Group();
  column.name = 'severance-gate:column';
  column.position.y = 19.5;
  const COLUMN_H = 240;
  const colLayers = [[0.85, 1.3, 0.95, 0.5, 1.0], [2.1, 3.6, 0.42, 0.35, 0.5], [4.8, 9.5, 0.16, 0.22, 0.0]].map(([r0, r1, alpha, scroll, hot]) => {
    const geo = new T.CylinderGeometry(r1, r0, COLUMN_H, 20, 24, true);
    geo.translate(0, COLUMN_H / 2, 0);
    const m = new T.ShaderMaterial({ uniforms: { uTime: shared.uTime, uLevel: U(0), uAlpha: U(alpha), uFlare: shared.uFlare, uNoise: shared.uNoise, uScroll: U(scroll), uMotion: shared.uMotion, uHot: U(hot) },
      vertexShader: COLUMN_VS, fragmentShader: COLUMN_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false });
    const mesh = new T.Mesh(geo, m);
    mesh.renderOrder = 9;
    mesh.frustumCulled = false;
    column.add(mesh);
    return m;
  });
  const motes = particleField(T, LIMITS.motes, { seed: 5, size: 0.32, height: 70, radius: 3.4, rise: 9, spiral: 1, color: 0xffb36a });
  column.add(motes.mesh);
  fx.add(column);

  // ---- orbital resonance rings
  const rings = [[12.6, 21.8, 0.14, 0.0, 0.17, 48, 1.1], [14.4, 18.2, -0.3, 0.9, -0.11, 64, 2.3], [10.6, 24.6, 0.45, 2.1, 0.26, 40, 3.7]].map(([radius, y, tilt, yawOff, speed, segs, seed]) => {
    const geo = new T.RingGeometry(radius, radius + 0.7, 160, 1);
    // RingGeometry UVs are planar; rebuild them as (around, across) for the glyph band.
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y2 = pos.getY(i);
      uv.setXY(i, (Math.atan2(y2, x) / TAU + 1) % 1, (Math.hypot(x, y2) - radius) / 0.7);
    }
    const m = new T.ShaderMaterial({ uniforms: { uTime: shared.uTime, uLevel: U(0), uSeed: U(seed), uSegments: U(segs) }, vertexShader: VS_UV, fragmentShader: RING_FS,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false });
    const mesh = new T.Mesh(geo, m);
    const pivot = new T.Group();
    pivot.position.y = y;
    pivot.rotation.set(Math.PI / 2 + tilt, yawOff, 0, 'YXZ');
    pivot.add(mesh);
    mesh.renderOrder = 8;
    fx.add(pivot);
    return { mesh, mat: m, pivot, speed, radius, y };
  });

  // ---- ground: fissures and resonance waves on a terrain-conforming disc
  const groundGeo = conformingDisc(T, 32, 72, { x: G.x, z: G.z }, o.groundHeight);
  const groundMat = new T.ShaderMaterial({ uniforms: { uTime: shared.uTime, uLevel: shared.uLevel, uNoise: shared.uNoise, uWave: U(1), uMotion: shared.uMotion, uFlare: shared.uFlare, uCos: U(Math.round(Math.cos(G.yaw))), uSin: U(Math.round(Math.sin(G.yaw))) },
    vertexShader: VS_UV, fragmentShader: GROUND_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 });
  const groundMesh = new T.Mesh(groundGeo, groundMat);
  groundMesh.renderOrder = 4;
  const groundHolder = new T.Group();
  groundHolder.add(groundMesh);
  o.scene.add(groundHolder);
  groundHolder.position.set(G.x, 0, G.z);
  groundHolder.visible = false;
  // ---- low mist around the foundation
  const mistGeo = new T.PlaneGeometry(70, 70);
  mistGeo.rotateX(-Math.PI / 2);
  const mistMats = [0.35, 0.8, 1.5].slice(0, LIMITS.mist).map((y, i) => {
    const m = new T.ShaderMaterial({ uniforms: { uTime: U(0), uLevel: shared.uLevel, uNoise: shared.uNoise, uAlpha: U(0.22 - i * 0.05), uMotion: shared.uMotion },
      vertexShader: VS_UV, fragmentShader: MIST_FS, transparent: true, depthWrite: false });
    const mesh = new T.Mesh(mistGeo, m);
    mesh.position.y = y;
    mesh.rotation.y = i * 1.7;
    mesh.renderOrder = 3;
    groundHolder.add(mesh);
    return m;
  });
  // ---- embers and luminous dust rising from the apron
  const embers = particleField(T, LIMITS.embers, { seed: 9, size: 0.14, height: 16, radius: 24, rise: 0.9, color: 0xffa04a });
  groundHolder.add(embers.mesh);
  // ---- rune panel halos (light bleeding out of the recesses)
  const halos = new T.Group();
  const haloMats = [];
  fx.add(halos);

  let fragments = [];
  const scenes = {};

  function adopt(gltf) {
    for (const sc of gltf.scenes) scenes[sc.name] = sc;
    if (!scenes.Near || !scenes.Mid || !scenes.Far) throw new Error('Severance Gate GLB lacks its Near/Mid/Far scenes');
    for (const name of ['Near', 'Mid', 'Far']) {
      const band = bands[name.toLowerCase()];
      const sc = scenes[name];
      for (const child of [...sc.children]) band.add(child);
      band.traverse((n) => {
        if (!n.isMesh) return;
        const mname = n.material?.name;
        if (EMISSIVE[mname]) {
          n.material = name === 'Far' && mname === 'SG_Channel' ? chanFar : name === 'Far' && mname === 'SG_Rune' ? runeFar : EMISSIVE[mname];
          n.castShadow = false; n.receiveShadow = false;
        } else {
          n.castShadow = name !== 'Far';
          n.receiveShadow = true;
          if (n.material?.aoMap) n.material.aoMapIntensity = 1;
        }
      });
    }
    // fragments are animated per band (the Mid scene links the same meshes)
    fragments = [];
    for (const band of [bands.near, bands.mid]) band.traverse((n) => {
      if (/Fragment_\d+$/.test(n.name)) fragments.push({ node: n, base: n.position.clone(), rot: n.rotation.clone(), i: Number(n.name.slice(-2)) });
    });
    // halos from the rune geometry: one per panel, at the centroid of its glyphs
    const runes = bands.near.getObjectByName('Runes');
    if (runes) {
      const pos = runes.geometry.attributes.position, uv = runes.geometry.attributes.uv;
      const acc = [0, 1, 2, 3].map(() => ({ min: new T.Vector3(Infinity, Infinity, Infinity), max: new T.Vector3(-Infinity, -Infinity, -Infinity) }));
      const v = new T.Vector3();
      for (let i = 0; i < pos.count; i++) {
        const panel = Math.min(3, Math.floor(uv.getX(i) / 0.1875 + 0.01));
        v.fromBufferAttribute(pos, i);
        acc[panel].min.min(v); acc[panel].max.max(v);
      }
      const haloGeo = new T.PlaneGeometry(1, 1);
      for (const a of acc) {
        if (!Number.isFinite(a.min.x)) continue;
        const m = new T.ShaderMaterial({ uniforms: { uK: U(0) }, vertexShader: VS_UV, fragmentShader: HALO_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
        const q = new T.Mesh(haloGeo, m);
        const c = a.min.clone().add(a.max).multiplyScalar(0.5);
        q.position.copy(c).add(new T.Vector3(0, 0.12, 0.42));
        q.rotation.x = -Math.atan((GATE_FRAME.body.hd0 - GATE_FRAME.body.hd1) / (GATE_FRAME.height - GATE_FRAME.floor));
        q.scale.set((a.max.x - a.min.x) * 2.4, (a.max.y - a.min.y) * 1.4, 1);
        q.renderOrder = 6;
        halos.add(q);
        haloMats.push(m);
      }
    }
    if (scenes.Ruins) state.ruins = scenes.Ruins;
  }

  function fallback() {
    // A procedural silhouette so the collision footprint is never invisible.
    const mat = new T.MeshStandardMaterial({ color: 0x3b3a3c, roughness: 0.9 });
    const F = GATE_FRAME;
    const body = new T.CylinderGeometry(Math.hypot(F.body.hw1, F.body.hd1) * 0.75, Math.hypot(F.body.hw0, F.body.hd0) * 0.75, F.height - F.floor, 4, 1);
    body.rotateY(Math.PI / 4);
    body.translate(0, (F.height + F.floor) / 2, 0);
    const plinth = new T.BoxGeometry(F.plinth.hw * 2, F.floor, F.plinth.rear - F.plinth.front);
    plinth.translate(0, F.floor / 2, -(F.plinth.rear + F.plinth.front) / 2);
    for (const g of [body, plinth]) bands.near.add(new T.Mesh(g, mat));
    state.status = 'fallback';
  }

  function load() {
    if (state.status !== 'idle') return;
    state.status = 'loading';
    if (!o.loader) { fallback(); return; }
    o.loader.loadAsync(o.url || SEVERANCE_GATE_URL).then((gltf) => {
      if (state.status === 'disposed') { disposeTree(gltf.scene); return; }
      adopt(gltf);
      state.status = 'ready';
    }).catch((err) => {
      if (state.status === 'disposed') return;
      console.warn('[severance-gate] GLB unavailable; using the procedural silhouette:', err?.message || err);
      fallback();
    });
  }

  function setPhase(phase) {
    if (!Object.hasOwn(PHASE_LEVEL, phase) || phase === state.phase) return;
    // Activation sequence only when this client witnesses the gate waking; a
    // client arriving at an already active gate does not replay it.
    if (state.phase === 'dormant' && phase === 'resonating' && state.seenPhase !== null) state.seq = 0;
    state.phase = phase;
    state.target = PHASE_LEVEL[phase];
  }

  function traverse(e) {
    if (e?.m) { state.minorFlare = 1; return; }
    state.flare = 1;
    state.flareAge = 0;
    const v = env.vfx;
    if (v && env.quality() > 0 && root.visible) {
      const at = toWorld(0, P.z, -P.y + 0.6);
      v.shock?.({ at: [at.x, o.groundHeight(at.x, at.z) + 0.1, at.z], radius: 7, color: AMBER, life: 0.9, width: 0.1 });
      if (!env.calm()) v.flash?.({ at: [at.x, at.y, at.z], color: AMBER, intensity: 9, life: 0.35 });
      v.burst?.({ at: [at.x, at.y, at.z], shape: 'sphere', radius: 1.6, count: 40, color: 0xffd09a, color2: AMBER, size: [0.05, 0.16], sizeEnd: 0.02, life: [0.5, 1.2], speed: [1.5, 4.5] });
    }
  }

  const tmpV = new T.Vector3();
  function toWorld(x, y, z) {
    tmpV.set(x, y, z);
    return root.localToWorld(tmpV.clone());
  }

  function discharge(dt) {
    const v = env.vfx;
    if (state.deterministic || !v || env.quality() < 1 || env.reducedMotion() || state.band !== 'near' || state.level < 0.8) return;
    state.nextDischarge -= dt;
    if (state.nextDischarge > 0) return;
    state.nextDischarge = 2.5 + Math.random() * 4.5;
    const kind = Math.random();
    let a, b;
    if (kind < 0.4 && fragments.length > 1) {          // between two levitating fragments
      const f1 = fragments[Math.floor(Math.random() * fragments.length)], f2 = fragments[Math.floor(Math.random() * fragments.length)];
      if (f1 === f2 || !f1.node.visible) return;
      a = f1.node.getWorldPosition(new T.Vector3()); b = f2.node.getWorldPosition(new T.Vector3());
      if (a.distanceTo(b) > 14) return;
    } else if (kind < 0.75) {                          // crown notch to an upper rune panel
      const s = Math.random() < 0.5 ? -1 : 1;
      a = toWorld(0, 26.5, -2.4); b = toWorld(s * 2.85, 25.2, -4.4);
    } else {                                           // chamber wall to the vortex rim
      const s = Math.random() < 0.5 ? -1 : 1;
      a = toWorld(s * 2.6, 6 + Math.random() * 6, -0.6); b = toWorld(s * 1.6, P.z + (Math.random() - 0.5) * 4, -P.y);
    }
    v.lightning?.({ from: [a.x, a.y, a.z], to: [b.x, b.y, b.z], color: 0xffb46a, life: 0.28, width: 0.05, branches: 1 });
    state.discharges++;
  }

  function update(dt, t, eye, opts = {}) {
    if (state.status === 'disposed') return;
    state.deterministic = !!opts.deterministic;
    const inRegion = !!eye && inSeverancePocket(eye.x, eye.z, 30);
    root.visible = inRegion;
    groundHolder.visible = false;
    if (!inRegion) return;
    if (state.status === 'idle') load();
    dt = Math.max(0, Math.min(0.1, Number.isFinite(dt) ? dt : 0));
    const reduced = env.reducedMotion();
    const q = env.quality();
    const k = Math.max(0.3, Math.min(1, env.intensity()));
    state.time += reduced ? dt * 0.12 : dt;
    state.seenPhase = state.phase;
    // smooth state transitions; the flare decays into stabilization
    state.level += (state.target - state.level) * Math.min(1, dt / (state.target > state.level ? 2.2 : 3.5));
    state.seq = Math.min(99, state.seq + dt);
    state.flare = Math.max(0, state.flare - dt * 0.55);
    state.flareAge += dt;
    state.minorFlare = Math.max(0, state.minorFlare - dt * 1.4);
    const flare = Math.min(1, state.flare + state.minorFlare * 0.35) * (env.calm() ? 0.5 : 1);
    shared.uTime.value = state.time;
    shared.uLevel.value = state.level * (0.55 + 0.45 * k);
    shared.uMotion.value = reduced ? 0.15 : 1;
    shared.uFlare.value = flare;
    runeMat.uniforms.uSeq.value = state.seq;
    chanMat.uniforms.uFlareAge.value = state.flareAge;
    lampMat.uniforms.uK.value = 0.35 + 0.6 * state.level;
    dimMat.uniforms.uK.value = 0.2 + 0.25 * state.level;
    // detail band from camera distance to the gate centre
    const d = Math.hypot(eye.x - G.x, eye.z - G.z);
    const H = BANDS.hysteresis;
    const band = state.band === 'near' ? (d > BANDS.near + H ? (d > BANDS.mid ? 'far' : 'mid') : 'near')
      : state.band === 'mid' ? (d < BANDS.near - H ? 'near' : d > BANDS.mid + H ? 'far' : 'mid')
      : (d < BANDS.mid - H ? (d < BANDS.near ? 'near' : 'mid') : 'far');
    state.band = band;
    const ready = state.status === 'ready';
    bands.near.visible = band === 'near' || !ready;
    bands.mid.visible = ready && band === 'mid';
    bands.far.visible = ready && band === 'far';
    // column ignites late in the activation sequence and stays in every band
    const colTarget = state.level > 0.5 ? (state.seq < 99 ? Math.min(1, Math.max(0, (state.seq - 2.6) / 1.6)) : 1) * state.level : state.level * 0.15;
    state.column += (colTarget - state.column) * Math.min(1, dt * 1.5);
    colLayers.forEach((m, i) => { m.uniforms.uLevel.value = state.column * (i === 2 && q === 0 ? 0 : 1) * (0.6 + 0.4 * k); });
    motes.mesh.visible = q > 0 && band !== 'far';
    motes.mat.uniforms.uTime.value = state.time;
    motes.mat.uniforms.uLevel.value = state.column * 0.9;
    motes.mat.uniforms.uMotion.value = reduced ? 0.15 : 1;
    // vortex and rings
    vortex.visible = band !== 'far' || q > 0;
    for (const r of rings) {
      r.pivot.visible = q > 0 && band !== 'far';
      r.mat.uniforms.uLevel.value = Math.max(0, state.level - 0.35) / 0.65 * (0.75 + 0.25 * Math.sin(state.time * 0.6 + r.radius)) * k;
      r.mesh.rotation.z += dt * r.speed * (reduced ? 0.1 : 1);
    }
    for (const m of haloMats) m.uniforms.uK.value = q > 0 ? (0.05 + 0.32 * state.level + flare * 0.25) * k : 0;
    // levitating fragments: rise with the gate, bob and turn slowly, drift in orbit
    const lift = -2.2 + 2.2 * Math.min(1, state.level / 0.6);
    for (const f of fragments) {
      const ph = f.i * 1.37;
      const sway = reduced ? 0 : Math.sin(state.time * 0.05 + ph) * 0.06;
      const c = Math.cos(sway), s = Math.sin(sway);
      f.node.position.set(f.base.x * c - f.base.z * s, f.base.y + lift + Math.sin(state.time * 0.45 + ph) * 0.4, f.base.x * s + f.base.z * c);
      f.node.rotation.set(f.rot.x + state.time * 0.05 * (1 + (f.i % 3)), f.rot.y + state.time * 0.07 * (f.i % 2 ? 1 : -1), f.rot.z);
    }
    // ground layers only near the gate
    groundHolder.visible = band === 'near';
    for (const m of mistMats) m.uniforms.uTime.value = state.time;
    for (const m of mistMats) m.uniforms.uAlpha.value = q > 0 ? m.uniforms.uAlpha.value : 0;
    groundMat.uniforms.uWave.value = q > 0 && !reduced ? 1 : 0;
    embers.mesh.visible = q > 0 && band === 'near';
    embers.mat.uniforms.uTime.value = state.time;
    embers.mat.uniforms.uLevel.value = (0.25 + 0.75 * state.level) * k;
    embers.mat.uniforms.uMotion.value = reduced ? 0.15 : 1;
    // warm light spill on the stairs and the passage stone
    light.intensity = q >= 1 ? (10 + 48 * state.level + 80 * flare) * (0.7 + 0.3 * k) * state.lightScale : 0;
    discharge(dt);
    // occasional link between a ring and the monolith
    if (env.vfx && q > 0 && !reduced && !state.deterministic && band === 'near' && state.level > 0.9) {
      state.ringLinkAt -= dt;
      if (state.ringLinkAt <= 0) {
        state.ringLinkAt = 5 + Math.random() * 6;
        const r = rings[Math.floor(Math.random() * rings.length)];
        const from = r.mesh.localToWorld(new T.Vector3(r.radius + 0.35, 0, 0));
        const to = toWorld(Math.sign(Math.random() - 0.5) * 3.4, r.y - 1, -3.0);
        env.vfx.beam?.({ from: [from.x, from.y, from.z], to: [to.x, to.y, to.z], color: 0xffa860, width: 0.06, life: 0.6, jitter: 0.12, grow: 0.25 });
      }
    }
  }

  function placeRuins(group, ground) {
    // Ruin instances share the gate GLB's Ruins meshes and its stone atlas.
    return (props) => {
      if (!state.ruins) return false;
      for (const p of props) {
        const src = state.ruins.getObjectByName(p.variant);
        if (!src) continue;
        const inst = src.clone();
        const x = p.vx ?? p.x, z = p.vz ?? p.z;
        inst.position.set(x, ground(x, z) - 0.04, z);
        inst.rotation.y = p.rot;
        inst.traverse((n) => {
          if (n.isMesh) {
            if (EMISSIVE[n.material?.name]) n.material = dimMat;
            n.castShadow = true; n.receiveShadow = true;
          }
        });
        group.add(inst);
      }
      return true;
    };
  }

  const controller = {
    root, bands, fx,
    get status() { return state.status; },
    get band() { return state.band; },
    get phase() { return state.phase; },
    get level() { return state.level; },
    get state() { return state; },
    attach(e) { env = { ...env, ...e }; },
    /** Presentation multiplier on the warm portal light (time-of-day preview); 1 = authored. */
    setLightScale(k) { state.lightScale = Number.isFinite(k) ? Math.max(0, Math.min(3, k)) : 1; },
    setPhase, traverse, update, load, placeRuins,
    stats() {
      let tris = 0, draws = 0;
      root.traverseVisible((n) => {
        if (!n.isMesh) return;
        draws++;
        const g = n.geometry;
        const count = g.index ? g.index.count : g.attributes.position.count;
        tris += (g.isInstancedBufferGeometry ? g.instanceCount : 1) * count / 3;
      });
      return { status: state.status, band: state.band, phase: state.phase, level: +state.level.toFixed(3), draws, triangles: Math.round(tris), discharges: state.discharges, particles: (motes.mesh.visible ? LIMITS.motes : 0) + (embers.mesh.visible && groundHolder.visible ? LIMITS.embers : 0) };
    },
    dispose() {
      if (state.status === 'disposed') return;
      state.status = 'disposed';
      root.removeFromParent();
      groundHolder.removeFromParent();
      disposeTree(root);
      disposeTree(groundHolder);
      discGeo.dispose();
      noise.dispose();
      if (severanceLink.controller === controller) severanceLink.controller = null;
    },
  };
  severanceLink.controller = controller;
  return controller;
}
