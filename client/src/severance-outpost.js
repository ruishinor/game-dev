// The Expedition Outpost in the Severance Expanse: a low angular shelter on
// trusses with ochre panels, the quartermaster's counter, supply crates, a
// generator, a comms mast with a beacon, and perimeter lamps. Placement comes
// from shared EXPEDITION_OUTPOST / OUTPOST_COLLIDERS; nothing here affects
// gameplay. Effects follow the gate engine: shader layers, additive halos,
// one pre-created light, deterministic under the manual clock.
import { EXPEDITION_OUTPOST as OP, OUTPOST_COLLIDERS } from '../../shared/severance-gate.js';
import { buildOutpostStaging } from './severance-outpost-staging.js';
import { loadStillpoint } from './stillpoint-world.js';
import { outpostStillpointPose } from '../../shared/stillpoint-roam.js';
import { noiseTexture, particleField } from './severance-gate.js';
import { SEVERANCE_EXPANSE as E, SEVERANCE_GATE, pocketHeight } from '../../shared/severance-gate.js';

export const OUTPOST_SHELTER_URL = '/client/assets/outpost_shelter.glb?v=417c3cd3fe83';

export const OUTPOST_LIMITS = Object.freeze({ lights: 1, halos: 12 });

const HALO_VS = `attribute vec4 aHalo; attribute vec3 aTint; varying vec2 vQ; varying vec3 vT; varying float vI;
void main(){ vec4 mv = viewMatrix * vec4(aHalo.xyz, 1.0); mv.xy += position.xy * aHalo.w; vQ = position.xy * 2.0; vT = aTint; vI = float(gl_InstanceID); gl_Position = projectionMatrix * mv; }`;
const HALO_FS = `uniform float uTime, uGain, uBlink; varying vec2 vQ; varying vec3 vT; varying float vI;
void main(){ float r2 = dot(vQ, vQ); float k = exp(-r2 * 4.0) * uGain;
  // the last halo is the mast beacon: a slow double blink
  if (vI > 10.5) { float t = fract(uTime * 0.5); k *= 2.0 * uBlink * (smoothstep(0.0, 0.03, t) * (1.0 - smoothstep(0.08, 0.14, t)) + smoothstep(0.2, 0.23, t) * (1.0 - smoothstep(0.28, 0.34, t))); }
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

  // ---- shelter: outpost_shelter.glb (front toward local +z, turned to face west)
  const shelter = new T.Group();
  shelter.name = 'severance-outpost:shelter';
  shelter.position.set(S.x, o.ground(S.x, S.z), S.z);
  shelter.rotation.y = S.yaw;
  root.add(shelter);
  const shelterFx = { lamp: null, strip: null, vent: null };
  let shelterStatus = 'idle';
  function shelterFallback() {
    // a faceted shell silhouette so the colliders are never invisible
    const len = S.rear - S.front, prof = new T.Shape();
    prof.moveTo(-S.hw, 0.9); prof.lineTo(-S.hw * 0.85, 2.15); prof.lineTo(-S.hw * 0.57, 3.45); prof.lineTo(0, S.height);
    prof.lineTo(S.hw * 0.57, 3.45); prof.lineTo(S.hw * 0.85, 2.15); prof.lineTo(S.hw, 0.9); prof.lineTo(S.hw - 0.3, 0.9); prof.lineTo(0, S.height - 0.3); prof.lineTo(-S.hw + 0.3, 0.9);
    const g = new T.ExtrudeGeometry(prof, { depth: len, bevelEnabled: false });
    g.translate(0, 0, -S.rear);
    const m = new T.Mesh(g, M.panel);
    m.castShadow = m.receiveShadow = true;
    shelter.add(m);
    shelterStatus = 'fallback';
  }
  function loadShelter() {
    if (shelterStatus !== 'idle') return;
    shelterStatus = 'loading';
    if (!o.loader) { shelterFallback(); return; }
    o.loader.loadAsync(o.shelterUrl || OUTPOST_SHELTER_URL).then((gltf) => {
      if (shelterStatus === 'disposed') return;
      gltf.scene.traverse((n) => {
        if (!n.isMesh) return;
        const name = n.material?.name;
        if (name === 'SH_Lamp' || name === 'SH_Strip' || name === 'SH_Vent') {
          n.material = n.material.clone();
          shelterFx[name === 'SH_Lamp' ? 'lamp' : name === 'SH_Strip' ? 'strip' : 'vent'] = n.material;
          n.castShadow = false;
        } else {
          n.castShadow = n.receiveShadow = true;
          if (n.material?.aoMap) n.material.aoMapIntensity = 1;
        }
      });
      shelter.add(gltf.scene);
      shelterStatus = 'ready';
    }).catch((err) => {
      if (shelterStatus === 'disposed') return;
      console.warn('[outpost] shelter GLB unavailable; using a simple shell:', err?.message || err);
      shelterFallback();
    });
  }

  // Two additional field shelters: pitched weather roofs, structural posts,
  // fascia lighting, and no unseen solid walls. Each post's actual collider
  // is registered in the authoritative shared outpost contract.
  for(const sh of OP.auxiliaryShelters){
    const y=o.ground(sh.x,sh.z);
    const roof=box(T,M.roof,sh.w+.34,.17,sh.d+.38,sh.x,y+sh.height+.06,sh.z);
    roof.name='severance-outpost:shelter-'+sh.key;
    roof.rotation.z=.065;
    root.add(roof);
    const underside=box(T,M.panelDark,sh.w-.3,.055,sh.d-.2,sh.x,y+sh.height-.06,sh.z);
    underside.name='severance-outpost:shelter-lining-'+sh.key;
    root.add(underside);
    for(const sign of [-1,1]){
      root.add(box(T,M.frame,sh.w-.4,.09,.12,sh.x,y+sh.height-.2,sh.z+sign*(sh.d/2-.14)));
      root.add(box(T,M.teal,sh.w*.72,.045,.035,sh.x,y+sh.height-.25,sh.z+sign*(sh.d/2+.18)));
    }
    const ridge=box(T,M.frame,.14,.18,sh.d+.25,sh.x,y+sh.height+.19,sh.z);
    root.add(ridge);
  }
  // Stillpoints are noncombat camp followers using the existing skinned GLB
  // and a deterministic presentation-only movement loop.
  let followerStatus='idle';
  let followers=[];
  function startFollowers(){
    if(followerStatus!=='idle')return;
    followerStatus='loading';
    if(!o.loader){followerStatus='unavailable';return;}
    Promise.all(OP.stillpointFollowers.map((site,i)=>loadStillpoint(T,o.loader,site,{
      poseAt:(seconds)=>outpostStillpointPose(i,seconds)
    }))).then(models=>{
      if(followerStatus==='disposed'){for(const m of models)m.dispose?.();return;}
      followers=models;
      models.forEach((m,i)=>{m.group.name='severance-outpost:stillpoint-'+(i+1);root.add(m.group);});
      followerStatus='ready';
    }).catch(err=>{
      followerStatus='unavailable';
      console.warn('[outpost] Stillpoint followers unavailable:',err?.message||err);
    });
  }

  // ---- holo-map table: the Expanse in miniature, routes traced, the gate marked
  const holo = buildHoloMap(T, o.ground, noise);
  holo.group.position.set(OP.table.x, o.ground(OP.table.x, OP.table.z), OP.table.z);
  root.add(holo.group);

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
    } else if (c.type === 'outpost_table') {
      const top = new T.Mesh(new T.CylinderGeometry(c.r, c.r * 0.92, 0.12, 12), M.frame);
      top.position.set(c.x, y + c.h - 0.06, c.z); top.castShadow = top.receiveShadow = true; root.add(top);
      const ped = new T.Mesh(new T.CylinderGeometry(0.22, 0.34, c.h - 0.1, 8), M.panelDark);
      ped.position.set(c.x, y + (c.h - 0.1) / 2, c.z); root.add(ped);
      const ring = new T.Mesh(new T.TorusGeometry(c.r * 0.9, 0.025, 6, 32), M.teal);
      ring.rotation.x = Math.PI / 2; ring.position.set(c.x, y + c.h + 0.01, c.z); root.add(ring);
    } else if(c.type==='outpost_shelter_post'){
      root.add(box(T,M.frame,c.r*2,c.h,c.r*2,c.x,y+c.h/2,c.z));
      root.add(box(T,M.brass||M.panel,.4,.14,.4,c.x,y+c.h-.07,c.z));
    } else if (c.type === 'outpost_lamp') {
      const post = new T.Mesh(new T.CylinderGeometry(0.05, 0.08, c.h, 5), M.frame);
      post.position.set(c.x, y + c.h / 2, c.z);
      root.add(post);
      root.add(box(T, M.warm, 0.18, 0.22, 0.18, c.x, y + c.h + 0.05, c.z));
    }
  }

  const staging=buildOutpostStaging(T,{ground:o.ground,assets:o.assets});
  root.add(staging.group);
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
  // generator heat haze and exhaust sparks; drifting camp dust
  const haze = particleField(T, 40, { seed: 71, size: 0.9, height: 4.5, radius: 0.5, rise: 0.9, color: 0x403024 });
  haze.mesh.position.set(gen.x, o.ground(gen.x, gen.z) + gen.h, gen.z);
  haze.mesh.name = 'severance-outpost:generator-haze';
  root.add(haze.mesh);
  const sparks = particleField(T, 24, { seed: 72, size: 0.06, height: 2.2, radius: 0.3, rise: 1.6, color: 0xffa04a });
  sparks.mesh.position.copy(haze.mesh.position);
  root.add(sparks.mesh);
  const dust = particleField(T, 140, { seed: 73, size: 0.1, height: 6, radius: OP.r, rise: 0.25, color: 0xffd8a8 });
  dust.mesh.position.set(OP.x, o.ground(OP.x, OP.z), OP.z);
  dust.mesh.name = 'severance-outpost:dust';
  root.add(dust.mesh);
  // one warm light under the shelter
  const light = new T.PointLight(0xffb36a, 0, 18, 1.8);
  light.name = 'severance-outpost:light';
  light.position.set(S.x - 2, o.ground(S.x, S.z) + S.height - 0.7, S.z);
  root.add(light);

  return {
    root,
    get shelterStatus() { return shelterStatus; },
    update(dt, t, eye, { night = 0, deterministic = false } = {}) {
      const near = eye ? Math.hypot(eye.x - OP.x, eye.z - OP.z) : Infinity;
      root.visible = near < 260;
      if (root.visible && shelterStatus === 'idle') loadShelter();
      if(root.visible && followerStatus==='idle')startFollowers();
      if(followerStatus==='ready' && eye)for(const m of followers)m.update(dt,eye,deterministic,t);
      haloMat.uniforms.uTime.value = t;
      haloMat.uniforms.uGain.value = 0.45 + 0.8 * night;
      light.intensity = near < 60 ? 6 + 16 * night : 0;
      M.warm.emissiveIntensity = 1.4 + 1.6 * night;
      const flick = deterministic ? 1 : 0.92 + 0.08 * Math.sin(t * 13.1) * Math.sin(t * 3.7);
      if (shelterFx.lamp) shelterFx.lamp.emissiveIntensity = (1.2 + 2.2 * night) * flick;
      if (shelterFx.strip) shelterFx.strip.emissiveIntensity = 0.8 + 1.4 * night;
      if (shelterFx.vent) shelterFx.vent.emissiveIntensity = (0.6 + 1.2 * night) * (0.75 + 0.25 * Math.sin(t * 1.3));
      const fx = near < 90;
      for (const f of [haze, sparks, dust]) { f.mesh.visible = fx; f.mat.uniforms.uTime.value = t; f.mat.uniforms.uMotion.value = deterministic ? 0.6 : 1; }
      haze.mat.uniforms.uLevel.value = 0.35;
      sparks.mat.uniforms.uLevel.value = 0.5 + 0.5 * night;
      dust.mat.uniforms.uLevel.value = 0.25 + 0.35 * night;
      holo.update(t, near < 70, deterministic);
    },
    stats() { return { visible: root.visible, halos: halos.length, lights: 1, staging:staging.stats, shelter: shelterStatus, shelters:1+OP.auxiliaryShelters.length, stillpoints:followers.length, holo: holo.group.visible }; },
    dispose() {
      shelterStatus = 'disposed';
      followerStatus='disposed';
      for(const m of followers)m.dispose?.();
      holo.dispose();
      staging.dispose();
      root.traverse((n) => { n.geometry?.dispose?.(); });
      for (const m of Object.values(M)) m.dispose();
      haloMat.dispose(); noise.dispose();
      root.removeFromParent();
    },
  };
}

// ----------------------------------------------------------------------------- holo-map
const HOLO_VS = `varying vec3 vW; varying vec3 vN; varying vec3 vL;
void main(){ vL = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
const HOLO_FS = `uniform float uTime, uGain; uniform vec3 uColor; varying vec3 vW; varying vec3 vN; varying vec3 vL;
void main(){ vec3 V = normalize(cameraPosition - vW); float fr = pow(1.0 - abs(dot(normalize(vN), V)), 1.6);
  float scan = 0.6 + 0.4 * sin(vW.y * 140.0 - uTime * 6.0);
  float contour = smoothstep(0.86, 1.0, fract(vL.y * 26.0));
  float sweep = exp(-pow(fract(uTime * 0.18) * 2.4 - 1.2 - vL.x * 1.2, 2.0) * 40.0);
  float flick = 0.9 + 0.1 * sin(uTime * 37.0) * sin(uTime * 11.0);
  float k = (0.14 + 0.5 * fr + 0.55 * contour + 0.9 * sweep) * scan * flick * uGain;
  gl_FragColor = vec4(uColor * k, k * 0.85); }`;
const LINE_FS = `uniform float uTime, uGain; uniform vec3 uColor; varying vec3 vL;
void main(){ float dash = 0.55 + 0.45 * sin(vL.z * 90.0 + vL.x * 90.0 - uTime * 4.0); gl_FragColor = vec4(uColor * dash * uGain, dash * uGain); }`;

/** A floating miniature of the Expanse over the outpost table: terrain, three routes, the gate. */
function buildHoloMap(T, ground, noise) {
  const group = new T.Group();
  group.name = 'severance-outpost:holo-map';
  const span = 1.3, lift = 1.18;                 // metres across, height above the table base
  const sx = span / (2 * E.hd), nx = 34, nz = 40;
  const geo = new T.PlaneGeometry(2 * E.hw * sx, 2 * E.hd * sx, nx, nz);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const wx = E.x + pos.getX(i) / sx, wz = E.z + pos.getZ(i) / sx;
    pos.setY(i, Math.min(60, pocketHeight(wx, wz)) * sx * 0.9);
  }
  geo.computeVertexNormals();
  const U = (v) => ({ value: v });
  const time = U(0), gain = U(1);
  const mat = new T.ShaderMaterial({ uniforms: { uTime: time, uGain: gain, uColor: U(new T.Color(0x5ff0e0)) }, vertexShader: HOLO_VS, fragmentShader: HOLO_FS,
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
  const map = new T.Mesh(geo, mat);
  map.position.y = lift;
  map.rotation.y = Math.PI / 2;               // north of the Expanse points away from the shelter mouth
  map.renderOrder = 7;
  group.add(map);
  // routes: west causeway, central pass, east flats, as dashed lines above the relief
  const routes = [
    [[15, -866], [-30, -820], [-48, -760], [-48, -694], [-20, -650], [0, -625]],
    [[15, -866], [5, -790], [-24, -726], [24, -726], [10, -660], [0, -625]],
    [[15, -866], [50, -800], [60, -740], [50, -680], [20, -640], [0, -625]],
  ];
  const lineMat = new T.ShaderMaterial({ uniforms: { uTime: time, uGain: gain, uColor: U(new T.Color(0xffc070)) }, vertexShader: 'varying vec3 vL; void main(){ vL = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: LINE_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
  for (const r of routes) {
    const pts = r.map(([x, z]) => new T.Vector3((x - E.x) * sx, Math.max(0, pocketHeight(x, z)) * sx * 0.9 + 0.012, (z - E.z) * sx));
    const line = new T.Line(new T.BufferGeometry().setFromPoints(pts), lineMat);
    map.add(line);
  }
  // the gate: a pulsing amber marker and a thin column
  const gateMat = new T.MeshBasicMaterial({ color: 0xffa040, transparent: true, blending: T.AdditiveBlending, depthWrite: false });
  const gm = new T.Mesh(new T.ConeGeometry(0.018, 0.06, 4), gateMat);
  gm.position.set((SEVERANCE_GATE.x - E.x) * sx, 0.06, (SEVERANCE_GATE.z - E.z) * sx);
  gm.rotation.x = Math.PI;
  map.add(gm);
  const col = new T.Mesh(new T.CylinderGeometry(0.003, 0.003, 0.35, 4), gateMat);
  col.position.set(gm.position.x, 0.2, gm.position.z);
  map.add(col);
  // projector cone from the table
  const coneMat = new T.ShaderMaterial({ uniforms: { uTime: time, uGain: gain }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uTime, uGain; varying vec2 vUv; void main(){ float k = (1.0 - vUv.y) * 0.18 * (0.8 + 0.2 * sin(uTime * 5.0 + vUv.x * 40.0)) * uGain; gl_FragColor = vec4(vec3(0.35, 0.95, 0.9) * k, k); }',
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
  const cone = new T.Mesh(new T.CylinderGeometry(span * 0.62, 0.08, lift - 0.95, 20, 1, true), coneMat);
  cone.position.y = 0.95 + (lift - 0.95) / 2;
  group.add(cone);
  return {
    group,
    update(t, on, deterministic) {
      group.visible = on;
      if (!on) return;
      time.value = t;
      gain.value = 1;
      gm.scale.setScalar(1 + 0.25 * Math.sin(t * 3.0));
      if (!deterministic) map.rotation.y = Math.PI / 2 + Math.sin(t * 0.15) * 0.08;
    },
    dispose() { for (const m of [mat, lineMat, gateMat, coneMat]) m.dispose(); group.traverse((n) => n.geometry?.dispose?.()); },
  };
}
