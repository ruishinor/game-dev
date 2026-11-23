// The Silent Foundry interior: four chambers behind the Severance Gate. Layout
// and colliders come from shared/silent-foundry.js; nothing here affects play.
// Built with the gate's effect engine: shader layers (vat liquid, glass, the
// resonator core, rune floor, mineral columns), additive particle fields, a
// small pre-created light budget re-assigned by chamber, and a deterministic
// mode for captures. Lighting, fog and the sky are switched while the camera is
// inside and restored on leaving.
import { SILENT_FOUNDRY as F, FOUNDRY_LAYOUT as L, FOUNDRY_AREAS, inSilentFoundry, foundryHeight } from '../../shared/silent-foundry.js';
import { noiseTexture, particleField } from './severance-gate.js';

export const FOUNDRY_LIMITS = Object.freeze({ lights: 4, motes: 4 * 120 });
export const FOUNDRY_KIT_URL = '/client/assets/foundry_kit.glb?v=08c209d3d495';
const CEILING = 15;
const FOG = { color: 0x161b20, near: 24, far: 150 };
export const FOUNDRY_VISIBILITY = Object.freeze({
  ambientInside:1.1, guideWidth:.09, guideOpacity:.60, guideDraws:1,
  thresholdOpacity:.52, thresholdDraws:1,
  maxLocalLights:FOUNDRY_LIMITS.lights,
});

const VS = `varying vec2 vUv; varying vec3 vW; varying vec3 vN; varying float vFog;
void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
  vec4 mv = viewMatrix * w; vFog = -mv.z; gl_Position = projectionMatrix * mv; }`;
const FOG_GLSL = `uniform vec3 fogColor; uniform float fogNear, fogFar; varying float vFog;`;
// Culture liquid: slow upward flow, bright veins, a glowing meniscus.
const LIQUID_FS = `uniform sampler2D uNoise; uniform float uTime; uniform vec3 uColor; varying vec2 vUv; varying vec3 vW; ${FOG_GLSL}
void main(){ float n = texture2D(uNoise, vec2(vUv.x * 2.0, vUv.y * 1.2 - uTime * 0.05)).r;
  float m = texture2D(uNoise, vec2(vUv.x * 4.0 + uTime * 0.02, vUv.y * 2.5 - uTime * 0.11)).g;
  float vein = pow(1.0 - abs(m - 0.5) * 2.0, 6.0);
  float top = smoothstep(0.86, 1.0, vUv.y);
  vec3 c = uColor * (0.35 + 0.5 * n + 0.9 * vein) + vec3(0.8, 1.0, 0.9) * top * 0.6;
  gl_FragColor = vec4(mix(c, fogColor, smoothstep(fogNear, fogFar, vFog)), 1.0); }`;
const GLASS_FS = `uniform vec3 uColor; varying vec3 vW; varying vec3 vN; ${FOG_GLSL}
void main(){ vec3 V = normalize(cameraPosition - vW); float fr = pow(1.0 - abs(dot(normalize(vN), V)), 3.0);
  float k = 0.05 + 0.6 * fr; gl_FragColor = vec4(uColor * k, k * (1.0 - smoothstep(fogNear, fogFar, vFog))); }`;
// The resonator core: stacked bright bands climbing a dark crystal, fresnel rim.
const CORE_FS = `uniform sampler2D uNoise; uniform float uTime, uGain; varying vec2 vUv; varying vec3 vW; varying vec3 vN; ${FOG_GLSL}
void main(){ vec3 V = normalize(cameraPosition - vW); float fr = pow(1.0 - abs(dot(normalize(vN), V)), 2.2);
  float band = pow(0.5 + 0.5 * sin(vW.y * 2.2 - uTime * 3.0), 8.0);
  float n = texture2D(uNoise, vec2(vUv.x * 3.0, vW.y * 0.08 - uTime * 0.04)).r;
  float k = (0.25 + 0.9 * band + 0.8 * fr + 0.4 * n) * uGain;
  vec3 c = mix(vec3(0.1, 0.35, 0.6), vec3(0.75, 0.95, 1.0), clamp(band + fr * 0.5, 0.0, 1.0)) * k;
  gl_FragColor = vec4(mix(c, fogColor, smoothstep(fogNear, fogFar, vFog) * 0.6), 1.0); }`;
// Additive ring / disc layers: rune bands rotating about the centre.
const RUNE_FS = `uniform float uTime, uGain; uniform vec3 uColor; varying vec2 vUv;
void main(){ vec2 p = vUv * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
  float a = atan(p.y, p.x);
  float rings = pow(0.5 + 0.5 * sin(r * 34.0 - uTime * 1.5), 10.0) * smoothstep(0.25, 0.4, r);
  float glyph = step(0.6, fract(a * 6.0 / 3.14159 + uTime * 0.05)) * smoothstep(0.62, 0.66, r) * (1.0 - smoothstep(0.78, 0.82, r));
  float k = (rings * 0.5 + glyph * 0.9 + exp(-r * r * 9.0) * 0.6) * (1.0 - smoothstep(0.92, 1.0, r)) * uGain;
  gl_FragColor = vec4(uColor * k, k); }`;
const MINERAL_FS = `uniform sampler2D uNoise; uniform float uTime; varying vec3 vW; varying vec3 vN; varying vec2 vUv; ${FOG_GLSL}
void main(){ vec3 V = normalize(cameraPosition - vW); float fr = pow(1.0 - abs(dot(normalize(vN), V)), 2.4);
  float n = texture2D(uNoise, vec2(vW.x * 0.2 + vW.z * 0.13, vW.y * 0.12 - uTime * 0.015)).r;
  float vein = pow(1.0 - abs(n - 0.5) * 2.0, 7.0);
  float k = 0.2 + 0.9 * fr + 0.8 * vein + 0.3 * vUv.y;
  vec3 c = mix(vec3(0.3, 0.1, 0.03), vec3(1.0, 0.62, 0.22), clamp(k * 0.7, 0.0, 1.0)) * k;
  gl_FragColor = vec4(mix(c, fogColor, smoothstep(fogNear, fogFar, vFog)), 1.0); }`;

/**
 * @param T three namespace
 * @param scene the world scene
 * @param o {lighting: {sky, ambient, sun}}
 */
export function buildSilentFoundry(T, scene, o = {}) {
  const group = new T.Group();
  group.name = 'silent-foundry';
  group.visible = false;
  scene.add(group);
  const noise = noiseTexture(T, 128, 113);
  const U = (v) => ({ value: v });
  const fogU = () => ({ fogColor: U(new T.Color()), fogNear: U(1), fogFar: U(2000) });
  const time = U(0);
  const at = (u, v) => ({ x: F.x + u, z: F.z + v });
  const mats = [];
  const M = (m) => { mats.push(m); return m; };
  const metal = M(new T.MeshStandardMaterial({ color: 0x34373a, roughness: 0.6, metalness: 0.7, roughnessMap: noise }));
  const dark = M(new T.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.85, metalness: 0.4 }));
  const ochre = M(new T.MeshStandardMaterial({ color: 0x9a6532, roughness: 0.75, metalness: 0.3, roughnessMap: noise }));
  const stone = M(new T.MeshStandardMaterial({ color: 0x3d3634, roughness: 0.95, roughnessMap: noise }));
  const hot = M(new T.MeshStandardMaterial({ color: 0x1a0a04, emissive: 0xff6a1e, emissiveIntensity: 2.2 }));
  const teal = M(new T.MeshStandardMaterial({ color: 0x06201e, emissive: 0x3fd8cf, emissiveIntensity: 1.4 }));
  const add = (geo, mat, x, y, z, { ry = 0, shadow = true, into = group } = {}) => {
    const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry;
    m.castShadow = shadow; m.receiveShadow = true; into.add(m); return m;
  };
  // procedural stand-ins, hidden once the Blender kit (foundry_kit.glb) is in place
  const proc = new T.Group();
  proc.name = 'silent-foundry:procedural';
  group.add(proc);
  const addP = (geo, mat, x, y, z, opts = {}) => add(geo, mat, x, y, z, { ...opts, into: proc });
  const yAt = (u, v) => foundryHeight(F.x + u, F.z + v);

  // ---- shell: floor (follows the Depths ramp), walls, ceiling with beams
  const floorGeo = new T.PlaneGeometry(F.hw * 2, F.hd * 2, 12, 104);
  floorGeo.rotateX(-Math.PI / 2);
  const fp = floorGeo.attributes.position;
  for (let i = 0; i < fp.count; i++) fp.setY(i, foundryHeight(F.x + fp.getX(i), F.z + fp.getZ(i)));
  floorGeo.computeVertexNormals();
  const floorMat = M(new T.MeshStandardMaterial({ color: 0x2c2b2d, roughness: 0.8, metalness: 0.35, roughnessMap: noise }));
  floorMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvFW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFW;').replace('#include <color_fragment>', `#include <color_fragment>
      { vec2 g = abs(fract(vFW.xz / 4.0) - 0.5); float seam = 1.0 - smoothstep(0.47, 0.5, max(g.x, g.y));
        diffuseColor.rgb *= 0.7 + 0.3 * seam; }`);
  };
  floorMat.customProgramCacheKey = () => 'foundry-floor-v1';
  const floor = new T.Mesh(floorGeo, floorMat);
  floor.position.set(F.x, 0, F.z);
  floor.receiveShadow = true;
  group.add(floor);
  for (const s of [-1, 1]) {
    add(new T.BoxGeometry(1.2, CEILING + 6, F.hd * 2), stone, F.x + s * (F.hw + 0.6), (CEILING + 6) / 2 - 5, F.z, { shadow: false });
    // buttresses with ochre panels between
    for (let v = -100; v <= 100; v += 10) {
      addP(new T.BoxGeometry(1.4, CEILING, 1.2), metal, F.x + s * (F.hw - 0.3), CEILING / 2 + yAt(0, v) - 0.5, F.z + v, { shadow: false });
      if (Math.abs(v) % 20 === 10) addP(new T.BoxGeometry(0.2, 5, 7.6), ochre, F.x + s * (F.hw - 0.1), 4 + yAt(0, v), F.z + v, { shadow: false });
    }
  }
  for (const s of [-1, 1]) add(new T.BoxGeometry(F.hw * 2 + 2, CEILING + 6, 1.2), stone, F.x, (CEILING + 6) / 2 - 5, F.z + s * (F.hd + 0.6), { shadow: false });
  const ceil = add(new T.BoxGeometry(F.hw * 2 + 2, 0.6, F.hd * 2 + 2), dark, F.x, CEILING + 0.3, F.z, { shadow: false });
  ceil.castShadow = false;
  for (let v = -100; v <= 100; v += 10) addP(new T.BoxGeometry(F.hw * 2, 0.8, 0.6), metal, F.x, CEILING - 0.4, F.z + v, { shadow: false });
  // partitions with framed doorways (colliders are the solid parts)
  for (const w of L.partitions) {
    add(new T.BoxGeometry(w.hw * 2, CEILING, w.hd * 2), stone, w.x, CEILING / 2 + yAt(w.x - F.x, w.z - F.z), w.z);
  }
  for (const v of [52, 0, -52]) {
    const y = yAt(0, v);
    addP(new T.BoxGeometry(F.door * 2 + 1.4, 1.2, 2.0), metal, F.x, y + 6.6, F.z + v);
    for (const s of [-1, 1]) addP(new T.BoxGeometry(0.7, 6.6, 2.0), metal, F.x + s * (F.door + 0.35), y + 3.3, F.z + v);
    addP(new T.BoxGeometry(F.door * 2, 0.08, 0.08), teal, F.x, y + 6.0, F.z + v - 1.02, { shadow: false });
  }

  // ---- Fabrication Hall: presses with hot slits, a gantry
  const slits = [];
  for (const p of L.fabrication) {
    if (p.type === 'foundry_press') {
      const y = yAt(p.x - F.x, p.z - F.z), inward = Math.sign(F.x - p.x);
      addP(new T.BoxGeometry(p.hw * 2, p.h, p.hd * 2), metal, p.x, y + p.h / 2, p.z);
      addP(new T.BoxGeometry(p.hw * 2 + 0.1, 0.5, p.hd * 2 + 0.1), ochre, p.x, y + p.h - 0.6, p.z);
      addP(new T.BoxGeometry(0.9, 2.4, 0.9), dark, p.x, y + p.h + 1.2, p.z);
      slits.push(addP(new T.BoxGeometry(0.06, 0.35, p.hd * 1.6), hot, p.x + inward * (p.hw + 0.02), y + 1.6, p.z, { shadow: false }));
    } else {
      add(new T.BoxGeometry(p.hw * 2, p.h, p.hd * 2), metal, p.x, yAt(0, p.z - F.z) + p.h / 2, p.z);
    }
  }
  add(new T.BoxGeometry(18.4, 0.9, 1.2), ochre, F.x, 7.2, F.z + 70);

  // ---- Cultivation Vault: glass vats of glowing culture, a manifold
  const liquids = [];
  const glassMat = M(new T.ShaderMaterial({ uniforms: { uColor: U(new T.Color(0x9ff5e6)), ...fogU() }, vertexShader: VS, fragmentShader: GLASS_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: true }));
  for (const p of L.cultivation) {
    const y = yAt(p.x - F.x, p.z - F.z);
    if (p.type === 'foundry_vat') {
      const liquid = M(new T.ShaderMaterial({ uniforms: { uNoise: U(noise), uTime: time, uColor: U(new T.Color(liquids.length % 3 === 1 ? 0x58f0a0 : 0x3fd8cf)), ...fogU() }, vertexShader: VS, fragmentShader: LIQUID_FS, fog: true }));
      liquids.push(liquid);
      add(new T.CylinderGeometry(p.r * 0.86, p.r * 0.86, p.h * 0.8, 24, 1, true), liquid, p.x, y + 0.5 + p.h * 0.4, p.z, { shadow: false });
      add(new T.CylinderGeometry(p.r * 0.92, p.r * 0.92, p.h * 0.95, 24, 1, true), glassMat, p.x, y + 0.45 + p.h * 0.475, p.z, { shadow: false });
      for (const yy of [0.25, p.h + 0.3]) addP(new T.CylinderGeometry(p.r, p.r, 0.5, 24), metal, p.x, y + yy, p.z);
    } else {
      add(new T.BoxGeometry(p.hw * 2, p.h, p.hd * 2), metal, p.x, y + p.h / 2, p.z);
      for (const s of [-1, 1]) add(new T.CylinderGeometry(0.18, 0.18, 9.2, 8), ochre, p.x + s * 4.5, y + 0.5, p.z, { ry: 0 }).rotation.z = Math.PI / 2;
    }
  }

  // ---- Harmonic Chamber: the resonator core, rotating rune rings, pylons, rune floor
  const R = L.harmonic.find((p) => p.type === 'foundry_resonator');
  const coreMat = M(new T.ShaderMaterial({ uniforms: { uNoise: U(noise), uTime: time, uGain: U(1), ...fogU() }, vertexShader: VS, fragmentShader: CORE_FS, fog: true }));
  const ry = yAt(R.x - F.x, R.z - F.z);
  addP(new T.CylinderGeometry(R.r * 1.05, R.r * 1.15, 1.2, 8), metal, R.x, ry + 0.6, R.z);
  add(new T.CylinderGeometry(0.6, R.r * 0.55, R.h, 6), coreMat, R.x, ry + 1.2 + R.h / 2, R.z, { shadow: false });
  const runeMat = (color, gain) => M(new T.ShaderMaterial({ uniforms: { uTime: time, uGain: U(gain), uColor: U(new T.Color(color)) }, vertexShader: VS, fragmentShader: RUNE_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
  const rings = [];
  for (const [r, h, tilt] of [[5.2, 4.5, 0.25], [6.4, 6.5, -0.35], [4.2, 8.6, 0.5]]) {
    const ring = add(new T.PlaneGeometry(r * 2, r * 2), runeMat(0x8fd8ff, 0.9), R.x, ry + h, R.z, { shadow: false });
    ring.rotation.x = -Math.PI / 2 + tilt;
    ring.renderOrder = 6;
    rings.push(ring);
  }
  const floorRune = add(new T.PlaneGeometry(22, 22), runeMat(0x4fd1c5, 0.7), R.x, ry + 0.05, R.z, { shadow: false });
  floorRune.rotation.x = -Math.PI / 2;
  floorRune.renderOrder = 5;
  for (const p of L.harmonic.filter((q) => q.type === 'foundry_pylon')) {
    const y = yAt(p.x - F.x, p.z - F.z);
    addP(new T.CylinderGeometry(p.r * 0.6, p.r, p.h, 6), metal, p.x, y + p.h / 2, p.z);
    add(new T.OctahedronGeometry(0.6), coreMat, p.x, y + p.h + 0.8, p.z, { shadow: false });
  }

  // ---- Excavation Depths: mineral columns breaking through the floor, rubble
  const mineral = M(new T.ShaderMaterial({ uniforms: { uNoise: U(noise), uTime: time, ...fogU() }, vertexShader: VS, fragmentShader: MINERAL_FS, fog: true }));
  for (const p of L.depths) {
    const y = yAt(p.x - F.x, p.z - F.z);
    const col = add(new T.CylinderGeometry(p.r * 0.5, p.r, p.h, 6), mineral, p.x, y + p.h / 2 - 0.5, p.z, { ry: p.r * 2.1, shadow: false });
    col.rotation.z = (p.x > F.x ? 1 : -1) * 0.12;
    for (let k = 0; k < 4; k++) add(new T.DodecahedronGeometry(0.4 + k * 0.15, 0), stone, p.x + Math.cos(k * 1.7) * (p.r + 0.6), y + 0.2, p.z + Math.sin(k * 1.7) * (p.r + 0.6));
  }
  // a cut stone ramp edge into the Depths
  for (const s of [-1, 1]) add(new T.BoxGeometry(0.8, 1.2, 14), metal, F.x + s * 12, yAt(0, -60) + 0.2, F.z - 62, { shadow: false });

  // ---- atmosphere: one particle field per chamber, re-used by distance
  const fields = FOUNDRY_AREAS.map((a, i) => {
    const colors = [0xffa04a, 0x7ff5d8, 0x9fd8ff, 0xffb36a];
    const f = particleField(T, 120, { seed: 31 + i, size: i === 0 ? 0.12 : 0.16, height: 12, radius: 18, rise: i === 0 ? 1.4 : 0.5, spiral: i === 2 ? 0.6 : 0, color: colors[i] });
    const v = (a.v0 + a.v1) / 2;
    f.mesh.position.set(F.x, yAt(0, v), F.z + v);
    f.mesh.scale.set(1, 1, 1.4);
    f.mat.uniforms.uLevel.value = 0.8;
    group.add(f.mesh);
    return f;
  });

  // ---- lights: one per chamber, pre-created
  const lightDefs = [[0, 76, 0xffac70, 112], [0, 26, 0x7af2d9, 96], [0, -26, 0xb8d4ff, 106], [0, -82, 0xffbc77, 112]];
  const lights = lightDefs.map(([u, v, color, power]) => {
    const l = new T.PointLight(color, power, 58, 1.55);
    l.position.set(F.x + u, yAt(u, v) + 7.3, F.z + v);
    l.userData.base = power;
    group.add(l);
    return l;
  });

  // Thin, inset route guides are always visible to a walking player, even
  // when only one of the four chamber lights reaches the camera. A single
  // non-shadowed InstancedMesh follows the authoritative ramp and uses room
  // colors for orientation; no colliders, fake heightfields or draw-call storm.
  const guideSites=[];
  for(let i=0;i<FOUNDRY_AREAS.length;i++){
    const area=FOUNDRY_AREAS[i];
    for(let v=area.v0+5;v<area.v1-3;v+=4.1)for(const u of [-6.25,6.25])
      guideSites.push({u,v,room:i});
  }
  const guideColors=[0xffc08a,0x70ccaf,0xa7bbef,0xffc18e];
  const guideGeom=new T.BoxGeometry(FOUNDRY_VISIBILITY.guideWidth,.022,3.35);
  const guideMat=M(new T.MeshBasicMaterial({color:0xffffff,toneMapped:false,
    transparent:true,opacity:FOUNDRY_VISIBILITY.guideOpacity,depthWrite:false}));
  const routeGuides=new T.InstancedMesh(guideGeom,guideMat,guideSites.length);
  routeGuides.name='foundry:inset-route-guides';
  routeGuides.castShadow=false;routeGuides.receiveShadow=false;
  const guideDummy=new T.Object3D();
  const guideColor=new T.Color();
  for(let i=0;i<guideSites.length;i++){
    const {u,v,room}=guideSites[i];
    guideDummy.position.set(F.x+u,yAt(u,v)+.07,F.z+v);
    guideDummy.updateMatrix();routeGuides.setMatrixAt(i,guideDummy.matrix);
    routeGuides.setColorAt(i,guideColor.setHex(guideColors[room]));
  }
  routeGuides.instanceMatrix.needsUpdate=true;
  if(routeGuides.instanceColor)routeGuides.instanceColor.needsUpdate=true;
  group.add(routeGuides);

  // Low, non-pulsing threshold markings distinguish chamber transitions
  // without competing with orange hostile telegraphs. These sit on the
  // walkable floor and introduce no collisions, lights or new materials maps.
  const thresholdVs = [52, 0, -52];
  const thresholdMat = M(new T.MeshBasicMaterial({
    color: 0xffffff, toneMapped: false, transparent: true,
    opacity: FOUNDRY_VISIBILITY.thresholdOpacity, depthWrite: false,
  }));
  const thresholds = new T.InstancedMesh(
    new T.BoxGeometry(F.door * 1.7, .025, .18), thresholdMat, thresholdVs.length,
  );
  thresholds.name = 'foundry:door-thresholds';
  thresholds.castShadow = false;
  thresholds.receiveShadow = false;
  for (let i = 0; i < thresholdVs.length; i++) {
    const v = thresholdVs[i];
    guideDummy.position.set(F.x, yAt(0, v) + .065, F.z + v);
    guideDummy.updateMatrix();
    thresholds.setMatrixAt(i, guideDummy.matrix);
    thresholds.setColorAt(i, guideColor.setHex(guideColors[i + 1]));
  }
  thresholds.instanceMatrix.needsUpdate = true;
  if (thresholds.instanceColor) thresholds.instanceColor.needsUpdate = true;
  group.add(thresholds);

  // ---- entering / leaving: lighting, fog and the sky are restored on exit
  let saved = null;
  function enter() {
    const fog = scene.fog, L2 = o.lighting || {};
    saved = { fog: fog ? { c: fog.color.getHex(), n: fog.near, f: fog.far } : null, sky: L2.sky?.visible, sun: L2.sun?.intensity, amb: L2.ambient?.intensity };
    if (fog) { fog.color.setHex(FOG.color); fog.near = FOG.near; fog.far = FOG.far; }
    if (L2.sky) L2.sky.visible = false;
    if (L2.sun) L2.sun.intensity = 0.15;
    if (L2.ambient) L2.ambient.intensity = FOUNDRY_VISIBILITY.ambientInside;
  }
  function leave() {
    const fog = scene.fog, L2 = o.lighting || {};
    if (fog && saved.fog) { fog.color.setHex(saved.fog.c); fog.near = saved.fog.n; fog.far = saved.fog.f; }
    if (L2.sky && saved.sky !== undefined) L2.sky.visible = saved.sky;
    if (L2.sun && saved.sun !== undefined) L2.sun.intensity = saved.sun;
    if (L2.ambient && saved.amb !== undefined) L2.ambient.intensity = saved.amb;
    saved = null;
  }

  // ---- the Blender architecture kit (foundry_kit.glb): one InstancedMesh per piece part
  const kitState = { status: 'idle', instances: 0, draws: 0 };
  const glow = { FK_Lamp: [], FK_Hot: [], FK_Strip: [] };
  function kitPlacements() {
    const out = [];
    for (const s of [-1, 1]) for (let v = -100; v <= 100; v += 10) {
      out.push({ piece: 'Wall_Bay', x: F.x + s * (F.hw - 0.05), y: yAt(0, v), z: F.z + v, ry: s < 0 ? Math.PI / 2 : -Math.PI / 2 });
    }
    for (const p of L.fabrication.filter((q) => q.type === 'foundry_press')) out.push({ piece: 'Press', x: p.x, y: yAt(p.x - F.x, p.z - F.z), z: p.z, ry: 0 });
    for (const p of L.cultivation.filter((q) => q.type === 'foundry_vat')) out.push({ piece: 'Vat_Frame', x: p.x, y: yAt(p.x - F.x, p.z - F.z), z: p.z, ry: p.x > F.x ? Math.PI : 0 });
    out.push({ piece: 'Resonator_Base', x: R.x, y: yAt(R.x - F.x, R.z - F.z), z: R.z, ry: 0 });
    for (const p of L.harmonic.filter((q) => q.type === 'foundry_pylon')) out.push({ piece: 'Pylon', x: p.x, y: yAt(p.x - F.x, p.z - F.z), z: p.z, ry: 0 });
    for (const v of [52, 0, -52]) out.push({ piece: 'Door_Frame', x: F.x, y: yAt(0, v), z: F.z + v, ry: 0 });
    for (let v = -100; v <= 100; v += 10) for (const u of [-18, -6, 6, 18]) out.push({ piece: 'Truss', x: F.x + u, y: CEILING - 1.9, z: F.z + v, ry: 0 });
    return out;
  }
  function adoptKit(gltf) {
    gltf.scene.updateMatrixWorld(true);
    const byPiece = new Map();
    for (const p of kitPlacements()) { if (!byPiece.has(p.piece)) byPiece.set(p.piece, []); byPiece.get(p.piece).push(p); }
    const m4 = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), one = new T.Vector3(1, 1, 1);
    for (const [piece, list] of byPiece) {
      const top = gltf.scene.getObjectByName(piece);
      if (!top) continue;
      top.traverse((n) => {
        if (!n.isMesh) return;
        const local = n.matrixWorld.clone();
        let mat = n.material;
        if (glow[mat?.name]) { mat = mat.clone(); glow[n.material.name].push(mat); }
        else if (mat?.aoMap) mat.aoMapIntensity = 1;
        const im = new T.InstancedMesh(n.geometry, mat, list.length);
        list.forEach((p, i) => im.setMatrixAt(i, m4.compose(new T.Vector3(p.x, p.y, p.z), q.setFromAxisAngle(up, p.ry), one).clone().multiply(local)));
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        const lit = !glow[n.material?.name];
        im.castShadow = lit && piece !== 'Truss' && piece !== 'Wall_Bay';
        im.receiveShadow = lit;
        im.name = 'silent-foundry:kit:' + piece;
        group.add(im);
        kitState.instances += list.length; kitState.draws++;
      });
    }
    proc.visible = false;
  }
  function loadKit() {
    if (kitState.status !== 'idle') return;
    kitState.status = 'loading';
    if (!o.loader) { kitState.status = 'fallback'; return; }
    o.loader.loadAsync(o.kitUrl || FOUNDRY_KIT_URL).then((gltf) => {
      if (kitState.status === 'disposed') return;
      adoptKit(gltf);
      kitState.status = 'ready';
    }).catch((err) => {
      if (kitState.status === 'disposed') return;
      console.warn('[foundry] kit GLB unavailable; keeping the procedural interior:', err?.message || err);
      kitState.status = 'fallback';
    });
  }

  let t = 0, manual = false;
  return {
    group,
    get inside() { return !!saved; },
    setManualClock(on) { manual = !!on; },
    update(dt, _t, eye) {
      const inside = !!eye && inSilentFoundry(eye.x, eye.z, 4);
      group.visible = inside;
      if (inside && !saved) enter();
      else if (!inside && saved) leave();
      if (!inside) return;
      if (kitState.status === 'idle') loadKit();
      t += manual ? 0 : dt;
      for (const m of glow.FK_Hot) m.emissiveIntensity = 4 + 2.2 * Math.sin(t * 2.3);
      for (const m of glow.FK_Lamp) m.emissiveIntensity = 3.5 * (manual ? 1 : 0.93 + 0.07 * Math.sin(t * 17.0));
      for (const m of glow.FK_Strip) m.emissiveIntensity = 2.2 + 0.8 * Math.sin(t * 1.4);
      time.value = t;
      for (const r of rings) r.rotation.z += (manual ? 0 : dt) * 0.25;
      for (let i = 0; i < slits.length; i++) slits[i].material.emissiveIntensity = 1.8 + 0.6 * Math.sin(t * 2.3 + i);
      fields.forEach((f, i) => {
        f.mat.uniforms.uTime.value = t;
        f.mesh.visible = Math.abs(eye.z - f.mesh.position.z) < 70;
        f.mat.uniforms.uMotion.value = manual ? 0.6 : 1;
      });
      lights.forEach((l, i) => {
        const d = Math.abs(eye.z - l.position.z);
        l.intensity = d < 80 ? l.userData.base * (i === 2 ? 0.85 + 0.15 * Math.sin(t * 1.7) : 1) : 0;
      });
    },
    get kitStatus() { return kitState.status; },
    stats() { return { inside: !!saved, lights: lights.length, guideInstances:routeGuides.count, guideDraws:1, thresholdInstances:thresholds.count, thresholdDraws:1, fields: fields.filter((f) => f.mesh.visible).length, kit: kitState.status, instances: kitState.instances, draws: kitState.draws }; },
    dispose() {
      kitState.status = 'disposed';
      if (saved) leave();
      group.traverse((n) => n.geometry?.dispose?.());
      for (const m of mats) m.dispose();
      noise.dispose();
      group.removeFromParent();
    },
  };
}
