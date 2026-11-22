// Asset preview: renders models through the same loader and factories the game
// uses, as a grid of cells. Used by `npm run assets:preview` for contact sheets
// and handy for eyeballing an asset in a browser.
//
//   /client/preview.html?items=look:red_rucker,look:conductor@Idle_Loop@0.5,mender,skitter@Attack@0.4
//   /client/preview.html?items=piece:sanctum:Column_Hollow,piece:nature:TwistedTree_1
//
// An item is "<model>[@clip[@fraction]]". &cols= &cell= &yaw= &pitch= adjust the layout.

import * as THREE from '/vendor/three/three.module.js';
import { Assets } from './assets.js';
import { createModel } from './characters.js';
import { poseLongpoint } from './longpoint.js';
import { makeEnvironment } from './scene.js';
import { previewGrid } from './preview-grid.js';

const q = new URLSearchParams(location.search);
const {items,cols,cell,yaw,pitch,W,H}=previewGrid(q);

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H, false);
canvas.style.width = `${W}px`;
canvas.style.height = `${H}px`;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.setScissorTest(true);
renderer.autoClear = false;

const assets = await new Assets().init();
await assets.preload(Object.keys(assets.manifest.assets).filter((id) => assets.entry(id).url.endsWith('.glb')));
const environment = makeEnvironment(renderer);
const info = [];

function build(spec) {
  const [kind, a, b] = spec.split(':');
  if (kind === 'look') return createModel(assets, { c: 'vanguard', a });
  if (kind === 'longpoint') {
    const group = assets.instance('longpoint');
    if (!group) return null;
    poseLongpoint(group, a === 'deployed' ? 1 : 0);
    return { group, kind: 'glb' };
  }
  if (kind === 'longpoint-look') return createModel(assets, { k: 'p', c: 'surveyor', a, wv: 'longpoint' });
  if (kind === 'piece') {
    const obj = assets.instance(a, b);
    return obj ? { group: obj, kind: 'piece' } : null;
  }
  return createModel(assets, { c: kind });
}

function renderAll() {
info.length = 0;
for (const el of document.querySelectorAll('.label')) el.remove();
renderer.setViewport(0, 0, W, H);
renderer.setScissor(0, 0, W, H);
renderer.setClearColor(0x23262c);
renderer.clear();
items.forEach((item, i) => {
  const [spec, clip, fraction] = item.split('@');
  const cx = (i % cols) * cell;
  const cy = Math.floor(i / cols) * cell;
  const label = document.createElement('div');
  label.className = 'label';
  label.style.left = `${cx + 2}px`;
  label.style.top = `${cy + 2}px`;
  document.body.append(label);
  let model = null;
  try {
    model = build(spec);
  } catch (err) {
    label.textContent = `ERR ${spec}: ${err.message}`;
    info.push({ item, problem: `threw ${err.message}` });
    return;
  }
  if (!model) {
    label.textContent = `missing ${spec}`;
    info.push({ item, problem: 'model or piece not found' });
    return;
  }
  let problem = model.kind === 'procedural' ? 'fell back to the procedural model' : null;
  const scene = new THREE.Scene();
  scene.environment = environment;
  scene.add(new THREE.HemisphereLight(0x9db4ff, 0x3a2c44, 1.2));
  const sun = new THREE.DirectionalLight(0xffd9b4, 2.4);
  sun.position.set(-3, 6, 4);
  scene.add(sun, model.group);
  if (model.update) model.update(1 / 60, { t: 1, speed: 0, dead: false, hit: 0, cast: 0, attack: 0, fwd: 1, interval: 0, mode: 'triage', act: 'idle' });
  let shown = spec;
  // "<model>@sit@<view>": the procedural cross-legged seated pose (sit/stand
  // emote), viewed front | side | back | three | top, grid on the ground plane.
  const SIT_VIEWS = { front: [0, 0.2], side: [Math.PI / 2, 0.12], back: [Math.PI, 0.2], three: [0.75, 0.3], top: [0.0001, 1.45] };
  let itemYaw = yaw, itemPitch = pitch, groundGrid = false;
  if (clip === 'sit') {
    for (let i = 0; i < 3; i++) model.update?.(1 / 60, { t: 1 + i / 60, speed: 0, dead: false, hit: 0, cast: 0, attack: 0, fwd: 1, interval: 0, mode: 'triage', act: 'idle', sitting: true, reducedMotion: true });
    if (!(model.sitState?.().available && model.sitState().blend === 1)) problem = problem || 'seated pose unavailable for this rig';
    [itemYaw, itemPitch] = SIT_VIEWS[fraction] ?? SIT_VIEWS.three;
    groundGrid = true;
    shown = `${spec} · seated (${fraction || 'three'})`;
  } else if (clip && model.animator && model.animator.clips.get(clip)) {
    const c = model.animator.clips.get(clip);
    model.animator.mixer.stopAllAction();
    model.animator.mixer.clipAction(c).play();
    model.animator.mixer.setTime(c.duration * (Number(fraction) || 0.5));
    shown = `${spec} · ${clip} ${Number(fraction) || 0.5}`;
  } else if (clip) {
    shown = `${spec} · (no clip ${clip})`;
    problem = problem || `clip "${clip}" does not exist`;
  }
  model.group.updateMatrixWorld(true);
  const box = new THREE.Box3();
  let tris = 0;
  model.group.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    if (o.isSkinnedMesh) {
      o.computeBoundingBox();
      box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld));
    } else box.expandByObject(o);
  });
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const r = Math.max(size.x, size.y, size.z) * 0.5 || 1;
  const cam = new THREE.PerspectiveCamera(35, 1, r * 0.05, r * 60);
  const d = (r / Math.tan((35 * Math.PI) / 360)) * 1.2;
  cam.position.set(c.x + Math.sin(itemYaw) * Math.cos(itemPitch) * d, c.y + Math.sin(itemPitch) * d, c.z + Math.cos(itemYaw) * Math.cos(itemPitch) * d);
  cam.lookAt(c);
  const grid = new THREE.GridHelper(Math.ceil(r * 4), Math.ceil(r * 4), 0x666a72, 0x3c3f46);
  grid.position.y = groundGrid ? model.group.position.y : box.min.y;
  scene.add(grid);
  renderer.setViewport(cx, H - cy - cell, cell, cell);
  renderer.setScissor(cx, H - cy - cell, cell, cell);
  renderer.render(scene, cam);
  label.textContent = `${shown} · ${size.x.toFixed(1)}×${size.y.toFixed(1)}×${size.z.toFixed(1)} m · ${Math.round(tris)} tris${model.kind === 'procedural' ? ' · PROCEDURAL FALLBACK' : ''}`;
  if (!tris) problem = problem || 'rendered no geometry';
  info.push({ item, kind: model.kind, tris: Math.round(tris), size: size.toArray().map((v) => Math.round(v * 100) / 100), ...(problem ? { problem } : {}) });
});
}

// Outfit textures load asynchronously: the first pass requests them, the
// second draws once they have arrived.
renderAll();
await assets.texturesReady();
renderAll();

window.__preview = { done: true, info, assets: assets.report() };
