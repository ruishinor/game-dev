// The Listening Stone: an isolated artefact embedded in a basalt monolith.
// Golden circuit inscriptions, an embedded medallion, counter-rotating ground
// rings and tilted orbital arcs, orbiting debris and rising motes. Restrained
// emission that strengthens as a character approaches (st.near, metres;
// presentation only — it never affects attunement or any rule).
//
// Same model contract as models.js: { group, height, radius, hover, update(dt, st) }.
import * as THREE from '/vendor/three/three.module.js';
import { drawSigil } from './vfx/textures.js';

const TAU = Math.PI * 2;
const GOLD = 0xffb84a;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 3D value noise from a seeded lattice. */
function noise3(seed) {
  const r = rng(seed);
  const P = new Float32Array(512);
  for (let i = 0; i < 512; i++) P[i] = r();
  const h = (x, y, z) => P[((x * 73 + y * 151 + z * 283) & 511 + 512) % 512];
  const s = (t) => t * t * (3 - 2 * t);
  return (x, y, z) => {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = s(x - ix), fy = s(y - iy), fz = s(z - iz);
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(h(ix, iy, iz), h(ix + 1, iy, iz), fx), l(h(ix, iy + 1, iz), h(ix + 1, iy + 1, iz), fx), fy),
      l(l(h(ix, iy, iz + 1), h(ix + 1, iy, iz + 1), fx), l(h(ix, iy + 1, iz + 1), h(ix + 1, iy + 1, iz + 1), fx), fy),
      fz,
    );
  };
}

function displaced(geo, amp, freq, seed) {
  const n = noise3(seed);
  const p = geo.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const len = Math.hypot(v.x, v.z) || 1;
    const d = (n(v.x * freq, v.y * freq, v.z * freq) - 0.5) * 2 * amp + (n(v.x * freq * 3, v.y * freq * 3, v.z * freq * 3) - 0.5) * amp * 0.35;
    v.x += (v.x / len) * d;
    v.z += (v.z / len) * d;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Basalt albedo/roughness and a golden inscription emissive map, wrapped around the shaft. */
function stoneMaps() {
  if (typeof document === 'undefined') return {};
  const W = 512;
  const H = 1024;
  const r = rng(0x57a1);
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    return [c, c.getContext('2d')];
  };
  const [albedo, a] = mk();
  a.fillStyle = '#3a3a3c';
  a.fillRect(0, 0, W, H);
  for (let i = 0; i < 2200; i++) {
    const v = 40 + Math.floor(r() * 50);
    a.fillStyle = `rgba(${v},${v - 2},${v - 4},${0.25 + r() * 0.35})`;
    a.fillRect(r() * W, r() * H, 2 + r() * 14, 1 + r() * 4);
  }
  // strata
  for (let y = 0; y < H; y += 18 + r() * 40) {
    a.fillStyle = `rgba(20,18,16,${0.2 + r() * 0.3})`;
    a.fillRect(0, y, W, 1 + r() * 3);
  }
  const [emis, e] = mk();
  e.fillStyle = '#000';
  e.fillRect(0, 0, W, H);
  e.strokeStyle = '#fff';
  e.fillStyle = '#fff';
  e.lineCap = 'round';
  e.shadowColor = '#fff';
  e.shadowBlur = 6;
  // Circuit traces: orthogonal runs with node terminals, denser around the medallion band.
  for (let i = 0; i < 70; i++) {
    let x = r() * W;
    let y = H * (0.2 + r() * 0.65);
    e.lineWidth = r() < 0.2 ? 3 : 1.6;
    e.beginPath();
    e.moveTo(x, y);
    for (let k = 0; k < 4 + r() * 5; k++) {
      if (r() < 0.5) x += (r() - 0.5) * 90;
      else y += (r() - 0.5) * 120;
      e.lineTo(x, y);
    }
    e.stroke();
    e.beginPath();
    e.arc(x, y, 3 + r() * 3, 0, TAU);
    e.fill();
  }
  // concentric arc bands circling the stone
  for (const [y, w] of [[0.32, 2], [0.36, 1.2], [0.7, 2.4], [0.74, 1.2]]) {
    e.lineWidth = w;
    e.setLineDash([22 + r() * 30, 8 + r() * 14]);
    e.beginPath();
    e.moveTo(0, H * y);
    e.lineTo(W, H * y);
    e.stroke();
  }
  e.setLineDash([]);
  // glyph row
  for (let i = 0; i < 14; i++) {
    const x = (i + 0.5) * (W / 14);
    const y = H * 0.55;
    e.lineWidth = 2;
    e.beginPath();
    e.moveTo(x, y - 14);
    e.lineTo(x, y + 14);
    e.moveTo(x - 8, y - 6 + r() * 12);
    e.lineTo(x + 8, y - 6 + r() * 12);
    e.stroke();
  }
  const tex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  };
  return { map: tex(albedo, true), emissiveMap: tex(emis, true) };
}

function sigilTexture() {
  if (typeof document === 'undefined') return null;
  // Recolour the resonance sigil's two ring layers into a single alpha mask.
  const src = drawSigil('resonance', 512);
  const g = src.getContext('2d');
  const img = g.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.max(img.data[i], img.data[i + 1]);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = v;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(src);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeListeningStone() {
  const group = new THREE.Group();
  const owned = [];
  const own = (x) => (owned.push(x), x);
  const maps = stoneMaps();
  for (const t of [maps.map, maps.emissiveMap]) if (t) owned.push(t);
  // Monolith: irregular basalt with golden inscriptions.
  const stoneMat = own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0.08, map: maps.map || null, emissiveMap: maps.emissiveMap || null, emissive: maps.emissiveMap ? GOLD : 0x000000, emissiveIntensity: 0.6 }));
  const shaftGeo = own(displaced(new THREE.CylinderGeometry(0.62, 1.05, 5.6, 9, 18), 0.22, 0.9, 0x51));
  const shaft = new THREE.Mesh(shaftGeo, stoneMat);
  shaft.position.y = 2.8;
  shaft.rotation.y = 0.4;
  shaft.castShadow = shaft.receiveShadow = true;
  group.add(shaft);
  const capGeo = own(displaced(new THREE.IcosahedronGeometry(0.62, 2), 0.18, 1.4, 0x52));
  const cap = new THREE.Mesh(capGeo, stoneMat);
  cap.position.y = 5.7;
  cap.scale.set(1, 1.3, 0.9);
  cap.castShadow = true;
  group.add(cap);
  const baseGeo = own(displaced(new THREE.CylinderGeometry(1.25, 1.6, 0.6, 11, 3), 0.18, 1.2, 0x53));
  const base = new THREE.Mesh(baseGeo, stoneMat);
  base.position.y = 0.2;
  base.receiveShadow = true;
  group.add(base);

  // Embedded medallion on the south face: gold rings around a sigil disc.
  const gold = own(new THREE.MeshStandardMaterial({ color: 0xd9a24a, metalness: 1, roughness: 0.3, emissive: GOLD, emissiveIntensity: 0.25 }));
  const sigilTex = sigilTexture();
  if (sigilTex) owned.push(sigilTex);
  const medallion = new THREE.Group();
  medallion.position.set(0, 2.6, 0.92);
  medallion.rotation.x = -0.12;
  for (const [R, t] of [[0.62, 0.035], [0.48, 0.02], [0.3, 0.03]]) medallion.add(new THREE.Mesh(own(new THREE.TorusGeometry(R, t, 8, 48)), gold));
  const discMat = own(new THREE.MeshBasicMaterial({ color: GOLD, map: sigilTex, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const disc = new THREE.Mesh(own(new THREE.CircleGeometry(0.6, 48)), discMat);
  disc.position.z = 0.01;
  medallion.add(disc);
  group.add(medallion);

  // Ground rings (flat, counter-rotating) and tilted orbital arcs.
  const ringMat = own(new THREE.MeshBasicMaterial({ color: GOLD, map: sigilTex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  const rings = [2.6, 4.2, 5.6].map((R, i) => {
    const m = new THREE.Mesh(own(new THREE.RingGeometry(R * 0.82, R, 96, 1)), ringMat);
    // planar UVs over the ring so the sigil's outer band lands on it
    const uv = m.geometry.getAttribute('uv');
    const p = m.geometry.getAttribute('position');
    for (let k = 0; k < p.count; k++) uv.setXY(k, p.getX(k) / (2 * R) + 0.5, p.getY(k) / (2 * R) + 0.5);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.06 + i * 0.01;
    m.renderOrder = 2;
    group.add(m);
    return m;
  });
  const arcMat = own(new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const arcs = [[2.0, 2.2, 0.5], [2.4, 3.6, -0.35], [1.7, 4.6, 0.9]].map(([R, y, tilt], i) => {
    const a = new THREE.Mesh(own(new THREE.TorusGeometry(R, 0.018, 6, 96, TAU * (0.45 + i * 0.12))), arcMat);
    const pivot = new THREE.Group();
    pivot.position.y = y;
    pivot.rotation.set(Math.PI / 2 + tilt, 0, 0);
    pivot.add(a);
    group.add(pivot);
    return pivot;
  });

  // Orbiting debris: one instanced draw.
  const r = rng(0xdeb);
  const debrisGeo = own(displaced(new THREE.IcosahedronGeometry(1, 1), 0.25, 2, 0x54));
  const debris = new THREE.InstancedMesh(debrisGeo, stoneMat, 16);
  debris.castShadow = true;
  const rocks = Array.from({ length: 16 }, () => ({ R: 2.2 + r() * 2.6, y: 0.8 + r() * 4.5, a: r() * TAU, w: (0.05 + r() * 0.12) * (r() < 0.5 ? -1 : 1), s: 0.08 + r() * 0.22, spin: r() * 2, ph: r() * TAU }));
  group.add(debris);

  // Rising motes.
  const MOTES = 70;
  const motePos = new Float32Array(MOTES * 3);
  const motes = Array.from({ length: MOTES }, () => ({ a: r() * TAU, R: 0.6 + r() * 3.5, y: r() * 6, v: 0.25 + r() * 0.5 }));
  const moteGeo = own(new THREE.BufferGeometry());
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3).setUsage(THREE.DynamicDrawUsage));
  let moteTex = null;
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.3, 'rgba(255,255,255,0.5)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    moteTex = own(new THREE.CanvasTexture(c));
  }
  const moteMat = own(new THREE.PointsMaterial({ color: GOLD, size: 0.16, map: moteTex, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const points = new THREE.Points(moteGeo, moteMat);
  points.frustumCulled = false;
  group.add(points);

  // The sky beam stays the resonance colour that attunement uses.
  const beamMat = own(new THREE.MeshBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
  const beam = new THREE.Mesh(own(new THREE.CylinderGeometry(0.16, 0.16, 80, 8, 1, true)), beamMat);
  beam.position.y = 46;
  group.add(beam);
  const lamp = new THREE.PointLight(GOLD, 14, 9, 2);
  lamp.position.set(0, 2.6, 1.6);
  group.add(lamp);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pv = new THREE.Vector3();
  const sv = new THREE.Vector3();
  let wake = 0;
  let ringTime = null;
  let orbitTime = null;
  let medallionAngle = null;
  return {
    group,
    height: 7.0,
    radius: 1.0,
    hover: 0,
    update(dt, st) {
      const t = Number.isFinite(st?.t) ? st.t : 0;
      const near = Number.isFinite(st?.near) ? st.near : Infinity;
      // 0 far away -> 1 within ~3 m; eased so it never snaps.
      const want = Math.min(1, Math.max(0, (12 - near) / 9));
      wake += (want - wake) * Math.min(1, (dt || 0) * 1.5);
      const k = wake + (st?.cast || 0);
      // Integrate angular speed. Multiplying the whole elapsed time by the
      // wake impulse made a late interaction jump much faster than an early one.
      const motion = k / (1 + 0.18 * k);
      ringTime = (ringTime ?? t) + dt * (1 + motion * 2);
      orbitTime = (orbitTime ?? t) + dt * (1 + motion);
      medallionAngle = (medallionAngle ?? t * 0.15) + dt * (0.15 + motion * 0.4);
      stoneMat.emissiveIntensity = 0.35 + 0.15 * Math.sin(t * 0.9) + k * 0.9;
      if (stoneMat.emissiveMap) stoneMat.emissiveMap.offset.y = Math.sin(t * 0.15) * 0.01 * (1 + k);
      gold.emissiveIntensity = 0.2 + k * 0.6;
      discMat.opacity = 0.55 + 0.35 * k;
      disc.rotation.z = -medallionAngle;
      ringMat.opacity = 0.25 + 0.45 * k;
      rings.forEach((m, i) => (m.rotation.z = ringTime * (i % 2 ? -1 : 1) * (0.04 + 0.03 * i)));
      arcs.forEach((p, i) => (p.rotation.z = orbitTime * (0.12 + i * 0.07) * (i % 2 ? -1 : 1)));
      arcMat.opacity = 0.35 + 0.45 * k;
      lamp.intensity = 8 + 16 * k;
      rocks.forEach((o, i) => {
        const a = o.a + orbitTime * o.w;
        pv.set(Math.cos(a) * o.R, o.y + Math.sin(t * 0.6 + o.ph) * 0.25 + k * 0.3, Math.sin(a) * o.R);
        e.set(t * o.spin * 0.3, t * o.spin * 0.2, o.ph);
        q.setFromEuler(e);
        sv.setScalar(o.s);
        debris.setMatrixAt(i, m4.compose(pv, q, sv));
      });
      debris.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < MOTES; i++) {
        const m = motes[i];
        m.y += dt * m.v * (1 + motion);
        if (m.y > 6.5) m.y = 0;
        const a = m.a + t * 0.2;
        motePos[i * 3] = Math.cos(a) * m.R;
        motePos[i * 3 + 1] = m.y;
        motePos[i * 3 + 2] = Math.sin(a) * m.R;
      }
      moteGeo.getAttribute('position').needsUpdate = true;
      moteMat.opacity = 0.35 + 0.55 * k;
    },
    dispose() {
      for (const x of owned) x.dispose?.();
      group.removeFromParent();
    },
  };
}
