// Runtime preview for GLBs produced by tools/asset-pipeline.
//
// Loads /client/pipeline-assets/manifest.json:
//   { "models": [ { "id", "file", "label", "clips": { "<name>": { "loop", "speed"?, "speedSamples"?, "turnDegS"? } } } ] }
// Locomotion clips are authored in place; this page moves the model at the
// clip's declared ground speed / turn rate (as a game would), over a grid so
// foot sliding is visible. window.__pipelinePreview exposes a deterministic
// API for automated captures: setClip(name), setTime(seconds), state.
import * as THREE from '/vendor/three/three.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { makeEnvironment } from './scene.js';

const BASE = '/client/pipeline-assets/';
const $ = (id) => document.getElementById(id);
const state = { ready: false, id: null, clip: null, time: 0, triangles: 0, bones: 0, clips: [], error: null, playing: true };
const api = { state };
window.__pipelinePreview = api;

const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(960, 720, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x283039);
scene.environment = makeEnvironment(renderer);
scene.add(new THREE.HemisphereLight(0xc8d8e8, 0x5a4c40, 1.1));
const sun = new THREE.DirectionalLight(0xfff0dc, 2.6);
sun.position.set(-4, 8, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 30 });
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x4a4f4c, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
const grid = new THREE.GridHelper(200, 400, 0x7c8a86, 0x5d6663); // 0.5 m cells: makes foot sliding visible
grid.position.y = 0.002;
scene.add(ground, grid);
const cam = new THREE.PerspectiveCamera(40, 4 / 3, 0.05, 400);
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

let models = new Map();
let current = null; // { root, mixer, actions, entry, size }
const clock = new THREE.Clock();

function rootPose(clipMeta, t) {
  // root motion the runtime would apply: forward is +Z in glTF/three
  let dist = 0;
  if (clipMeta.speedSamples) {
    const fps = 30, s = clipMeta.speedSamples;
    const n = Math.min(s.length - 1, Math.floor(t * fps));
    for (let i = 0; i < n; i++) dist += s[i] / fps;
    dist += (s[n] ?? 0) * (t - n / fps);
  } else dist = (clipMeta.speed || 0) * t;
  const yaw = THREE.MathUtils.degToRad(clipMeta.turnDegS || 0) * t;
  return { dist, yaw };
}

function apply(t) {
  if (!current || !state.clip) return;
  const meta = current.entry.clips[state.clip] || {};
  const action = current.actions.get(state.clip);
  const dur = action.getClip().duration;
  const local = meta.loop ? t % dur : Math.min(t, dur);
  current.mixer.setTime(local);
  const { dist, yaw } = rootPose(meta, t);
  current.root.position.set(0, 0, dist);
  current.root.rotation.y = yaw;
  state.time = t;
}

function frameCamera() {
  const yaw = THREE.MathUtils.degToRad(Number($('yaw').value)), pitch = THREE.MathUtils.degToRad(Number($('pitch').value));
  const target = current ? current.root.position.clone().add(new THREE.Vector3(0, current.size.y * 0.45, 0)) : new THREE.Vector3();
  const d = current ? current.size.length() * 1.35 : 6;
  cam.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * d, target.y + Math.sin(pitch) * d, target.z + Math.cos(yaw) * Math.cos(pitch) * d);
  cam.lookAt(target);
  sun.target.position.copy(target);
  sun.position.copy(target).add(new THREE.Vector3(-4, 8, 5));
}

function render() {
  frameCamera();
  renderer.render(scene, cam);
}

function dispose(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [].concat(o.material || [])) {
      for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
      m.dispose();
    }
  });
  obj.removeFromParent();
}

async function select(id) {
  state.ready = false;
  state.error = null;
  if (current) dispose(current.root);
  current = null;
  const entry = models.get(id);
  if (!entry) throw new Error('unknown asset ' + id);
  $('status').textContent = 'Loading ' + id;
  const t0 = performance.now();
  const gltf = await loader.loadAsync(BASE + entry.file);
  const root = gltf.scene;
  let triangles = 0, bones = new Set();
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = o.receiveShadow = true;
      o.frustumCulled = false; // bind-pose bounds do not cover every pose
      triangles += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    }
    if (o.isBone) bones.add(o.name);
  });
  scene.add(root);
  const mixer = new THREE.AnimationMixer(root);
  const actions = new Map(gltf.animations.map((c) => [c.name, mixer.clipAction(c)]));
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  current = { root, mixer, actions, entry, size };
  Object.assign(state, { id, triangles, bones: bones.size, clips: [...actions.keys()], loadMs: Math.round(performance.now() - t0), size: size.toArray().map((v) => +v.toFixed(3)) });
  $('clip').replaceChildren(...state.clips.map((c) => new Option(c, c)));
  setClip(state.clips.includes('Walk') ? 'Walk' : state.clips[0]);
  $('meta').textContent = `${entry.label || id}\n${triangles.toLocaleString()} triangles • ${bones.size} bones • clips: ${state.clips.join(', ')}\nsize ${state.size.join(' × ')} m • loaded in ${state.loadMs} ms`;
  state.ready = true;
  return state;
}

function setClip(name) {
  if (!current?.actions.has(name)) throw new Error('unknown clip ' + name);
  current.mixer.stopAllAction();
  const a = current.actions.get(name);
  a.reset().play();
  state.clip = name;
  $('clip').value = name;
  clock.start();
  apply(0);
  render();
  $('status').textContent = `${state.id} • ${name}`;
}

api.setClip = (name) => { setClip(name); return state; };
api.setTime = (t) => { state.playing = false; $('play').textContent = 'Play'; apply(t); render(); return state; };

$('asset').onchange = () => select($('asset').value).catch(fail);
$('clip').onchange = () => setClip($('clip').value);
$('play').onclick = () => { state.playing = !state.playing; $('play').textContent = state.playing ? 'Pause' : 'Play'; if (state.playing) clock.start(); };
for (const id of ['yaw', 'pitch']) $(id).oninput = render;

function fail(err) {
  state.error = String(err?.message || err);
  $('status').textContent = 'Error: ' + state.error;
  console.error(err);
}

let last = 0;
renderer.setAnimationLoop(() => {
  if (current && state.playing) {
    last += clock.getDelta();
    apply(state.time + (last > 0.1 ? 0.1 : last));
    last = 0;
  }
  render();
});

try {
  const res = await fetch(BASE + 'manifest.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('no pipeline assets published locally (client/pipeline-assets/manifest.json)');
  const manifest = await res.json();
  models = new Map(manifest.models.map((m) => [m.id, m]));
  $('asset').replaceChildren(...[...models.values()].map((m) => new Option(m.label || m.id, m.id)));
  const first = new URLSearchParams(location.search).get('asset') || manifest.models[0]?.id;
  if (first) await select(first);
} catch (err) {
  fail(err);
}
