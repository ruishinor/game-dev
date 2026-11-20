// The Lattice Crown over the Sanctum: the structure the Sanctum is named for,
// made visible. Six verdigris ribs rise from the existing pylon heads and arc
// inward to a floating lattice spire; a reconstitution core turns inside it,
// armillary rings orbit it, light runs up every rib and filaments of resonance
// thread the pylons. All of it hangs above head height and rests only on the
// existing pylons: no new colliders, the safe-zone layout, arrival flow,
// guards, vendor, fabrication and initiation are untouched.
//
// Effects follow the gate's engine: shader layers, additive particle fields,
// one pre-created light, a deterministic switch for captures.
import { particleField } from './severance-gate.js';
import { mergeGeometries } from './gear-kit.js';

export const CROWN = Object.freeze({ ribTop: 22, spireBase: 15, spireTop: 38, core: 24, lights: 1 });

const FLOW_VS = `varying vec2 vUv; varying vec3 vW; varying vec3 vN; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
// Light climbing a rib: travelling pulses along the tube's length (uv.x).
const FLOW_FS = `uniform float uTime, uGain; uniform vec3 uColor, uHot; varying vec2 vUv; varying vec3 vW; varying vec3 vN;
void main(){ vec3 V = normalize(cameraPosition - vW); float fr = pow(1.0 - abs(dot(normalize(vN), V)), 2.0);
  float pulse = pow(0.5 + 0.5 * sin((vUv.x * 18.0 - uTime * 1.6) * 3.14159), 14.0);
  float k = (0.18 + 0.9 * pulse + 0.4 * fr) * uGain;
  gl_FragColor = vec4(mix(uColor, uHot, pulse) * k, 1.0); }`;
const CORE_FS = `uniform float uTime, uGain; varying vec2 vUv; varying vec3 vW; varying vec3 vN;
void main(){ vec3 V = normalize(cameraPosition - vW); float fr = pow(1.0 - abs(dot(normalize(vN), V)), 1.8);
  float bands = pow(0.5 + 0.5 * sin(vW.y * 3.0 - uTime * 2.2), 6.0);
  float facets = 0.6 + 0.4 * abs(normalize(vN).y);
  float k = (0.35 + 0.8 * fr + 0.7 * bands) * facets * uGain;
  gl_FragColor = vec4(mix(vec3(0.18, 0.62, 0.58), vec3(0.88, 1.0, 0.94), clamp(bands + fr * 0.4, 0.0, 1.0)) * k, 1.0); }`;
const RING_FS = `uniform float uTime, uGain; uniform vec3 uColor; varying vec2 vUv;
void main(){ float seg = step(0.18, fract(vUv.x * 36.0)); float run = pow(0.5 + 0.5 * sin((vUv.x * 6.0 - uTime * 0.5) * 6.28318), 8.0);
  float k = (0.25 * seg + 0.9 * run) * uGain; gl_FragColor = vec4(uColor * k, k); }`;
const THREAD_FS = `uniform float uTime, uGain; uniform vec3 uColor; varying vec2 vUv;
void main(){ float flow = pow(0.5 + 0.5 * sin((vUv.x * 4.0 - uTime * 0.9) * 6.28318), 10.0);
  float edge = 1.0 - abs(vUv.y * 2.0 - 1.0);
  float k = (0.12 + flow) * edge * uGain; gl_FragColor = vec4(uColor * k, k); }`;

/**
 * @param T three namespace
 * @param scene the world scene
 * @param o {pylons: [{x, z, h}], ground(x, z)}
 */
export function buildSanctumCrown(T, scene, o) {
  const group = new T.Group();
  group.name = 'sanctum:lattice-crown';
  scene.add(group);
  const U = (v) => ({ value: v });
  const time = U(0), gain = U(1);
  const mats = [];
  const M = (m) => { mats.push(m); return m; };
  const metal = M(new T.MeshStandardMaterial({ color: 0x4f6b62, roughness: 0.42, metalness: 0.85 }));
  const verdigris = M(new T.MeshStandardMaterial({ color: 0x3f7f72, roughness: 0.6, metalness: 0.55 }));
  const flow = M(new T.ShaderMaterial({ uniforms: { uTime: time, uGain: gain, uColor: U(new T.Color(0x2c8f86)), uHot: U(new T.Color(0xc8fff2)) }, vertexShader: FLOW_VS, fragmentShader: FLOW_FS }));
  const centre = new T.Vector3(0, 0, 0);
  const ribs = [];
  const frame = new T.Group(), threads = new T.Group();
  group.add(frame, threads);
  // ---- ribs: from each pylon head, up and inward to the spire collar
  for (const p of o.pylons) {
    const base = new T.Vector3(p.x, o.ground(p.x, p.z) + p.h + 0.3, p.z);
    const out = new T.Vector3(p.x, 0, p.z).normalize();
    const pts = [
      base,
      base.clone().add(new T.Vector3(0, 4.5, 0)).addScaledVector(out, 1.6),
      new T.Vector3(out.x * 9.5, CROWN.ribTop - 6, out.z * 9.5),
      new T.Vector3(out.x * 4.2, CROWN.ribTop - 1, out.z * 4.2),
      new T.Vector3(out.x * 1.6, CROWN.spireBase + 0.5, out.z * 1.6),
    ];
    const curve = new T.CatmullRomCurve3(pts, false, 'centripetal');
    const rib = new T.Mesh(new T.TubeGeometry(curve, 64, 0.42, 10), metal);
    frame.add(rib);
    // an inset channel of light along the rib's inner face
    const inner = new T.CatmullRomCurve3(pts.map((q) => q.clone().addScaledVector(new T.Vector3(q.x, 0, q.z).normalize(), -0.28).add(new T.Vector3(0, -0.12, 0))), false, 'centripetal');
    frame.add(new T.Mesh(new T.TubeGeometry(inner, 64, 0.09, 6), flow));
    // verdigris collars along the rib
    for (const f of [0.18, 0.42, 0.66, 0.86]) {
      const at = curve.getPointAt(f), tan = curve.getTangentAt(f);
      const collar = new T.Mesh(new T.CylinderGeometry(0.46, 0.46, 0.36, 10), verdigris);
      collar.position.copy(at);
      collar.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), tan);
      frame.add(collar);
    }
    ribs.push(curve);
  }
  // ---- the spire: a twisted hexagonal lattice needle
  const spire = new T.Group();
  spire.name = 'sanctum:lattice-spire';
  const H = CROWN.spireTop - CROWN.spireBase, rings = 12;
  const nodes = [];
  for (let k = 0; k <= rings; k++) {
    const f = k / rings, r = 2.6 * (1 - f) ** 0.9 + 0.12, y = CROWN.spireBase + H * f, tw = f * 1.4;
    nodes.push([...Array(6)].map((_, i) => new T.Vector3(Math.cos(i / 6 * Math.PI * 2 + tw) * r, y, Math.sin(i / 6 * Math.PI * 2 + tw) * r)));
  }
  const strut = (a, b, r, mat) => {
    const d = b.clone().sub(a), len = d.length();
    const m = new T.Mesh(new T.CylinderGeometry(r, r, len, 6), mat);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
    spire.add(m);
  };
  for (let k = 0; k < rings; k++) for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    strut(nodes[k][i], nodes[k + 1][i], 0.09 * (1 - k / rings) + 0.03, metal);
    strut(nodes[k][i], nodes[k + 1][j], 0.05, k % 3 === 1 ? flow : metal);
    if (k % 2 === 0) strut(nodes[k][i], nodes[k][j], 0.06, verdigris);
  }
  group.add(spire);
  // ---- the reconstitution core and armillary rings
  const coreMat = M(new T.ShaderMaterial({ uniforms: { uTime: time, uGain: gain }, vertexShader: FLOW_VS, fragmentShader: CORE_FS }));
  const core = new T.Mesh(new T.OctahedronGeometry(1.7, 1), coreMat);
  core.position.y = CROWN.core;
  core.scale.set(1, 1.6, 1);
  group.add(core);
  const ringMat = M(new T.ShaderMaterial({ uniforms: { uTime: time, uGain: gain, uColor: U(new T.Color(0x7fe8d8)) }, vertexShader: FLOW_VS, fragmentShader: RING_FS,
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
  const armillary = [];
  for (const [r, tilt, speed] of [[4.6, 0.35, 0.12], [5.6, -0.6, -0.08], [3.6, 1.1, 0.18]]) {
    const ring = new T.Mesh(new T.TorusGeometry(r, 0.06, 6, 96), ringMat);
    const pivot = new T.Group();
    pivot.position.y = CROWN.core;
    pivot.rotation.x = Math.PI / 2 + tilt;
    pivot.add(ring);
    group.add(pivot);
    armillary.push({ pivot, speed });
  }
  // ---- resonance filaments: pylon to pylon and pylon to the core
  const threadMat = M(new T.ShaderMaterial({ uniforms: { uTime: time, uGain: gain, uColor: U(new T.Color(0x5ff0d8)) }, vertexShader: FLOW_VS, fragmentShader: THREAD_FS,
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
  o.pylons.forEach((p) => {
    const a = new T.Vector3(p.x, o.ground(p.x, p.z) + p.h + 0.6, p.z);
    const b = new T.Vector3(0, CROWN.core - 1.5, 0);
    const mid = a.clone().lerp(b, 0.5).add(new T.Vector3(0, 3.5, 0));
    const curve = new T.QuadraticBezierCurve3(a, mid, b);
    const ribbon = new T.Mesh(new T.TubeGeometry(curve, 40, 0.05, 4), threadMat);
    threads.add(ribbon);
  });
  // ---- motes spiralling up into the crown
  const motes = particleField(T, 220, { seed: 404, size: 0.16, height: CROWN.spireTop - 6, radius: 7, rise: 1.1, spiral: 1, color: 0x9ff5e6 });
  motes.mesh.position.set(centre.x, 6, centre.z);
  motes.mat.uniforms.uLevel.value = 0.7;
  group.add(motes.mesh);
  // one light in the core
  const light = new T.PointLight(0x7fe8d8, 30, 60, 1.6);
  light.position.set(0, CROWN.core, 0);
  group.add(light);
  // merge every static part per material: a handful of draws for the whole crown
  const merge = (root) => {
    root.updateMatrixWorld(true);
    const buckets = new Map();
    const statics = [];
    root.traverse((n) => { if (n.isMesh) statics.push(n); });
    for (const n of statics) {
      const g = n.geometry.clone();
      g.applyMatrix4(n.matrixWorld.clone().premultiply(new T.Matrix4().copy(root.matrixWorld).invert()));
      if (!buckets.has(n.material)) buckets.set(n.material, []);
      buckets.get(n.material).push(g);
      n.geometry.dispose();
      n.removeFromParent();
    }
    for (const [m, list] of buckets) {
      const mesh = new T.Mesh(mergeGeometries(T, list), m);
      for (const g of list) g.dispose();
      mesh.castShadow = m === metal || m === verdigris;
      mesh.renderOrder = m === threadMat ? 6 : 0;
      mesh.name = 'sanctum:crown-merged';
      root.add(mesh);
    }
  };
  merge(frame); merge(spire); merge(threads);
  let t = 0, deterministic = false;
  return {
    group,
    setDeterministic(on) { deterministic = !!on; },
    update(dt) {
      t += deterministic ? 0 : dt;
      time.value = t;
      motes.mat.uniforms.uTime.value = t;
      core.rotation.y = t * 0.25;
      core.position.y = CROWN.core + Math.sin(t * 0.6) * 0.35;
      for (const a of armillary) a.pivot.rotation.z = t * a.speed;
      spire.rotation.y = t * 0.02;
      light.intensity = 26 + 6 * Math.sin(t * 1.3);
    },
    stats() { return { ribs: ribs.length, lights: CROWN.lights }; },
    dispose() {
      group.traverse((n) => n.geometry?.dispose?.());
      for (const m of mats) m.dispose();
      group.removeFromParent();
    },
  };
}
