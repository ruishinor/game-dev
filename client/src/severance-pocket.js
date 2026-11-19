// Presentation of the provisional Severance Expanse approach pocket: its ash
// plain and enclosing ridge, outcrops, ruins along the old causeway, and the
// Severance Gate landmark. Collision and ground height come from
// shared/severance-gate.js; nothing here affects gameplay. When the real
// Severance Expanse zone lands, this module is retired and the landmark is
// built at the moved anchor instead.
import { SEVERANCE_POCKET, SEVERANCE_RUINS, SEVERANCE_OUTCROPS, SEVERANCE_GATE, inSeverancePocket, worldToGate } from '../../shared/severance-gate.js';
import { createSeveranceGateLandmark } from './severance-gate.js';
import { createTimeOfDay } from './severance-daylight.js';

const smooth = (t) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };
const POCKET_FOG = { color: 0x31282f, near: 38, far: 300 };

/** Height of the visible ridge beyond the walkable pocket (continues the rim). */
function ridgeHeight(x, z, ground) {
  const P = SEVERANCE_POCKET;
  const dx = Math.abs(x - P.x) - P.hw, dz = Math.abs(z - P.z) - P.hd;
  const out = Math.max(dx, dz);
  if (out <= 0) return ground(x, z);
  const edge = ground(Math.max(P.x - P.hw, Math.min(P.x + P.hw, x)), Math.max(P.z - P.hd, Math.min(P.z + P.hd, z)));
  return edge + out * 0.9 + 7 * Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.038) + 4 * Math.sin(x * 0.11 - z * 0.07);
}

function terrain(T, assets, ground) {
  const P = SEVERANCE_POCKET;
  const margin = 46;
  const w = (P.hw + margin) * 2, d = (P.hd + margin) * 2;
  const g = new T.PlaneGeometry(w, d, Math.round(w / 1.6), Math.round(d / 1.6));
  g.rotateX(-Math.PI / 2);
  g.translate(P.x, 0, P.z);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const ash = new T.Color(0x3c3637), dust = new T.Color(0x5b4f45), scorch = new T.Color(0x2a2224), rock = new T.Color(0x4a4547), c = new T.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = ridgeHeight(x, z, ground);
    pos.setY(i, h);
    const n = 0.5 + 0.5 * Math.sin(x * 0.31 + z * 0.17) * Math.cos(z * 0.23 - x * 0.07);
    c.copy(ash).lerp(dust, n * 0.6);
    const causeway = smooth(1 - Math.abs(x - P.x) / 5) * (inSeverancePocket(x, z) ? 1 : 0);
    c.lerp(dust, causeway * 0.45);
    const { bx, by } = worldToGate(x, z);
    const near = smooth(1 - Math.hypot(Math.max(0, Math.abs(bx) - 9), Math.max(0, Math.abs(by + 4) - 12)) / 14);
    c.lerp(scorch, near * 0.55);
    c.lerp(rock, smooth((h - 6) / 18));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new T.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const albedo = assets?.texture?.('ground_albedo', { repeat: 30 });
  const normal = assets?.texture?.('ground_normal', { repeat: 30, srgb: false });
  let material;
  if (albedo && normal) {
    for (let i = 0; i < col.length; i++) col[i] = Math.min(1, col[i] * 3.2 + 0.02);
    material = new T.MeshStandardMaterial({ vertexColors: true, map: albedo, normalMap: normal, normalScale: new T.Vector2(1, 1), roughness: 0.97, metalness: 0, envMapIntensity: 0.3 });
  } else material = new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
  const mesh = new T.Mesh(g, material);
  mesh.name = 'severance-pocket:terrain';
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * @param T three namespace
 * @param scene the world scene
 * @param o {assets, ground, rockGeo(seed), lighting?: {sky, ambient, sun, dir}}
 */
export function buildSeverancePocket(T, scene, o) {
  const group = new T.Group();
  group.name = 'severance-pocket';
  group.visible = false;
  scene.add(group);
  group.add(terrain(T, o.assets, o.ground));
  // weathered outcrops from the licensed nature kit, with a procedural fallback
  const stone = new T.MeshStandardMaterial({ color: 0x4b4648, roughness: 0.92, flatShading: true });
  const outcropMaterials = [];
  for (const p of SEVERANCE_OUTCROPS) {
    let rock = null;
    try {
      rock = o.assets?.instance?.('nature', ['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'][p.seed % 3]);
    } catch { rock = null; }
    if (rock) {
      const box = new T.Box3().setFromObject(rock), size = box.getSize(new T.Vector3());
      const k = (p.r * 2.1) / Math.max(size.x, size.z, 1e-3);
      rock.scale.set(k, Math.min(k * 1.4, p.h / Math.max(size.y, 1e-3)), k);
      rock.position.set(p.x, o.ground(p.x, p.z) - 0.25, p.z);
      rock.rotation.y = p.seed * 1.7;
      // The kit rock carries a grassy tint for the Reach; weather it to the ash plain.
      rock.traverse((n) => {
        if (!n.isMesh) return;
        n.castShadow = n.receiveShadow = true;
        n.material = n.material.clone();
        n.material.color?.setRGB(0.36, 0.33, 0.34);
        outcropMaterials.push(n.material);
      });
      rock.name = 'severance-pocket:outcrop';
      group.add(rock);
    } else {
      const m = new T.Mesh(o.rockGeo(p.seed), stone);
      m.scale.set(p.r * 1.1, p.h * 0.62, p.r * 1.1);
      m.position.set(p.x, o.ground(p.x, p.z) + p.h * 0.3, p.z);
      m.castShadow = m.receiveShadow = true;
      m.name = 'severance-pocket:outcrop';
      group.add(m);
    }
  }
  // ruin fallbacks (replaced by the gate GLB's Ruins meshes once it loads)
  const fallbackRuins = new T.Group();
  fallbackRuins.name = 'severance-pocket:ruin-fallbacks';
  for (const p of SEVERANCE_RUINS) {
    if (p.variant === 'Ruin_Paving') continue;
    const h = p.h || 2, w = p.r ? p.r * 1.4 : p.hw * 2;
    const m = new T.Mesh(new T.BoxGeometry(w, h, p.r ? p.r * 1.4 : p.hd * 2), stone);
    m.position.set(p.x, o.ground(p.x, p.z) + h / 2, p.z);
    m.rotation.y = p.r ? p.rot : 0;
    fallbackRuins.add(m);
  }
  group.add(fallbackRuins);
  const ruins = new T.Group();
  ruins.name = 'severance-pocket:ruins';
  group.add(ruins);
  // the return beacon stands on a small dais at the arrival terrace
  const dais = new T.Mesh(new T.CylinderGeometry(2.4, 2.8, 0.35, 10), new T.MeshStandardMaterial({ color: 0x3f3d40, roughness: 0.85, metalness: 0.15 }));
  dais.position.set(SEVERANCE_POCKET.beacon.x, o.ground(SEVERANCE_POCKET.beacon.x, SEVERANCE_POCKET.beacon.z) + 0.1, SEVERANCE_POCKET.beacon.z);
  dais.receiveShadow = true;
  group.add(dais);

  const landmark = createSeveranceGateLandmark(T, { scene, loader: o.assets?.loader, groundHeight: o.ground, url: o.url });
  let ruinsPlaced = false;
  let fogSaved = null;
  // Time-of-day preview (off unless asked for); see severance-daylight.js.
  const tod = createTimeOfDay(T, { scene, landmark, ...(o.lighting || {}) });
  // Manual clock: review captures advance the Expanse presentation by explicit
  // steps only, so frames are reproducible. Live play never uses it.
  let manual = false, lastEye = null, lastT = 0;
  function frame(dt, t, eye) {
      const inside = !!eye && inSeverancePocket(eye.x, eye.z, 40);
      group.visible = inside;
      landmark.update(dt, t, eye, { deterministic: manual });
      if (inside && !ruinsPlaced && landmark.status === 'ready') {
        ruinsPlaced = landmark.placeRuins(ruins, o.ground)(SEVERANCE_RUINS);
        fallbackRuins.visible = !ruinsPlaced;
      }
      // Leaving: the time-of-day preview restores first (to the regional preset), then
      // the preset restores the Reach. Entering: preset first, then the preview on top.
      if (!inside) tod.update(dt, false, SEVERANCE_POCKET);
      // a darker, warmer atmosphere inside the pocket; restored on leaving
      const fog = scene.fog;
      if (fog && inside && !fogSaved) {
        fogSaved = { color: fog.color.getHex(), near: fog.near, far: fog.far };
        fog.color.setHex(POCKET_FOG.color); fog.near = POCKET_FOG.near; fog.far = POCKET_FOG.far;
      } else if (fog && !inside && fogSaved) {
        fog.color.setHex(fogSaved.color); fog.near = fogSaved.near; fog.far = fogSaved.far;
        fogSaved = null;
      }
      if (inside) tod.update(dt, true, SEVERANCE_POCKET);
  }
  return {
    group, landmark, timeOfDay: tod,
    get ruinsPlaced() { return ruinsPlaced; },
    get manualClock() { return manual; },
    update(dt, t, eye) {
      lastEye = eye; lastT = t;
      frame(manual ? 0 : dt, t, eye);
    },
    /** Review captures: freeze the Expanse presentation clock (true) or release it. */
    setManualClock(on) { manual = !!on; },
    /** Advance the frozen presentation by exactly dt seconds, at most 0.1 per step (manual clock only). */
    step(dt) {
      if (!manual || !lastEye || !(dt >= 0)) return false;
      frame(Math.min(0.1, dt), lastT, lastEye);
      return true;
    },
    gateAnchor: SEVERANCE_GATE,
  };
}
