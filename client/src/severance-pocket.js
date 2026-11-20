// Presentation of the Severance Expanse: its terrain (ash plains, the Amber
// Flats, the dry lake, mesas and ridges with exposed strata, the enclosing
// ridge), the environment kit (ring, spires, crystals, boulders), ruins and the
// Severance Gate landmark. Collision and walkable ground height come from
// shared/severance-gate.js; nothing here affects gameplay.
import { SEVERANCE_POCKET, SEVERANCE_RUINS, SEVERANCE_GATE, SEVERANCE_MASSIFS, inSeverancePocket, worldToGate, massifLift, expanseSaddle } from '../../shared/severance-gate.js';
import { createSeveranceGateLandmark, noiseTexture } from './severance-gate.js';
import { createExpanseKit } from './severance-expanse-kit.js';
import { createTimeOfDay } from './severance-daylight.js';

const smooth = (t) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };
const POCKET_FOG = { color: 0x5a4a45, near: 70, far: 460 };
export const TERRAIN_SPACING = 1.5;

/**
 * Visible massif relief. The shared lift (gameplay ground) is a smooth round
 * profile that is zero at each collider radius; the presentation carves lobes,
 * cliff bands and terraces into it but never rises above it outside a collider,
 * so walkable ground matches exactly.
 */
function massifRelief(x, z) {
  let h = 0;
  for (const m of SEVERANCE_MASSIFS) {
    const dx = x - m.x, dz = z - m.z;
    if (Math.abs(dx) > m.r || Math.abs(dz) > m.r) continue;
    const d = Math.hypot(dx, dz);
    if (d >= m.r) continue;
    const a = Math.atan2(dz, dx);
    const lobe = 0.86 + 0.08 * Math.sin(a * 3 + m.seed) + 0.06 * Math.sin(a * 7 + m.seed * 1.7);
    const t = d / (m.r * lobe);
    if (t >= 1) continue;
    let k;
    if (m.kind === 'mesa') {
      // flat caprock, a sheer upper cliff, a talus apron below
      const cliff = 1 - smooth((t - 0.6) / 0.14);
      const apron = 0.34 * (1 - smooth((t - 0.72) / 0.28));
      k = Math.max(cliff, apron) * (0.96 + 0.04 * Math.sin(x * 0.4 + z * 0.33));
    } else if (m.kind === 'ridge') {
      // a talus mound under the crags (severance-expanse-kit.js carries the crest)
      const c = 1 - smooth((t - 0.15) / 0.85);
      k = (Math.round(c * 5) / 5 * 0.3 + c * 0.7) * 0.34;
    } else k = 1 - smooth((t - 0.2) / 0.75);
    h = Math.max(h, m.h * k);
  }
  return h;
}

function visibleGround(x, z, ground) {
  return ground(x, z) - massifLift(x, z) + massifRelief(x, z);
}

/** Height of the visible ridge beyond the walkable region (continues the rim). */
export function ridgeHeight(x, z, ground) {
  const P = SEVERANCE_POCKET;
  const dx = Math.abs(x - P.x) - P.hw, dz = Math.abs(z - P.z) - P.hd;
  const out = Math.max(dx, dz);
  if (out <= 0) return visibleGround(x, z, ground);
  const edge = ground(Math.max(P.x - P.hw, Math.min(P.x + P.hw, x)), Math.max(P.z - P.hd, Math.min(P.z + P.hd, z)));
  const cliff = smooth(out / 24);
  // irregular crest: several octaves with sharpened (ridged) peaks
  const ridged = (f, a) => a * (1 - Math.abs(Math.sin(x * f + 1.7) * Math.cos(z * f * 0.83 - 0.6)));
  const crest = 10 + 9 * Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.038) + ridged(0.021, 14) + ridged(0.067, 6) + ridged(0.19, 2.2);
  const sad = expanseSaddle(Math.max(P.x - P.hw, Math.min(P.x + P.hw, x)), Math.max(P.z - P.hd, Math.min(P.z + P.hd, z)));
  return edge + (out * 0.75 + cliff * crest) * sad;
}

// Exposed strata on steep faces, cross-bedding and wind streaks: world-space,
// so the bands run level across every slope and both the walkable ground and the
// enclosing ridge read as one geology.
function strata(T, material, noise) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uStrata = { value: noise };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSW; varying vec3 vSN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSW = (modelMatrix * vec4(transformed, 1.0)).xyz; vSN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uStrata; varying vec3 vSW; varying vec3 vSN;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        float steep = 1.0 - smoothstep(0.6, 0.84, normalize(vSN).y);
        vec4 n = texture2D(uStrata, vSW.xz * 0.011);
        // irregular bedding: a 1D noise along height, warped across the face
        float y = vSW.y + (n.r - 0.5) * 4.0;
        float bed = texture2D(uStrata, vec2(y * 0.041, 0.37 + vSW.x * 0.0013)).g;
        float fine = texture2D(uStrata, vec2(y * 0.23, 0.71 + vSW.z * 0.002)).b;
        vec3 ochre = vec3(0.19, 0.125, 0.09), pale = vec3(0.27, 0.215, 0.17), dark = vec3(0.075, 0.065, 0.066);
        vec3 rockc = mix(dark, ochre, smoothstep(0.32, 0.6, bed));
        rockc = mix(rockc, pale, smoothstep(0.68, 0.82, bed) * 0.65);
        rockc *= 0.78 + 0.3 * fine;
        float streak = texture2D(uStrata, vec2(vSW.x * 0.05 + vSW.z * 0.05, vSW.y * 0.006)).a;
        rockc *= 0.8 + 0.3 * streak;
        float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
        rockc *= 0.7 + 0.45 * clamp(lum, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, rockc, steep);
        // fine ash ripples on the flats
        float ripple = 0.5 + 0.5 * sin(dot(vSW.xz, vec2(0.82, 0.57)) * 3.1 + n.a * 6.0);
        diffuseColor.rgb *= mix(1.0, 0.94 + 0.08 * ripple, 1.0 - steep);
      }`);
  };
  material.customProgramCacheKey = () => 'severance-strata-v2';
}

function terrain(T, assets, ground) {
  const P = SEVERANCE_POCKET;
  const margin = 60;
  const w = (P.hw + margin) * 2, d = (P.hd + margin) * 2;
  const g = new T.PlaneGeometry(w, d, Math.round(w / TERRAIN_SPACING), Math.round(d / TERRAIN_SPACING));
  g.rotateX(-Math.PI / 2);
  g.translate(P.x, 0, P.z);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const ash = new T.Color(0x3c3637), dust = new T.Color(0x5b4f45), amber = new T.Color(0x6e5440), scorch = new T.Color(0x2a2224),
    crust = new T.Color(0x8d7d6c), rock = new T.Color(0x4a4547), c = new T.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = ridgeHeight(x, z, ground);
    pos.setY(i, h);
    const u = x - P.x, v = z - P.z;
    const n = 0.5 + 0.5 * Math.sin(x * 0.31 + z * 0.17) * Math.cos(z * 0.23 - x * 0.07);
    c.copy(ash).lerp(dust, n * 0.6);
    c.lerp(amber, smooth((u - 10) / 40) * 0.7);                              // the Amber Flats
    c.lerp(ash, smooth((-u - 20) / 30) * 0.35);                              // the cooler west causeway
    const lake = Math.hypot(u - 62, v - 12) / 26;
    c.lerp(crust, (1 - smooth(lake * 1.15 - 0.15)) * 0.75);                  // salt crust of the dry lake
    const { bx, by } = worldToGate(x, z);
    const near = smooth(1 - Math.hypot(Math.max(0, Math.abs(bx) - 9), Math.max(0, Math.abs(by + 4) - 12)) / 14);
    c.lerp(scorch, near * 0.55);
    c.lerp(rock, smooth((h - 6) / 18) * 0.6);
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
  } else material = new T.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const noise = noiseTexture(T, 128, 37);
  strata(T, material, noise);
  const mesh = new T.Mesh(g, material);
  mesh.name = 'severance-pocket:terrain';
  mesh.receiveShadow = true;
  mesh.userData.vertices = pos.count;
  return mesh;
}

/**
 * @param T three namespace
 * @param scene the world scene
 * @param o {assets, ground, rockGeo(seed), lighting?: {sky, ambient, sun, dir}}
 */
export function buildSeverancePocket(T, scene, o) {
  const preexisting = new Set(scene.children);
  const group = new T.Group();
  group.name = 'severance-pocket';
  group.visible = false;
  scene.add(group);
  group.add(terrain(T, o.assets, o.ground));
  const stone = new T.MeshStandardMaterial({ color: 0x4b4648, roughness: 0.92, flatShading: true });
  // ring, spires, hoodoos, talus, outcrops and crystals (severance_kit.glb)
  const kit = createExpanseKit(T, { group, loader: o.assets?.loader, ground: (x, z) => ridgeHeight(x, z, o.ground), url: o.kitUrl });
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
  // The return Phase Scar entity carries its own foundation; no stacked dais.

  const landmark = createSeveranceGateLandmark(T, { scene, loader: o.assets?.loader, groundHeight: o.ground, url: o.url });
  let ruinsPlaced = false;
  let fogSaved = null;
  // Time-of-day preview (off unless asked for); see severance-daylight.js.
  const tod = createTimeOfDay(T, { scene, landmark, ...(o.lighting || {}) });
  // Manual clock: review captures advance the Expanse presentation by explicit
  // steps only, so frames are reproducible. Live play never uses it.
  let manual = false, lastEye = null, lastT = 0, kitTime = 0;
  let cull = [], culled = null;
  const own = new Set(scene.children.filter((c) => !preexisting.has(c)));
  const sky = o.lighting?.sky;
  function frame(dt, t, eye) {
      const inside = !!eye && inSeverancePocket(eye.x, eye.z, 40);
      group.visible = inside;
      if (inside && !culled) { culled = cull.filter((c) => c.visible); for (const c of culled) c.visible = false; }
      else if (!inside && culled) { for (const c of culled) c.visible = true; culled = null; }
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
        if (sky) fogSaved.sky = sky.position.clone();
      } else if (fog && !inside && fogSaved) {
        fog.color.setHex(fogSaved.color); fog.near = fogSaved.near; fog.far = fogSaved.far;
        if (sky && fogSaved.sky) sky.position.copy(fogSaved.sky);
        fogSaved = null;
      }
      // The sky dome (r 420) travels with the eye inside the Expanse, so its horizon
      // gradient always sits on the enclosing ridge wherever one stands in the zone.
      if (inside && sky) sky.position.set(eye.x, 0, eye.z);
      if (inside) tod.update(dt, true, eye);
      if (inside) {
        kitTime += dt;
        kit.update(dt, kitTime, eye, { night: tod.active ? tod.sample(tod.state.t).stars : 0, deterministic: manual });
      }
  }
  return {
    group, landmark, kit, timeOfDay: tod,
    get ruinsPlaced() { return ruinsPlaced; },
    get manualClock() { return manual; },
    update(dt, t, eye) {
      lastEye = eye; lastT = t;
      frame(manual ? 0 : dt, t, eye);
    },
    /** Static Reach objects to hide while the camera is inside the Expanse. */
    setRegionCull(list) { cull = list.filter((c) => !c.isLight && !own.has(c)); },
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
