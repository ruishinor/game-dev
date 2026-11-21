// Scrapyard effect layers (presentation only), built from the shared engines:
// the Severance Gate's noise-driven shader fields and conforming ground discs,
// the scene-colour grab for real heat refraction (vfx/scene-color.js), and
// GPU-evaluated particles and ribbons (no per-frame CPU work beyond uniforms).
//
//   haze      heat refraction columns above the chimney and before the forge mouth
//   fire      a flame sheet inside the forge mouth
//   slag      a molten channel running from the forge to the quench tank
//   scorch    terrain-conforming scorched ground with breathing ember cracks
//   sparks    welding spark fountains (ballistic, gravity, streaked) at the gantry
//   arcs      flickering electrical arcs between the hoist and the carcass core
//   beam      the mast floodlight cone at night, with drifting dust
// Every layer is bounded (fixed geometry, one draw call) and quality-gated.
import { noiseTexture } from './severance-gate.js';
import { sceneColor, sceneColorUniforms } from './vfx/scene-color.js';

const NOISE_GLSL = /* glsl */`uniform sampler2D uNoise; float nz(vec2 p){ return texture2D(uNoise, p).r; } float nz2(vec2 p){ return texture2D(uNoise, p).g; }`;
const VS_UV = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// cylindrical billboard (faces the camera about +y), for haze and fire sheets
const VS_BILL = /* glsl */`
varying vec2 vUv; varying vec4 vClip;
void main(){
  vUv = uv;
  vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 toCam = cameraPosition - c; toCam.y = 0.0; toCam = normalize(toCam + 1e-5);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  vec3 sx = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), 0.0);
  vec3 w = c + right * position.x * sx.x + vec3(0.0, 1.0, 0.0) * position.y * sx.y;
  vClip = projectionMatrix * viewMatrix * vec4(w, 1.0);
  gl_Position = vClip;
}`;
const HAZE_FS = /* glsl */`
${NOISE_GLSL}
uniform sampler2D uScene; uniform float uSceneOn; uniform float uTime; uniform float uK;
varying vec2 vUv; varying vec4 vClip;
void main(){
  if (uSceneOn < 0.5) discard;
  float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x) * smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
  vec2 n = vec2(nz(vUv * vec2(1.4, 0.9) + vec2(0.0, -uTime * 0.55)), nz2(vUv * vec2(1.7, 1.1) + vec2(0.3, -uTime * 0.7))) - 0.5;
  vec2 suv = vClip.xy / vClip.w * 0.5 + 0.5 + n * 0.022 * uK * edge;
  vec3 c = texture2D(uScene, clamp(suv, vec2(0.001), vec2(0.999))).rgb;
  gl_FragColor = vec4(c * (1.0 + 0.04 * edge * uK), edge * 0.95);
}`;
const FIRE_FS = /* glsl */`
${NOISE_GLSL}
uniform float uTime; uniform float uK;
varying vec2 vUv; varying vec4 vClip;
void main(){
  vec2 p = vUv;
  float n = nz(vec2(p.x * 1.6, p.y * 0.8 - uTime * 0.9)) * 0.6 + nz2(vec2(p.x * 3.2 + 0.4, p.y * 1.7 - uTime * 1.6)) * 0.4;
  float shape = smoothstep(0.0, 0.3, p.x) * smoothstep(1.0, 0.7, p.x);
  float flame = smoothstep(0.15, 0.9, n * shape * 1.4 - p.y * 0.85 + 0.25);
  vec3 c = mix(vec3(0.9, 0.18, 0.02), vec3(1.0, 0.85, 0.45), flame * flame);
  float a = flame * uK;
  if (a < 0.01) discard;
  gl_FragColor = vec4(c * a * 2.2, a);
}`;
const SLAG_FS = /* glsl */`
${NOISE_GLSL}
uniform float uTime; uniform float uK;
varying vec2 vUv;
void main(){
  float across = abs(vUv.y - 0.5) * 2.0;
  float flow = nz(vec2(vUv.x * 2.5 - uTime * 0.12, vUv.y * 0.7)) * 0.65 + nz2(vec2(vUv.x * 6.0 - uTime * 0.3, vUv.y * 1.6)) * 0.35;
  float crust = smoothstep(0.5, 0.75, flow);
  float hot = (1.0 - smoothstep(0.35, 1.0, across)) * (1.0 - crust * 0.85);
  vec3 c = mix(vec3(0.08, 0.05, 0.04), mix(vec3(0.85, 0.2, 0.03), vec3(1.0, 0.7, 0.3), hot * hot), hot);
  float a = (1.0 - smoothstep(0.8, 1.0, across)) * smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
  gl_FragColor = vec4(c * (0.8 + 2.4 * hot * uK), a);
}`;
const SCORCH_FS = /* glsl */`
${NOISE_GLSL}
uniform float uTime; uniform float uK;
varying vec2 vUv;
void main(){
  vec2 p = (vUv - 0.5) * 2.0; float r = length(p);
  float soot = (1.0 - smoothstep(0.25, 1.0, r + (nz(vUv * 2.2) - 0.5) * 0.35));
  // ember crack network: thin ridges of noise near the forge, breathing
  float n = nz(vUv * 5.0 + 0.3) * 0.6 + nz2(vUv * 11.0) * 0.4;
  float crack = pow(1.0 - abs(n * 2.0 - 1.0), 18.0) * (1.0 - smoothstep(0.1, 0.65, r));
  float breathe = 0.6 + 0.4 * sin(uTime * 1.3 + n * 9.0);
  vec3 c = vec3(0.04, 0.03, 0.025) * soot + vec3(1.0, 0.38, 0.08) * crack * breathe * uK * 2.6;
  gl_FragColor = vec4(c, soot * 0.8 + crack * 0.6);
}`;
// sparks: each instance is one spark; a burst repeats every uPeriod with a per-
// spark seed for direction/speed; position is the ballistic arc at its age
const SPARK_VS = /* glsl */`
attribute vec4 aSeed;
uniform float uTime; uniform float uPeriod; uniform float uMotion; uniform vec3 uDir;
varying float vA; varying vec2 vQ;
void main(){
  float cycle = floor((uTime + aSeed.w * 0.25) / uPeriod);
  float age = mod(uTime + aSeed.w * 0.25, uPeriod);
  float h = fract(sin(cycle * 17.13 + aSeed.x * 91.7) * 4375.85);
  float live = 0.35 + 0.65 * aSeed.y;
  float k = age / live;
  vA = (k < 1.0 ? (1.0 - k) : 0.0) * step(0.12, h) * uMotion;
  float a = aSeed.x * 6.2831 + cycle * 1.7;
  vec3 v = normalize(uDir + vec3(cos(a), 0.0, sin(a)) * (0.6 + aSeed.z)) * (2.0 + 3.5 * aSeed.y);
  vec3 p = v * age + vec3(0.0, -4.9, 0.0) * age * age;
  vec3 vel = v + vec3(0.0, -9.8, 0.0) * age;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec3 dv = (modelViewMatrix * vec4(vel, 0.0)).xyz;
  vec2 d = normalize(dv.xy + 1e-4);
  float len = 0.05 + 0.03 * length(dv.xy);
  mv.xy += d * position.y * len * 1.6 + vec2(-d.y, d.x) * position.x * 0.022;
  vQ = position.xy * 2.0;
  gl_Position = projectionMatrix * mv;
}`;
const SPARK_FS = /* glsl */`
varying float vA; varying vec2 vQ;
void main(){
  float k = vA * (1.0 - smoothstep(0.4, 1.0, abs(vQ.x)));
  if (k < 0.01) discard;
  gl_FragColor = vec4(vec3(1.0, 0.75, 0.35) * k * 2.5, k);
}`;
// arcs: procedural jagged ribbons between two points, re-struck in steps
const ARC_VS = /* glsl */`
${NOISE_GLSL}
attribute vec2 aArc; attribute float aS;
uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform float uK;
varying float vA; varying float vS;
vec3 at(float s){
  float strike = floor(uTime * 9.0 + aArc.x * 3.0);
  vec3 p = mix(uA, uB, s);
  float amp = sin(3.14159 * s) * 0.14;
  p.x += (nz(vec2(s * 2.1, strike * 0.137 + aArc.x)) - 0.5) * amp * 2.0;
  p.y += (nz2(vec2(s * 2.1, strike * 0.211 + aArc.x)) - 0.5) * amp * 2.0;
  p.z += (nz(vec2(s * 1.7 + 0.5, strike * 0.071)) - 0.5) * amp * 2.0;
  return p;
}
void main(){
  float s = aArc.y;
  vec3 p = at(s), t = at(min(1.0, s + 0.03)) - at(max(0.0, s - 0.03));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec3 tv = (modelViewMatrix * vec4(t, 0.0)).xyz;
  vec3 side = normalize(cross(normalize(tv + 1e-5), normalize(-mv.xyz)));
  mv.xyz += side * aS * 0.02;
  float on = step(0.3, fract(sin(floor(uTime * 9.0 + aArc.x * 3.0) * 12.9898) * 43758.5));
  vA = on * uK; vS = aS;
  gl_Position = projectionMatrix * mv;
}`;
const ARC_FS = /* glsl */`
varying float vA; varying float vS;
void main(){ float k = vA * exp(-vS * vS * 5.0); if (k < 0.01) discard; gl_FragColor = vec4(vec3(0.55, 0.85, 1.0) * k * 2.0, k); }`;
const BEAM_FS = /* glsl */`
${NOISE_GLSL}
uniform float uTime; uniform float uK;
varying vec2 vUv;
void main(){
  float along = vUv.y;          // 0 at the lamp, 1 at the far end
  float across = abs(vUv.x - 0.5) * 2.0;
  float core = exp(-across * across * 3.0) * (1.0 - along) * (1.0 - along * 0.4);
  float dust = 0.7 + 0.3 * nz(vec2(vUv.x * 3.0 + uTime * 0.03, along * 2.0 - uTime * 0.05));
  float k = core * dust * uK * 0.4;
  gl_FragColor = vec4(vec3(1.0, 0.86, 0.62) * k, k);
}`;

/** Piece-local Blender (x, y, z-up) -> world, for a placed piece {x, z, yaw}. */
export function pieceToWorld(piece, ground, bx, by, bz) {
  const lx = bx, ly = bz, lz = -by, c = Math.cos(piece.yaw), s = Math.sin(piece.yaw);
  const x = piece.x + lx * c + lz * s, z = piece.z - lx * s + lz * c;
  return { x, y: ground(piece.x, piece.z) + ly, z };
}

export function createCampFx(T, { root, ground, pieces }) {
  const noise = noiseTexture(T, 128, 4021);
  const forge = pieces.find((p) => p.piece === 'CK_Forge');
  const gantry = pieces.find((p) => p.piece === 'CK_Gantry');
  const mast = pieces.find((p) => p.piece === 'CK_Mast');
  const u = { uTime: { value: 0 }, uK: { value: 1 }, uNoise: { value: noise } };
  const owned = [noise];
  const add = (mesh, name, order) => { mesh.name = 'camp-fx:' + name; mesh.renderOrder = order; root.add(mesh); owned.push(mesh.geometry, mesh.material); return mesh; };

  // heat haze: chimney plume and forge mouth (scene refraction)
  const sc = sceneColorUniforms(T);
  const hazeU = { ...u, uScene: { value: sc.uScene.value }, uSceneOn: { value: 0 } };
  const hazeMat = new T.ShaderMaterial({ uniforms: hazeU, vertexShader: VS_BILL, fragmentShader: HAZE_FS, transparent: true, depthWrite: false });
  const hazes = [];
  for (const [bx, by, bz, w, h] of [[0.2, 0.35, 4.3, 1.3, 3.2], [0, -0.75, 0.75, 1.0, 1.2]]) {
    const at = pieceToWorld(forge, ground, bx, by, bz);
    const g = new T.PlaneGeometry(1, 1); g.translate(0, 0.5, 0);
    const m = add(new T.Mesh(g, hazeMat), 'haze', 11);
    m.position.set(at.x, at.y, at.z); m.scale.set(w, h, 1); m.frustumCulled = false;
    m.onBeforeRender = (renderer) => {
      const gr = sceneColor(T, renderer);
      hazeU.uSceneOn.value = gr.grab(renderer) ? 1 : 0;
      hazeU.uScene.value = gr.uniforms.uScene.value;
    };
    hazes.push(m);
  }

  // flame sheet inside the forge mouth
  const mouth = pieceToWorld(forge, ground, 0, -0.5, 0.62);
  const fire = add(new T.Mesh(new T.PlaneGeometry(1, 1).translate(0, 0.5, 0), new T.ShaderMaterial({ uniforms: u, vertexShader: VS_BILL, fragmentShader: FIRE_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending })), 'fire', 9);
  fire.position.set(mouth.x, mouth.y, mouth.z); fire.scale.set(0.62, 0.42, 1); fire.frustumCulled = false;

  // molten slag channel from the forge front toward the quench tank
  const a0 = pieceToWorld(forge, ground, 0.1, -0.9, 0), a1 = pieceToWorld(forge, ground, -1.05, -2.2, 0);
  const len = Math.hypot(a1.x - a0.x, a1.z - a0.z);
  const slagGeo = new T.PlaneGeometry(len, 0.5, 16, 1); slagGeo.rotateX(-Math.PI / 2);
  const slag = add(new T.Mesh(slagGeo, new T.ShaderMaterial({ uniforms: u, vertexShader: VS_UV, fragmentShader: SLAG_FS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 })), 'slag', 5);
  slag.position.set((a0.x + a1.x) / 2, Math.max(ground(a0.x, a0.z), ground(a1.x, a1.z)) + 0.04, (a0.z + a1.z) / 2);
  slag.rotation.y = -Math.atan2(a1.z - a0.z, a1.x - a0.x);

  // scorched ground around the forge, conforming to the terrain
  const R = 4.2, sg = new T.PlaneGeometry(R * 2, R * 2, 18, 18); sg.rotateX(-Math.PI / 2);
  const sp = sg.attributes.position, fy = ground(forge.x, forge.z);
  for (let i = 0; i < sp.count; i++) sp.setY(i, ground(forge.x + sp.getX(i), forge.z + sp.getZ(i)) - fy + 0.05);
  const scorch = add(new T.Mesh(sg, new T.ShaderMaterial({ uniforms: u, vertexShader: VS_UV, fragmentShader: SCORCH_FS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })), 'scorch', 4);
  scorch.position.set(forge.x, fy, forge.z);

  // welding sparks at the carcass on the gantry
  const N = 70, quad = new T.PlaneGeometry(1, 1), sgeo = new T.InstancedBufferGeometry();
  sgeo.index = quad.index; sgeo.setAttribute('position', quad.getAttribute('position'));
  const seeds = new Float32Array(N * 4); let rs = 777;
  for (let i = 0; i < seeds.length; i++) seeds[i] = (rs = (rs * 16807) % 2147483647) / 2147483647;
  sgeo.setAttribute('aSeed', new T.InstancedBufferAttribute(seeds, 4)); sgeo.instanceCount = N;
  const sparkU = { uTime: u.uTime, uPeriod: { value: 0.9 }, uMotion: { value: 1 }, uDir: { value: new T.Vector3(0.3, 1, 0.2) } };
  const sparks = add(new T.Mesh(sgeo, new T.ShaderMaterial({ uniforms: sparkU, vertexShader: SPARK_VS, fragmentShader: SPARK_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending })), 'sparks', 10);
  const weld = pieceToWorld(gantry, ground, 0.55, -0.4, 1.35);
  sparks.position.set(weld.x, weld.y, weld.z); sparks.frustumCulled = false;

  // electrical arcs: hoist hook -> carcass core
  const S = 18, F = 3, aArc = [], aS = [], pos = [], idx = [];
  for (let f = 0; f < F; f++) {
    for (let s = 0; s <= S; s++) for (const side of [-1, 1]) { aArc.push(f * 0.37, s / S); aS.push(side); pos.push(0, 0, 0); }
    const o = f * (S + 1) * 2;
    for (let s = 0; s < S; s++) { const k = o + s * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const ag = new T.BufferGeometry();
  ag.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  ag.setAttribute('aArc', new T.Float32BufferAttribute(aArc, 2));
  ag.setAttribute('aS', new T.Float32BufferAttribute(aS, 1));
  ag.setIndex(idx);
  const hook = pieceToWorld(gantry, ground, 0.3, 0, 1.65), core = pieceToWorld(gantry, ground, 0.2, -0.05, 1.95);
  const arcU = { ...u, uA: { value: new T.Vector3(0, 0, 0) }, uB: { value: new T.Vector3(core.x - hook.x, core.y - hook.y, core.z - hook.z) } };
  const arcs = add(new T.Mesh(ag, new T.ShaderMaterial({ uniforms: arcU, vertexShader: ARC_VS, fragmentShader: ARC_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide })), 'arcs', 10);
  arcs.position.set(hook.x, hook.y, hook.z); arcs.frustumCulled = false;

  // mast floodlight cone (night): a long tapered quad pair crossing along the beam
  const lamp = pieceToWorld(mast, ground, 0.35, 0, 8.4);
  const target = { x: forge.x * 0.5 + gantry.x * 0.5, y: ground(forge.x, forge.z), z: forge.z * 0.5 + gantry.z * 0.5 };
  const bl = Math.hypot(target.x - lamp.x, target.y - lamp.y, target.z - lamp.z);
  const beamGroup = new T.Group(); beamGroup.name = 'camp-fx:beam';
  const beamMat = new T.ShaderMaterial({ uniforms: u, vertexShader: VS_UV, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
  owned.push(beamMat);
  for (const rot of [0, Math.PI / 2]) {
    const g = new T.BufferGeometry();
    // a trapezoid: 0.3 m wide at the lamp, 4.5 m wide at the ground
    g.setAttribute('position', new T.Float32BufferAttribute([-0.15, 0, 0, 0.15, 0, 0, -2.25, -bl, 0, 2.25, -bl, 0], 3));
    g.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
    g.setIndex([0, 2, 1, 1, 2, 3]);
    g.rotateY(rot);
    owned.push(g);
    const m = new T.Mesh(g, beamMat); m.renderOrder = 12; m.frustumCulled = false;
    beamGroup.add(m);
  }
  beamGroup.position.set(lamp.x, lamp.y, lamp.z);
  // the beam geometry runs along local -y; turn -y onto the lamp->target direction
  beamGroup.quaternion.setFromUnitVectors(new T.Vector3(0, -1, 0), new T.Vector3(target.x - lamp.x, target.y - lamp.y, target.z - lamp.z).normalize());
  root.add(beamGroup);

  return {
    layers: { hazes, fire, slag, scorch, sparks, arcs, beam: beamGroup },
    update(dt, t, { night = false, quality = 2, reducedMotion = false } = {}) {
      u.uTime.value = reducedMotion ? 0 : t;
      sparkU.uMotion.value = reducedMotion ? 0 : 1;
      const q = quality;
      for (const h of hazes) h.visible = q >= 2 && !reducedMotion;
      fire.visible = slag.visible = scorch.visible = q >= 1;
      sparks.visible = arcs.visible = q >= 1 && !reducedMotion;
      beamGroup.visible = night && q >= 1;
      u.uK.value = night ? 1.25 : 0.85;
    },
    dispose() {
      for (const x of owned) x?.dispose?.();
      beamGroup.removeFromParent();
      for (const h of hazes) h.removeFromParent();
    },
  };
}
