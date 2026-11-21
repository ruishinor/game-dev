// VFX lab: inspect the game's real effect recipes (vfx/engine.js + vfx/combat.js)
// on stand-in mannequins, with deterministic playback.
//
//   /client/vfx-lab.html?fx=area:rift_pulse&t=0.6&seed=7&q=2&light=night&n=1&paused=1&capture=1
//
// The engine is seeded and has no other randomness, so a scrub rebuilds the
// engine with the same seed, re-triggers the effect at t = 0 and steps it at a
// fixed 1/60 s to the requested time: every frame is reproducible. Controls:
// play/pause, restart, timeline scrub, speed, seed, quality, lighting presets,
// concurrent copies, reduced motion, live stats and a screenshot. Automation
// uses window.__lab ({ ready, seek(t), state() }).
import * as THREE from 'three';
import { createVfx } from './vfx/engine.js';
import { CombatVfx, AREA_KINDS } from './vfx/combat.js';
import { buildTextures } from './vfx/textures.js';
import { CLASSES } from '../../shared/content.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
if (params.get('capture') === '1') document.body.classList.add('capture');

const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
// minimal orbit (drag to turn, wheel to zoom); no extra vendor modules are served
const orbit = { yaw: Number(params.get('yaw') || 0), pitch: Number(params.get('pitch') || 0.42), dist: Number(params.get('dist') || 12), target: new THREE.Vector3(0, 1.2, 0) };
const controls = {
  update() {
    const c = Math.cos(orbit.pitch);
    camera.position.set(orbit.target.x + Math.sin(orbit.yaw) * c * orbit.dist, orbit.target.y + Math.sin(orbit.pitch) * orbit.dist, orbit.target.z + Math.cos(orbit.yaw) * c * orbit.dist);
    camera.lookAt(orbit.target);
  },
};
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  orbit.yaw -= (e.clientX - drag.x) * 0.006;
  orbit.pitch = Math.max(-0.1, Math.min(1.45, orbit.pitch + (e.clientY - drag.y) * 0.005));
  drag = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('wheel', (e) => { orbit.dist = Math.max(3, Math.min(60, orbit.dist * (1 + Math.sign(e.deltaY) * 0.1))); e.preventDefault(); }, { passive: false });
controls.update();

// ---- stage: floor, lights, mannequins
const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.9 }));
floor.receiveShadow = true;
scene.add(floor);
const hemi = new THREE.HemisphereLight(0xb0bcff, 0x4c4038, 1.2);
const sun = new THREE.DirectionalLight(0xffe2c0, 2.2);
sun.position.set(-6, 10, 5);
scene.add(hemi, sun);
const LIGHTING = {
  studio: { bg: 0x1b1d22, hemi: 1.2, sun: 2.2, floor: 0x3a3d42 },
  day: { bg: 0x8fa6bf, hemi: 1.6, sun: 3.0, floor: 0x5f5a50 },
  dusk: { bg: 0x3a2a3a, hemi: 0.7, sun: 1.2, floor: 0x3d3634 },
  night: { bg: 0x07090f, hemi: 0.18, sun: 0.12, floor: 0x1e2024 },
};
function applyLighting(key) {
  const L = LIGHTING[key] || LIGHTING.studio;
  scene.background = new THREE.Color(L.bg);
  hemi.intensity = L.hemi;
  sun.intensity = L.sun;
  floor.material.color.setHex(L.floor);
}

let nextId = 1;
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.6, metalness: 0.2 });
function mannequin(x, z, yaw, meta) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.0, 4, 12), bodyMat);
  body.position.y = 0.85;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), bodyMat);
  head.position.y = 1.7;
  g.add(body, head);
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  scene.add(g);
  return {
    group: g, id: nextId++, yaw, placed: true, inView: true, dead: false, meta,
    pos: new THREE.Vector3(x, 0, z), chest: new THREE.Vector3(x, 1.25, z), head: new THREE.Vector3(x, 1.75, z),
    model: { hover: 0, radius: 0.5, height: 1.8, trigger() {} },
  };
}

// ---- effect catalogue (every recipe the game can call)
const CATALOGUE = [];
for (const [cls, def] of Object.entries(CLASSES)) {
  for (const ab of [...def.abilities, 'auto']) CATALOGUE.push({ id: `cast:${cls}:${ab}`, label: `${cls} · ${ab}`, cls, kind: 'cast', ab });
}
for (const k of [...AREA_KINDS].sort()) CATALOGUE.push({ id: `area:${k}`, label: `area · ${k}`, kind: 'area', k });
for (const k of ['melee', 'bolt']) CATALOGUE.push({ id: `hit:${k}`, label: `hit · ${k}`, kind: 'hit', k });
for (const k of ['windup', 'level', 'acquire']) CATALOGUE.push({ id: `event:${k}`, label: `event · ${k}`, kind: k });

const sel = $('fx');
for (const c of CATALOGUE) { const o = document.createElement('option'); o.value = c.id; o.textContent = c.label; sel.append(o); }

// ---- engine lifecycle
const textures = buildTextures(THREE);
let vfx = null, cvfx = null, actors = [];
const state = {
  fx: CATALOGUE.some((c) => c.id === params.get('fx')) ? params.get('fx') : CATALOGUE[0].id, t: Number(params.get('t') || 0), seed: Number(params.get('seed') || 7), q: Number(params.get('q') ?? 2),
  light: params.get('light') || 'studio', n: Number(params.get('n') || 1), speed: 1, paused: params.get('paused') === '1', reduced: params.get('rm') === '1',
};
const STEP = 1 / 60, LOOP = 4;

function clearActors() { for (const a of actors) { scene.remove(a.s.group, a.d.group); } actors = []; }
function stage() {
  clearActors();
  const side = Math.ceil(Math.sqrt(state.n));
  for (let i = 0; i < state.n; i++) {
    const ox = ((i % side) - (side - 1) / 2) * 9, oz = (Math.floor(i / side) - (side - 1) / 2) * 7;
    const entry = CATALOGUE.find((c) => c.id === state.fx) || CATALOGUE[0];
    const s = mannequin(ox - 3, oz, Math.PI / 2, { k: 'p', c: entry.cls || 'vanguard' });
    const d = mannequin(ox + 3, oz, -Math.PI / 2, { k: 'e', c: 'sentinel' });
    actors.push({ s, d, ox, oz });
  }
}
function trigger() {
  const entry = CATALOGUE.find((c) => c.id === state.fx) || CATALOGUE[0];
  for (const { s, d, ox, oz } of actors) {
    if (entry.kind === 'cast') cvfx.cast(entry.ab, s, d);
    else if (entry.kind === 'area') cvfx.area({ e: 'fx', k: entry.k, s: 1, d: 2, x: ox + 3, y: 0, z: oz, r: 4, ms: 3000 }, s, d, d);
    else if (entry.kind === 'hit') cvfx.hit(d, s, { e: 'hit', ab: 'auto', k: entry.k, a: 12 });
    else if (entry.kind === 'windup') cvfx.windup(d, 2000);
    else if (entry.kind === 'level') cvfx.level(s);
    else if (entry.kind === 'acquire') cvfx.acquire(s);
  }
}
function rebuild() {
  vfx?.dispose();
  vfx = createVfx(THREE, scene, { textures, quality: state.q, seed: state.seed, reducedMotion: state.reduced, groundHeight: () => 0 });
  cvfx = new CombatVfx(vfx);
  stage();
  trigger();
  clock = 0;
}
let clock = 0;
/** Deterministic seek: rebuild and step at 1/60 s to t. */
function seek(t) {
  rebuild();
  const n = Math.round(Math.max(0, Math.min(LOOP, t)) / STEP);
  for (let i = 0; i < n; i++) vfx.update(STEP);
  clock = n * STEP;
}

// ---- UI wiring
function syncUi() {
  sel.value = state.fx; $('seed').value = state.seed; $('q').value = String(state.q); $('light').value = state.light; $('n').value = String(state.n);
  $('rm').checked = state.reduced; $('play').textContent = state.paused ? 'Play' : 'Pause';
}
sel.onchange = () => { state.fx = sel.value; seek(0); };
$('seed').onchange = () => { state.seed = Number($('seed').value) || 1; seek(clock); };
$('q').onchange = () => { state.q = Number($('q').value); seek(clock); };
$('light').onchange = () => { state.light = $('light').value; applyLighting(state.light); };
$('n').onchange = () => { state.n = Number($('n').value); seek(clock); };
$('rm').onchange = () => { state.reduced = $('rm').checked; seek(clock); };
$('speed').onchange = () => { state.speed = Number($('speed').value); };
$('play').onclick = () => { state.paused = !state.paused; syncUi(); };
$('restart').onclick = () => seek(0);
$('time').oninput = () => { state.paused = true; syncUi(); seek(Number($('time').value)); };
$('shot').onclick = () => { renderer.render(scene, camera); const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = `vfx-${state.fx.replace(/[:]/g, '_')}-${clock.toFixed(2)}s.png`; a.click(); };

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
applyLighting(state.light);
syncUi();
seek(state.t);

let last = performance.now(), frameMs = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  frameMs = frameMs * 0.9 + (now - last) * 0.1;
  last = now;
  if (!state.paused) {
    const adv = dt * state.speed;
    clock += adv;
    if (clock > LOOP) seek(0); else vfx.update(adv);
  }
  $('time').value = clock.toFixed(2);
  $('tval').textContent = clock.toFixed(2) + ' s';
  controls.update();
  renderer.render(scene, camera);
  const st = vfx.stats();
  $('stats').textContent = `particles ${st.particles}  items ${st.items}\nemitted ${st.emitted}  dropped ${st.dropped}\nlights ${st.lights}  ribbons ${st.ribbons}\ncalls ${renderer.info.render.calls}  tris ${renderer.info.render.triangles}\nframe ${frameMs.toFixed(1)} ms`;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.__lab = {
  ready: true,
  catalogue: CATALOGUE.map((c) => c.id),
  seek(t) { state.paused = true; syncUi(); seek(t); renderer.render(scene, camera); return clock; },
  select(fx) { if (!CATALOGUE.some((c) => c.id === fx)) return false; state.fx = fx; syncUi(); seek(0); return true; },
  state() { return { ...state, clock, stats: vfx.stats(), calls: renderer.info.render.calls }; },
};
