// The Expedition Outpost in the Severance Expanse: a low angular shelter on
// trusses with ochre panels, the quartermaster's counter, supply crates, a
// generator, a comms mast with a beacon, and perimeter lamps. Placement comes
// from shared EXPEDITION_OUTPOST / OUTPOST_COLLIDERS; nothing here affects
// gameplay. Effects follow the gate engine: shader layers, additive halos,
// one pre-created light, deterministic under the manual clock.
import { EXPEDITION_OUTPOST as OP, OUTPOST_COLLIDERS } from '../../shared/severance-gate.js';
import { noiseTexture } from './severance-gate.js';

export const OUTPOST_LIMITS = Object.freeze({ lights: 1, halos: 12 });

const HALO_VS = `attribute vec4 aHalo; attribute vec3 aTint; varying vec2 vQ; varying vec3 vT; varying float vI;
void main(){ vec4 mv = viewMatrix * vec4(aHalo.xyz, 1.0); mv.xy += position.xy * aHalo.w; vQ = position.xy * 2.0; vT = aTint; vI = float(gl_InstanceID); gl_Position = projectionMatrix * mv; }`;
const HALO_FS = `uniform float uTime, uGain, uBlink; varying vec2 vQ; varying vec3 vT; varying float vI;
void main(){ float r2 = dot(vQ, vQ); float k = exp(-r2 * 4.0) * uGain;
  // the last halo is the mast beacon: a slow double blink
  if (vI > 10.5) { float t = fract(uTime * 0.5); k *= uBlink * (smoothstep(0.0, 0.03, t) * (1.0 - smoothstep(0.08, 0.14, t)) + smoothstep(0.2, 0.23, t) * (1.0 - smoothstep(0.28, 0.34, t))); }
  else k *= 0.9 + 0.1 * sin(uTime * 3.1 + vI * 1.7);
  if (k < 0.003) discard; gl_FragColor = vec4(vT * k, k); }`;

function box(T, mat, w, h, d, x, y, z, ry = 0) {
  const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = m.receiveShadow = true;
  return m;
}

/**
 * @param T three namespace
 * @param o {group (parent), ground(x,z)}
 */
export function createExpeditionOutpost(T, o) {
  const root = new T.Group();
  root.name = 'severance-outpost';
  o.group.add(root);
  const noise = noiseTexture(T, 64, 91);
  noise.repeat.set(3, 3);
  const M = {
    frame: new T.MeshStandardMaterial({ color: 0x3a3d3f, roughness: 0.55, metalness: 0.75, roughnessMap: noise }),
    panel: new T.MeshStandardMaterial({ color: 0xb2793a, roughness: 0.78, metalness: 0.25, roughnessMap: noise }),
    panelDark: new T.MeshStandardMaterial({ color: 0x6e4a26, roughness: 0.85, metalness: 0.2 }),
    roof: new T.MeshStandardMaterial({ color: 0x8c6a46, roughness: 0.8, metalness: 0.35, side: T.DoubleSide, roughnessMap: noise }),
    canvas: new T.MeshStandardMaterial({ color: 0x7b6e5a, roughness: 0.98, side: T.DoubleSide }),
    crate: new T.MeshStandardMaterial({ color: 0x5c5a4a, roughness: 0.85, metalness: 0.3 }),
    strap: new T.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6, metalness: 0.6 }),
    teal: new T.MeshStandardMaterial({ color: 0x0e2a28, emissive: 0x4fd1c5, emissiveIntensity: 1.6, roughness: 0.4 }),
    warm: new T.MeshStandardMaterial({ color: 0x2a1a0a, emissive: 0xffb060, emissiveIntensity: 2.2, roughness: 0.5 }),
    pad: new T.MeshStandardMaterial({ color: 0x3b332e, roughness: 1, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
  };
  const S = OP.shelter;
  const g0 = o.ground(OP.x, OP.z);
  // ---- compacted pad
  const pad = new T.Mesh(new T.CircleGeometry(OP.r - 1.5, 48), M.pad);
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(OP.x, g0 + 0.03, OP.z);
  pad.receiveShadow = true;
  root.add(pad);

  // ---- shelter: local frame, x across the opening (along world z), z depth (world +x is the back)
  const shelter = new T.Group();
  shelter.name = 'severance-outpost:shelter';
  shelter.position.set(S.x, o.ground(S.x, S.z), S.z);
  shelter.rotation.y = S.yaw;          // local +z faces west (the opening)
  root.add(shelter);
  const W = S.hd, D = S.hw;            // half-width along the opening, half-depth
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    shelter.add(box(T, M.frame, 0.22, S.eave, 0.22, sx * W, S.eave / 2, sz * D));
  }
  // trusses: a shallow asymmetric gable, ridge set back toward the rear wall
  const ridgeZ = -D * 0.35;
  for (let i = 0; i <= 4; i++) {
    const x = -W + (2 * W) * i / 4;
    const t = new T.Group();
    t.position.x = x;
    const chord = box(T, M.frame, 0.12, 0.12, D * 2 + 0.6, 0, S.eave, 0);
    const front = new T.Vector3(0, S.eave, D + 0.3), back = new T.Vector3(0, S.eave, -D - 0.3), apex = new T.Vector3(0, S.ridge, ridgeZ);
    for (const [a, b] of [[front, apex], [apex, back]]) {
      const len = a.distanceTo(b);
      const m = box(T, M.frame, 0.12, 0.14, len, 0, (a.y + b.y) / 2, (a.z + b.z) / 2);
      m.rotation.x = -Math.atan2(b.y - a.y, b.z - a.z);
      t.add(m);
    }
    for (const k of [0.33, 0.66]) {        // web members
      const p = front.clone().lerp(apex, k), q = new T.Vector3(0, S.eave, p.z);
      const m = box(T, M.frame, 0.07, p.y - q.y, 0.07, 0, (p.y + q.y) / 2, p.z);
      t.add(m);
    }
    t.add(chord);
    shelter.add(t);
  }
  // roof planes (ochre, slightly overhanging)
  const roofPlane = (a, b) => {
    const len = Math.hypot(b.y - a.y, b.z - a.z) + 0.2;
    const m = new T.Mesh(new T.BoxGeometry(W * 2 + 1.0, 0.08, len), M.roof);
    m.position.set(0, (a.y + b.y) / 2 + 0.11, (a.z + b.z) / 2);
    m.rotation.x = -Math.atan2(b.y - a.y, b.z - a.z);
    m.castShadow = m.receiveShadow = true;
    shelter.add(m);
  };
  roofPlane(new T.Vector3(0, S.eave - 0.15, D + 0.9), new T.Vector3(0, S.ridge, ridgeZ));
  roofPlane(new T.Vector3(0, S.ridge, ridgeZ), new T.Vector3(0, S.eave - 0.25, -D - 0.6));
  // rear wall of ochre panels with dark seams; side canvas screens
  const panels = 6;
  for (let i = 0; i < panels; i++) {
    const w = (2 * W) / panels;
    shelter.add(box(T, i % 3 === 1 ? M.panelDark : M.panel, w - 0.06, S.eave - 0.2, 0.12, -W + w * (i + 0.5), (S.eave - 0.2) / 2 + 0.1, -D + 0.12));
  }
  for (const sx of [-1, 1]) {
    const c = new T.Mesh(new T.PlaneGeometry(D * 1.3, S.eave * 0.55), M.canvas);
    c.position.set(sx * W, S.eave * 0.62, -D * 0.3);
    c.rotation.y = Math.PI / 2;
    c.castShadow = true;
    shelter.add(c);
  }
  // a teal service strip under the ridge
  shelter.add(box(T, M.teal, W * 1.6, 0.05, 0.05, 0, S.ridge - 0.25, ridgeZ));

  // ---- counter, crates, generator, mast, lamps (match the colliders)
  for (const c of OUTPOST_COLLIDERS) {
    const y = o.ground(c.x, c.z);
    if (c.type === 'outpost_counter') {
      root.add(box(T, M.panel, c.hw * 2, c.h, c.hd * 2, c.x, y + c.h / 2, c.z));
      root.add(box(T, M.frame, c.hw * 2 + 0.1, 0.06, c.hd * 2 + 0.1, c.x, y + c.h + 0.03, c.z));
      root.add(box(T, M.teal, 0.04, 0.04, c.hd * 1.8, c.x - c.hw - 0.02, y + c.h - 0.08, c.z));
    } else if (c.type === 'outpost_crates') {
      const n = Math.max(2, Math.round(c.hw * c.hd * 2));
      for (let i = 0; i < n; i++) {
        const s = 0.75 + (i % 3) * 0.15, dx = ((i % 2) - 0.5) * c.hw, dz = (Math.floor(i / 2) % 2 - 0.5) * c.hd, up = i >= 4 ? s : 0;
        root.add(box(T, M.crate, s, s, s, c.x + dx, y + s / 2 + up, c.z + dz, i * 0.4));
        root.add(box(T, M.strap, s + 0.02, 0.06, s + 0.02, c.x + dx, y + s * 0.62 + up, c.z + dz, i * 0.4));
      }
    } else if (c.type === 'outpost_generator') {
      root.add(box(T, M.frame, c.hw * 2, c.h, c.hd * 2, c.x, y + c.h / 2, c.z));
      root.add(box(T, M.warm, c.hw * 1.6, 0.18, 0.05, c.x, y + c.h * 0.7, c.z - c.hd - 0.02));
      root.add(box(T, M.panel, c.hw * 2.05, 0.12, c.hd * 2.05, c.x, y + c.h + 0.06, c.z));
    } else if (c.type === 'outpost_mast') {
      const mast = new T.Mesh(new T.CylinderGeometry(0.09, 0.16, c.h, 6), M.frame);
      mast.position.set(c.x, y + c.h / 2, c.z);
      mast.castShadow = true;
      root.add(mast);
      for (const k of [0.35, 0.65, 0.9]) root.add(box(T, M.frame, 0.9 * (1.1 - k), 0.05, 0.05, c.x, y + c.h * k, c.z));
      root.add(box(T, M.frame, c.r * 2, 0.4, c.r * 2, c.x, y + 0.2, c.z));
    } else if (c.type === 'outpost_lamp') {
      const post = new T.Mesh(new T.CylinderGeometry(0.05, 0.08, c.h, 5), M.frame);
      post.position.set(c.x, y + c.h / 2, c.z);
      root.add(post);
      root.add(box(T, M.warm, 0.18, 0.22, 0.18, c.x, y + c.h + 0.05, c.z));
    }
  }

  // ---- additive halos (lamps, counter, beacon) in one draw
  const halos = [];
  for (const l of OP.lamps) halos.push([l.x, o.ground(l.x, l.z) + 2.45, l.z, 1.4, 1.0, 0.62, 0.3]);
  halos.push([OP.counter.x - 0.3, o.ground(OP.counter.x, OP.counter.z) + 1.0, OP.counter.z, 2.2, 0.25, 0.75, 0.7]);
  const gen = OUTPOST_COLLIDERS.find((c) => c.type === 'outpost_generator');
  halos.push([gen.x, o.ground(gen.x, gen.z) + gen.h * 0.7, gen.z - gen.hd - 0.1, 1.1, 1.0, 0.55, 0.25]);
  while (halos.length < OUTPOST_LIMITS.halos - 1) halos.push([OP.x, -1000, OP.z, 0, 0, 0, 0]);
  halos.push([OP.mast.x, o.ground(OP.mast.x, OP.mast.z) + 9.3, OP.mast.z, 1.6, 1.0, 0.25, 0.2]);
  const quad = new T.PlaneGeometry(1, 1);
  const hg = new T.InstancedBufferGeometry();
  hg.index = quad.index;
  hg.setAttribute('position', quad.getAttribute('position'));
  hg.setAttribute('aHalo', new T.InstancedBufferAttribute(new Float32Array(halos.flatMap((h) => h.slice(0, 4))), 4));
  hg.setAttribute('aTint', new T.InstancedBufferAttribute(new Float32Array(halos.flatMap((h) => h.slice(4))), 3));
  hg.instanceCount = halos.length;
  const haloMat = new T.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uGain: { value: 1 }, uBlink: { value: 1 } }, vertexShader: HALO_VS, fragmentShader: HALO_FS,
    transparent: true, depthWrite: false, blending: T.AdditiveBlending });
  const haloMesh = new T.Mesh(hg, haloMat);
  haloMesh.frustumCulled = false;
  haloMesh.renderOrder = 6;
  haloMesh.name = 'severance-outpost:halos';
  root.add(haloMesh);
  // one warm light under the shelter
  const light = new T.PointLight(0xffb36a, 0, 18, 1.8);
  light.name = 'severance-outpost:light';
  light.position.set(S.x, o.ground(S.x, S.z) + S.eave - 0.4, S.z);
  root.add(light);

  return {
    root,
    update(dt, t, eye, { night = 0 } = {}) {
      const near = eye ? Math.hypot(eye.x - OP.x, eye.z - OP.z) : Infinity;
      root.visible = near < 260;
      haloMat.uniforms.uTime.value = t;
      haloMat.uniforms.uGain.value = 0.45 + 0.8 * night;
      light.intensity = near < 60 ? 6 + 16 * night : 0;
      M.warm.emissiveIntensity = 1.4 + 1.6 * night;
    },
    stats() { return { visible: root.visible, halos: halos.length, lights: 1 }; },
    dispose() {
      root.traverse((n) => { n.geometry?.dispose?.(); });
      for (const m of Object.values(M)) m.dispose();
      haloMat.dispose(); noise.dispose();
      root.removeFromParent();
    },
  };
}
