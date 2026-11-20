// Regional looks for reused enemy rigs. The server names a visual variant (vx)
// for Severance Expanse patrols ('ash') and Silent Foundry encounters
// ('foundry'); combat, animation and hit volumes stay those of the base rig.
//
//   ash      ash-crusted hide, ember veins that breathe, amber crystal growths
//   foundry  soot-dark metal, orange-hot seams, teal resonance shards
//
// Materials are cloned per model (never shared assets), veins are a shader
// layer in object space so they follow the skinned body, growths ride the
// upper torso bone when the rig has one.

const VARIANTS = Object.freeze({
  ash: { tint: 0x6a5c52, mix: 0.5, rough: 0.12, vein: 0xff7a2a, veinGain: 1.3, scale: 2.6, crystal: 0xffa548, core: 0x4a1a06, shards: 5 },
  foundry: { tint: 0x2f2b29, mix: 0.55, rough: -0.05, vein: 0xff5a14, veinGain: 1.9, scale: 3.4, crystal: 0x5ef2e2, core: 0x05302f, shards: 3 },
});
export const ENEMY_VARIANTS = Object.freeze(Object.keys(VARIANTS));

const SHARD_VS = `varying vec3 vN; varying vec3 vW; varying float vH;
void main(){ vH = position.y; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
const SHARD_FS = `uniform vec3 uHot, uCore; uniform float uTime, uGain; varying vec3 vN; varying vec3 vW; varying float vH;
void main(){ vec3 V = normalize(cameraPosition - vW); float fr = pow(1.0 - abs(dot(normalize(vN), V)), 2.2);
  float pulse = 0.8 + 0.2 * sin(uTime * 2.1 + vW.y * 3.0);
  float k = (0.3 + 0.9 * fr + 0.6 * clamp(vH * 3.0, 0.0, 1.0)) * pulse * uGain;
  gl_FragColor = vec4(mix(uCore, uHot, clamp(k * 0.8, 0.0, 1.0)) * k, 1.0); }`;

function veinMaterial(T, src, v, uniforms, radius) {
  const m = src.clone();
  const scale = { value: v.scale / Math.max(1e-3, radius) };   // a few veins across the body, whatever the rig units
  if (m.color) m.color.lerp(new T.Color(v.tint), v.mix);
  if (m.roughness !== undefined) m.roughness = Math.min(1, Math.max(0.05, m.roughness + v.rough));
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uVeinColor = uniforms.color;
    sh.uniforms.uVeinGain = uniforms.gain;
    sh.uniforms.uVeinTime = uniforms.time;
    sh.uniforms.uVeinScale = scale;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vVein;')
      .replace('#include <project_vertex>', 'vVein = transformed;\n#include <project_vertex>');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vVein; uniform vec3 uVeinColor; uniform float uVeinGain, uVeinTime, uVeinScale;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { vec3 p = vVein * uVeinScale;
        float a = sin(p.x * 1.7 + sin(p.y * 1.3 + p.z * 0.7) * 2.1);
        float b = sin(p.z * 1.9 + sin(p.x * 1.1 - p.y * 0.9) * 1.8);
        float vein = smoothstep(0.93, 0.995, 1.0 - abs(a * b));
        float breathe = 0.65 + 0.35 * sin(uVeinTime * 1.6 + p.y * 0.8);
        totalEmissiveRadiance += uVeinColor * vein * breathe * uVeinGain; }`);
  };
  m.customProgramCacheKey = () => 'enemy-vein-v1:' + (src.customProgramCacheKey?.() || '') + ':' + src.type;
  return m;
}

function growthBone(group) {
  let best = null;
  group.traverse((n) => {
    if (n.isBone && /spine|chest|torso|thorax|body|back/i.test(n.name)) best = n;
  });
  return best;
}

/**
 * Apply a regional look to a model ({group, update, dispose}). Unknown variants
 * leave the model untouched.
 */
export function applyEnemyVariant(T, model, vx) {
  const v = VARIANTS[vx];
  if (!v || !model?.group) return model;
  const uniforms = { color: { value: new T.Color(v.vein) }, gain: { value: v.veinGain }, time: { value: 0 } };
  const owned = [];
  model.group.traverse((n) => {
    if (!n.isMesh || !n.material) return;
    n.geometry.computeBoundingSphere?.();
    const radius = n.geometry.boundingSphere?.radius || 1;
    const mats = [].concat(n.material).map((m) => (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) ? veinMaterial(T, m, v, uniforms, radius) : m);
    for (const m of mats) owned.push(m);
    n.material = Array.isArray(n.material) ? mats : mats[0];
  });
  // crystal growths along the back
  model.group.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(model.group);
  const size = box.getSize(new T.Vector3());
  const shardMat = new T.ShaderMaterial({ uniforms: { uHot: { value: new T.Color(v.crystal) }, uCore: { value: new T.Color(v.core) }, uTime: uniforms.time, uGain: { value: 1 } },
    vertexShader: SHARD_VS, fragmentShader: SHARD_FS });
  owned.push(shardMat);
  const growth = new T.Group();
  growth.name = 'enemy-variant:' + vx;
  const geo = new T.ConeGeometry(1, 1, 6, 1);
  geo.translate(0, 0.5, 0);
  const s = Math.max(0.15, Math.min(size.x, size.y, size.z)) * 0.22;
  for (let i = 0; i < v.shards; i++) {
    const m = new T.Mesh(geo, shardMat);
    const a = (i / v.shards) * Math.PI * 2;
    m.scale.set(s * (0.28 + 0.12 * (i % 2)), s * (1.1 + 0.5 * ((i * 7) % 3) / 2), s * 0.3);
    m.position.set(Math.cos(a) * s * 0.45, 0, Math.sin(a) * s * 0.3);
    m.rotation.set(Math.sin(a) * 0.5, a, Math.cos(a) * 0.5);
    m.castShadow = false;
    growth.add(m);
  }
  const bone = growthBone(model.group);
  if (bone) {
    bone.add(growth);
    // bones are in rig units; normalise to the model's world scale
    const ws = new T.Vector3();
    bone.getWorldScale(ws);
    growth.scale.setScalar(1 / Math.max(1e-3, ws.y));
  } else {
    growth.position.set(0, box.max.y - model.group.position.y - s * 0.3, 0);
    model.group.add(growth);
  }
  const update = model.update?.bind(model);
  const dispose = model.dispose?.bind(model);
  let t = 0;
  model.update = (dt, st, ...rest) => {
    t += dt || 0;
    uniforms.time.value = t;
    return update?.(dt, st, ...rest);
  };
  model.dispose = () => {
    growth.removeFromParent();
    geo.dispose();
    for (const m of owned) m.dispose();
    return dispose?.();
  };
  model.variant = vx;
  return model;
}
