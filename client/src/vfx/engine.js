// Presentation-only effect engine. THREE is injected (browser import map or the
// node package in tests). Nothing here reads or changes simulation state: every
// effect is started by the caller from an authoritative event and expires on
// its own.
//
// Draw cost is bounded by construction:
//   - two instanced particle systems (additive + alpha), one draw call each,
//     with a hard capacity; emission beyond capacity is dropped
//   - at most MAX_ITEMS pooled shader meshes; the oldest is retired first
//   - a fixed number of flash lights created once (never added later, so no
//     shader recompiles mid-fight); none at all below quality 2
import { CELL } from './textures.js';

export const MAX_ITEMS = 40;
export const CAPACITY = { add: 1800, alpha: 420 };
export const MAX_AREAS = 16;
export const MAX_AURAS = 48;
export const MAX_TIMELINES = 24;
export const shieldEnvelope = (height = 1.9) => Math.max(1.7, height * 1.12);
const STRIDE = 30;
const TAU = Math.PI * 2;

// Shader colours are written as given (display sRGB); these shaders skip tone
// mapping on purpose so emissive cores stay saturated against a tone-mapped scene.
const rgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
export const hot = (hex, k = 0.55) => {
  const [r, g, b] = rgb(hex);
  const m = (c) => Math.round((c + (1 - c) * k) * 255);
  return (m(r) << 16) | (m(g) << 8) | m(b);
};

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Resolve a point given as [x,y,z], {x,y,z} or a function returning either. Null if invalid. */
export function point(p) {
  if (typeof p === 'function') p = p();
  if (!p) return null;
  const v = Array.isArray(p) ? p : [p.x, p.y, p.z];
  if (v.length !== 3 || !v.every((n) => Number.isFinite(n) && Math.abs(n) < 1e5)) return null;
  return [v[0], v[1], v[2]];
}
const finitePos = (x, max = 200) => Number.isFinite(x) && x > 0 && x <= max;
const range = (r, v) => (Array.isArray(v) ? v[0] + (v[1] - v[0]) * r() : v);

// --- shaders --------------------------------------------------------------------

const PARTICLE_VS = `
attribute vec3 iPos; attribute vec3 iVel; attribute vec4 iCol; attribute vec4 iMisc;
uniform float cells;
varying vec2 vUv; varying vec4 vCol;
void main(){
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  float size = iMisc.x;
  vec2 ax = vec2(cos(iMisc.z), sin(iMisc.z));
  float st = 1.0;
  if (iMisc.w > 0.0) {
    vec2 sv = (viewMatrix * vec4(iVel, 0.0)).xy;
    float sp = length(sv);
    if (sp > 1e-4) { ax = sv / sp; st = 1.0 + iMisc.w * sp; }
  }
  vec2 ay = vec2(-ax.y, ax.x);
  mv.xy += ax * position.x * size * st + ay * position.y * size;
  gl_Position = projectionMatrix * mv;
  float cell = iMisc.y;
  vec2 c = vec2(mod(cell, cells), cells - 1.0 - floor(cell / cells));
  vUv = (c + position.xy + 0.5) / cells;
  vCol = iCol;
}`;
const PARTICLE_FS = `
uniform sampler2D map;
varying vec2 vUv; varying vec4 vCol;
void main(){
  vec4 t = texture2D(map, vUv);
  float a = t.a * vCol.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol.rgb * t.rgb, a);
}`;

const DECAL_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const ROT = `vec2 rot(vec2 p, float a){ float c = cos(a), s = sin(a); return vec2(c*p.x - s*p.y, s*p.x + c*p.y); }`;
const SIGIL_FS = `
uniform sampler2D sigil; uniform vec3 color; uniform float alpha, spinA, spinB, prog, hot;
varying vec2 vUv;
${ROT}
void main(){
  vec2 p = vUv - 0.5; float r = length(p) * 2.0;
  if (r > 1.0) discard;
  float o = texture2D(sigil, rot(p, spinA) + 0.5).r;
  float n = texture2D(sigil, rot(p, spinB) + 0.5).g;
  float w = texture2D(sigil, p + 0.5).b;
  float vis = 1.0 - smoothstep(prog - 0.06, prog, r);
  float edgeDistance = (r - prog) * 14.0;
  float front = exp(-edgeDistance * edgeDistance) * hot;
  float line = max(o, n);
  float a = clamp(line * 0.95 + w * 0.3 + front * 0.8, 0.0, 1.0) * vis * alpha;
  vec3 c = mix(color, vec3(1.0), clamp(line * hot * 0.45 + front * 0.5, 0.0, 1.0));
  gl_FragColor = vec4(c, a);
}`;
const SHOCK_FS = `
uniform sampler2D noise; uniform vec3 color; uniform float alpha, prog, width, t, filaments;
varying vec2 vUv;
void main(){
  vec2 p = vUv - 0.5; float r = length(p) * 2.0;
  if (r > 1.0) discard;
  float angle = atan(p.y, p.x + 0.00001);
  float n = texture2D(noise, vec2(angle / 6.2831853 * 3.0, r * 0.6 - t * 0.35)).r;
  float offset = filaments * (sin(angle * 11.0) * 0.009 + (n - 0.5) * 0.017);
  float d = (r - prog - offset) / width;
  float ring = exp(-d * d * 3.0);
  float inside = (1.0 - smoothstep(prog - width * 2.5, prog, r)) * step(r, prog) * 0.18;
  float crest = exp(-d * d * 27.0);
  float echo = exp(-pow(abs(d + 1.1 + 0.25 * sin(angle * 13.0)), 2.0) * 14.0);
  float segment = smoothstep(0.42, 0.68, n + sin(angle * 17.0) * 0.16);
  float layered = ring * 0.32 + crest * (0.28 + segment * 0.45) + echo * segment * 0.42;
  float a = (mix(ring * (0.45 + n), layered, filaments) + inside * n) * alpha;
  gl_FragColor = vec4(mix(color, vec3(1.0), mix(ring * ring * 0.55, crest * 0.75, filaments)), clamp(a, 0.0, 1.0));
}`;
const SCORCH_FS = `
uniform sampler2D crack; uniform vec3 color; uniform float alpha, heat;
varying vec2 vUv;
void main(){
  vec2 p = vUv - 0.5; float r = length(p) * 2.0;
  if (r > 1.0) discard;
  vec4 c = texture2D(crack, vUv);
  float edge = 1.0 - smoothstep(0.6, 1.0, r);
  float glow = c.r * edge * heat;
  float dark = c.g * edge * 0.8 + c.r * edge * 0.5;
  vec3 col = mix(vec3(0.035, 0.03, 0.028), mix(color, vec3(1.0, 0.95, 0.8), glow * 0.4), clamp(glow * 1.6, 0.0, 1.0));
  gl_FragColor = vec4(col, clamp(dark + glow, 0.0, 1.0) * alpha);
}`;
const HAZARD_FS = `
uniform sampler2D sigil; uniform float alpha, fill, t, motion;
varying vec2 vUv;
${ROT}
void main(){
  vec2 p = vUv - 0.5; float r = length(p) * 2.0;
  if (r > 1.0) discard;
  float o = texture2D(sigil, rot(p, t * 0.35 * motion) + 0.5).r;
  float n = texture2D(sigil, rot(p, -t * 0.6 * motion) + 0.5).g;
  float filled = 1.0 - smoothstep(fill - 0.015, fill, r);
  float front = exp(-pow((r - fill) * 30.0, 2.0));
  float pulse = 0.72 + 0.28 * sin(t * 11.0) * motion;
  float rim = smoothstep(0.9, 0.985, r);
  float a = 0.13 + filled * 0.22 + front * 0.55 + o * 0.55 * pulse + n * 0.35 + rim * 0.5 * pulse;
  vec3 c = mix(vec3(0.95, 0.16, 0.1), vec3(1.0, 0.62, 0.25), clamp(front + o * 0.4, 0.0, 1.0));
  gl_FragColor = vec4(c, clamp(a, 0.0, 0.92) * alpha);
}`;
const BEAM_VS = `
uniform vec3 A, B, bend; uniform float width, t, jitter, taper, seed;
varying vec2 vUv;
float h(float n){ return fract(sin(n) * 43758.5453); }
void main(){
  float u = position.x, side = position.y;
  vec3 P = mix(A, B, u) + bend * 4.0 * u * (1.0 - u);
  vec3 dir = normalize(B - A + vec3(1e-5));
  vec3 toCam = normalize(cameraPosition - P);
  vec3 sv = cross(dir, toCam);
  sv = length(sv) > 1e-4 ? normalize(sv) : vec3(1.0, 0.0, 0.0);
  vec3 nv = cross(sv, dir);
  float env = sin(3.14159 * u);
  float k = floor(t * 20.0); float seg = u * 14.0;
  float j0 = h(floor(seg) + k * 13.0 + seed) - 0.5, j1 = h(floor(seg) + 1.0 + k * 13.0 + seed) - 0.5;
  float j2 = h(floor(seg) * 1.7 + k * 7.0 + seed + 3.0) - 0.5, j3 = h((floor(seg) + 1.0) * 1.7 + k * 7.0 + seed + 3.0) - 0.5;
  P += (sv * mix(j0, j1, fract(seg)) + nv * mix(j2, j3, fract(seg))) * jitter * env;
  P += sv * side * width * mix(1.0, 0.3 + 0.7 * env, taper);
  vUv = vec2(u, side * 0.5 + 0.5);
  gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
}`;
const BEAM_FS = `
uniform sampler2D noise; uniform vec3 color; uniform float alpha, t, len, flow, head;
varying vec2 vUv;
void main(){
  float x = vUv.y * 2.0 - 1.0;
  float core = exp(-x * x * 26.0), halo = exp(-x * x * 3.2);
  float n = texture2D(noise, vec2(vUv.x * len * 0.35 - t * flow, vUv.y * 0.5 + t * 0.13)).r;
  float ends = smoothstep(0.0, 0.03, vUv.x) * smoothstep(1.0, 0.97, vUv.x);
  float grow = 1.0 - smoothstep(head - 0.06, head, vUv.x);
  float a = (core * (0.75 + 0.5 * n) + halo * 0.5 * n * n) * ends * grow * alpha;
  gl_FragColor = vec4(mix(color, vec3(1.0), core * 0.7), clamp(a, 0.0, 1.0));
}`;
const ARC_VS = `attribute float along; attribute float across; varying float vA; varying float vR; void main(){ vA = along; vR = across; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const ARC_FS = `
uniform sampler2D noise; uniform vec3 color; uniform float alpha, head, trail, t;
varying float vA; varying float vR;
void main(){
  float behind = head - vA;
  if (behind < 0.0 || behind > trail) discard;
  float k = 1.0 - behind / trail;
  float edge = pow(vR, 2.5);
  float n = texture2D(noise, vec2(vA * 3.0 - t * 2.0, vR * 0.7)).r;
  float a = k * k * (edge * 1.1 + 0.18) * (0.55 + 0.7 * n) * alpha;
  gl_FragColor = vec4(mix(color, vec3(1.0), edge * k * 0.8), clamp(a, 0.0, 1.0));
}`;
const SHELL_VS = `
varying vec3 vN; varying vec3 vV; varying vec2 vUv;
#ifdef IMPACT_RIPPLE
varying vec3 vLocal;
#endif
void main(){
  vUv = uv;
  #ifdef IMPACT_RIPPLE
  vLocal = position;
  #endif
  vec4 q = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal); vV = -q.xyz; gl_Position = projectionMatrix * q;
}`;
const SHELL_FS = `
uniform sampler2D noise; uniform vec3 color; uniform float alpha, t, hex, flow, vfade, streak;
varying vec3 vN; varying vec3 vV; varying vec2 vUv;
#ifdef IMPACT_RIPPLE
uniform vec3 impactDirection; uniform float ripple;
varying vec3 vLocal;
#endif
float hexDistance(vec2 p){ p = abs(p); return max(dot(p, vec2(0.8660254, 0.5)), p.y); }
void main(){
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
  float n = texture2D(noise, vec2(vUv.x * 4.0, vUv.y * 1.2 - t * flow)).r;
  vec2 hp = vUv * vec2(22.0, 9.0); vec2 period = vec2(1.7320508, 1.0);
  vec2 a1 = mod(hp, period) - period * 0.5; vec2 b1 = mod(hp - period * 0.5, period) - period * 0.5;
  vec2 hh = dot(a1, a1) < dot(b1, b1) ? a1 : b1;
  float cell = 1.0 - smoothstep(0.02, 0.07, abs(hexDistance(hh.yx) - 0.5));
  #ifdef IMPACT_RIPPLE
  float distanceToHit = 1.0 - dot(normalize(vLocal), impactDirection);
  float d = (distanceToHit - ripple) / 0.055;
  float leading = exp(-d * d * 2.4);
  float echo = exp(-(d + 2.15) * (d + 2.15) * 2.0) * 0.4;
  float cells = cell * (1.0 - smoothstep(0.04, 0.16, abs(distanceToHit - ripple)));
  float contact = exp(-distanceToHit * 29.0) * (1.0 - smoothstep(0.01, 0.16, ripple));
  float intensity = (leading * 0.54 + echo * 0.35 + cells * 0.31 + contact * 0.42) * alpha;
  if (intensity < 0.004) discard;
  gl_FragColor = vec4(mix(color, vec3(0.86, 0.96, 1.0), clamp(leading + contact, 0.0, 0.71)), intensity);
  #else
  float v = mix(1.0, 1.0 - vUv.y, vfade);
  float a = (f * 0.95 + pow(n, 3.0) * streak * 0.6 + cell * hex * (0.2 + 0.6 * n)) * v * alpha;
  gl_FragColor = vec4(mix(color, vec3(1.0), f * f * 0.45), clamp(a, 0.0, 1.0));
  #endif
}`;

// --- engine ---------------------------------------------------------------------

export function createVfx(THREE, scene, options = {}) {
  const { textures = null, groundHeight = null, seed = 7 } = options;
  let quality = options.quality ?? 2;
  let reduced = !!options.reducedMotion;
  let disposed = false;
  const rand = mulberry(seed);
  const root = new THREE.Group();
  root.name = 'vfx-engine';
  scene.add(root);
  const blank = textures ? null : new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  if (blank) blank.needsUpdate = true;
  const T = {
    atlas: textures?.atlas || blank,
    crack: textures?.crack || blank,
    noise: textures?.noise || blank,
    sigil: (s) => textures?.sigils?.[s] || blank,
  };
  const stats = { emitted: 0, dropped: 0, retired: 0 };

  // Particles ---------------------------------------------------------------------
  function particlePool(capacity, blending) {
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    const attr = (n) => new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n).setUsage(THREE.DynamicDrawUsage);
    const a = { iPos: attr(3), iVel: attr(3), iCol: attr(4), iMisc: attr(4) };
    for (const [k, v] of Object.entries(a)) geo.setAttribute(k, v);
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: T.atlas }, cells: { value: 4 } },
      vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS,
      transparent: true, depthWrite: false, depthTest: true, blending, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = blending === THREE.AdditiveBlending ? 6 : 5;
    mesh.name = 'vfx-particles';
    root.add(mesh);
    return { capacity, data: new Float32Array(capacity * STRIDE), live: 0, geo, mat, mesh, a, quad };
  }
  const pools = { add: particlePool(CAPACITY.add, THREE.AdditiveBlending), alpha: particlePool(CAPACITY.alpha, THREE.NormalBlending) };
  const budget = () => (quality >= 2 ? 1 : quality === 1 ? 0.55 : 0) * (reduced ? 0.45 : 1);

  /**
   * Emit particles. Positions are sampled from a shape around `at`.
   * shape: 'point' | 'sphere' | 'disc' | 'ring' | 'line' (from `at` to `to`)
   */
  function burst(o) {
    if (disposed || quality <= 0) return 0;
    const at = point(o.at);
    if (!at) return 0;
    const to = o.shape === 'line' ? point(o.to) : null;
    if (o.shape === 'line' && !to) return 0;
    const pool = pools[o.blend === 'alpha' ? 'alpha' : 'add'];
    const n = Math.min(400, Math.max(0, Math.round((o.count ?? 8) * (o.exact ? 1 : budget()))));
    const c0 = rgb(o.color ?? 0xffffff);
    const c1 = rgb(o.color2 ?? o.color ?? 0xffffff);
    const dir = point(o.dir) || [0, 1, 0];
    const dl = Math.hypot(...dir) || 1;
    const d = dir.map((x) => x / dl);
    const spread = o.spread ?? Math.PI;
    const radius = o.radius ?? 0;
    const attract = point(o.attract);
    let made = 0;
    for (let i = 0; i < n; i++) {
      if (pool.live >= pool.capacity) {
        stats.dropped += n - i;
        break;
      }
      const f = pool.data;
      const j = pool.live++ * STRIDE;
      // position
      let px = at[0];
      let py = at[1];
      let pz = at[2];
      const ang = rand() * TAU;
      if (o.shape === 'sphere') {
        const u = rand() * 2 - 1;
        const s = Math.sqrt(1 - u * u);
        const rr = radius * Math.cbrt(rand());
        px += Math.cos(ang) * s * rr;
        py += u * rr;
        pz += Math.sin(ang) * s * rr;
      } else if (o.shape === 'disc' || o.shape === 'ring') {
        const rr = o.shape === 'ring' ? radius * (0.92 + rand() * 0.08) : radius * Math.sqrt(rand());
        px += Math.cos(ang) * rr;
        pz += Math.sin(ang) * rr;
        if (groundHeight && o.ground) py = groundHeight(px, pz) + (o.lift ?? 0.08);
      } else if (to) {
        const k = rand();
        px += (to[0] - px) * k;
        py += (to[1] - py) * k;
        pz += (to[2] - pz) * k;
      }
      // velocity: a cone around dir, or radial for ring/disc with o.radial
      const speed = range(rand, o.speed ?? 1);
      let vx;
      let vy;
      let vz;
      if (o.radial && (o.shape === 'disc' || o.shape === 'ring' || o.shape === 'sphere')) {
        const dx = px - at[0];
        const dz = pz - at[2];
        const l = Math.hypot(dx, dz) || 1;
        vx = (dx / l) * speed;
        vz = (dz / l) * speed;
        vy = (o.up ?? 0.3) * speed;
      } else {
        const cosT = 1 - rand() * (1 - Math.cos(spread));
        const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
        const phi = rand() * TAU;
        // basis around d
        const ux = Math.abs(d[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
        let bx = [d[1] * ux[2] - d[2] * ux[1], d[2] * ux[0] - d[0] * ux[2], d[0] * ux[1] - d[1] * ux[0]];
        const bl = Math.hypot(...bx);
        bx = bx.map((x) => x / bl);
        const by = [d[1] * bx[2] - d[2] * bx[1], d[2] * bx[0] - d[0] * bx[2], d[0] * bx[1] - d[1] * bx[0]];
        vx = (d[0] * cosT + (bx[0] * Math.cos(phi) + by[0] * Math.sin(phi)) * sinT) * speed;
        vy = (d[1] * cosT + (bx[1] * Math.cos(phi) + by[1] * Math.sin(phi)) * sinT) * speed;
        vz = (d[2] * cosT + (bx[2] * Math.cos(phi) + by[2] * Math.sin(phi)) * sinT) * speed;
      }
      const life = Math.max(0.05, range(rand, o.life ?? 0.6));
      f[j] = px; f[j + 1] = py; f[j + 2] = pz;
      f[j + 3] = vx; f[j + 4] = vy; f[j + 5] = vz;
      f[j + 6] = 0; f[j + 7] = life;
      f[j + 8] = range(rand, o.size ?? 0.2); f[j + 9] = o.sizeEnd === undefined ? f[j + 8] : range(rand, o.sizeEnd);
      f[j + 10] = c0[0]; f[j + 11] = c0[1]; f[j + 12] = c0[2];
      f[j + 13] = c1[0]; f[j + 14] = c1[1]; f[j + 15] = c1[2];
      f[j + 16] = o.alpha ?? 1;
      f[j + 17] = Array.isArray(o.cell) ? o.cell[Math.floor(rand() * o.cell.length)] : o.cell ?? CELL.glow;
      f[j + 18] = rand() * TAU;
      f[j + 19] = reduced ? 0 : range(rand, o.spin ?? 0);
      f[j + 20] = o.stretch ?? 0;
      f[j + 21] = o.gravity ?? 0;
      f[j + 22] = o.drag ?? 0;
      f[j + 23] = attract ? attract[0] : 0; f[j + 24] = attract ? attract[1] : 0; f[j + 25] = attract ? attract[2] : 0;
      f[j + 26] = attract ? o.pull ?? 4 : 0;
      f[j + 27] = reduced ? 0 : o.swirl ?? 0;
      f[j + 28] = at[0]; f[j + 29] = at[2];
      made++;
    }
    stats.emitted += made;
    return made;
  }

  function stepPool(pool, dt) {
    const f = pool.data;
    let w = 0;
    const { iPos, iVel, iCol, iMisc } = pool.a;
    for (let r = 0; r < pool.live; r++) {
      const j = r * STRIDE;
      const age = f[j + 6] + dt;
      const life = f[j + 7];
      if (age >= life) continue;
      const k = age / life;
      // integrate
      const drag = Math.max(0, 1 - f[j + 22] * dt);
      f[j + 3] *= drag; f[j + 4] = f[j + 4] * drag - f[j + 21] * dt; f[j + 5] *= drag;
      if (f[j + 26] > 0) {
        const dx = f[j + 23] - f[j], dy = f[j + 24] - f[j + 1], dz = f[j + 25] - f[j + 2];
        const s = f[j + 26] * dt;
        f[j + 3] += dx * s; f[j + 4] += dy * s; f[j + 5] += dz * s;
      }
      if (f[j + 27] !== 0) {
        const dx = f[j] - f[j + 28], dz = f[j + 2] - f[j + 29];
        const s = f[j + 27] * dt;
        f[j + 3] += -dz * s; f[j + 5] += dx * s;
      }
      f[j] += f[j + 3] * dt; f[j + 1] += f[j + 4] * dt; f[j + 2] += f[j + 5] * dt;
      f[j + 6] = age;
      f[j + 18] += f[j + 19] * dt;
      // compact
      if (w !== r) f.copyWithin(w * STRIDE, j, j + STRIDE);
      const o = w * STRIDE;
      const env = Math.min(1, k / 0.08) * Math.pow(1 - k, 1.25);
      const ck = Math.min(1, k * 1.6);
      iPos.array[w * 3] = f[o]; iPos.array[w * 3 + 1] = f[o + 1]; iPos.array[w * 3 + 2] = f[o + 2];
      iVel.array[w * 3] = f[o + 3]; iVel.array[w * 3 + 1] = f[o + 4]; iVel.array[w * 3 + 2] = f[o + 5];
      iCol.array[w * 4] = f[o + 10] + (f[o + 13] - f[o + 10]) * ck;
      iCol.array[w * 4 + 1] = f[o + 11] + (f[o + 14] - f[o + 11]) * ck;
      iCol.array[w * 4 + 2] = f[o + 12] + (f[o + 15] - f[o + 12]) * ck;
      iCol.array[w * 4 + 3] = f[o + 16] * env;
      iMisc.array[w * 4] = f[o + 8] + (f[o + 9] - f[o + 8]) * k;
      iMisc.array[w * 4 + 1] = f[o + 17];
      iMisc.array[w * 4 + 2] = f[o + 18];
      iMisc.array[w * 4 + 3] = f[o + 20];
      w++;
    }
    pool.live = w;
    pool.geo.instanceCount = w;
    if (!w) return;
    for (const a of Object.values(pool.a)) {
      a.clearUpdateRanges?.();
      a.addUpdateRange?.(0, w * a.itemSize);
      a.needsUpdate = true;
    }
  }

  // Shader meshes -------------------------------------------------------------------
  const items = new Set();
  const shared = {
    sphere: new THREE.SphereGeometry(1, 32, 16),
    dome: new THREE.SphereGeometry(1, 32, 12, 0, TAU, 0, Math.PI / 2),
    tube: new THREE.CylinderGeometry(1, 1, 1, 32, 1, true).translate(0, 0.5, 0),
    ribbon: (() => {
      const N = 40;
      const p = [];
      const idx = [];
      for (let i = 0; i <= N; i++) p.push(i / N, -1, 0, i / N, 1, 0);
      for (let i = 0; i < N; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      g.setIndex(idx);
      return g;
    })(),
  };
  const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const col = (hex) => new THREE.Vector3(...rgb(hex));
  function material(vs, fs, uniforms, blending = THREE.AdditiveBlending, extra = {}) {
    return new THREE.ShaderMaterial({ uniforms, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, depthTest: true, blending, side: THREE.DoubleSide, ...extra });
  }
  function track(mesh, life, tick, ownGeometry = false) {
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    root.add(mesh);
    const it = queueItem({ mesh, life, age: 0, tick, ownGeometry });
    try { tick(0, 0, it); } catch { retire(it); return null; }
    return it;
  }
  function queueItem(it) {
    if (items.size >= MAX_ITEMS) retire(items.values().next().value);
    items.add(it);
    return it;
  }
  function retire(it) {
    if (!items.delete(it)) return;
    stats.retired++;
    if (it.light) it.light.intensity = 0;
    if (!it.mesh) return;
    root.remove(it.mesh);
    it.mesh.material?.dispose();
    if (it.ownGeometry) it.mesh.geometry.dispose();
  }

  /** Flat ground decal that follows the terrain when the point stands on it. */
  function decalGeometry(c, radius, lift = 0.05) {
    const seg = radius > 5 ? 28 : radius > 2 ? 18 : 10;
    const g = new THREE.PlaneGeometry(radius * 2, radius * 2, seg, seg);
    g.rotateX(-Math.PI / 2);
    const pos = g.getAttribute('position');
    const onTerrain = groundHeight && Math.abs(groundHeight(c[0], c[2]) - c[1]) < 0.4;
    for (let i = 0; i < pos.count; i++) {
      const y = onTerrain ? groundHeight(c[0] + pos.getX(i), c[2] + pos.getZ(i)) - c[1] : 0;
      pos.setY(i, y + lift);
    }
    g.computeBoundingSphere();
    return g;
  }
  function decalMesh(c, radius, mat, lift) {
    const m = new THREE.Mesh(decalGeometry(c, radius, lift), mat);
    m.position.set(c[0], c[1], c[2]);
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -2;
    mat.polygonOffsetUnits = -4;
    return m;
  }

  /** A discipline sigil drawn on the ground: grows out, rotates its two layers, fades. */
  function sigil(o) {
    if (disposed || quality <= 0) return null;
    const c = point(o.at);
    if (!c || !finitePos(o.radius, 60)) return null;
    const u = { sigil: { value: T.sigil(o.style || 'kinetic') }, color: { value: col(o.color ?? 0xffffff) }, alpha: { value: 0 }, spinA: { value: 0 }, spinB: { value: 0 }, prog: { value: 0 }, hot: { value: o.hot ?? 1 } };
    const life = o.life ?? 1.2;
    const grow = o.grow ?? 0.18;
    const spin = reduced ? 0 : o.spin ?? 0.6;
    const base = o.alpha ?? 0.9;
    const rot0 = o.rotation ?? rand() * TAU;
    return track(decalMesh(c, o.radius, material(DECAL_VS, SIGIL_FS, u), o.lift ?? 0.05), life, (k, t) => {
      u.prog.value = reduced ? 1.06 : Math.min(1.06, 0.15 + (t / Math.max(0.01, grow * life)) * 0.91);
      u.spinA.value = rot0 + t * spin;
      u.spinB.value = -rot0 - t * spin * 1.6;
      u.hot.value = (o.hot ?? 1) * Math.max(0, 1 - t / (life * 0.35));
      u.alpha.value = base * Math.min(1, k / 0.05) * (k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1);
    }, true);
  }

  function shock(o) {
    if (disposed || quality <= 0) return null;
    const c = point(o.at);
    if (!c || !finitePos(o.radius, 60)) return null;
    const u = { noise: { value: T.noise }, color: { value: col(o.color ?? 0xffffff) }, alpha: { value: 0 }, prog: { value: 0 }, width: { value: o.width ?? 0.06 }, t: { value: 0 }, filaments: { value: o.filaments ? 1 : 0 } };
    const life = o.life ?? 0.55;
    return track(decalMesh(c, o.radius * 1.08, material(DECAL_VS, SHOCK_FS, u), o.lift ?? 0.09), life, (k, t) => {
      const e = 1 - Math.pow(1 - k, 2.6);
      u.prog.value = (0.05 + e * 0.88);
      u.t.value = o.filaments && reduced ? 0 : t;
      u.alpha.value = (o.alpha ?? 1) * (1 - k);
    }, true);
  }

  function scorch(o) {
    if (disposed || quality <= 0) return null;
    const c = point(o.at);
    if (!c || !finitePos(o.radius, 30)) return null;
    const u = { crack: { value: T.crack }, color: { value: col(o.color ?? 0xff8a3a) }, alpha: { value: 0 }, heat: { value: 1 } };
    const life = o.life ?? 3;
    const m = decalMesh(c, o.radius, material(DECAL_VS, SCORCH_FS, u, THREE.NormalBlending), 0.035);
    m.rotation.y = rand() * TAU;
    return track(m, life, (k) => {
      u.heat.value = Math.max(0, 1 - k * 2.2);
      u.alpha.value = (o.alpha ?? 0.85) * Math.min(1, k / 0.03) * (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
    }, true);
  }

  function telegraph(o) {
    if (disposed || quality <= 0) return null;
    const c = point(o.at);
    if (!c || !finitePos(o.radius, 60)) return null;
    const life = Math.max(0.1, (o.ms ?? 1000) / 1000);
    const u = { sigil: { value: T.sigil('hazard') }, alpha: { value: 0 }, fill: { value: 0 }, t: { value: 0 }, motion: { value: reduced ? 0 : 1 } };
    return track(decalMesh(c, o.radius, material(DECAL_VS, HAZARD_FS, u, THREE.NormalBlending), 0.07), life, (k, t) => {
      u.fill.value = k;
      u.t.value = t;
      u.alpha.value = Math.min(1, k / 0.06);
    }, true);
  }

  /** A camera-facing energy ribbon between two (possibly moving) points. */
  function beam(o) {
    if (disposed || quality <= 0) return null;
    const a0 = point(o.from);
    const b0 = point(o.to);
    if (!a0 || !b0) return null;
    const u = {
      A: { value: v3(a0) }, B: { value: v3(b0) }, bend: { value: v3(o.bend || [0, 0, 0]) },
      width: { value: o.width ?? 0.12 }, t: { value: 0 }, jitter: { value: reduced ? 0 : o.jitter ?? 0 }, taper: { value: o.taper ?? 0.6 }, seed: { value: rand() * 100 },
      noise: { value: T.noise }, color: { value: col(o.color ?? 0xffffff) }, alpha: { value: 0 }, len: { value: 1 }, flow: { value: o.flow ?? 2.5 }, head: { value: 1.1 },
    };
    const life = o.life ?? 0.4;
    const grow = o.grow ?? 0;
    return track(new THREE.Mesh(shared.ribbon, material(BEAM_VS, BEAM_FS, u)), life, (k, t) => {
      const a = point(o.from);
      const b = point(o.to);
      if (a) u.A.value.set(...a);
      if (b) u.B.value.set(...b);
      u.len.value = u.A.value.distanceTo(u.B.value);
      u.t.value = t;
      u.head.value = grow > 0 ? Math.min(1.1, t / (grow * life)) : 1.1;
      u.alpha.value = (o.alpha ?? 1) * Math.min(1, k / 0.05) * Math.pow(1 - k, o.hold ? 0.4 : 1);
    });
  }

  const arcGeos = new Map();
  function arcGeometry(len) {
    const key = len.toFixed(2);
    if (arcGeos.has(key)) return arcGeos.get(key);
    const N = 36;
    const p = [];
    const along = [];
    const across = [];
    const idx = [];
    for (let i = 0; i <= N; i++) {
      const th = -Math.PI / 2 - len / 2 + (i / N) * len;
      for (const r of [0.45, 1]) {
        p.push(Math.cos(th) * r, 0, -Math.sin(th) * r);
        along.push(i / N);
        across.push((r - 0.45) / 0.55);
      }
    }
    for (let i = 0; i < N; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
    g.setAttribute('across', new THREE.Float32BufferAttribute(across, 1));
    g.setIndex(idx);
    arcGeos.set(key, g);
    return g;
  }
  /** A swept crescent (melee strike) around `at`, facing yaw, rolled by `tilt`. */
  function arc(o) {
    if (disposed || quality <= 0) return null;
    const c = point(o.at);
    if (!c || !finitePos(o.radius, 10) || !Number.isFinite(o.yaw ?? 0)) return null;
    const len = Math.min(TAU, Math.max(0.3, o.sweep ?? 2.4));
    const u = { noise: { value: T.noise }, color: { value: col(o.color ?? 0xffffff) }, alpha: { value: 0 }, head: { value: 0 }, trail: { value: o.trail ?? 0.55 }, t: { value: 0 } };
    const m = new THREE.Mesh(arcGeometry(len), material(ARC_VS, ARC_FS, u));
    m.position.set(...c);
    m.rotation.set(0, o.yaw ?? 0, 0, 'YXZ');
    m.rotateZ(o.tilt ?? 0.35);
    m.scale.setScalar(o.radius);
    const life = o.life ?? 0.32;
    const dir = (o.reverse ? -1 : 1);
    return track(m, life, (k, t) => {
      const h = Math.min(1, k / 0.6) * (1 + u.trail.value);
      u.head.value = dir > 0 ? h : 1 - h + u.trail.value;
      u.t.value = t;
      u.alpha.value = (o.alpha ?? 1) * (k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
    });
  }

  /** Fresnel shell: 'sphere' | 'dome' | 'wall' (open cylinder fading up) | 'pillar'. */
  function shell(o) {
    if (disposed || quality <= 0) return null;
    const c0 = point(o.at);
    if (!c0 || !finitePos(o.radius, 60)) return null;
    const kind = o.kind || 'sphere';
    const geo = kind === 'dome' ? shared.dome : kind === 'sphere' ? shared.sphere : shared.tube;
    const impact = (kind === 'sphere' || kind === 'dome') && point(o.impactDirection);
    const u = { noise: { value: T.noise }, color: { value: col(o.color ?? 0xffffff) }, alpha: { value: 0 }, t: { value: 0 }, hex: { value: o.hex ?? 0 }, flow: { value: reduced ? 0 : o.flow ?? 0.6 }, vfade: { value: kind === 'wall' || kind === 'pillar' ? 1 : 0 }, streak: { value: o.streak ?? 0.6 } };
    if (impact) {
      u.impactDirection = { value: v3(impact).normalize() };
      u.ripple = { value: 0 };
    }
    const m = new THREE.Mesh(geo, material(SHELL_VS, SHELL_FS, u, THREE.AdditiveBlending,
      impact ? { defines: { IMPACT_RIPPLE: 1 }, side: THREE.FrontSide } : {}));
    const life = o.life ?? 0.8;
    const from = o.from ?? (kind === 'pillar' ? 1 : 0.35);
    const to = o.to ?? 1;
    const h = o.height ?? o.radius;
    return track(m, life, (k, t) => {
      const c = point(o.at) || c0;
      m.position.set(...c);
      const e = 1 - Math.pow(1 - Math.min(1, k / (o.growPart ?? 0.35)), 3);
      const r = o.radius * (from + (to - from) * e);
      if (kind === 'wall' || kind === 'pillar') m.scale.set(r, h * (kind === 'wall' ? 1 - 0.5 * k : 0.6 + 0.4 * e), r);
      else m.scale.setScalar(r);
      u.t.value = t;
      if (impact) u.ripple.value = reduced ? 0.08 : (1 - (1 - k) ** 2) * 0.42;
      u.alpha.value = (o.alpha ?? 0.8) * Math.min(1, k / 0.06) * (k > (o.holdUntil ?? 0.35) ? 1 - (k - (o.holdUntil ?? 0.35)) / (1 - (o.holdUntil ?? 0.35)) : 1);
    });
  }

  /**
   * A persistent ground sigil the caller owns (e.g. a deployed device's real
   * radius). Returns { set(at, radius), dispose() } or null. At most
   * MAX_AREAS exist; the caller must dispose it when the device goes away.
   */
  const areas = new Set();
  function area(o) {
    if (disposed || quality <= 0 || areas.size >= MAX_AREAS) return null;
    const c = point(o.at);
    if (!c || !finitePos(o.radius, 60)) return null;
    const u = { sigil: { value: T.sigil(o.style || 'survey') }, color: { value: col(o.color ?? 0xffffff) }, alpha: { value: o.alpha ?? 0.6 }, spinA: { value: 0 }, spinB: { value: 0 }, prog: { value: 1.06 }, hot: { value: 0 } };
    let mesh = null;
    let key = '';
    const a = {
      t: 0,
      get alive() {
        return areas.has(a) && !disposed;
      },
      set(at, radius) {
        if (!areas.has(a)) return;
        const p = point(at);
        if (!p || !finitePos(radius, 60)) return;
        const k = `${p.map((v) => v.toFixed(2)).join(',')}|${radius.toFixed(2)}`;
        if (k === key) return;
        key = k;
        if (mesh) {
          root.remove(mesh);
          mesh.geometry.dispose();
        }
        mesh = decalMesh(p, radius, mat, o.lift ?? 0.06);
        mesh.frustumCulled = false;
        mesh.renderOrder = 3;
        root.add(mesh);
      },
      dispose() {
        if (!areas.delete(a)) return;
        if (mesh) {
          root.remove(mesh);
          mesh.geometry.dispose();
        }
        mat.dispose();
      },
      tick(dt) {
        a.t += dt;
        u.spinA.value = reduced ? 0 : a.t * (o.spin ?? 0.25);
        u.spinB.value = reduced ? 0 : -a.t * (o.spin ?? 0.25) * 1.6;
      },
    };
    const mat = material(DECAL_VS, SIGIL_FS, u);
    areas.add(a);
    a.set(c, o.radius);
    return a;
  }

  /**
   * A persistent fresnel shell that follows `at` (a function) for as long as
   * the caller keeps it — a status that lasts while a buff is present.
   * Returns { alive, dispose(), set({alpha}) } or null. At most MAX_AURAS.
   */
  const auras = new Set();
  function aura(o) {
    if (disposed || quality <= 0 || auras.size >= MAX_AURAS || typeof o.at !== 'function') return null;
    const c = point(o.at);
    if (!c || !finitePos(o.radius, 8)) return null;
    const kind = o.kind === 'dome' ? 'dome' : 'sphere';
    const u = { noise: { value: T.noise }, color: { value: col(o.color ?? 0xffffff) }, alpha: { value: 0 }, t: { value: 0 }, hex: { value: o.hex ?? 0 }, flow: { value: reduced ? 0 : o.flow ?? 0.5 }, vfade: { value: 0 }, streak: { value: o.streak ?? 0.5 } };
    const mesh = new THREE.Mesh(kind === 'dome' ? shared.dome : shared.sphere, material(SHELL_VS, SHELL_FS, u));
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    mesh.scale.setScalar(o.radius);
    root.add(mesh);
    let target = o.alpha ?? 0.3;
    let age = 0;
    const a = {
      get alive() {
        return auras.has(a) && !disposed;
      },
      set(p) {
        if (Number.isFinite(p?.alpha)) target = Math.max(0, Math.min(1, p.alpha));
      },
      tick(dt) {
        age += dt;
        const at = point(o.at);
        if (at) mesh.position.set(...at);
        u.t.value = age;
        // fade in, then a slow breath (none in reduced motion)
        u.alpha.value = target * Math.min(1, age / 0.25) * (reduced ? 1 : 0.85 + 0.15 * Math.sin(age * (o.pulse ?? 2.4)));
      },
      dispose() {
        if (!auras.delete(a)) return;
        root.remove(mesh);
        mesh.material.dispose();
      },
    };
    auras.add(a);
    a.tick(0);
    return a;
  }

  // Flash lights ------------------------------------------------------------------
  const lights = [];
  if ((options.lights ?? true) && quality >= 2) {
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 8, 2);
      l.name = 'vfx-flash';
      root.add(l);
      lights.push({ l, until: 0, it: null });
    }
  }
  function flash(o) {
    if (disposed || !lights.length || quality < 2) return null;
    const c = point(o.at);
    if (!c) return null;
    const free = (s) => !items.has(s.it);
    const slot = lights.find(free) || lights.reduce((a, b) => (a.it.age > b.it.age ? a : b));
    retire(slot.it);
    const L = slot.l;
    L.position.set(...c);
    L.color.setHex(o.color ?? 0xffffff);
    L.distance = o.distance ?? 7;
    const I = (o.intensity ?? 12) * (reduced ? 0.5 : 1);
    const it = { mesh: null, light: L, life: o.life ?? 0.3, age: 0, tick: (k) => { L.intensity = I * Math.pow(1 - k, 2); } };
    slot.it = queueItem(it);
    return it;
  }

  /** Generic per-frame driver for compound effects (projectile trails etc.). */
  function emitter(o) {
    if (disposed || quality <= 0 || typeof o.tick !== 'function') return null;
    const it = { mesh: null, life: Math.max(0.02, o.life ?? 0.5), age: 0, tick: o.tick };
    return queueItem(it);
  }

  // Timelines schedule discrete layers on the presentation clock. Canceling a
  // timeline stops pending stages; emitted layers keep their own fade/lifetime.
  const timelines = new Set();
  function play(stages, context) {
    if (disposed || quality <= 0 || timelines.size >= MAX_TIMELINES || !Array.isArray(stages)
      || !stages.length || stages.length > 12) return null;
    let last = 0;
    for (const stage of stages) {
      if (!stage || !Number.isFinite(stage.at) || stage.at < last || stage.at > 8 || typeof stage.emit !== 'function') return null;
      last = stage.at;
    }
    const sequence = { age: 0, next: 0, stages: stages.map(({ at, emit }) => ({ at, emit })), context };
    timelines.add(sequence);
    advance(sequence, 0);
    return { get alive() { return timelines.has(sequence); }, cancel() { timelines.delete(sequence); } };
  }

  function advance(sequence, dt) {
    sequence.age += dt;
    const { stages, context } = sequence;
    while (timelines.has(sequence) && sequence.next < stages.length && stages[sequence.next].at <= sequence.age + 1e-8) {
      const stage = stages[sequence.next++];
      try {
        stage.emit(context);
      } catch {
        timelines.delete(sequence);
        stats.retired++;
      }
    }
    if (sequence.next === stages.length) timelines.delete(sequence);
  }

  function update(dt) {
    if (disposed) return;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.1);
    // Emitters can create layers and evict the oldest item while ticking.
    for (const it of [...items]) {
      if (!items.has(it)) continue;
      it.age += dt;
      const k = Math.min(1, it.age / it.life);
      if (!it.done) {
        try {
          it.tick(k, it.age, it, dt);
        } catch {
          it.done = true;
        }
      }
      if (k >= 1 || it.done) retire(it);
    }
    for (const a of areas) a.tick(dt);
    for (const a of auras) a.tick(dt);
    stepPool(pools.add, dt);
    stepPool(pools.alpha, dt);
    if (timelines.size) for (const sequence of [...timelines]) advance(sequence, dt);
  }

  function clear() {
    timelines.clear();
    for (const it of items) retire(it);
    for (const p of Object.values(pools)) {
      p.live = 0;
      p.geo.instanceCount = 0;
    }
  }

  function setQuality(q) {
    quality = q;
    if (q < 2) for (const s of lights) retire(s.it);
    if (q <= 0) {
      clear();
      for (const a of [...areas]) a.dispose();
      for (const a of [...auras]) a.dispose();
    }
  }

  function dispose() {
    if (disposed) return;
    clear();
    for (const a of [...areas]) a.dispose();
    for (const a of [...auras]) a.dispose();
    disposed = true;
    for (const p of Object.values(pools)) {
      p.geo.dispose();
      p.quad.dispose();
      p.mat.dispose();
    }
    for (const g of Object.values(shared)) g.dispose();
    for (const g of arcGeos.values()) g.dispose();
    blank?.dispose();
    root.removeFromParent();
  }

  return {
    root, burst, sigil, area, aura, shock, scorch, telegraph, beam, arc, shell, flash, emitter, play, update, clear, dispose, setQuality,
    rand,
    get quality() { return quality; },
    get reducedMotion() { return reduced; },
    set reducedMotion(v) { reduced = !!v; },
    stats() {
      return { ...stats, areas: areas.size, auras: auras.size, timelines: timelines.size, items: items.size, particles: pools.add.live + pools.alpha.live, lights: lights.length };
    },
  };
}
