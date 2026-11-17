// Client entry point: rendering loop, local prediction, remote interpolation
// and translation of server events into presentation. The server decides
// every outcome; this file only shows them and sends intents.

import * as THREE from '/vendor/three/three.module.js';
import { CLASSES, ABILITIES, LOOKS, defaultLook } from '../../shared/content.js';
import { BRINE_TRIAL } from '../../shared/survey.js';
import { MOVE_DT, stepMove, groundHeight, zoneAt } from '../../shared/world.js';
import { buildWorld, makeEnvironment } from './scene.js';
import { Assets } from './assets.js';
import { createModel, CHARACTER_BUNDLES } from './characters.js';
import { animationInterval } from './animator.js';
import { Fx } from './fx.js';
import { LiveAegis } from './live-aegis.js';
import { LiveCasts } from './live-casts.js';
import { createVfx } from './vfx/engine.js';
import { buildTextures } from './vfx/textures.js';
import { CombatVfx } from './vfx/combat.js';
import { Input } from './input.js';
import { ThirdPersonCamera } from './camera.js';
import { Net, saveToken } from './net.js';
import { UI } from './ui.js';
import { makePortraits } from './portraits.js';

const INTERP_MS = 110;
const TURN_RATE = 2.9;
const INTERACT_RANGE = 5;

const $ = (id) => document.getElementById(id);
const canvas = $('view');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  $('login-error').textContent = 'This browser could not start WebGL, which the game needs.';
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.3, 900);

// Models come from GLB bundles, loaded once before anything is drawn. If a
// bundle is missing, the affected entities use their procedural stand-ins.
// ?glb=none|vanguard,skitter,… limits which entity types use GLB models.
const params = new URLSearchParams(location.search);
const glbOnly = params.get('glb');
const assets = new Assets();
await assets.init();
await assets.preload(glbOnly === 'none' ? [] : [...CHARACTER_BUNDLES, 'sanctum', 'nature'], (done, total) => {
  $('enter').textContent = `Loading the Reach… ${done}/${total}`;
});
const useGlb = (meta) => glbOnly === null || (glbOnly !== 'none' && glbOnly.split(',').includes(meta.c));
// ?glb=none reproduces the original procedural presentation exactly (used for
// before/after comparisons), so it also skips image-based lighting.
const environment = glbOnly === 'none' ? null : makeEnvironment(renderer);
scene.environment = environment;
scene.environmentIntensity = 0.85;
// ?q=0 (weak or software GPUs) also thins out purely decorative ground cover.
const world = buildWorld(scene, glbOnly === null ? assets : null, { detail: params.get('q') === '0' ? 0.4 : 1, prototypeArt: glbOnly === null && params.get('q') !== '0' && params.get('prototypeArt') !== '0' });
const fx = new Fx(scene);
const legacyFx = fx;
const liveAegis = new LiveAegis(THREE);
const liveCasts = new LiveCasts(THREE,scene);
const pointOf = ent=>[ent.pos.x,ent.pos.y-ent.model.hover+.08,ent.pos.z];
const toward = (a,b)=>{const d=b.map((v,i)=>v-a[i]);return Math.hypot(...d)>0.01?d:[0,1,0];};
function authored(name,family,options){
  if(quality===0)return false;
  return liveCasts.spawn(name,family,{...options,reducedMotion:motionPreference.matches},fxClock);
}
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
// Effect clock. ?vfxt=<0.02..1> slows presentation-only effects so software
// rendering can photograph them mid-flight; simulation time is untouched.
const vfxTime = Math.min(1, Math.max(0.02, Number(new URLSearchParams(location.search).get('vfxt')) || 1));
let fxClock = 0;
// Particle/shader effect engine (quality >= 1). Quality 0 keeps the original
// lightweight Fx primitives. Flash lights exist only when starting at quality 2.
let vfx = null;
let cvfx = null;
try {
  const startQ = new URLSearchParams(location.search).get('q');
  vfx = createVfx(THREE, scene, { textures: buildTextures(THREE), groundHeight, quality: /^[01]$/.test(startQ || '') ? Number(startQ) : 2, reducedMotion: motionPreference.matches });
  cvfx = new CombatVfx(vfx);
} catch (err) {
  console.warn('Effect engine unavailable; using basic effects.', err);
}
motionPreference.addEventListener?.('change', () => { if (vfx) vfx.reducedMotion = motionPreference.matches; });
const rich = () => !!cvfx && quality > 0;
// Inside onEvent the legacy primitives are muted while the engine is active.
const MUTED_FX = { bolt() {}, beam() {}, ring() {}, pillar() {}, burst() {}, telegraph() {} };
const cam = new ThirdPersonCamera(camera);
// ?nolock=1 keeps the cursor free while steering (fallback for setups where
// pointer lock misbehaves, and for automated input).
const input = new Input(canvas, { lock: params.get('nolock') !== '1' });

const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1.02, 40), new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
ring.rotation.x = -Math.PI / 2;
ring.visible = false;
scene.add(ring);
const pressureZone = new THREE.Mesh(new THREE.RingGeometry(BRINE_TRIAL.exclusion.r-0.10,BRINE_TRIAL.exclusion.r,48),new THREE.MeshBasicMaterial({color:0xe9a54e,transparent:true,opacity:0.85,side:THREE.DoubleSide,depthWrite:false}));
pressureZone.rotation.x=-Math.PI/2;
pressureZone.position.set(BRINE_TRIAL.exclusion.x,groundHeight(BRINE_TRIAL.exclusion.x,BRINE_TRIAL.exclusion.z)+0.12,BRINE_TRIAL.exclusion.z);
pressureZone.visible=false;scene.add(pressureZone);

// Snapshot-driven stationary survey equipment, independent of its owner's model.
const rigParts = {
  base: new THREE.CylinderGeometry(0.32, 0.40, 0.15, 8),
  body: new THREE.BoxGeometry(0.32, 0.52, 0.29),
  mast: new THREE.CylinderGeometry(0.025, 0.04, 0.55, 8),
  lamp: new THREE.BoxGeometry(0.21, 0.05, 0.03),
  area: new THREE.RingGeometry(0.985, 1, 48),
};
const rigMetal = new THREE.MeshStandardMaterial({ color: 0x77786e, roughness: 0.65, metalness: 0.45 });
const rigDark = new THREE.MeshStandardMaterial({ color: 0x303b40, roughness: 0.8 });
const rigLight = new THREE.MeshBasicMaterial({ color: 0x85cde9 });
const rigArea = new THREE.MeshBasicMaterial({ color: 0x85cde9, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
function syncRig(ent) {
  const r = ent.row?.rig;
  if (!r) {
    if (ent.rigModel) scene.remove(ent.rigModel);
    ent.rigModel = null;
    return;
  }
  if (!ent.rigModel) {
    const g = new THREE.Group();
    const part = (geo, mat, x, y, z) => { const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x,y,z); g.add(mesh); return mesh; };
    part(rigParts.base, rigDark, 0, 0.075, 0);
    part(rigParts.body, rigMetal, 0, 0.38, 0);
    part(rigParts.mast, rigDark, 0.11, 0.88, 0);
    part(rigParts.lamp, rigLight, 0, 0.55, 0.16);
    const area = part(rigParts.area, rigArea, 0, 0.12, 0);
    area.rotation.x = -Math.PI / 2;
    g.userData.area = area;
    scene.add(g);
    ent.rigModel = g;
  }
  ent.rigModel.position.set(r.x, groundHeight(r.x,r.z), r.z);
  ent.rigModel.userData.area.scale.setScalar(r.r);
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// --- state -------------------------------------------------------------------

const S = {
  myId: 0,
  compId: 0,
  ents: new Map(),
  you: null,
  sheet: null,
  target: 0,
  inspect: null,
  followId: 0,
  autoRun: false,
  targetSentAt: 0,
  timeOffset: null,
  zone: '',
  cdReady: {},
  gcdReady: 0,
  fps: 60,
  frameMs: 0,
  frames: 0,
  drawn: 0,
  paused: false,
  snaps: 0,
};

const local = {
  pred: { x: 0, z: 0, jy: 0, vy: 0 },
  prev: { x: 0, z: 0, jy: 0 },
  yaw: Math.PI,
  sentYaw: Math.PI,
  yawSentAt: 0,
  speedMul: 1,
  pending: [],
  outbox: [],
  seq: 0,
  acc: 0,
  lastSend: 0,
  err: { x: 0, z: 0 },
};

const net = new Net({
  onWelcome,
  onSnapshot,
  onAuthFail: (reason) => showAccountLogin(reason ? `${reason} Sign in to an account or create a guest character.` : ''),
  onAccountReady: showRoster,
  onAccountFail: (reason) => {
    const el = net.accountLogged && !$('character-roster').hidden ? $('roster-error') : $('account-error');
    el.textContent = reason;
    if (!net.accountToken && /session expired/i.test(reason)) {
      clearWorld();
      S.myId = 0;
      input.enabled = false;
      $('status').hidden = true;
      showAccountLogin(reason);
    }
  },
  onAccountLoggedOut: () => {
    clearWorld();
    S.myId = 0;
    input.enabled = false;
    $('hud').hidden = true;
    showAccountLogin('Signed out.');
  },
  onCreateFail: (reason) => {
    $('login-error').textContent = reason;
    $('enter').disabled = false;
  },
  onStatus: (text) => {
    if (text) stopAutomaticMovement();
    $('status').hidden = !text;
    $('status').textContent = text || '';
    if (text) input.reset();
  },
  onReplaced: () => {
    $('status').hidden = false;
    $('status').textContent = 'This character was opened in another window. Reload this page to take it back.';
    input.enabled = false;
  },
});

// Suppress the native menu throughout the active game, without consuming
// events needed by our contextual player actions. Keep account forms native.
document.addEventListener('contextmenu', e=>{
  if(!document.getElementById('hud').hidden)e.preventDefault();
},true);

const portraits = makePortraits(assets, useGlb);
const ui = new UI({
  portrait: portraits,
  useAbility: (id) => net.send({ t: 'use', a: id }),
  pet: (c) => net.send({ t: 'pet', c }),
  petRename: (name) => net.send({ t: 'pet_rename', name }),
  partyInvite: (id) => net.send({ t: 'party_invite', id }),
  followPlayer: (id) => followPlayer(id),
  isFollowing: (id) => S.followId===id,
  cancelMovement: () => stopAutomaticMovement(),
  stopFollowing: (id) => { if(S.followId===id)stopAutomaticMovement(); },
  whisper: (id, m) => net.send({ t: 'whisper', id, m }),
  partyAnswer: (accept) => net.send({ t: 'party_answer', accept }),
  partyLeave: () => net.send({ t: 'party_leave' }),
  quality: (preset) => {
    if (!['0', '1', '2'].includes(preset)) return;
    const next = new URL(location.href);
    next.searchParams.set('q', preset);
    location.assign(next.toString());
  },
  autoAttack: () => net.send({ t: 'atk', on: S.you?.auto ? 0 : 1 }),
  inspectCompanion: (id, point) => {
    S.inspect = S.inspect?.id === id ? null : { id, x: point.x, y: point.y };
  },
  closeInspect: () => { S.inspect = null; },
  target: (id) => setTarget(id),
  interact: id=>net.send({t:'act',id}),
  craft: recipe=>net.send({t:'craft',recipe}),
  equip: (item) => net.send({ t: 'equip', item }),
  unequip: (slot) => net.send({ t: 'unequip', slot }),
  respawn: () => net.send({ t: 'respawn' }),
  chat: (m, channel='vicinity') => net.send({ t: 'chat', m, channel }),
  characters: () => openCharacterMenu(),
  signOut: () => net.signOut(),
  copyRecoveryKey: () => copyGuestRecoveryKey(),
  forget: () => {
    saveToken(null);
    location.reload();
  },
});

// --- login -------------------------------------------------------------------

let chosenClass = 'symbiotech';
let chosenLook = defaultLook(chosenClass);
/** Offer the appearances of the chosen class (hidden when there is only one). */
function buildLooks() {
  const list = LOOKS[chosenClass];
  chosenLook = defaultLook(chosenClass);
  $('look-row').hidden = list.length < 2;
  const wrap = $('looks');
  wrap.replaceChildren();
  for (const look of list) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'lookcard';
    card.dataset.look = look.id;
    card.setAttribute('aria-pressed', String(look.id === chosenLook));
    const title = document.createElement('strong');
    title.textContent = look.name;
    const blurb = document.createElement('p');
    blurb.textContent = look.blurb;
    card.append(title, blurb);
    card.addEventListener('click', () => {
      chosenLook = look.id;
      for (const c of wrap.children) c.setAttribute('aria-pressed', String(c.dataset.look === look.id));
    });
    wrap.append(card);
  }
}
function buildLogin() {
  const wrap = $('classes');
  for (const id of Object.keys(CLASSES)) {
    const def = CLASSES[id];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'classcard';
    card.dataset.cls = id;
    card.setAttribute('aria-pressed', String(id === chosenClass));
    const title = document.createElement('strong');
    title.textContent = def.name;
    const role = document.createElement('span');
    role.className = 'role';
    role.textContent = def.role;
    const blurb = document.createElement('p');
    blurb.textContent = def.blurb;
    card.append(title, role, blurb);
    card.addEventListener('click', () => {
      chosenClass = id;
      for (const c of wrap.children) c.setAttribute('aria-pressed', String(c.dataset.cls === id));
      buildLooks();
    });
    wrap.append(card);
  }
  buildLooks();
  $('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('name').value.trim();
    if (!/^[A-Za-z][A-Za-z '-]{1,14}[A-Za-z]$/.test(name)) {
      $('login-error').textContent = 'Names are 3–16 letters (spaces, apostrophes and hyphens allowed inside).';
      return;
    }
    $('login-error').textContent = '';
    $('enter').disabled = true;
    net.create(name, chosenClass, chosenLook);
  });
}

function showAccountLogin(message = '') {
  $('login').hidden = false;
  $('hud').hidden = true;
  $('account-auth').hidden = false;
  $('character-roster').hidden = true;
  $('guest-note').hidden = false;
  $('saved-guest').hidden = !net.token;
  // Do not offer to overwrite the local guest key with a new character.
  $('login-form').hidden = !!net.token;
  $('resuming').hidden = true;
  $('account-error').textContent = message;
  $('login-error').textContent = '';
  $('enter').textContent = 'Enter as guest';
  $('enter').disabled = false;
}

function showRoster(m) {
  input.enabled = false;
  $('login').hidden = false;
  $('hud').hidden = true;
  $('resuming').hidden = true;
  $('account-auth').hidden = true;
  $('guest-note').hidden = true;
  $('character-roster').hidden = false;
  $('login-form').hidden = false;
  $('enter').textContent = 'Create character';
  $('enter').disabled = false;
  $('roster-error').textContent = '';
  $('login-error').textContent = '';
  $('roster-title').textContent = `${m.handle}'s characters`;
  $('link-legacy').hidden = !net.token;

  const rows = $('roster-list');
  rows.replaceChildren();
  if (!m.chars.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No characters yet. Create one below or link a previous guest character.';
    rows.append(empty);
  }
  for (const c of m.chars) {
    const row = document.createElement('div');
    row.className = 'roster-row';
    const info = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = c.name;
    const detail = document.createElement('div');
    detail.className = 'muted';
    detail.textContent = `Level ${c.level} · ${CLASSES[c.cls]?.name || c.cls}`;
    info.append(name, detail);
    const actions = document.createElement('div');
    actions.className = 'roster-actions';
    const play = document.createElement('button');
    play.textContent = 'Play';
    play.addEventListener('click', () => net.selectCharacter(c.id));
    const remove = document.createElement('button');
    remove.className = 'remove';
    remove.textContent = 'Delete';
    remove.title = 'Permanent. Requires a second click.';
    remove.addEventListener('click', () => {
      if (remove.dataset.confirm === '1') net.deleteCharacter(c.id, c.name);
      else {
        remove.dataset.confirm = '1';
        remove.textContent = 'Confirm delete';
      }
    });
    actions.append(play, remove);
    row.append(info, actions);
    rows.append(row);
  }
}

function buildAccountUI() {
  $('account-form').addEventListener('submit', (e) => {
    e.preventDefault();
    $('account-error').textContent = '';
    net.accountAuth($('account-handle').value.trim(), $('account-password').value, false);
  });
  $('account-register').addEventListener('click', () => {
    $('account-error').textContent = '';
    net.accountAuth($('account-handle').value.trim(), $('account-password').value, true);
  });
  $('account-signout').addEventListener('click', () => net.signOut());
  $('resume-saved-guest').addEventListener('click', () => {
    if (net.token) net.resumeGuest(net.token);
  });
  $('copy-saved-guest').addEventListener('click', async () => {
    if (!net.token) return;
    try {
      await navigator.clipboard.writeText(net.token);
      $('guest-error').textContent = 'Recovery key copied. Keep it private.';
    } catch {
      window.prompt('Copy your private guest recovery key:', net.token);
    }
  });
  $('resume-guest-key').addEventListener('click', () => {
    const token = $('guest-resume-key').value.trim();
    if (net.token && token !== net.token) {
      $('guest-error').textContent = 'A guest is already saved here. Back up its recovery key first and use another browser slot for the imported guest.';
      return;
    }
    if (!net.resumeGuest(token)) $('guest-error').textContent = 'Enter a valid 64-character recovery key.';
    else { $('guest-resume-key').value = ''; $('guest-error').textContent = ''; }
  });
  $('link-legacy').addEventListener('click', () => {
    if (net.token) net.claimLegacy(net.token);
  });
  $('import-legacy').addEventListener('click', () => {
    const token = $('recovery-token').value.trim();
    if (!net.claimLegacy(token)) $('roster-error').textContent = 'Enter a valid 64-character guest recovery key.';
    else $('recovery-token').value = '';
  });
}

function openCharacterMenu() {
  net.leaveWorld();
  clearWorld();
  S.myId = 0;
  input.enabled = false;
  $('hud').hidden = true;
  if (net.accountLogged) {
    $('login').hidden = false;
    $('account-auth').hidden = true;
    $('login-form').hidden = true;
    $('character-roster').hidden = true;
    $('resuming').hidden = false;
    $('resuming').textContent = 'Loading your characters…';
  } else showAccountLogin('Your guest is saved. Return to it below, or create an account and link it.');
}

async function copyGuestRecoveryKey() {
  if (!net.token) return ui.error('This character is already linked or has no guest key.');
  try {
    await navigator.clipboard.writeText(net.token);
    ui.toast('Recovery key copied. Keep it private.', 'gain');
  } catch {
    window.prompt('Copy your private recovery key. Anyone with it can access this guest character:', net.token);
  }
}

buildLogin();
buildAccountUI();
$('enter').textContent = 'Enter as guest';
$('enter').disabled = false;
if (net.accountToken || net.token) {
  $('login-form').hidden = true;
  $('account-auth').hidden = true;
  $('guest-note').hidden = true;
  $('resuming').hidden = false;
  net.connect();
} else showAccountLogin('');

// --- entities ----------------------------------------------------------------

function addEntity(meta) {
  let ent = S.ents.get(meta.i);
  if (ent) {
    ent.meta = meta; // e.g. level changed
    return ent;
  }
  const model = createModel(assets, meta, useGlb(meta));
  const holder = new THREE.Group();
  holder.add(model.group);
  if (quality === 0) lowSpec(holder, true);
  scene.add(holder);
  ent = {
    id: meta.i,
    meta,
    model,
    holder,
    row: null,
    buf: [],
    pos: { x: 0, y: 0, z: 0 },
    yaw: 0,
    jy: 0,
    speed: 0,
    attack: 0,
    castAnim: 0,
    hit: 0,
    dead: false,
    cast: null,
    placed: false,
    fwd: 1,
    inView: true,
    chest: new THREE.Vector3(),
    head: new THREE.Vector3(),
  };
  S.ents.set(ent.id, ent);
  return ent;
}

function removeEntity(ent) {
  fx.clearRoot(ent.id);
  liveAegis.remove(ent.id);
  scene.remove(ent.holder);
  if (ent.rigModel) scene.remove(ent.rigModel);
  if (ent.model.dispose) ent.model.dispose();
  else {
    ent.holder.traverse((o) => {
      if (o.isMesh && o.material && !o.material.isShared) o.material.dispose();
    });
  }
  ui.removePlate(ent.id);
  S.ents.delete(ent.id);
  if (S.target === ent.id) S.target = 0;
  if (S.inspect?.id === ent.id) S.inspect = null;
}

function clearWorld() {
  stopAutomaticMovement();
  for (const ent of [...S.ents.values()]) removeEntity(ent);
  liveAegis.clear();
  liveCasts.clear();
  vfx?.clear();
  ui.clearPlates();
}

const chestOf = (ent) => () => ent.chest;

// --- network handlers ----------------------------------------------------------

function onWelcome(m) {
  clearWorld();
  S.myId = m.id;
  S.compId = m.comp;
  S.timeOffset = null;
  S.target = 0;
  S.inspect = null;
  S.you = null;
  S.snaps = 0;
  local.pred = { x: m.x, z: m.z, jy: 0, vy: 0 };
  local.prev = { x: m.x, z: m.z, jy: 0 };
  local.pending = [];
  local.outbox = [];
  local.seq = 0;
  local.err = { x: 0, z: 0 };
  $('login').hidden = true;
  $('hud').hidden = false;
  ui.setAccountLinked(net.accountLogged);
  input.enabled = true;
  canvas.focus();
  if (!onWelcome.greeted) {
    onWelcome.greeted = true;
    ui.log('Welcome to the Verdigris Reach. Press H for controls.', 'gain');
  } else ui.log('Reconnected.', 'info');
}

function onSnapshot(m) {
  const now = performance.now();
  const off = m.time - now;
  if (S.timeOffset === null || Math.abs(off - S.timeOffset) > 400) S.timeOffset = off;
  else S.timeOffset += (off - S.timeOffset) * 0.08;
  S.snaps++;

  if (m.meta) for (const meta of m.meta) addEntity(meta);

  const seen = new Set();
  for (const row of m.ents) {
    const ent = S.ents.get(row.i);
    if (!ent) continue;
    seen.add(row.i);
    ent.row = row;
    if (ent.meta.c === 'surveyor') syncRig(ent);
    ent.dead = !!(row.f & 1);
    ent.buf.push({ t: m.time, x: row.x, z: row.z, j: row.j || 0, r: row.r || 0 });
    if (ent.buf.length > 12) ent.buf.shift();
  }
  for (const ent of [...S.ents.values()]) if (!seen.has(ent.id)) removeEntity(ent);

  // Reconcile local prediction with the authoritative position.
  const y = m.y;
  S.you = y;
  while (local.pending.length && local.pending[0].seq <= y.ack) local.pending.shift();
  const s = { x: y.x, z: y.z, jy: y.jy, vy: y.vy };
  for (const c of local.pending) stepMove(s, c, y.sp);
  const ex = local.pred.x - s.x;
  const ez = local.pred.z - s.z;
  const e2 = ex * ex + ez * ez;
  if (e2 > 1e-9) {
    if (e2 < 16) {
      // Absorb small corrections into a decaying visual offset.
      local.err.x += ex;
      local.err.z += ez;
    } else {
      local.err.x = 0;
      local.err.z = 0;
    }
    local.pred.x = s.x;
    local.pred.z = s.z;
    local.prev.x = s.x;
    local.prev.z = s.z;
  }
  local.pred.jy = s.jy;
  local.pred.vy = s.vy;
  local.speedMul = y.sp;

  for (const id of Object.keys(y.cds)) S.cdReady[id] = now + y.cds[id];
  for (const id of Object.keys(S.cdReady)) if (!(id in y.cds)) delete S.cdReady[id];
  S.gcdReady = now + y.gcd;

  // Adopt the server's view of our target unless we just changed it.
  const mine = S.ents.get(S.myId);
  if (mine && mine.row && now - S.targetSentAt > 500 && mine.row.t !== S.target) S.target = mine.row.t;

  if (m.sheet) {
    S.sheet = m.sheet;
    ui.setSheet(m.sheet);
  }
  for (const e of m.ev) onEvent(e);
  if (m.pv) for (const e of m.pv) onEvent(e);
}

const EXTRA_NAMES = { auto: 'attack', sting: 'sting', carapace: 'Carapace', rending_echo: 'Rending Echo', arc_pulse: 'Arc Pulse', seismic_slam: 'Seismic Slam', resonance_burst: 'Resonance Burst', hurl: 'hurled stone', triage: 'mend', shared_pulse: 'Shared Pulse', bond: 'bond' };
const abilityName = (id) => (ABILITIES[id] ? ABILITIES[id].name : EXTRA_NAMES[id] || id);
const sourceColour = (ent) => (ent.meta.k === 'e' ? 0xff6a4a : ent.meta.c === 'vanguard' ? 0xffb45c : ent.meta.c === 'surveyor' ? 0x85cde9 : ent.meta.c === 'keeper' ? 0xb498e8 : ent.meta.c === 'mender' ? 0xffc46b : 0x7dffc4);

function nameOf(ent) {
  if (!ent) return 'Something';
  if (ent.id === S.myId) return 'You';
  if (ent.id === S.compId) return 'Your symbiote';
  if (ent.meta.k === 'c') {
    const owner = S.ents.get(ent.meta.o);
    return owner ? `${owner.meta.n}'s symbiote` : 'A symbiote';
  }
  return ent.meta.n;
}

function onEvent(e) {
  const now = performance.now();
  const fx = rich() ? MUTED_FX : legacyFx;
  switch (e.e) {
    case 'dmg': {
      const d = S.ents.get(e.d);
      const s = S.ents.get(e.s);
      const mine = e.s === S.myId || e.s === S.compId;
      if (d) {
        d.hit = 1;
        if (d.model.trigger) d.model.trigger('hit');
        const cls = e.d === S.myId ? 'dmg-me' : mine ? 'dmg-mine' : 'dmg-other';
        ui.floatText(toScreen(d.head), e.sh ? `${e.a} (${e.sh} absorbed)` : String(e.a), cls);
        if (rich() && d.placed) cvfx.hit(d, s, e);
        if (e.sh && d.placed && !motionPreference.matches && quality > 0) fx.burst(d.chest, 0x89cfe1, 5, 0.75);
        else if (e.k !== 'bolt' && !e.sh) fx.burst(d.chest, e.d === S.myId ? 0xff6a4a : 0xffe2a0, 5, 0.9);
      }
      if (s) {
        s.attack = 1;
        // A strike needs to face its victim even if the server's movement
        // yaw has not yet changed. This is presentation-only, for a brief
        // stationary attack pose; it never changes server aiming or damage.
        if (d && (s.meta.k === 'p' || s.meta.k === 'e')) {
          s.faceTo = d.id;
          s.faceUntil = now + 500;
        }
        if (s.model.trigger) s.model.trigger(e.k === 'bolt' ? 'cast' : 'attack', e.ab);
        if (e.k === 'bolt' && d) fx.bolt(chestOf(s), chestOf(d), sourceColour(s));
        if (rich() && d?.placed && s.placed) cvfx.abilityHit(e.ab, s, d);
        if(d?.placed&&s.placed&&['rending_arc','core_bore','phase_needle','resonant_reversal'].includes(e.ab)){
          const a=pointOf(s),b=pointOf(d);
          authored(e.ab,'kinetic',{variant:e.ab==='phase_needle'||e.ab==='resonant_reversal'?'resonance':'impact',center:[b[0],b[1]+.7,b[2]],direction:toward(a,b),radius:Math.min(2,d.model.radius+.45),duration:.85});
        }
      }
      // Melee already has a burst above. Make bolt impacts readable too,
      // without doubling particles or changing combat damage.
      if (d && e.k === 'bolt') fx.burst(d.chest, e.d === S.myId ? 0xff6a4a : 0xffe2a0, 3, 0.35);
      if (mine && d) ui.log(`${nameOf(s)}${e.s === S.myId ? 'r' : "'s"} ${abilityName(e.ab)} hits ${d.meta.n} for ${e.a}.`, 'out');
      else if (e.d === S.myId) ui.log(`${nameOf(s)}'s ${abilityName(e.ab)} hits you for ${e.a}${e.sh ? ` (${e.sh} absorbed)` : ''}.`, 'in');
      break;
    }
    case 'heal': {
      const d = S.ents.get(e.d);
      const s = S.ents.get(e.s);
      if (d) ui.floatText(toScreen(d.head), `+${e.a}`, 'heal');
      if (d?.placed && rich()) cvfx.heal(d, s);
      const mine = e.s === S.myId || e.s === S.compId;
      if (mine && d) ui.log(`${nameOf(s)}${e.s === S.myId ? 'r' : "'s"} ${abilityName(e.ab)} heals ${e.d === S.myId ? 'you' : d.meta.n} for ${e.a}.`, 'heal');
      else if (e.d === S.myId) ui.log(`${nameOf(s)}'s ${abilityName(e.ab)} heals you for ${e.a}.`, 'heal');
      break;
    }
    case 'beam': {
      const s = S.ents.get(e.s);
      const d = S.ents.get(e.d);
      if (s && d) {
        if (s.meta.k === 'c') s.castAnim = 1;
        if(s.placed&&d.placed&&Math.hypot(s.pos.x-d.pos.x,s.pos.z-d.pos.z)>.2)
          authored('mender-transfer','restorative',{variant:'transfer',source:pointOf(s),target:pointOf(d),radius:.8,duration:.8});
        fx.beam(chestOf(s), chestOf(d), 0x7dffc4, 500, 0.06);
        fx.burst(d.chest, 0x7dffc4, 4, 0.7);
        if (rich() && s.placed && d.placed && s !== d) cvfx.transfer(s, d);
      }
      break;
    }
    case 'cast': {
      const s = S.ents.get(e.s);
      const d = S.ents.get(e.d);
      if (!s) break;
      if (s.model.trigger) s.model.trigger('ability', e.ab);
      if (rich() && s.placed && (!d || d.placed)) cvfx.cast(e.ab, s, d);
      if(e.ab==='hinge_field'&&d?.placed){authored('hinge-projection','aegis',{variant:'hinge',center:pointOf(d),radius:1.4,yaw:d.yaw,duration:1.2});fx.ring(d.pos.x,d.pos.z,1.5,0x7fd0ff,650,d.pos.y);}
      else if (e.ab === 'graviton_tether' && d) fx.beam(chestOf(s), chestOf(d), 0xb48cff, 520, 0.09);
      else if (e.ab === 'fault_scan' && d) {
        if(s.placed&&d.placed){const a=pointOf(s),b=pointOf(d);authored('fault-scan','kinetic',{variant:'survey',center:[a[0],a[1]+1.0,a[2]],direction:toward(a,b),radius:Math.min(12,Math.max(.5,Math.hypot(b[0]-a[0],b[2]-a[2]))),duration:.9});}
        fx.beam(chestOf(s), chestOf(d), 0x85cde9, 480, 0.035);
        fx.ring(d.pos.x, d.pos.z, 1.8, 0x85cde9, 600, d.pos.y);
      } else if (e.ab === 'field_rig') fx.ring(s.pos.x, s.pos.z, 4, 0x85cde9, 550, s.pos.y);
      else if (e.ab === 'mending_graft') {
        s.castAnim = 1;
        if (d && d !== s) fx.beam(chestOf(s), chestOf(d), 0x7dffc4, 480, 0.07);
        if (d) {fx.burst(d.chest, 0x7dffc4, 10, 1.1);if(d.placed)authored('mending-graft','restorative',{variant:'restore',target:pointOf(d),radius:1.0,duration:1.5});}
      } else if (e.ab === 'kinetic_ward') {
        s.castAnim = 1;
        fx.ring(s.pos.x, s.pos.z, 2.2, 0xffb45c, 500, s.pos.y);
        if(s.placed)authored('kinetic-ward','kinetic',{variant:'charge',center:[s.pos.x,s.pos.y+1,s.pos.z],direction:[Math.sin(s.yaw),0,Math.cos(s.yaw)],radius:1.1,duration:1.2});
      } else if (e.ab === 'spore_snare' && d) fx.ring(d.pos.x, d.pos.z, 2, 0x9dffb0, 700, d.pos.y);
      break;
    }
    case 'fx': {
      const s = S.ents.get(e.s);
      if (rich() && (Number.isFinite(e.x) ? Number.isFinite(e.z) : s?.placed)) {
        cvfx.area(Number.isFinite(e.x) ? { ...e, y: groundHeight(e.x, e.z) } : e, s);
        const o = e.k === 'attune' ? S.ents.get(e.o) : null;
        if (o && s) cvfx.attuneLink(o, s);
      }
      if (e.k === 'survey_blast') {
        fx.ring(e.x, e.z, e.r, 0xf0b56b, 650);
        fx.pillar(e.x, e.z, 0xf0b56b, 450);
        authored('controlled-blast','kinetic',{variant:'impact',center:[e.x,groundHeight(e.x,e.z)+.12,e.z],direction:[0,1,0],radius:e.r,duration:1});
        break;
      }
      if (e.k === 'arc_pulse' || e.k === 'seismic_slam') {
        fx.ring(e.x, e.z, e.r, 0xff6a3a, 500);
        fx.ring(e.x, e.z, e.r * 0.6, 0xffe2a0, 380);
        break;
      }
      if (!s) break;
      if (s.model.trigger && (e.k === 'discharge' || e.k === 'aegis' || e.k === 'surge' || e.k === 'attune')) s.model.trigger('ability', e.k);
      if(e.k==='lattice_relay'){fx.ring(s.pos.x,s.pos.z,e.r,0x7fd0ff,650,s.pos.y);if(s.placed)authored('lattice-relay','aegis',{variant:'lattice',center:pointOf(s),radius:1.5,yaw:s.yaw,duration:1.2});}
      else if(['harmonic_restore','rescue_lattice','brine_service'].includes(e.k)){if(s.placed)authored(e.k,'restorative',{variant:'stabilize',target:pointOf(s),radius:1.3,duration:1.6});fx.ring(s.pos.x,s.pos.z,1.6,0x8ecfb1,650,s.pos.y);}
      else if (e.k === 'discharge') {
        s.castAnim = 1;
        fx.ring(s.pos.x, s.pos.z, e.r, 0xffb45c, 520, s.pos.y);
        fx.ring(s.pos.x, s.pos.z, e.r * 0.55, 0xfff2c0, 380, s.pos.y);
        fx.burst(s.chest, 0xffb45c, 14, 2.4);
        if(s.placed)authored('discharge','kinetic',{variant:'resonance',center:pointOf(s),radius:Math.min(12,e.r),duration:1});
      } else if (e.k === 'aegis') {
        s.castAnim = 1;
        fx.ring(s.pos.x, s.pos.z, e.r, 0x7fd0ff, 650, s.pos.y);
        if (!motionPreference.matches && quality > 0) fx.ring(s.pos.x, s.pos.z, e.r * 0.65, 0xb6e7ef, 450, s.pos.y);
      } else if (e.k === 'surge') {
        s.castAnim = 1;
        fx.ring(s.pos.x, s.pos.z, e.r, 0x7dffc4, 700, s.pos.y - s.model.hover);
        fx.ring(s.pos.x, s.pos.z, e.r * 0.5, 0xd8ffe9, 500, s.pos.y - s.model.hover);
        fx.burst(s.chest, 0x7dffc4, 16, 2.6);
        if(s.placed)authored('overgrowth-surge','restorative',{variant:'restore',target:pointOf(s),radius:Math.min(8,e.r),duration:1.6});
      } else if (e.k === 'resonance_burst') {
        fx.ring(s.pos.x, s.pos.z, 20, 0xb48cff, 800, s.pos.y);
        fx.burst(s.chest, 0xb48cff, 14, 3);
      } else if (e.k === 'respawn') fx.pillar(s.pos.x, s.pos.z, 0x6fe6ff, 1000);
      else if (e.k === 'spawn') fx.ring(s.pos.x, s.pos.z, 1.6, 0xffa6f2, 600);
      else if (e.k === 'equip') {
        fx.ring(s.pos.x, s.pos.z, 1.8, 0xffd27a, 700, s.pos.y);
        fx.burst(s.chest, 0xffd27a, 10, 1.4);
      } else if (e.k === 'attune') {
        const o = S.ents.get(e.o);
        if (o) {
          o.castAnim = 1;
          fx.beam(() => o.head, chestOf(s), 0x7fd0ff, 1400, 0.14);
        }
        fx.pillar(s.pos.x, s.pos.z, 0x7fd0ff, 1500);
        fx.ring(s.pos.x, s.pos.z, 5, 0x7fd0ff, 1200, s.pos.y);
      }
      break;
    }
    case 'tele': {
      const ent = S.ents.get(e.id);
      if (ent) ent.cast = { name: e.n, start: now, end: now + e.ms };
      if (e.g) {
        fx.telegraph(e.x, e.z, e.r, e.ms);
        if (rich()) cvfx.telegraph(e.x, groundHeight(e.x, e.z), e.z, e.r, e.ms);
        const me = S.ents.get(S.myId);
        if (me && !me.dead && Math.hypot(me.pos.x - e.x, me.pos.z - e.z) < e.r + 1) ui.toast(`${e.n} — move out of the marked ground!`, 'warn');
      }
      break;
    }
    case 'die': {
      const ent = S.ents.get(e.id);
      if (!ent) break;
      ent.dead = true;
      ent.cast = null;
      if (rich() && ent.placed) cvfx.die(ent);
      if (ent.meta.k === 'e') ui.log(`${ent.meta.n} is destroyed.`, 'info');
      else if (e.id !== S.myId) ui.log(`${ent.meta.n} has been defeated.`, 'in');
      break;
    }
    case 'shield': {
      const d = S.ents.get(e.d);
      if (d) ui.floatText(toScreen(d.head), `Aegis ${e.a}`, 'shield');
      break;
    }
    case 'lvl': {
      const ent = S.ents.get(e.id);
      if (ent) {
        if (rich() && ent.placed) cvfx.level(ent);
        fx.pillar(ent.pos.x, ent.pos.z, 0xffd27a, 1400);
        fx.ring(ent.pos.x, ent.pos.z, 4, 0xffd27a, 900, ent.pos.y);
        if (e.id !== S.myId) ui.log(`${ent.meta.n} reached level ${e.l}.`, 'info');
      }
      break;
    }
    case 'chat':
      ui.chatLine('['+(e.channel==='party'?'Party':'Vicinity')+'] '+e.n,e.m,e.channel==='party'?'party-chat':'chatline');
      break;
    case 'msg':
      if (e.k === 'err') ui.error(e.m);
      else {
        ui.log(e.m, e.k);
        if (e.k === 'gain') ui.toast(e.m, 'gain');
      }
      break;
    case 'xp': {
      const me = S.ents.get(S.myId);
      if (me) ui.floatText(toScreen(me.head), `+${e.a} XP`, 'xp');
      break;
    }
    case 'say':
      ui.showNpcDialogue(e.id,e.m);
      ui.chatLine(e.n, e.m, 'npc');
      ui.toast(`${e.n}: “${e.m}”`, 'npc');
      break;
    default:
      break;
  }
}

// --- targeting and interaction -------------------------------------------------

function setTarget(id) {
  S.inspect = null;
  S.target = id;
  S.targetSentAt = performance.now();
  net.send({ t: 'tgt', id });
}

const proj = new THREE.Vector3();
function toScreen(v) {
  proj.copy(v).project(camera);
  if (proj.z < -1 || proj.z > 1) return null;
  return { x: (proj.x * 0.5 + 0.5) * window.innerWidth, y: (-proj.y * 0.5 + 0.5) * window.innerHeight };
}

/** Entity under a screen point, nearest to the camera first. */
function pick(x, y, kinds) {
  let best = null;
  let bestDist = Infinity;
  for (const ent of S.ents.values()) {
    if (!kinds.includes(ent.meta.k) || ent.id === S.myId || !ent.placed) continue;
    if (ent.meta.k === 'e' && ent.dead) continue;
    const top = toScreen(ent.head);
    if (!top) continue;
    proj.set(ent.pos.x, ent.pos.y - ent.model.hover * 0.2, ent.pos.z);
    const foot = toScreen(proj);
    if (!foot) continue;
    const hgt = Math.max(26, foot.y - top.y);
    const wid = Math.max(26, hgt * ((ent.model.radius * 2.4) / ent.model.height));
    if (Math.abs(x - top.x) <= wid / 2 + 6 && y >= top.y - 8 && y <= top.y + hgt + 8) {
      const d = camera.position.distanceToSquared(ent.holder.position);
      if (d < bestDist) {
        bestDist = d;
        best = ent;
      }
    }
  }
  return best;
}

function nearestObject() {
  const me = S.ents.get(S.myId);
  if (!me) return null;
  let best = null;
  let bestD = INTERACT_RANGE;
  for (const ent of S.ents.values()) {
    if (ent.meta.k !== 'o') continue;
    const d = Math.hypot(ent.pos.x - me.pos.x, ent.pos.z - me.pos.z);
    if (d < bestD) {
      bestD = d;
      best = ent;
    }
  }
  return best;
}

function nextEnemy() {
  const me = S.ents.get(S.myId);
  if (!me) return;
  const fx_ = Math.sin(cam.yaw);
  const fz_ = Math.cos(cam.yaw);
  const list = [];
  for (const ent of S.ents.values()) {
    if (ent.meta.k !== 'e' || ent.dead) continue;
    const dx = ent.pos.x - me.pos.x;
    const dz = ent.pos.z - me.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 50) continue;
    const front = (dx * fx_ + dz * fz_) / (d || 1) > 0.2;
    list.push({ id: ent.id, score: d + (front ? 0 : 100) });
  }
  if (!list.length) {
    ui.error('No enemies nearby.');
    return;
  }
  list.sort((a, b) => a.score - b.score);
  const i = list.findIndex((e) => e.id === S.target);
  setTarget(list[(i + 1) % list.length].id);
}

input.onClick = (button, x, y) => {
  if (button === 0) {
    const ent = pick(x, y, ['e', 'p', 'c', 'o']);
    if (ent?.meta.k === 'c') {
      S.inspect = S.inspect?.id === ent.id ? null : { id: ent.id, x: x + 14, y: y - 24 };
    } else if(ent?.meta.k==='o'&&ent.meta.c==='archivist') {setTarget(0);ui.openNpc(ent);}
    else if (ent && ent.meta.k !== 'o') setTarget(ent.id);
    else S.inspect = null;
  } else {
    S.inspect = null;
    const ent = pick(x, y, ['e', 'o', 'p']);
    if (!ent) return;
    if(ent.meta.k==='p') { ui.openPlayerContext(ent,x,y); return; }
    if (ent.meta.k === 'o') {
      if(ent.meta.c==='archivist')ui.openNpc(ent);
      net.send({ t: 'act', id: ent.id });
    }
    else {
      setTarget(ent.id);
      net.send({ t: 'atk' });
    }
  }
};

input.onAction = (code, e) => {
  const digit = /^Digit([1-5])$/.exec(code);
  if (digit && S.sheet) {
    const i = Number(digit[1]) - 1;
    const def = CLASSES[S.sheet.cls];
    if (e.shiftKey) {
      const mode = ['triage', 'guard', 'assist', 'follow', 'stay'][i];
      if (mode && def.companion) net.send({ t: 'pet', c: mode });
    } else if (def.abilities[i]) net.send({ t: 'use', a: def.abilities[i] });
    return;
  }
  switch (code) {
    case 'NumLock':
      e.preventDefault();
      if (S.ents.get(S.myId)?.dead) break;
      const enableRun = !S.autoRun;
      stopAutomaticMovement();
      S.autoRun = enableRun;
      break;
    case 'Tab':
      e.preventDefault();
      nextEnemy();
      break;
    case 'KeyR':
      net.send({ t: 'atk', on: S.you?.auto ? 0 : 1 });
      break;
    case 'Escape':
      stopAutomaticMovement();
      if (!ui.closePanels() && S.target) setTarget(0);
      break;
    case 'F1':
      e.preventDefault();
      setTarget(S.myId);
      break;
    case 'F2':
      e.preventDefault();
      if (S.compId && S.ents.has(S.compId)) {
        const r = ui.pet.getBoundingClientRect();
        S.inspect = S.inspect?.id === S.compId ? null : { id: S.compId, x: r.right + 10, y: r.top };
      } else ui.error('You have no companion to inspect.');
      break;
    case 'KeyC':
      ui.toggleBuild();
      break;
    case 'KeyB':
      ui.toggleWorkshop();
      break;
    case 'KeyI':
      ui.toggleInventory();
      break;
    case 'KeyJ':
      ui.toggleCodex();
      break;
    case 'KeyP':
      ui.toggleParty();
      break;
    case 'KeyO':
      ui.toggleSettings();
      break;
    case 'KeyM':
      ui.toggleMenu();
      break;
    case 'KeyH':
      ui.toggleHelp();
      break;
    case 'KeyV':
      cam.reset(local.yaw);
      break;
    case 'KeyF': {
      const o = nearestObject();
      if (o) net.send({ t: 'act', id: o.id });
      else ui.error('Nothing to interact with here.');
      break;
    }
    case 'Slash':
      e.preventDefault();
      ui.focusChat('/');
      break;
    case 'Enter':
      e.preventDefault();
      ui.focusChat();
      break;
    default:
      break;
  }
};

// --- frame loop ----------------------------------------------------------------

const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function sampleRemote(ent, rt) {
  const buf = ent.buf;
  if (!buf.length) return null;
  if (rt <= buf[0].t) return buf[0];
  for (let i = buf.length - 1; i >= 0; i--) {
    if (buf[i].t <= rt) {
      const a = buf[i];
      const b = buf[i + 1];
      if (!b) return a;
      const k = (rt - a.t) / (b.t - a.t || 1);
      return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, j: a.j + (b.j - a.j) * k, r: lerpAngle(a.r, b.r, k) };
    }
  }
  return buf[buf.length - 1];
}

function stopAutomaticMovement() {
  S.autoRun = false;
  S.followId = 0;
}
function followPlayer(id) {
  const ent = S.ents.get(id);
  const me = S.ents.get(S.myId);
  if (!me || me.dead || !ent || ent.id === S.myId || ent.meta.k !== 'p' || ent.dead) return ui.error('Select a living player to follow.');
  stopAutomaticMovement();
  S.followId = id;
}
// A visible second browser may follow while the leader has keyboard focus.
// Hidden tabs, logout and disconnect still cancel automatic movement.
input.onReset = () => {
  S.autoRun = false;
  if (document.hidden || !input.enabled) S.followId = 0;
};

function stepLocal(inp, now, dt) {
  const me = S.ents.get(S.myId);
  const dead = !!(me && me.dead);
  if (!me || dead || !input.enabled || document.hidden) stopAutomaticMovement();
  // Automatic movement is only an input convenience. It uses the same
  // collision, speed, prediction, rate limits and server movement validation.
  if (inp.f || inp.s || inp.turn || inp.jump) stopAutomaticMovement();
  if (S.followId) {
    const ent = S.ents.get(S.followId);
    const dx = ent ? ent.pos.x - local.pred.x : 0;
    const dz = ent ? ent.pos.z - local.pred.z : 0;
    const distance = Math.hypot(dx, dz);
    if (!ent || ent.dead || !ent.placed || distance > 45) stopAutomaticMovement();
    else if (distance > 2.8) {
      local.yaw = Math.atan2(dx, dz);
      inp.f = Math.min(1, (distance - 2.8) / 1.4);
      inp.steering = false;
    }
  } else if (S.autoRun) inp.f = 1;
  if (inp.lookX || inp.lookY) cam.look(inp.lookX, inp.lookY);
  if (inp.wheel) cam.zoom(inp.wheel);
  if (!dead) {
    if (inp.steering) local.yaw = cam.yaw;
    else if (inp.turn) {
      const d = inp.turn * TURN_RATE * dt;
      local.yaw += d;
      cam.yaw += d;
    }
    if (inp.f > 0 && !inp.steering && !inp.orbiting && !input.lmb) cam.trail(local.yaw, dt);
  }
  local.yaw = wrap(local.yaw);
  cam.yaw = wrap(cam.yaw);

  const f = dead ? 0 : inp.f;
  const st = dead ? 0 : inp.s;
  const jump = !dead && inp.jump;
  local.acc += dt;
  let steps = 0;
  while (local.acc >= MOVE_DT && steps < 8) {
    local.acc -= MOVE_DT;
    steps++;
    local.prev.x = local.pred.x;
    local.prev.z = local.pred.z;
    local.prev.jy = local.pred.jy;
    const yaw = Math.round(local.yaw * 10000) / 10000;
    const airborne = local.pred.jy > 0 || local.pred.vy > 0;
    const turned = Math.abs(wrap(yaw - local.sentYaw)) > 0.01 && now - local.yawSentAt > 90;
    if (f || st || jump || airborne || turned) {
      const cmd = { seq: ++local.seq, f, s: st, yaw, j: jump ? 1 : 0 };
      stepMove(local.pred, cmd, local.speedMul);
      local.pending.push(cmd);
      local.outbox.push([cmd.seq, f, st, yaw, cmd.j]);
      local.sentYaw = yaw;
      local.yawSentAt = now;
    }
  }
  if (steps === 8) local.acc = 0;
  if (local.pending.length > 240) local.pending.splice(0, local.pending.length - 240);
  if (local.outbox.length && (local.outbox.length >= 2 || now - local.lastSend > 40)) {
    while (local.outbox.length) net.send({ t: 'in', s: local.outbox.splice(0, 16) });
    local.lastSend = now;
  }
  const decay = Math.exp(-dt * 14);
  local.err.x *= decay;
  local.err.z *= decay;
}

const viewPoints = [null, null];
const frustum = new THREE.Frustum();
const viewProj = new THREE.Matrix4();
const cullSphere = new THREE.Sphere();

function updateEntities(dt, t, now) {
  const rt = now + (S.timeOffset || 0) - INTERP_MS;
  const me = S.ents.get(S.myId);
  // The camera moves after entities do, so this is last frame's view; the
  // sphere below is generous enough to absorb one frame of camera motion.
  frustum.setFromProjectionMatrix(viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  for (const ent of S.ents.values()) {
    let x;
    let z;
    let j = 0;
    let yaw;
    if (ent.id === S.myId) {
      const a = local.acc / MOVE_DT;
      x = local.prev.x + (local.pred.x - local.prev.x) * a + local.err.x;
      z = local.prev.z + (local.pred.z - local.prev.z) * a + local.err.z;
      j = local.prev.jy + (local.pred.jy - local.prev.jy) * a;
      yaw = local.yaw;
    } else {
      const sm = sampleRemote(ent, rt);
      if (!sm) continue;
      x = sm.x;
      z = sm.z;
      j = sm.j;
      yaw = sm.r;
      if (ent.meta.k === 'o') {
        // Characters in the world turn to face a nearby traveller.
        yaw = me && ent.meta.c === 'archivist' && Math.hypot(me.pos.x - x, me.pos.z - z) < 9 ? Math.atan2(me.pos.x - x, me.pos.z - z) : 0.9;
        yaw = lerpAngle(ent.yaw, yaw, Math.min(1, dt * 4));
      }
    }
    let y = groundHeight(x, z) + j + ent.model.hover;
    const row = ent.row;
    // A bonded symbiote rides its host's shoulder.
    if (ent.meta.k === 'c' && row && row.a === 'bonded') {
      const host = S.ents.get(row.hs);
      if (host && host.placed) {
        x = host.pos.x - Math.cos(host.yaw) * 0.42;
        z = host.pos.z + Math.sin(host.yaw) * 0.42;
        y = host.pos.y + 1.72;
        yaw = host.yaw;
      }
    }
    if (ent.placed) {
      const mx = x - ent.pos.x;
      const mz = z - ent.pos.z;
      const moved = Math.hypot(mx, mz);
      const inst = dt > 0 ? moved / dt : 0;
      ent.speed += (Math.min(inst, 14) - ent.speed) * Math.min(1, dt * 12);
      // Which way it is travelling relative to where it faces (-1 = backing up).
      if (moved > 1e-4) ent.fwd += ((mx * Math.sin(yaw) + mz * Math.cos(yaw)) / moved - ent.fwd) * Math.min(1, dt * 10);
    }
    ent.pos.x = x;
    ent.pos.y = y;
    ent.pos.z = z;
    ent.yaw = yaw;
    ent.jy = j;
    ent.placed = true;
    ent.holder.position.set(x, y, z);
    const facingTarget = now < (ent.faceUntil || 0) && !ent.dead && ent.speed < 1.5
      ? S.ents.get(ent.faceTo) : null;
    const faceYaw = facingTarget && facingTarget.placed
      ? Math.atan2(facingTarget.pos.x - x, facingTarget.pos.z - z) : yaw;
    // Smooth presentation yaw separately from the authoritative movement yaw.
    ent.displayYaw = ent.displayYaw === undefined ? faceYaw
      : lerpAngle(ent.displayYaw, faceYaw, Math.min(1, dt * 13));
    ent.holder.rotation.y = ent.displayYaw;
    ent.chest.set(x, y + ent.model.height * (ent.model.hover ? 0 : 0.62), z);
    ent.head.set(x, y + ent.model.height * (ent.model.hover ? 0.6 : 1) + 0.3, z);
    ent.attack = Math.max(0, ent.attack - dt * 3.2);
    ent.castAnim = Math.max(0, ent.castAnim - dt * 1.8);
    ent.hit = Math.max(0, ent.hit - dt * 5);
    const casting = !!(ent.cast && now < ent.cast.end);
    // Skinned models are not frustum-culled by the renderer (their bounds are
    // for the bind pose), so visibility and animation cost are decided here.
    cullSphere.center.set(x, y + ent.model.height * 0.5, z);
    cullSphere.radius = ent.model.height * 0.75 + ent.model.radius + 2.5;
    // The low preset also stops drawing characters far across the valley.
    ent.inView = frustum.intersectsSphere(cullSphere) && (quality > 0 || ent.id === S.myId || camera.position.distanceToSquared(cullSphere.center) < 80 * 80);
    ent.holder.visible = ent.inView;
    if (ent.meta.k === 'e') fx.setRooted(ent.id, x, z, ent.model.radius, ent.inView && !ent.dead && !!row?.b?.includes('root'));
    liveAegis.sync(ent, motionPreference.matches || quality === 0, t);
    ent.model.update(dt, {
      t,
      speed: ent.speed,
      dead: ent.dead,
      attack: ent.attack,
      cast: ent.castAnim,
      hit: ent.hit,
      air: j > 0.05,
      mode: row ? row.md : undefined,
      act: row ? row.a : undefined,
      casting,
      combat: !!(row && row.f & 8),
      charge: ent.id === S.myId && S.you ? S.you.res / 100 : 0,
      self: ent.id === S.myId,
      // Presentation only: how close the local player stands to an object.
      near: ent.meta.k === 'o' && S.ents.get(S.myId) ? Math.hypot(S.ents.get(S.myId).pos.x - x, S.ents.get(S.myId).pos.z - z) : undefined,
      fwd: ent.fwd,
      interval: ent.id === S.myId ? 0 : animationInterval(camera.position.distanceTo(cullSphere.center), ent.inView, false),
    });
  }
}

function updatePlates(now) {
  const me = S.ents.get(S.myId);
  for (const ent of S.ents.values()) {
    if (ent.id === S.myId) continue;
    const k = ent.meta.k;
    const d = me ? Math.hypot(ent.pos.x - me.pos.x, ent.pos.z - me.pos.z) : 0;
    const max = k === 'c' ? 22 : k === 'e' ? (ent.meta.el ? 60 : 45) : 60;
    const hide = !ent.placed || d > (k === 'e' && ent.dead ? 15 : max);
    const screen = hide ? null : toScreen(ent.head);
    const row = ent.row || {};
    let label = ent.meta.n;
    let cls = 'player';
    if (k === 'e') {
      cls = ent.dead ? 'corpse' : ent.meta.el ? 'enemy elite' : 'enemy';
      label = ent.dead ? `${ent.meta.n} · remains` : `${ent.meta.n}${ent.meta.el ? ' ◆' : ''}`;
      if (!ent.dead && row.f & 2) label += ' (retreating)';
    } else if (k === 'c') cls = 'comp';
    else if (k === 'o') cls = 'object';
    ui.placePlate(ent, screen, {
      cls,
      label,
      selected: k === 'c' ? ent.id === S.inspect?.id : ent.id === S.target,
      owned: k === 'c' && ent.meta.o === S.myId,
      hp: (k === 'e' || k === 'p') && row.m ? Math.max(0, row.h / row.m) : 0,
    });
  }
}

let last = performance.now();
let time = 0;
let frames = 0;
let fpsAt = last;
let slowSince = 0;
let quality = 2;
let slowTimer = 0;

/**
 * Level 0 shading for one object tree: no normal maps and much less metal.
 * Without image-based lighting a metal has nothing to reflect and renders
 * black, so the low preset turns the kit's metals into dull painted surfaces.
 * Reversible; safe to call repeatedly (materials are shared between objects).
 */
function lowSpec(root, on) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || !m.isMeshStandardMaterial || !!m.userData.low === on) continue;
      if (on) {
        m.userData.low = { normalMap: m.normalMap, metalness: m.metalness, metalnessMap: m.metalnessMap };
        m.normalMap = null;
        m.metalnessMap = null;
        m.metalness = Math.min(m.metalness, 0.25);
      } else {
        Object.assign(m, m.userData.low);
        m.userData.low = null;
      }
      m.needsUpdate = true;
    }
  });
}

/**
 * 2 = everything; 1 = no shadows; 0 = low-spec: also no image-based lighting,
 * no normal maps and reduced resolution. Measured in software rendering,
 * image-based lighting alone is about 40% of the frame and normal maps 17%.
 */
function setQuality(q) {
  quality = q;
  renderer.shadowMap.enabled = q >= 2;
  world.sun.castShadow = q >= 2;
  scene.environment = q >= 1 ? environment : null;
  world.ambient.intensity = world.ambientBase * (q >= 1 ? 1 : 1.5);
  lowSpec(scene, q === 0);
  vfx?.setQuality(q);
  renderer.setPixelRatio(q >= 1 ? Math.min(window.devicePixelRatio || 1, 2) : Math.min(window.devicePixelRatio || 1, 1) * 0.75);
  resize();
}
// ?q=0|1|2 pins the starting quality (useful on weak or software GPUs);
// add &qlock=1 to also stop it adapting to the frame rate (for captures).
const wantQ = params.get('q');
const qualityLocked = params.get('qlock') === '1';
if (wantQ !== null && /^[012]$/.test(wantQ)) setQuality(Number(wantQ));

const drawGap = Number(params.get('rfps')) > 0 ? 1000 / Number(params.get('rfps')) - 2 : 0;
let lastDraw = -1e9;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0.001, (now - last) / 1000));
  last = now;
  time += dt;

  frames++;
  if (now - fpsAt >= 1000) {
    S.fps = Math.round((frames * 1000) / (now - fpsAt));
    frames = 0;
    fpsAt = now;
    // Step quality down if the machine cannot keep up (never back up).
    if (S.myId && S.fps < 26 && !document.hidden && !qualityLocked) {
      if (++slowSince >= 3 && quality > 0) {
        slowSince = 0;
        setQuality(quality - 1);
      }
    } else slowSince = 0;
  }

  if (!S.myId) {
    // Title backdrop: a slow orbit of the Sanctum.
    const a = time * 0.06;
    camera.position.set(Math.sin(a) * 34, 15, Math.cos(a) * 34);
    camera.lookAt(0, 5, 0);
    world.update(dt, time, { x: 0, y: 0, z: 0 });
    renderer.render(scene, camera);
    return;
  }

  stepLocal(input.sample(), now, dt);
  updateEntities(dt, time, now);
  const me = S.ents.get(S.myId);
  if (me && me.placed) {
    cam.update(me.pos, dt);
    // Pressed against a wall the camera sits in the character's head.
    me.holder.visible = me.inView && cam.dist > 1.3;
  }
  fxClock += dt * 1000 * vfxTime;
  fx.update(dt * vfxTime);
  liveCasts.update(fxClock);
  vfx?.update(dt * vfxTime);
  pressureZone.visible=!!S.you?.brineTrial?.ms;

  const target = S.ents.get(S.target) || null;
  if (me && me.placed) {
    // Whatever stands between the camera and the player or their target fades.
    viewPoints[0] = me.chest;
    viewPoints[1] = target && target.placed && !target.dead ? target.chest : null;
    world.update(dt, time, me.pos, { eye: camera.position, points: viewPoints });
  }
  if (target && target.placed && !(target.meta.k === 'e' && target.dead)) {
    ring.visible = true;
    const r = target.model.radius * 1.5;
    ring.scale.setScalar(r);
    ring.position.set(target.pos.x, groundHeight(target.pos.x, target.pos.z) + 0.14, target.pos.z);
    ring.rotation.z = time * 0.8;
    ring.material.color.setHex(target.meta.k === 'e' ? (S.you?.surveyKit?.mark === target.id ? 0x85cde9 : 0xff5a4a) : 0x7dffc4);
  } else ring.visible = false;

  camera.updateMatrixWorld();
  updatePlates(now);

  if (me && me.row && S.you) {
    slowTimer += dt;
    ui.update({
      me,
      you: S.you,
      target,
      ents: S.ents,
      comp: S.compId ? S.ents.get(S.compId) : null,
      inspect: S.inspect,
      movement: S.followId ? `Following ${S.ents.get(S.followId)?.meta.n || 'player'} · Esc to stop` : S.autoRun ? 'Auto-run · Num Lock to stop' : '',
      now,
      cd: (id) => Math.max(0, (S.cdReady[id] || 0) - now),
      gcd: () => Math.max(0, S.gcdReady - now),
      dist: (ent) => Math.hypot(ent.pos.x - me.pos.x, ent.pos.z - me.pos.z) - (ent.model.radius || 0),
      fps: S.fps,
      latency: net.latency,
      nearObject: me.dead ? null : nearestObject(),
    });
    if (slowTimer > 0.12) {
      slowTimer = 0;
      ui.drawMinimap({ me, ents: S.ents, yaw: local.yaw });
      const zone = zoneAt(me.pos.x, me.pos.z);
      if (zone !== S.zone) {
        S.zone = zone;
        ui.zone(zone);
      }
    }
  }
  // Game logic above runs every animation frame; drawing may be capped
  // (?rfps=N) or paused. Where drawing is very slow (software WebGL) that
  // keeps input, prediction and networking in real time.
  if (!S.paused && now - lastDraw >= drawGap) {
    renderer.render(scene, camera);
    lastDraw = now;
    S.drawn++;
  }
  S.frames++;
  S.frameMs += (performance.now() - now - S.frameMs) * 0.2;
}
requestAnimationFrame(frame);

// Read-only inspection hook for automated browser checks.
window.__attune = {
  state() {
    const me = S.ents.get(S.myId);
    return {
      myId: S.myId,
      compId: S.compId,
      snaps: S.snaps,
      fps: S.fps,
      frameMs: Math.round(S.frameMs),
      frames: S.frames,
      drawn: S.drawn,
      quality,
      target: S.target,
      inspected: S.inspect?.id || 0,
      pos: me ? { x: me.pos.x, y: me.pos.y, z: me.pos.z } : null,
      yaw: local.yaw,
      camYaw: cam.yaw,
      camDist: cam.dist,
      camWant: cam.want,
      camPitch: cam.pitch,
      pending: local.pending.length,
      you: S.you,
      sheet: S.sheet,
      ents: [...S.ents.values()].map((e) => ({ id: e.id, k: e.meta.k, c: e.meta.c, n: e.meta.n, a: e.meta.a, x: e.pos.x, z: e.pos.z, row: e.row, dead: e.dead, model: e.model.kind || 'procedural', inView: e.inView, speed: Math.round(e.speed * 10) / 10, anim: e.model.animator ? e.model.animator.describe() : null })),
      draw: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures },
      assets: assets.report(),
      world: { ...world.stats, faded: world.occluders.faded },
    };
  },
  screenOf(id) {
    const ent = S.ents.get(id);
    return ent ? toScreen(ent.chest) : null;
  },
  /** Stop or resume drawing (the game keeps running). Lets a capture script render one client at a time. */
  pause(on) {
    S.paused = !!on;
  },
  /** Renderer internals, for profiling from automated checks. */
  gfx: { scene, renderer, camera },
  /** Pose the camera (and the character's facing) for repeatable screenshots. Presentation only. */
  view({ yaw, pitch, dist, face } = {}) {
    if (yaw !== undefined) cam.yaw = yaw;
    if (pitch !== undefined) cam.pitch = pitch;
    if (dist !== undefined) cam.want = cam.dist = dist;
    if (face !== undefined) local.yaw = face;
  },
};
