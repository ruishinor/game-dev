// The Scrapyard (Severance Expanse enemy camp): salvage_camp.glb pieces placed
// from the shared layout (the same data the colliders use), a working forge
// (flickering coals and light, rising embers and a smoke column) and lamps.
// Presentation only: the garrison is server-owned and arrives as entities.
import { SALVAGE_CAMP, SALVAGE_CAMP_PIECES } from '../../shared/severance-gate.js';
import { particleField } from './severance-gate.js';
import { createCampFx } from './salvage-camp-fx.js';

export const SALVAGE_CAMP_URL = '/client/assets/salvage_camp.glb?v=0e3fb17363b7';

const SMOKE_VS = /* glsl */`
attribute vec4 aSeed;
uniform float uTime; uniform float uMotion;
varying float vA; varying vec2 vQ;
void main(){
  float life = fract(aSeed.x + uTime * (0.06 + 0.04 * aSeed.y) * uMotion);
  vec3 c = vec3((aSeed.z - 0.5) * 0.4 + life * 1.6 * (aSeed.w - 0.3), life * 7.0, (aSeed.y - 0.5) * 0.4 + life * 0.8);
  vec4 mv = modelViewMatrix * vec4(c, 1.0);
  float s = 0.5 + life * 2.6;
  mv.xy += position.xy * s;
  vQ = position.xy * 2.0;
  vA = smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.55, 1.0, life));
  gl_Position = projectionMatrix * mv;
}`;
const SMOKE_FS = /* glsl */`
uniform vec3 uColor; uniform float uK;
varying float vA; varying vec2 vQ;
void main(){
  float r = length(vQ);
  float k = exp(-r * r * 3.0) * vA * uK;
  if (k < 0.004) discard;
  gl_FragColor = vec4(uColor, k);
}`;

function smokeColumn(T, count, seed) {
  const quad = new T.PlaneGeometry(1, 1);
  const geo = new T.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  const seeds = new Float32Array(count * 4);
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < seeds.length; i++) seeds[i] = rnd();
  geo.setAttribute('aSeed', new T.InstancedBufferAttribute(seeds, 4));
  geo.instanceCount = count;
  const mat = new T.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uMotion: { value: 1 }, uColor: { value: new T.Color(0.2, 0.19, 0.19) }, uK: { value: 0.4 } },
    vertexShader: SMOKE_VS, fragmentShader: SMOKE_FS, transparent: true, depthWrite: false });
  const mesh = new T.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  return { mesh, mat, geo };
}

/**
 * @param T three namespace
 * @param o {group, ground(x, z), loader?, url?}
 */
export function createSalvageCamp(T, o) {
  const root = new T.Group();
  root.name = 'salvage-camp';
  o.group.add(root);
  const forgeAt = SALVAGE_CAMP_PIECES.find((p) => p.piece === 'CK_Forge');
  const fy = o.ground(forgeAt.x, forgeAt.z);
  // forge light, coals and plume (one light, created up front: no shader recompiles)
  const light = new T.PointLight(0xff8a3c, 0, 14, 2);
  light.name = 'salvage-camp:forge-light';
  light.position.set(forgeAt.x + Math.sin(forgeAt.yaw) * 0.9, fy + 1.2, forgeAt.z + Math.cos(forgeAt.yaw) * 0.9);
  root.add(light);
  // chimney top in world space: piece-local (0.2, 4.2, -0.35) rotated by yaw
  const cx = 0.2, cz = -0.35, c = Math.cos(forgeAt.yaw), s = Math.sin(forgeAt.yaw);
  const chimney = new T.Vector3(forgeAt.x + cx * c + cz * s, fy + 4.25, forgeAt.z - cx * s + cz * c);
  const embers = particleField(T, 60, { size: 0.06, height: 5, radius: 0.35, rise: 0.9, spiral: 0.4, color: 0xff9a40, seed: 913 });
  embers.mesh.name = 'salvage-camp:embers';
  embers.mesh.position.copy(chimney);
  root.add(embers.mesh);
  const smoke = smokeColumn(T, 26, 4111);
  smoke.mesh.name = 'salvage-camp:smoke';
  smoke.mesh.position.copy(chimney);
  root.add(smoke.mesh);

  const layers = createCampFx(T, { root, ground: o.ground, pieces: SALVAGE_CAMP_PIECES });
  const fx = { coals: null, lamps: [] };
  const owned = [];
  let status = 'idle';
  function fallback() {
    const m = new T.MeshStandardMaterial({ color: 0x5a4c3c, roughness: 0.8, metalness: 0.4 });
    owned.push(m);
    const dims = { CK_Wall: [3.2, 2.5, 0.2], CK_Forge: [1.6, 1.5, 1.4], CK_LeanTo: [4.4, 2.6, 2.6], CK_Gantry: [4.4, 3.6, 1.8], CK_Mast: [0.8, 9, 0.8], CK_Crates: [1.8, 1.6, 1.6], CK_Pile: [2.2, 0.8, 2.2] };
    for (const p of SALVAGE_CAMP_PIECES) {
      const [w, h, d] = dims[p.piece];
      const b = new T.Mesh(new T.BoxGeometry(w, h, d), m);
      b.position.set(p.x, o.ground(p.x, p.z) + h / 2, p.z);
      b.rotation.y = p.yaw;
      b.castShadow = b.receiveShadow = true;
      owned.push(b.geometry);
      root.add(b);
    }
    status = 'fallback';
  }
  function load() {
    if (status !== 'idle') return;
    status = 'loading';
    if (!o.loader) { fallback(); return; }
    o.loader.loadAsync(o.url || SALVAGE_CAMP_URL).then((gltf) => {
      if (status === 'disposed') return;
      const protos = {};
      gltf.scene.traverse((n) => { if (n.name?.startsWith('CK_') && !n.name.startsWith('CK_Lamp') && n.name !== 'CK_Coals' && n.parent === gltf.scene) protos[n.name] = n; });
      for (const p of SALVAGE_CAMP_PIECES) {
        const proto = protos[p.piece];
        if (!proto) continue;
        const inst = proto.clone(true);
        inst.position.set(p.x, o.ground(p.x, p.z), p.z);
        inst.rotation.set(0, p.yaw, 0);
        inst.traverse((n) => {
          if (!n.isMesh) return;
          const name = n.material?.name;
          if (name === 'CK_Coals' || name === 'CK_Lamp') {
            n.material = n.material.clone();
            owned.push(n.material);
            n.material.toneMapped = false;
            if (name === 'CK_Coals') fx.coals = n.material; else fx.lamps.push(n.material);
            n.castShadow = false;
          } else {
            n.castShadow = n.receiveShadow = true;
          }
        });
        root.add(inst);
      }
      status = 'ready';
    }).catch((err) => {
      if (status === 'disposed') return;
      console.warn('[camp] salvage_camp.glb unavailable; using simple stand-ins:', err?.message || err);
      fallback();
    });
  }
  load();

  return {
    root,
    get status() { return status; },
    /** @param eye camera position (world) */
    update(dt, t, eye, { night = false, quality = 2, reducedMotion = false } = {}) {
      const near = !eye || Math.hypot(eye.x - SALVAGE_CAMP.x, eye.z - SALVAGE_CAMP.z) < 140;
      root.visible = near;
      if (!near) return;
      const motion = reducedMotion ? 0 : 1;
      const flick = 0.82 + 0.12 * Math.sin(t * 7.3) * motion + 0.06 * Math.sin(t * 17.1 + 1.3) * motion;
      light.intensity = quality >= 1 ? (night ? 26 : 10) * flick : 0;
      if (fx.coals) fx.coals.emissiveIntensity = 5 * flick;
      for (const l of fx.lamps) l.emissiveIntensity = night ? 6 : 2.5;
      embers.mesh.visible = smoke.mesh.visible = quality >= 1;
      embers.mat.uniforms.uTime.value = t;
      embers.mat.uniforms.uLevel.value = 0.9;
      embers.mat.uniforms.uMotion.value = motion;
      smoke.mat.uniforms.uTime.value = t;
      smoke.mat.uniforms.uMotion.value = motion;
      layers.update(dt, t, { night, quality, reducedMotion });
    },
    layers: layers.layers,
    stats() { return { status, pieces: SALVAGE_CAMP_PIECES.length }; },
    dispose() {
      status = 'disposed';
      for (const x of owned) x.dispose?.();
      embers.mat.dispose(); embers.geo.dispose(); smoke.mat.dispose(); smoke.geo.dispose();
      layers.dispose();
      root.removeFromParent();
    },
  };
}
