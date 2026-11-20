// Client entry point: rendering loop, local prediction, remote interpolation
// and translation of server events into presentation. The server decides
// every outcome; this file only shows them and sends intents.

import * as THREE from '/vendor/three/three.module.js';
import {setupCreationSections} from './creation-sections.js';
import {setupRosterSettingsPages} from './menu-settings-pager.js';
import { CLASSES, ABILITIES, COMPANIONS, LOOKS, defaultLook } from '../../shared/content.js';
import { attachArmourFxEnv } from './armour-fx.js';
import { FRAMES, RACES, HAIR_STYLES, HAIR_COLOURS, LOOK_RACE, defaultAppearance, normalizeAppearance, encodeAppearance } from '../../shared/appearance.js';
import { BRINE_TRIAL } from '../../shared/survey.js';
import { MOVE_DT, stepMove, groundHeight, zoneAt, sameTravelRegion } from '../../shared/world.js';
import { parseTimeOfDay } from './severance-daylight.js';
import { buildWorld, makeEnvironment } from './scene.js';
import { Assets, disposeInstance, shared } from './assets.js';
import { createRecoveryVisuals } from './recovery-visuals.js';
import { createModel, CHARACTER_BUNDLES, gearKit } from './characters.js';
import { LONGPOINT_TRACE } from './longpoint.js';
import {loadWeaponModels} from './weapon-visuals.js';
import { setFaceQuality, faceDetailRange } from './face.js';
import { prepareMenderCarapace } from './mender-prototype.js';
import { signedWheelTravel } from './spindle.js';
import { fieldRigDevice } from './gear-recipes.js';
import { animationInterval } from './animator.js';
import { Fx } from './fx.js';
import { LiveAegis } from './live-aegis.js';
import { LiveCasts } from './live-casts.js';
import { createVfx } from './vfx/engine.js';
import { buildTextures } from './vfx/textures.js';
import { CombatVfx } from './vfx/combat.js';
import { StatusVfx } from './vfx/status.js';
import { Input } from './input.js';
import { ThirdPersonCamera } from './camera.js';
import { Net, saveToken } from './net.js';
import { UI, companionCommandKeys } from './ui.js';
import {ActionBindings} from './hotkey-bindings.js';
import { nearestInteractable } from './interact-target.js';
import { npcAccess, npcProfile } from './npc-interaction.js';
import { makePortraits } from './portraits.js';
import {createCreationPreview} from './creation-preview.js';
import {CharacterRosterView} from './roster-view.js';
import {createKestrelAlarm} from './kestrel-alarm.js';

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
// Mesh culling must not change the scene's shader light count. The Stone
// supplies this persistent light's properties when its world entity arrives.
const stoneLight = new THREE.PointLight(0xffffff, 0);
const stoneUp = new THREE.Vector3(0, 1, 0);
scene.add(stoneLight);

// Models come from GLB bundles, loaded once before anything is drawn. If a
// bundle is missing, the affected entities use their procedural stand-ins.
// ?glb=none|vanguard,skitter,… limits which entity types use GLB models.
const params = new URLSearchParams(location.search);
const glbOnly = params.get('glb');
const assets = new Assets();
await assets.init();
await assets.preload(glbOnly === 'none' ? [] : [...CHARACTER_BUNDLES, ...(assets.entry('longpoint') ? ['longpoint'] : []), 'sanctum', 'nature'], (done, total) => {
  $('enter').textContent = `Loading the Reach… ${done}/${total}`;
});
// Three existing licensed compact firearm meshes; Longpoint remains the authored original.
if(glbOnly!=='none')await loadWeaponModels(assets);
// Original carapace is opt-in until actual visual/motion review; no
// change to default companion animation or low-spec behavior.
if(params.get('menderArt')==='1'&&glbOnly!=='none'&&params.get('q')!=='0'){
  try{const gltf=await assets.loader.loadAsync('/client/art-assets/mender_carapace.glb');assets.menderPrototype=prepareMenderCarapace(THREE,gltf.scene);}
  catch(err){console.warn('[models] Mender prototype unavailable; retaining live rig:',err.message||err);}
}
const useGlb = (meta) => glbOnly === null || (glbOnly !== 'none' && glbOnly.split(',').includes(meta.c));
// ?glb=none reproduces the original procedural presentation exactly (used for
// before/after comparisons), so it also skips image-based lighting.
const environment = glbOnly === 'none' ? null : makeEnvironment(renderer);
scene.environment = environment;
scene.environmentIntensity = 0.85;
// ?q=0 (weak or software GPUs) also thins out purely decorative ground cover.
const world = buildWorld(scene, glbOnly === null ? assets : null, { detail: params.get('q') === '0' ? 0.4 : 1, prototypeArt: glbOnly === null && params.get('q') !== '0' && params.get('prototypeArt') !== '0', reducedMotion: () => motionPreference.matches || params.get('q') === '0' });
const machine=scene.getObjectByName('sanctum-precision-fabricator');
const kestrelAlarm=createKestrelAlarm(THREE,scene);
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
let alarmCalm=readFxPrefs().calm;
// Effect clock. ?vfxt=<0.02..1> slows presentation-only effects so software
// rendering can photograph them mid-flight; simulation time is untouched.
const vfxTime = Math.min(1, Math.max(0.02, Number(new URLSearchParams(location.search).get('vfxt')) || 1));
const inspectVfx = new URLSearchParams(location.search).get('vfxcapture') === '1';
let fxClock = 0;
// Particle/shader effect engine (quality >= 1). Quality 0 keeps the original
// lightweight Fx primitives. Flash lights exist only when starting at quality 2.
let vfx = null;
let cvfx = null;
let svfx = null;
// Items and materials reach the player through both a 'loot' event and a gain
// message; show one acquisition effect for the pair.
let acquiredAt = -1e9;
function acquired() {
  const me = S.ents.get(S.myId);
  if (!rich() || !me?.placed || fxClock - acquiredAt < 400) return;
  acquiredAt = fxClock;
  cvfx.acquire(me);
}
try {
  const startQ = new URLSearchParams(location.search).get('q');
  vfx = createVfx(THREE, scene, { textures: buildTextures(THREE), groundHeight, quality: /^[01]$/.test(startQ || '') ? Number(startQ) : 2, reducedMotion: motionPreference.matches });
  cvfx = new CombatVfx(vfx);
  svfx = new StatusVfx(cvfx);
} catch (err) {
  console.warn('Effect engine unavailable; using basic effects.', err);
}
motionPreference.addEventListener?.('change', () => { if (vfx) vfx.reducedMotion = motionPreference.matches; });
// Player effect comfort settings (presentation only; hostile telegraphs are never reduced).
function readFxPrefs() {
  let level = 1, calm = false;
  try {
    level = Number(localStorage.getItem('attunement.fxIntensity') || 1);
    calm = localStorage.getItem('attunement.calmFlashes') === '1';
  } catch {}
  return { level: [1, 0.6, 0.3].includes(level) ? level : 1, calm };
}
{
  const p = readFxPrefs();
  vfx?.setIntensity(p.level, p.calm);
}
const rich = () => !!cvfx && quality > 0;
// The Severance Gate landmark reads the effect engine and the player's comfort settings.
// Severance Expanse time-of-day review preview (?tod=day|dusk|night|dawn|loop|0..1). Off by default.
world.severancePocket?.timeOfDay.configure(parseTimeOfDay(location.search));
world.severance?.attach({ vfx, quality: () => quality, reducedMotion: () => motionPreference.matches, intensity: () => vfx?.intensity ?? 1, calm: () => !!vfx?.calmFlashes });
attachArmourFxEnv({ quality: () => quality, reducedMotion: () => motionPreference.matches, intensity: () => vfx?.intensity ?? 1, vfx: () => (rich() ? vfx : null) });
const recoveryVisuals=createRecoveryVisuals(THREE,scene,groundHeight);
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
// Module-level resources are reused by every rig: flagged shared so that
// disposing one rig's instance never frees them.
const rigParts = {
  base: shared(new THREE.CylinderGeometry(0.32, 0.40, 0.15, 8)),
  body: shared(new THREE.BoxGeometry(0.32, 0.52, 0.29)),
  mast: shared(new THREE.CylinderGeometry(0.025, 0.04, 0.55, 8)),
  lamp: shared(new THREE.BoxGeometry(0.21, 0.05, 0.03)),
  area: shared(new THREE.RingGeometry(0.985, 1, 48)),
};
const rigMetal = shared(new THREE.MeshStandardMaterial({ color: 0x77786e, roughness: 0.65, metalness: 0.45 }));
const rigDark = shared(new THREE.MeshStandardMaterial({ color: 0x303b40, roughness: 0.8 }));
const rigLight = shared(new THREE.MeshBasicMaterial({ color: 0x85cde9 }));
const rigArea = shared(new THREE.MeshBasicMaterial({ color: 0x85cde9, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));
function dropRig(ent) {
  if (ent.rigModel) {
    scene.remove(ent.rigModel);
    disposeInstance(ent.rigModel);
  }
  ent.rigModel = null;
  ent.rigArea?.dispose();
  ent.rigArea = null;
}
function syncRig(ent) {
  const r = ent.row?.rig;
  if (!r) {
    dropRig(ent);
    return;
  }
  if (!ent.rigModel) {
    const g = new THREE.Group();
    const part = (geo, mat, x, y, z) => { const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x,y,z); g.add(mesh); return mesh; };
    // Detailed deployable from the shared gear kit; the original blocks remain the fallback.
    try {
      g.userData.update = gearKit().instantiate('field_rig', fieldRigDevice, { attach: (_bone, obj) => g.add(obj) });
    } catch (err) {
      console.warn('Field rig model unavailable; using basic model.', err);
    }
    if (!g.children.length) {
      part(rigParts.base, rigDark, 0, 0.075, 0);
      part(rigParts.body, rigMetal, 0, 0.38, 0);
      part(rigParts.mast, rigDark, 0.11, 0.88, 0);
      part(rigParts.lamp, rigLight, 0, 0.55, 0.16);
    }
    g.userData.arcAt = 0;
    const area = part(rigParts.area, rigArea, 0, 0.12, 0);
    area.rotation.x = -Math.PI / 2;
    g.userData.area = area;
    scene.add(g);
    ent.rigModel = g;
  }
  const gy = groundHeight(r.x, r.z);
  ent.rigModel.position.set(r.x, gy, r.z);
  ent.rigModel.userData.area.scale.setScalar(r.r);
  // The survey sigil marks the rig's real recharge radius (quality >= 1).
  if (rich()) {
    if (!ent.rigArea?.alive) ent.rigArea = vfx.area({ at: [r.x, gy, r.z], radius: r.r, style: 'survey', color: 0x5fd0ff, alpha: 0.45, spin: 0.2 });
    else ent.rigArea.set([r.x, gy, r.z], r.r);
  } else if (ent.rigArea) {
    ent.rigArea.dispose();
    ent.rigArea = null;
  }
}

/** Per frame: animate deployed rigs and show recharge arcs to an owner in range. */
function animateRig(ent, t) {
  const g = ent.rigModel;
  const r = ent.row?.rig;
  if (!g || !r) return;
  g.userData.update?.({ t, combat: true });
  if (!rich() || !ent.placed || ent.dead || fxClock - g.userData.arcAt < 750) return;
  if (Math.hypot(ent.pos.x - r.x, ent.pos.z - r.z) > r.r) return;
  g.userData.arcAt = fxClock;
  const top = [r.x, g.position.y + 1.36, r.z];
  vfx.beam({ from: top, to: ent.chest, color: 0x6fd6ff, width: 0.05, life: 0.35, jitter: 0.18, grow: 0.4, taper: 1 });
  vfx.burst({ at: ent.chest, count: 4, cell: 13, color: 0xd8f6ff, color2: 0x6fd6ff, size: 0.08, life: 0.35, speed: [0.3, 1], drag: 2 });
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
    const el = net.accountLogged
      ? ($('character-roster').hidden ? $('login-error')
        : $('roster-import-dialog').open ? $('roster-import-error') : $('roster-error'))
      : $('account-error');
    el.textContent = reason;
    selectionView.setBusy(false);
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
    if (text) {
      stopAutomaticMovement();
      if(document.body.classList.contains('character-selection-mode'))selectionView.setBusy(false);
      if(worldEntryPending){worldEntryPending=false;$('world-entry-curtain').hidden=true;}
    }
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
const bindings=new ActionBindings(localStorage);
let hallPreview=null;
const ui = new UI({
  alarmAudio:()=>kestrelAlarm.enabled,setAlarmAudio:value=>kestrelAlarm.setEnabled(value),
  portrait: portraits,
  bindings,
  npcAccess: id => npcAccess(S.ents.get(id), S.ents.get(S.myId), S.you, INTERACT_RANGE),
  focusView: () => canvas.focus({preventScroll:true}),
  useAbility: (id) => net.send({ t: 'use', a: id }),
  pet: (c) => net.send({ t: 'pet', c }),
  petRename: (name) => net.send({ t: 'pet_rename', name }),
  managePet: (action, type) => net.send({ t: 'pet_manage', action, type }),
  partyInvite: (id) => net.send({ t: 'party_invite', id }),
  followPlayer: (id) => followPlayer(id),
  followChat: (name) => {
    if(!name)return followPlayer(S.target);
    const matches=[...S.ents.values()].filter(e=>e.meta.k==='p'&&e.id!==S.myId&&e.meta.n.toLowerCase()===name.toLowerCase());
    if(matches.length!==1)return ui.error('Select a player or enter /follow followed by their exact name.');
    followPlayer(matches[0].id);
  },
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
  fxPrefs: () => readFxPrefs(),
  setFxPrefs: (level, calm) => {
    try {
      localStorage.setItem('attunement.fxIntensity', String(level));
      localStorage.setItem('attunement.calmFlashes', calm ? '1' : '0');
    } catch {}
    vfx?.setIntensity(level, calm);
    alarmCalm=!!calm;
  },
  autoAttack: () => net.send({ t: 'atk', on: S.you?.auto ? 0 : 1 }),
  inspectCompanion: (id, point) => {
    S.inspect = S.inspect?.id === id ? null : { id, x: point.x, y: point.y };
  },
  closeInspect: () => { S.inspect = null; },
  target: (id) => setTarget(id),
  interact: id=>net.send({t:'act',id}),
  changeAppearance:appearance=>net.send({t:'appearance_change',appearance}),
  inspectAppearance:()=>{stopAutomaticMovement();cam.yaw=local.yaw+Math.PI;cam.pitch=.06;cam.want=cam.dist=4.2;},
  startAppearancePreview:(root,getAppearance,selectFrame)=>{
    hallPreview?.preview.destroy();
    const preview=createCreationPreview({root,assets,useGlb,motionPreference,selectFrame,getMeta:()=>{
      const me=S.ents.get(S.myId);
      return {...me.meta,ap:getAppearance()};
    }});
    hallPreview={root,preview};
  },
  lootOpen:(id,generation,auto)=>net.send({t:'loot_open',id,generation,auto}),
  lootTake:(id,generation,item)=>net.send({t:'loot_take',id,generation,item}),
  lootClose:()=>net.send({t:'loot_close'}),
  vendorTrade:quote=>net.send({...quote,t:'vendor_trade'}),
  vendorClose:()=>net.send({t:'vendor_close'}),
  craft: (recipe,quantity,rev)=>net.send({t:'craft',recipe,quantity,rev}),
  cancelProduction: () => net.send({ t: 'production_cancel' }),
  useUtility: (item,weapon,rev)=>net.send({t:'use_utility',item,weapon,rev}),
  equip: (item) => net.send({ t: 'equip', item }),
  rodMode: mode => net.send({ t:'rod_mode',mode }),
  itemSeen: (item, rev) => net.send({ t: 'item_seen', item, rev }),
  disposeItem: (item, action, rev) => net.send({ t: 'item_dispose', item, action, rev }),
  cancelInscription: () => net.send({ t: 'inscription_cancel' }),
  unequip: (slot) => net.send({ t: 'unequip', slot }),
  respawn: () => net.send({ t: 'respawn' }),
  chat: (m, channel='vicinity') => net.send({ t: 'chat', m, channel }),
  characters: () => openCharacterMenu(),
  signOut: () => net.signOut(),
  copyRecoveryKey: () => copyGuestRecoveryKey(),
});

// --- login -------------------------------------------------------------------

let chosenClass = 'symbiotech';
let chosenLook = defaultLook(chosenClass);
// Cosmetic appearance chosen at creation (validated again by the server).
let chosenAp = defaultAppearance(chosenLook);
let apTouched = false;
const creationPreview=createCreationPreview({
  root:$('creation-preview'),assets,useGlb,motionPreference,variant:'selection',
  getMeta:()=>({k:'p',c:chosenClass,a:chosenLook,n:$('name').value.trim()||chosenClass,ap:encodeAppearance(normalizeAppearance(chosenAp,chosenLook))}),
  selectFrame:frame=>{
    apTouched=true;
    chosenAp=normalizeAppearance({...chosenAp,frame},chosenLook);
    buildAppearance();
  },
});
let lastRoster=null;
const selectionView=new CharacterRosterView({root:$('character-roster'),assets,useGlb,motionPreference,
  onEnter:id=>net.selectCharacter(id),onCreate:showCharacterCreation,
  onDelete:(id,name)=>net.deleteCharacter(id,name)
});
let titleDrawAt=-Infinity;
let worldEntryPending=false;
const creationSections=setupCreationSections();
function showCharacterCreation(){
  if(!net.accountLogged||!lastRoster){
    $('roster-error').textContent='Your account session is unavailable. Sign in again to create a character.';
    return;
  }
  creationSections.show('identity');
  ui.toggleSettings(false);
  $('hud').hidden=true;
  $('character-roster').hidden=true;
  $('login-form').hidden=false;
  $('creation-back').hidden=false;
  $('enter').textContent='Create character';
  $('enter').disabled=false;
  $('login-error').textContent='';
  document.body.classList.remove('character-selection-mode','gate-mode');
  document.body.classList.add('character-create-mode');
  creationPreview.release();
  creationPreview.resetView();
  $('name').focus({preventScroll:true});
}
function backToRoster(){if(lastRoster&&net.accountLogged)showRoster(lastRoster);}

function buildAppearance() {
  const pick = (id, items, current, onPick, label) => {
    const wrap = $(id);
    wrap.replaceChildren();
    for (const it of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.value = String(it.value);
      b.setAttribute('aria-pressed', String(it.value === current));
      if (it.swatch !== undefined) {
        b.style.background = '#' + it.swatch.toString(16).padStart(6, '0');
        b.setAttribute('aria-label', it.label);
        b.title = it.label;
      } else b.textContent = it.label;
      b.addEventListener('click', () => {
        apTouched = true;
        onPick(it.value);
        chosenAp = normalizeAppearance(chosenAp, chosenLook);
        buildAppearance();
      });
      wrap.append(b);
    }
    void label;
  };
  const race = RACES[chosenAp.race];
  pick('ap-frame', Object.values(FRAMES).map((f) => ({ value: f.id, label: f.name })), chosenAp.frame, (v) => (chosenAp.frame = v));
  pick('ap-race', Object.values(RACES).map((r) => ({ value: r.id, label: r.name })), chosenAp.race, (v) => { chosenAp.race = v; chosenAp.skin = 0; });
  // Race-bound outfits (Red Rucker) offer only their race.
  if (LOOK_RACE[chosenLook]) for (const b of $('ap-race').children) b.disabled = b.dataset.value !== LOOK_RACE[chosenLook];
  $('ap-race-blurb').textContent = race.blurb;
  pick('ap-skin', race.skins.map((hex, i) => ({ value: i, swatch: hex, label: `Skin tone ${i + 1}` })), chosenAp.skin, (v) => (chosenAp.skin = v));
  pick('ap-hair', race.hair.map((h) => ({ value: h, label: HAIR_STYLES[h].name })), chosenAp.hair, (v) => (chosenAp.hair = v));
  pick('ap-colour', HAIR_COLOURS.map((c, i) => ({ value: i, swatch: c.hex, label: c.name })), chosenAp.hairColour, (v) => (chosenAp.hairColour = v));
  const hairless = race.hair.length === 1 && race.hair[0] === 'none';
  for (const b of $('ap-colour').children) b.disabled = hairless;
}
/** Offer the appearances of the chosen class (hidden when there is only one). */
function buildLooks() {
  const list = LOOKS[chosenClass];
  chosenLook = defaultLook(chosenClass);
  chosenAp=apTouched?normalizeAppearance(chosenAp,chosenLook):defaultAppearance(chosenLook);
  buildAppearance();
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
      chosenAp = apTouched ? normalizeAppearance(chosenAp, chosenLook) : defaultAppearance(chosenLook);
      buildAppearance();
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
  buildAppearance();
  $('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('name').value.trim();
    if (!/^[A-Za-z][A-Za-z '-]{1,14}[A-Za-z]$/.test(name)) {
      $('login-error').textContent = 'Names are 3–16 letters (spaces, apostrophes and hyphens allowed inside).';
      return;
    }
    $('login-error').textContent = '';
    $('enter').disabled = true;
    net.create(name, chosenClass, chosenLook, encodeAppearance(normalizeAppearance(chosenAp, chosenLook)));
  });
}

function showAccountLogin(message = '') {
  worldEntryPending=false;
  $('world-entry-curtain').hidden=true;
  selectionView.release();
  document.body.classList.remove('character-selection-mode','character-create-mode');
  document.body.classList.add('gate-mode');
  setAccountMode('signin');
  setPasswordShown(false);
  $('creation-back').hidden=true;
  $('login').hidden = false;
  $('hud').hidden = true;
  $('account-auth').hidden = false;
  $('character-roster').hidden = true;
  $('guest-note').hidden = false;
  $('saved-guest').hidden = !net.token;
  $('abandon-saved-guest').dataset.armed='';
  $('abandon-saved-guest').textContent='Abandon saved guest character';
  // Do not offer to overwrite the local guest key with a new character.
  $('login-form').hidden = !!net.token;
  $('resuming').hidden = true;
  $('account-error').textContent = message;
  $('login-error').textContent = '';
  $('enter').textContent = 'Enter as guest';
  $('enter').disabled = false;
  $('gate-guest-link').textContent = net.token ? 'Return to your saved guest' : 'Play as a guest';
}

function showRoster(m) {
  worldEntryPending=false;
  $('world-entry-curtain').hidden=true;
  lastRoster=m;
  if($('roster-import-dialog').open)$('roster-import-dialog').close();
  input.enabled=false;
  $('login').hidden=false;
  $('hud').hidden=true;
  $('resuming').hidden=true;
  $('account-auth').hidden=true;
  $('guest-note').hidden=true;
  $('character-roster').hidden=false;
  $('login-form').hidden=true;
  $('creation-back').hidden=true;
  $('enter').textContent='Create character';
  $('enter').disabled=false;
  $('roster-error').textContent='';
  $('login-error').textContent='';
  $('link-legacy').hidden=!net.token;
  document.body.classList.remove('character-create-mode','gate-mode');
  document.body.classList.add('character-selection-mode');
  creationPreview.release();
  selectionView.render(m);
  ui.toggleSettings(false);
}

// The gate form signs in or creates an account; the footer switch flips the mode.
function setAccountMode(mode) {
  const register = mode === 'register';
  $('account-form').dataset.mode = register ? 'register' : 'signin';
  $('account-signin').textContent = register ? 'Create account' : 'Sign in';
  $('account-password').autocomplete = register ? 'new-password' : 'current-password';
  $('account-mode-prompt').textContent = register ? 'Already have an account?' : 'Don’t have an account yet?';
  $('account-register').textContent = register ? 'Sign in' : 'Sign up';
  $('account-register-hint').hidden = !register;
  $('account-help').hidden = true;
  $('account-help-toggle').setAttribute('aria-expanded', 'false');
}
function setPasswordShown(shown) {
  $('account-password').type = shown ? 'text' : 'password';
  $('account-reveal').setAttribute('aria-pressed', String(shown));
  $('account-reveal').setAttribute('aria-label', shown ? 'Hide password' : 'Show password');
}

function buildAccountUI() {
  $('creation-back').addEventListener('click',backToRoster);
  $('account-form').addEventListener('submit', (e) => {
    e.preventDefault();
    $('account-error').textContent = '';
    net.accountAuth($('account-handle').value.trim(), $('account-password').value, $('account-form').dataset.mode === 'register');
  });
  $('account-register').addEventListener('click', () => {
    $('account-error').textContent = '';
    setAccountMode($('account-form').dataset.mode === 'register' ? 'signin' : 'register');
    $('account-handle').focus({ preventScroll: true });
  });
  $('account-reveal').addEventListener('click', () => {
    setPasswordShown($('account-password').type === 'password');
    $('account-password').focus({ preventScroll: true });
  });
  $('account-help-toggle').addEventListener('click', () => {
    const open = $('account-help').hidden;
    $('account-help').hidden = !open;
    $('account-help-toggle').setAttribute('aria-expanded', String(open));
  });
  // In-page links to guest access scroll the login view without touching the URL.
  for (const a of document.querySelectorAll('#account-auth a[href="#guest-note"]')) a.addEventListener('click', (e) => {
    e.preventDefault();
    $('guest-note').scrollIntoView({ block: 'start' });
    ($('resume-saved-guest').offsetParent ? $('resume-saved-guest') : $('login-form').hidden ? $('guest-resume-key') : $('name')).focus({ preventScroll: true });
  });
  $('account-signout').addEventListener('click', () => net.signOut());
  $('roster-settings').addEventListener('click', () => {
    if(!net.accountLogged)return;
    const open=ui.settingsPanel.hidden;
    if(open){
      setupRosterSettingsPages(ui.settingsPanel);
      const more=ui.settingsPanel.querySelector('#settings-screen-page-2');
      if(more&&!more.querySelector('#roster-import-trigger')){
        const button=document.createElement('button');
        button.id='roster-import-trigger';
        button.type='button';
        button.textContent='Import previous guest character';
        button.addEventListener('click',()=>{
          ui.toggleSettings(false);
          $('hud').hidden=true;
          $('roster-import-dialog').showModal();
          $('recovery-token').focus({preventScroll:true});
        });
        more.append(button);
      }
    }
    $('hud').hidden=!open;
    ui.toggleSettings(open);
    if(open)ui.settingsPanel.querySelector('button')?.focus({preventScroll:true});
  });
  // Settings can also close itself via its own X and Escape handlers.
  // Once it is closed, never leave an otherwise hidden gameplay HUD in front
  // of the account roster.
  new MutationObserver(()=>{
    if(document.body.classList.contains('character-selection-mode')
       &&ui.settingsPanel.hidden)$('hud').hidden=true;
  }).observe(ui.settingsPanel,{attributes:true,attributeFilter:['hidden']});
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
  $('abandon-saved-guest').addEventListener('click',()=>{
    if(!net.token||net.accountLogged)return;
    const btn=$('abandon-saved-guest');
    if(!btn.dataset.armed){btn.dataset.armed='1';btn.textContent='Confirm · forget local guest key';return;}
    saveToken(null);location.reload();
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
  const importDialog=$('roster-import-dialog');
  $('roster-import-close').addEventListener('click',()=>importDialog.close());
  importDialog.addEventListener('close',()=>{
    $('recovery-token').value='';
    $('roster-import-error').textContent='';
    if(document.body.classList.contains('character-selection-mode'))$('roster-settings').focus({preventScroll:true});
  });
  $('link-legacy').addEventListener('click',()=>{if(net.token)net.claimLegacy(net.token);});
  $('import-legacy').addEventListener('click',()=>{
    const token=$('recovery-token').value.trim();
    if(!net.claimLegacy(token))$('roster-import-error').textContent='Enter a valid 64-character guest recovery key.';
    else {$('roster-import-error').textContent='Import requested. Awaiting account confirmation…';$('recovery-token').value='';}
  });
  // Controls are disabled in the static HTML until both auth handlers exist.
  // This prevents first-click loss during slow module initialization.
  $('account-signin').disabled = false;
  $('account-register').disabled = false;
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
    document.body.classList.remove('gate-mode');
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
    // Appearance updates must replace the actual rendered character on every
    // observing client, while preserving interpolation, identity and targeting.
    if(meta.k==='p'&&(meta.ap!==ent.meta.ap||meta.a!==ent.meta.a)){
      const next=createModel(assets,meta,useGlb(meta)),old=ent.model;
      ent.holder.remove(old.group);old.dispose?.();ent.model=next;ent.holder.add(next.group);
      if(quality===0)lowSpec(next.group,true);
    } else {
      if (ent.meta.wv !== meta.wv) ent.model.setWeaponVisual?.(meta.wv);
      if (JSON.stringify(ent.meta.av || null) !== JSON.stringify(meta.av || null)) ent.model.setArmourVisual?.(meta.av);
      if (ent.meta.sv !== meta.sv) ent.model.setSocialVisual?.(meta.sv);
    }
    ent.meta = meta;
    return ent;
  }
  const model = createModel(assets, meta, useGlb(meta));
  if (model.worldLight) {
    const source = model.worldLight;
    stoneLight.color.copy(source.color);
    stoneLight.distance = source.distance;
    stoneLight.decay = source.decay;
    source.removeFromParent();
  }
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
  if (ent.model.worldLight) stoneLight.intensity = 0;
  recoveryVisuals.remove(ent.id);
  fx.clearRoot(ent.id);
  svfx?.remove(ent.id);
  liveAegis.remove(ent.id);
  scene.remove(ent.holder);
  dropRig(ent);
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
  S.sheet = null;
  S.you = null;
  recoveryVisuals.clear();
  stopAutomaticMovement();
  for (const ent of [...S.ents.values()]) removeEntity(ent);
  liveAegis.clear();
  liveCasts.clear();
  vfx?.clear();
  svfx?.clear();
  fx.clearFauna();
  ui.clearPlates();
}

const chestOf = (ent) => () => ent.chest;

// --- network handlers ----------------------------------------------------------

function onWelcome(m) {
  clearWorld();
  ui.questTracker.useCharacter(m.charId);
  ui.setAbilityOwner(m.charId);
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
  creationPreview.release();
  selectionView.release();
  ui.toggleSettings(false);
  worldEntryPending=true;
  $('world-entry-curtain').classList.remove('dismissed');
  $('world-entry-curtain').hidden=false;
  document.body.classList.remove('character-selection-mode','character-create-mode');
  $('login').hidden = true;
  $('hud').hidden = false;
  ui.setAccountLinked(net.accountLogged);
  // Preserve the existing input lifecycle; the transition veil only
  // affects presentation, not authoritative game simulation or controls.
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
    const prev=ent.buf.at(-1);if(prev&&!sameTravelRegion(prev,row))ent.buf.length=0;
    ent.buf.push({ t: m.time, x: row.x, z: row.z, j: row.j || 0, r: row.r || 0 });
    if (ent.buf.length > 12) ent.buf.shift();
  }
  for (const ent of [...S.ents.values()]) if (!seen.has(ent.id)) removeEntity(ent);

  // Reconcile local prediction with the authoritative position.
  const y = m.y;
  S.you = y;
  if (Number.isFinite(y.wc)) world.severancePocket?.timeOfDay.setLive(y.wc / 10000);
  if(Number.isSafeInteger(y.comp))S.compId=y.comp;
  S.followId=y.follow||0;
  if(S.followId){const own=S.ents.get(S.myId)?.row;if(own&&Number.isFinite(own.r))local.yaw=own.r;}
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
  // Private loot state must be current before keyboard input, even if rendering lags.
  ui.loot.sync(y.lootable,y.loot);
  ui.vendor.sync(y.vendor);
  // Presentation only: a vendor acknowledges a newly opened trade.
  const vendorId = y.vendor?.id ?? null;
  if (vendorId && vendorId !== S.lastVendorId) S.ents.get(vendorId)?.model.trigger?.('interact');
  S.lastVendorId = vendorId;
  ui.syncNpc();
  for (const e of m.ev) onEvent(e);
  if (m.pv) for (const e of m.pv) onEvent(e);
}

const EXTRA_NAMES = { auto: 'attack', sting: 'sting', carapace: 'Carapace', rending_echo: 'Rending Echo', arc_pulse: 'Arc Pulse', fault_shear: 'Fault Shear', containment_sweep: 'Containment Sweep', seismic_slam: 'Seismic Slam', resonance_burst: 'Resonance Burst', hurl: 'hurled stone', triage: 'mend', shared_pulse: 'Shared Pulse', bond: 'bond' };
const abilityName = (id) => (ABILITIES[id] ? ABILITIES[id].name : EXTRA_NAMES[id] || id);
const sourceColour = (ent) => (ent.meta.k === 'e' ? 0xff6a4a : ent.meta.c === 'vanguard' ? 0xffb45c : ent.meta.c === 'surveyor' ? 0x85cde9 : ent.meta.c === 'keeper' ? 0xb498e8 : ent.meta.c === 'mender' ? 0xffc46b : 0x7dffc4);

function nameOf(ent) {
  if (!ent) return 'Something';
  if (ent.id === S.myId) return 'You';
  if (ent.meta.k === 'c') {
    const owner = S.ents.get(ent.meta.o);
    const kind = ent.meta.c === 'survey_strider' ? 'Strider' : ent.meta.c === 'mender' ? 'symbiote' : ent.meta.n;
    if (ent.id === S.compId) return ent.meta.c === 'spindle' ? ent.meta.n : `Your ${kind}`;
    return owner ? `${owner.meta.n}'s ${kind}` : `A ${kind}`;
  }
  return ent.meta.n;
}

function onEvent(e) {
  const now = performance.now();
  // Muted only where the engine has a recipe; see the 'fx' case for the fallback.
  let fx = rich() ? MUTED_FX : legacyFx;
  switch (e.e) {
    case 'dmg': {
      const d = S.ents.get(e.d);
      const s = S.ents.get(e.s);
      const mine = e.s === S.myId || e.s === S.compId;
      // Confirmed primary melee attacks energize the equipped rod. Echo/AoE secondary hits
      // do not multiply weapon discharges; existing ability effects and damage are unchanged.
      const rodImpact = ['auto','rending_arc'].includes(e.ab)&&e.k==='melee'&&s?.meta.k==='p'&&s.meta.c==='vanguard'&&[1,2].includes(s.row?.er)&&s.placed&&s.inView&&d?.placed&&d.inView&&(e.a>0||e.sh>0)&&s.model.rodContact?.(d.chest,d.pos,!!e.sh);
      if (d) {
        if(e.a>0){d.hit=1;if(d.model.trigger)d.model.trigger('hit');}
        // A fully absorbed attack is a shield impact, not a body hit.
        const blocked=e.a===0&&e.sh>0;
        const cls = blocked?'shield':e.d === S.myId ? 'dmg-me' : mine ? 'dmg-mine' : 'dmg-other';
        ui.floatText(toScreen(d.head), blocked?`Blocked ${e.sh}`:e.sh ? `${e.a} (${e.sh} absorbed)` : String(e.a), cls);
        if (rich() && d.placed) cvfx.hit(d, s, e);
        if (e.sh && d.placed && !motionPreference.matches && quality > 0) fx.burst(d.chest, 0x89cfe1, 5, 0.75);
        else if (!rich() && e.a>0 && !e.sh && d.placed && (d.meta.c==='sinter_grazer'||d.meta.c==='faultstalker')){
          const dx=(s?.placed?s.pos.x:d.pos.x)-d.pos.x,dz=(s?.placed?s.pos.z:d.pos.z+1)-d.pos.z;
          const len=Math.hypot(dx,dz),nx=len>.001?dx/len:0,nz=len>.001?dz/len:1;
          const reach=d.model.radius*.68;
          fx.faunaImpact([d.chest.x+nx*reach,d.chest.y,d.chest.z+nz*reach],[nx,0,nz],
            {radius:d.model.radius*.62,reducedMotion:motionPreference.matches||quality===0});
        }else if (e.k !== 'bolt' && !e.sh && !rodImpact) fx.burst(d.chest, e.d === S.myId ? 0xff6a4a : 0xffe2a0, 5, 0.9);
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
        if (e.k === 'bolt' && !rich() && s.placed && d?.placed && s!==d) {
          const muzzle=e.ab==='auto'?s.model.weaponEffectOrigin?.():null;
          if(e.wv==='longpoint'&&muzzle?.isVector3&&[muzzle.x,muzzle.y,muzzle.z].every(Number.isFinite)){
            legacyFx.beam(()=>muzzle,chestOf(d),LONGPOINT_TRACE.color,LONGPOINT_TRACE.life*1000,LONGPOINT_TRACE.width);
          }else legacyFx.bolt(() => muzzle || s.chest, chestOf(d), sourceColour(s), 200, s.meta.k==='e'?'hostile':s.meta.c);
        }
        if (rich() && d?.placed && s.placed) cvfx.abilityHit(e.ab, s, d);
        if(d?.placed&&s.placed&&['rending_arc','core_bore','phase_needle','resonant_reversal'].includes(e.ab)){
          const a=pointOf(s),b=pointOf(d);
          authored(e.ab,'kinetic',{variant:e.ab==='phase_needle'||e.ab==='resonant_reversal'?'resonance':'impact',center:[b[0],b[1]+.7,b[2]],direction:toward(a,b),radius:Math.min(2,d.model.radius+.45),duration:.85});
        }
      }
      // Melee already has a burst above. Make bolt impacts readable too,
      // without doubling particles or changing combat damage.
      if (d && e.k === 'bolt' && e.a>0) fx.burst(d.chest, e.d === S.myId ? 0xff6a4a : 0xffe2a0, 3, 0.35);
      if (mine && d) ui.log(`${nameOf(s)}${e.s === S.myId ? 'r' : "'s"} ${abilityName(e.ab)} hits ${d.meta.n} for ${e.a}.`, 'out');
      else if (e.d === S.myId) ui.log(`${nameOf(s)}'s ${abilityName(e.ab)} hits you for ${e.a}${e.sh ? ` (${e.sh} absorbed)` : ''}.`, 'in');
      break;
    }
    case 'heal': {
      const d = S.ents.get(e.d);
      const s = S.ents.get(e.s);
      if (d) ui.floatText(toScreen(d.head), `+${e.a}`, 'heal');
      if (d?.placed && rich()) cvfx.heal(d, s);
      if (s && s !== d) s.model.armourReact?.('heal', e.ab);
      d?.model.armourReact?.('healed', e.ab);
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
        if (e.k === 'aegis_relay') {
          fx.beam(chestOf(s), chestOf(d), 0x8eddf0, 650, 0.10);
          fx.ring(d.pos.x, d.pos.z, 1.7, 0xa9eaf0, 540, d.pos.y);
          if (!motionPreference.matches && quality > 0) fx.burst(d.chest, 0x8eddf0, 6, 0.8);
        } else {
          fx.beam(chestOf(s), chestOf(d), 0x7dffc4, 500, 0.06);
          fx.burst(d.chest, 0x7dffc4, 4, 0.7);
        }
        if (rich() && s.placed && d.placed && s !== d) {
          if (e.k === 'aegis_relay') cvfx.relay(s, d);
          else cvfx.transfer(s, d);
        }
      }
      break;
    }
    case 'cast': {
      const s = S.ents.get(e.s);
      const d = S.ents.get(e.d);
      if (!s) break;
      if (s.model.trigger) s.model.trigger('ability', e.ab);
      if(s.meta.k==='p'&&s.meta.c==='vanguard'&&[1,2].includes(s.row?.er)&&s.placed&&s.inView&&['rending_arc','kinetic_ward','discharge'].includes(e.ab))s.model.rodCharge?.();
      if (rich() && s.placed && (!d || d.placed)) cvfx.cast(e.ab, s, d);
      if(e.ab==='hinge_field'&&d?.placed){authored('hinge-projection','aegis',{variant:'hinge',center:pointOf(d),radius:1.4,yaw:d.yaw,duration:1.2});fx.ring(d.pos.x,d.pos.z,1.5,0x7fd0ff,650,d.pos.y);}
      else if (e.ab === 'phase_transposition' && d) {
        s.castAnim=1;
        if (!rich()) {
          fx.beam(chestOf(s),chestOf(d),0x9adfff,650,0.12);
          fx.ring(s.pos.x,s.pos.z,1.6,0x7fd0ff,550,s.pos.y);
          fx.ring(d.pos.x,d.pos.z,1.6,0x7fd0ff,750,d.pos.y);
        }
      }
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
      let handled = false;
      if (rich() && (Number.isFinite(e.x) ? Number.isFinite(e.z) : s?.placed)) {
        handled = cvfx.area(Number.isFinite(e.x) ? { ...e, y: groundHeight(e.x, e.z) } : e, s, S.ents.get(e.o), S.ents.get(e.d));
        const o = e.k === 'attune' ? S.ents.get(e.o) : null;
        if (o && s) cvfx.attuneLink(o, s);
      }
      // A kind without an engine recipe (or one that could not be placed)
      // keeps its original effect, so new server effects never go invisible.
      if (!handled) fx = legacyFx;
      // Rich recipes supersede the ecology fallback only when handled.
      if (handled && ['fault_shear','sinter_pounce','sinter_repel','sinter_alarm','sinter_guard','sinter_molt'].includes(e.k)) break;
      if(e.k==='severance_traverse'){world.severance?.traverse(e);break;}
      if(['rift_open','rift_pulse','rift_stabilize','rift_collapse'].includes(e.k)){
        S.ents.get(e.s)?.model?.flare?.(e.k);
        if(!handled&&Number.isFinite(e.x)&&Number.isFinite(e.z)){
          const colour=e.k==='rift_pulse'?0xf2a37f:0xb7c5ea;
          fx.ring(e.x,e.z,e.r,colour,850);
          if(!motionPreference.matches&&quality>0)fx.pillar(e.x,e.z,colour,650);
        }
        break;
      }
      if (e.k === 'survey_blast') {
        fx.ring(e.x, e.z, e.r, 0xf0b56b, 650);
        fx.pillar(e.x, e.z, 0xf0b56b, 450);
        authored('controlled-blast','kinetic',{variant:'impact',center:[e.x,groundHeight(e.x,e.z)+.12,e.z],direction:[0,1,0],radius:e.r,duration:1});
        break;
      }
      if (e.k === 'fault_shear') {
        fx.ring(e.x,e.z,e.r,0xd18b4b,680);
        fx.ring(e.x,e.z,e.r*0.72,0xf2d6a0,450);
        fx.faunaImpact([e.x,groundHeight(e.x,e.z)+.24,e.z],[0,1,0],
          {variant:'shear',radius:e.r*.9,duration:.7,reducedMotion:motionPreference.matches||quality===0});
        if(!motionPreference.matches&&quality>0){
          for(let i=0;i<5;i++){
            const a=i*Math.PI*2/5;
            const x=e.x+Math.cos(a)*e.r*0.58,z=e.z+Math.sin(a)*e.r*0.58;
            fx.burst(new THREE.Vector3(x,groundHeight(x,z)+0.25,z),0xc8a481,3,0.8);
          }
        }
        break;
      }
      if(e.k==='sinter_pounce'||e.k==='sinter_repel'){
        const d=S.ents.get(e.d);
        if(s&&d&&s.placed&&d.placed){
          s.attack=1;
          const dx=d.pos.x-s.pos.x,dz=d.pos.z-s.pos.z,len=Math.hypot(dx,dz);
          const nx=len>.001?dx/len:0,nz=len>.001?dz/len:1;
          fx.faunaImpact([s.chest.x+nx*.35,s.chest.y,s.chest.z+nz*.35],[nx,0,nz],
            {variant:'wild',radius:.5,duration:.45,reducedMotion:motionPreference.matches||quality===0});
        }
        break;
      }
      if(e.k==='sinter_alarm'||e.k==='sinter_guard'||e.k==='sinter_molt'){
        if(s&&s.placed){
          const colour=e.k==='sinter_alarm'?0xcbb67a:e.k==='sinter_guard'?0xd98f52:0x9eae83;
          fx.ring(s.pos.x,s.pos.z,e.k==='sinter_alarm'?2.3:1.3,colour,680,s.pos.y);
          if(!motionPreference.matches&&quality>0)fx.burst(s.chest,colour,5,0.65);
        }
        break;
      }
      if (e.k === 'arc_pulse' || e.k === 'turret_drone_barrage' || e.k === 'seismic_slam' || e.k === 'containment_sweep') {
        fx.ring(e.x, e.z, e.r, 0xff6a3a, 500);
        fx.ring(e.x, e.z, e.r * 0.6, 0xffe2a0, 380);
        break;
      }
      if (e.k === 'carapace_echo') {
        fx.ring(e.x, e.z, e.r, 0xc9ae76, 650);
        const target = S.ents.get(e.d);
        if (s && target && !motionPreference.matches && quality > 0) {
          fx.beam(chestOf(s), chestOf(target), 0xc9ae76, 420, 0.11);
          fx.ring(e.x, e.z, e.r * 0.54, 0xe1dbb0, 430);
        }
        break;
      }
      if (!s) break;
      if (e.k === 'deep_record') {
        const o = S.ents.get(e.o);
        if (o) {
          fx.ring(o.pos.x,o.pos.z,1.5,0xbacb9a,700,o.pos.y);
          if (!motionPreference.matches && quality > 0) fx.beam(() => o.head,chestOf(s),0xbacb9a,850,0.09);
        }
        break;
      }
      if(e.k==='vein_extract'||e.k==='vein_harvest'||e.k==='vein_break'){
        const o=S.ents.get(e.o);
        if(e.k==='vein_extract'){o?.model?.extract?.(e.ms);s?.model?.trigger?.('gather','gather');}
        else if(e.k==='vein_harvest')o?.model?.harvest?.();
        else o?.model?.breakOff?.();
        break;
      }
      if(e.k==='field_recovery'){
        const o=S.ents.get(e.o);
        if(!handled&&o?.placed)fx.ring(o.pos.x,o.pos.z,1.25,0xc0b88c,680,o.pos.y);
        break;
      }
      if (e.k === 'sinter_sample') {
        const o = S.ents.get(e.o);
        if (o) {
          const colour = e.mode === 'kinetic' ? 0x8ec4d5 : 0x90c6a1;
          fx.ring(o.pos.x, o.pos.z, 1.6, colour, 680, o.pos.y);
          if (!motionPreference.matches && quality > 0) {
            fx.beam(chestOf(s), () => o.head, colour, 720, 0.085);
            fx.burst(o.head, colour, 5, 0.65);
          }
        }
        break;
      }
      if (e.k === 'field_maintenance') {
        if(!handled)fx.ring(s.pos.x,s.pos.z,1.15,0xd6b788,650,s.pos.y);
        break;
      }
      if (e.k === 'carapace_imprint') {
        fx.ring(s.pos.x, s.pos.z, 1.3, 0x97b6a1, 430, s.pos.y);
        break;
      }
      if (s.model.trigger && (e.k === 'discharge' || e.k === 'aegis' || e.k === 'surge' || e.k === 'attune')) s.model.trigger('ability', e.k);
      if(e.k==='lattice_relay'){fx.ring(s.pos.x,s.pos.z,e.r,0x7fd0ff,650,s.pos.y);if(s.placed)authored('lattice-relay','aegis',{variant:'lattice',center:pointOf(s),radius:1.5,yaw:s.yaw,duration:1.2});}
      else if(['harmonic_restore','rescue_lattice','brine_service'].includes(e.k)){if(s.placed)authored(e.k,'restorative',{variant:'stabilize',target:pointOf(s),radius:1.3,duration:1.6});fx.ring(s.pos.x,s.pos.z,1.6,0x8ecfb1,650,s.pos.y);}
      else if (e.k === 'discharge') {
        s.castAnim = 1;
        if (!handled) {
          fx.ring(s.pos.x, s.pos.z, e.r, 0xffb45c, 520, s.pos.y);
          fx.ring(s.pos.x, s.pos.z, e.r * 0.55, 0xfff2c0, 380, s.pos.y);
          fx.burst(s.chest, 0xffb45c, 14, 2.4);
          if (s.placed) authored('discharge','kinetic',{variant:'resonance',center:pointOf(s),radius:Math.min(12,e.r),duration:1});
        }
      } else if (e.k === 'aegis') {
        s.castAnim = 1;
        if (!handled) {
          fx.ring(s.pos.x, s.pos.z, e.r, 0x7fd0ff, 650, s.pos.y);
          if (!motionPreference.matches && quality > 0) fx.ring(s.pos.x, s.pos.z, e.r * 0.65, 0xb6e7ef, 450, s.pos.y);
        }
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
      // world anomalies show their own build-up; the enemy wind-up dome is for creatures
      if (ent?.model?.charge) ent.model.charge(e.ms);
      else if (ent?.placed && rich()) cvfx.windup(ent, e.ms);
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
      if (d) ui.floatText(toScreen(d.head), e.k === 'relay' ? `Relay +${e.a}` : `Aegis ${e.a}`, 'shield');
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
        if (e.k === 'warn') ui.toast(e.m, 'warn');
        if (e.k === 'production') ui.toast(e.m, 'production');
        if (e.k === 'gain') {
          ui.toast(e.m, 'gain');
          acquired();
        }
      }
      break;
    case 'loot':
      acquired();
      break;
    case 'attributes':
      ui.attributeToast(e.item, e.changes);
      break;
    case 'ritual': {
      // Process accepted local starts even when no animation frame sampled
      // the short-lived authoritative action.
      if(e.s===S.myId&&e.phase==='begin')ui.dismissWorldActionPanels();
      const actor = S.ents.get(e.s);
      if (!actor?.placed) break;
      const { x, y, z } = actor.pos;
      const colour = 0xb8a0e0;
      if (e.phase === 'begin') {
        actor.model.trigger?.('ability', 'attune');
        fx.ring(x, z, 0.95, colour, 700, y);
      } else if (e.phase === 'trace') {
        fx.ring(x, z, 1.45, colour, 700, y);
        if (!motionPreference.matches) fx.burst(actor.chest, colour, 8, 0.65);
      } else if (e.phase === 'complete') {
        fx.ring(x, z, 2, colour, 710, y);
        if (!motionPreference.matches) fx.pillar(x, z, colour, 600);
      }
      break;
    }
    case 'production': {
      if(e.s===S.myId&&e.phase==='begin'&&e.first===true)ui.dismissWorldActionPanels();
      const actor = S.ents.get(e.s);
      if (!actor?.placed || e.phase === 'stop') break;
      const { x, y, z } = actor.pos;
      const colour = e.method === 'culture' ? 0x9ed4a3 : e.method === 'upgrade' ? 0xe3bd76 : 0x8fcbd1;
      if (e.phase === 'begin') actor.model.trigger?.('ability', e.method === 'culture' ? 'mending_graft' : 'interact');
      fx.ring(x, z, e.phase === 'complete' ? 1.7 : 0.8, colour, 620, y);
      if (!motionPreference.matches) {
        if (e.method === 'culture') fx.burst(actor.chest, colour, 10, 0.55);
        else if (e.method === 'upgrade') fx.pillar(x, z, colour, 500);
        else fx.burst(actor.chest, colour, 5, 1.05);
      }
      break;
    }
    case 'xp': {
      const me = S.ents.get(S.myId);
      if (me) ui.floatText(toScreen(me.head), `+${e.a} XP`, 'xp');
      break;
    }
    case 'radio':
      ui.radio.receive(e.source,e.m,e.dialogueId);break;
    case 'workshop_open':
      ui.workshopTab='fabrication';ui.toggleWorkshop(true);break;
    case 'field_record':
      ui.showFieldRecord(e.key);break;
    case 'appearance_applied':
      ui.appearanceApplied(e.appearance);break;
    case 'appearance_rejected':
      ui.appearanceRejected(e.reason);break;
    case 'say':
      if(!ui.showNpcDialogue(e.id,e.m))ui.toast(`${e.n}: “${e.m}”`, 'npc');
      ui.chatLine(e.n, e.m, 'npc');
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
function pick(x, y, kinds, allowLoot=false) {
  let best = null;
  let bestDist = Infinity;
  for (const ent of S.ents.values()) {
    if (!kinds.includes(ent.meta.k) || ent.id === S.myId || !ent.placed) continue;
    if(ent.meta.k==='e'&&ent.dead){
      if(!allowLoot||!ui.loot.canLoot(ent.id))continue;
      const body=toScreen(ent.pos);if(!body)continue;
      const radius=Math.max(25,Math.min(58,ent.model.radius*36));
      if(Math.hypot(x-body.x,y-body.y)<=radius){const d=camera.position.distanceToSquared(ent.holder.position);if(d<bestDist){bestDist=d;best=ent;}}
      continue;
    }
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
  return nearestInteractable(S.ents,S.myId,S.you,INTERACT_RANGE);
}

function nextEnemy() {
  const me = S.ents.get(S.myId);
  if (!me) return;
  const fx_ = Math.sin(cam.yaw);
  const fz_ = Math.cos(cam.yaw);
  const list = [];
  for (const ent of S.ents.values()) {
    if (ent.meta.k !== 'e' || ent.dead || (ent.meta.neu && !(ent.row?.f & 8))) continue;
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
    const ent = pick(x, y, ['e', 'p', 'c', 'o'],true);
    if(ent?.meta.k==='e'&&ent.dead){ui.loot.open(ent.id);return;}
    if (ent?.meta.k === 'c') {
      S.inspect = S.inspect?.id === ent.id ? null : { id: ent.id, x: x + 14, y: y - 24 };
    } else if(ent?.meta.k==='o'&&(ent.meta.c==='quartermaster'||ent.meta.c==='expedition_quartermaster')) {net.send({t:'act',id:ent.id});}
    else if(npcProfile(ent)) {ui.openNpc(ent);}
    else if (ent && ent.meta.k !== 'o') setTarget(ent.id);
    else S.inspect = null;
  } else {
    S.inspect = null;
    const ent = pick(x, y, ['e', 'o', 'p'],true);
    if (!ent) return;
    if(ent.meta.k==='e'&&ent.dead){ui.loot.open(ent.id);return;}
    if(ent.meta.k==='p') { ui.openPlayerContext(ent,x,y); return; }
    if (ent.meta.k === 'o') {
      if(npcProfile(ent))ui.openNpc(ent);
      else net.send({ t: 'act', id: ent.id });
    }
    else {
      setTarget(ent.id);
      net.send({ t: 'atk' });
    }
  }
};

input.onAction = (code, e) => {
  const action=bindings.resolve(e);
  if(action && S.sheet) {
    const i=Number(action.split(':')[1])-1;
    const def=CLASSES[S.sheet.cls];
    if(action.startsWith('companion:')){
      const pet=S.ents.get(S.compId)?.meta.c;
      const mode=companionCommandKeys(pet)[i];
      if(mode && COMPANIONS[pet]?.modes[mode])net.send({t:'pet',c:mode});
    } else if(ui.hotbarAssignment(i)&&ui.hotbarAssignment(i)!=='@companion'){
      net.send({t:'use',a:ui.hotbarAssignment(i)});
    } else if(ui.hotbarAssignment(i)==='@companion'){
      const eligible=S.ents.get(S.myId);
      if(eligible&&!eligible.dead&&!(eligible.row?.f&8)){
        if(S.compId)net.send({t:'pet_manage',action:'dismiss'});
        else if(S.you?.companions?.some(c=>c.isDefault&&c.available))net.send({t:'pet_manage',action:'summon'});
      }
    }
    e.preventDefault();
    return;
  }
  // Modified unbound keys must not trigger unrelated built-in actions.
  if(e.ctrlKey||e.altKey||e.metaKey)return;
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
      e.preventDefault();
      if(ui.cancelHotbarDrag())break;
      stopAutomaticMovement();
      // Dismiss an active window first. Otherwise open/close the corner
      // menu, preserving the existing escape-to-clear-target behaviour.
      if (!ui.closePanels()) {
        if (S.target) setTarget(0);
        ui.toggleMenu();
      }
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
    case 'KeyL':
      ui.toggleQuestJournal();
      break;
    case 'KeyP':
      if(e.shiftKey)ui.toggleParty();
      else ui.toggleAbilityMatrix();
      break;
    case 'KeyO':
      ui.toggleSettings();
      break;
    case 'KeyM':
      e.preventDefault();
      ui.toggleAtlas();
      break;
    case 'KeyH':
      ui.toggleHelp();
      break;
    case 'KeyV':
      cam.reset(local.yaw);
      break;
    case 'KeyF': {
      // An open, visible personal loot session takes priority over world interaction.
      if(!e.shiftKey&&ui.loot.takeAll())break;
      const o = nearestObject();
      if(o?.meta.k==='e'&&o.dead)ui.loot.open(o.id,e.shiftKey===true);
      else if(npcProfile(o))ui.openNpc(o);
      else if (o) net.send({ t: 'act', id: o.id });
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
  if(S.followId)net.send({t:'follow',id:0});
  S.followId = 0;
}
function followPlayer(id) {
  const ent = S.ents.get(id);
  const me = S.ents.get(S.myId);
  if (!me || me.dead || !ent || ent.id === S.myId || ent.meta.k !== 'p' || ent.dead) return ui.error('Select a living player to follow.');
  stopAutomaticMovement();
  // Deliver any earlier manual input before the follow intent.
  while(local.outbox.length)net.send({t:'in',s:local.outbox.splice(0,16)});
  S.followId = id;
  net.send({t:'follow',id});
}
// Manual/auto-run inputs reset on blur; explicit server follow survives hidden tabs.
input.onReset = () => { S.autoRun = false; };

function stepLocal(inp, now, dt) {
  const me = S.ents.get(S.myId);
  const dead = !!(me && me.dead);
  if (!me || dead || !input.enabled) stopAutomaticMovement();
  // Automatic movement is only an input convenience. It uses the same
  // collision, speed, prediction, rate limits and server movement validation.
  if (inp.f || inp.s || inp.turn || inp.jump || inp.steering) stopAutomaticMovement();
  // Following is server-driven; do not send duplicate movement steps.
  if (!S.followId && S.autoRun) inp.f = 1;
  if(document.hidden){inp.f=0;inp.s=0;inp.turn=0;inp.jump=false;}
  if (inp.lookX || inp.lookY) cam.look(inp.lookX, inp.lookY);
  if (inp.wheel) cam.zoom(inp.wheel);
  if (!dead) {
    if (inp.steering) local.yaw = cam.yaw;
    else if (inp.turn) {
      const d = inp.turn * TURN_RATE * dt;
      local.yaw += d;
      cam.yaw += d;
    }
    if ((inp.f > 0 || S.followId) && !inp.steering && !inp.orbiting && !input.lmb) cam.trail(local.yaw, dt);
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
    if (!S.followId && (f || st || jump || airborne || turned)) {
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
        // Posts with an authored facing (the Sanctum wardens) never turn.
        yaw = ent.meta.y !== undefined ? ent.meta.y
          : me && ent.meta.c === 'archivist' && Math.hypot(me.pos.x - x, me.pos.z - z) < 9 ? Math.atan2(me.pos.x - x, me.pos.z - z) : 0.9;
        if (ent.meta.y === undefined) yaw = lerpAngle(ent.yaw, yaw, Math.min(1, dt * 4));
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
    let travel = 0;
    if (ent.placed) {
      const mx = x - ent.pos.x;
      const mz = z - ent.pos.z;
      if (ent.meta.c === 'spindle') travel = signedWheelTravel(mx, y - ent.pos.y, mz, yaw);
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
    const facingTarget = now < (ent.faceUntil || 0) && !ent.dead && ent.speed < 1.5 && ent.meta.y === undefined
      ? S.ents.get(ent.faceTo) : null;
    const faceYaw = facingTarget && facingTarget.placed
      ? Math.atan2(facingTarget.pos.x - x, facingTarget.pos.z - z) : yaw;
    // Smooth presentation yaw separately from the authoritative movement yaw.
    ent.displayYaw = ent.displayYaw === undefined || ent.meta.y !== undefined ? faceYaw
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
    // Persistent statuses (ward, regeneration, bond, corrode, sap, root) while the server reports them.
    if (svfx && rich() && ent.placed && ent.inView && !ent.dead) svfx.sync(ent, row?.b, dt * vfxTime);
    else svfx?.remove(ent.id);
    if (ent.rigModel) animateRig(ent, t);
    // Presentation only: where a character's eyes and head turn, and whether
    // the face is close enough to animate in detail.
    let lookAt = null;
    const camD = camera.position.distanceTo(cullSphere.center);
    if (ent.model.kind === 'glb' && ent.meta.c !== 'turret_drone' && ent.inView && camD < 16 && !ent.dead) {
      const meP = S.ents.get(S.myId);
      const tgt = ent.id === S.myId ? S.ents.get(S.target) : meP && Math.hypot(meP.pos.x - x, meP.pos.z - z) < 6 ? meP : null;
      if (tgt && tgt !== ent && tgt.placed) lookAt = (ent.lookVec ||= new THREE.Vector3()).set(tgt.pos.x, tgt.pos.y + (tgt.model.height || 1.8) * 0.88, tgt.pos.z);
      else if (ent.id === S.myId && camD < 3.2) lookAt = (ent.lookVec ||= new THREE.Vector3()).copy(camera.position);
    }
    ent.model.update(dt, {
      lookAt,
      faceDetail: ent.inView && (camD < faceDetailRange() || fullFaceDetail),
      talking: !!(ent.meta.c === 'archivist' || ent.meta.c === 'quartermaster' || ent.meta.c === 'expedition_quartermaster' || ent.meta.c === 'outpost_crew') && !!lookAt,
      t,
      speed: ent.speed,
      travel,
      cameraDistance: camD,
      dead: ent.dead,
      attack: ent.attack,
      cast: ent.castAnim,
      hit: ent.hit,
      air: j > 0.05,
      mode: row ? row.md : undefined,
      act: row ? row.a : undefined,
      casting,
      reducedMotion: motionPreference.matches || quality===0,
      effectsQuality: quality,
      electricalRod: ent.meta.k==='p'?(row?.er===2?'dual':row?.er===1?'rod':null):null,
      electricalRodVfx: ent.inView && camD < 24 ? vfx : null,
      rodQuality: quality,rodIntensity:vfx?.intensity??1,rodCalm:motionPreference.matches||vfx?.calmFlashes||false,
      work:row?.work,
      ecology: row?.ec,
      riftPhase:row?.rf,riftWarning:row?.rw??0,gatePhase:row?.gp,
      veinMs: ent.meta.c==='resonant_vein' ? (S.you?.veins?.depleted?.find((d)=>d.id===ent.id)?.ms ?? 0) : 0,
      grown: !!row?.grown,
      mineral:!!row?.mineral,scar:!!row?.scar,
      combat: !!(row && row.f & 8),
      charge: ent.id === S.myId && S.you ? S.you.res / 100 : 0,
      self: ent.id === S.myId,
      // Presentation only: how close the local player stands to an object.
      near: ent.meta.k === 'o' && S.ents.get(S.myId) ? Math.hypot(S.ents.get(S.myId).pos.x - x, S.ents.get(S.myId).pos.z - z) : undefined,
      fwd: ent.fwd,
      interval: ent.id === S.myId ? 0 : animationInterval(camera.position.distanceTo(cullSphere.center), ent.inView, false),
    });
    const light = ent.model.worldLight;
    if (light) {
      stoneLight.intensity = light.intensity;
      stoneLight.position.copy(light.position).applyAxisAngle(stoneUp, ent.displayYaw);
      stoneLight.position.x += x;
      stoneLight.position.y += y;
      stoneLight.position.z += z;
    }
  }
  recoveryVisuals.sync(S.ents,S.you?.lootable,me?.pos,vfx,quality,motionPreference.matches);
}

function updatePlates(now) {
  const me = S.ents.get(S.myId);
  // Only suppress overlapping calm wildlife labels, never active enemies,
  // allies, objects or the currently selected target. Stable priority.
  const occupied=[];
  const entries=[...S.ents.values()].sort((a,b)=>{
    const priority=e=>e.id===S.target?0:e.meta.neu&&!(e.row?.f&8)&&!e.dead?2:1;
    return priority(a)-priority(b)||a.id-b.id;
  });
  for (const ent of entries) {
    if (ent.id === S.myId) continue;
    const k = ent.meta.k;
    const d = me ? Math.hypot(ent.pos.x - me.pos.x, ent.pos.z - me.pos.z) : 0;
    const max = k === 'c' ? 22 : k === 'e' ? (ent.meta.el ? 60 : 45) : 60;
    const hide = !ent.placed || d > (k === 'e' && ent.dead ? 15 : max);
    let screen = hide ? null : toScreen(ent.head);
    const row = ent.row || {};
    const lootable=k==='e'&&ent.dead&&!!S.you?.lootable?.some(x=>x.id===ent.id);
    let label = ent.meta.n;
    let cls = 'player';
    if (k === 'e') {
      const calm = ent.meta.neu && !(row.f & 8);
      cls = ent.dead ? (lootable?'corpse lootable':'corpse') : ent.meta.el ? 'enemy elite' : calm ? 'enemy neutral' : 'enemy';
      label = ent.dead ? `${ent.meta.n} · ${lootable?"Loot":"remains"}` : `${ent.meta.n}${ent.meta.el ? " ◆" : ""}`;
      if (!ent.dead && row.f & 2) label += ' (retreating)';
      else if (!ent.dead && calm) label += ent.meta.form ? ' · '+(row.grown?'matured ': '')+ent.meta.form+(ent.id===S.target?' · neutral':'') : ' · neutral';
    } else if (k === 'c') cls = 'comp';
    else if (k === 'o') cls = 'object';
    if(screen){
      const half=Math.max(36,label.length*3.9);
      const rect={l:screen.x-half,r:screen.x+half,t:screen.y-30,b:screen.y};
      const calm=ent.meta.neu&&!(row.f&8)&&!ent.dead;
      if(calm&&ent.id!==S.target&&occupied.some(o=>rect.l<o.r&&rect.r>o.l&&rect.t<o.b&&rect.b>o.t))screen=null;
      if(screen)occupied.push(rect);
    }
    ui.placePlate(ent, screen, {
      cls,
      label,
      lootable,
      selected: k === 'c' ? ent.id === S.inspect?.id : ent.id === S.target,
      owned: k === 'c' && ent.meta.o === S.myId,
      hp: (k === 'e' || k === 'p') && row.m && (!ent.meta.neu || row.f&8 || ent.id===S.target) ? Math.max(0, row.h / row.m) : 0,
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
  if (q === 0) svfx?.clear();
  vfx?.setQuality(q);
  setFaceQuality(q);
  renderer.setPixelRatio(q >= 1 ? Math.min(window.devicePixelRatio || 1, 2) : Math.min(window.devicePixelRatio || 1, 1) * 0.75);
  resize();
}
// ?q=0|1|2 pins the starting quality (useful on weak or software GPUs);
// add &qlock=1 to also stop it adapting to the frame rate (for captures).
const wantQ = params.get('q');
const qualityLocked = params.get('qlock') === '1';
// ?facelod=0 keeps eyes, lashes and teeth drawn at any distance (close-up captures).
const fullFaceDetail = params.get('facelod') === '0';
if (wantQ !== null && /^[012]$/.test(wantQ)) setQuality(Number(wantQ));

const drawGap = Number(params.get('rfps')) > 0 ? 1000 / Number(params.get('rfps')) - 2 : 0;
let lastDraw = -1e9;

function advanceEffects(dt) {
  fxClock += dt * 1000;
  fx.update(dt);
  liveCasts.update(fxClock);
  vfx?.update(dt);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0.001, (now - last) / 1000));
  last = now;
  time += dt;
  kestrelAlarm.update(!!S.myId&&!!S.you?.kestrelAlarm,time,motionPreference.matches||alarmCalm);

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
    machine?.userData.updateWork?.(dt,time,null,true);
    const inspecting=creationPreview.update(now,dt)||selectionView.update(now,dt);
    // Dedicated cinematic scenes own both character screens.
    if(document.body.classList.contains('character-selection-mode')||document.body.classList.contains('character-create-mode'))return;
    if(now-titleDrawAt<Math.max(drawGap,inspecting?250:0))return;
    titleDrawAt=now;
    // Title backdrop: a slow orbit of the Sanctum.
    const a = time * 0.06;
    camera.position.set(Math.sin(a) * 34, 15, Math.cos(a) * 34);
    camera.lookAt(0, 5, 0);
    world.update(dt, time, { x: 0, y: 0, z: 0 });
    renderer.render(scene, camera);
    return;
  }

  if(hallPreview){
    if(!hallPreview.root.isConnected||hallPreview.root.closest('[hidden]')||!S.ents.get(S.myId)){hallPreview.preview.destroy();hallPreview=null;}
    else if(!S.paused)hallPreview.preview.update(now,dt);
  }
  stepLocal(input.sample(), now, dt);
  updateEntities(dt, time, now);
  if(machine?.userData.updateWork){
    let working=null;
    for(const actor of S.ents.values())if(actor.meta.k==='p'&&actor.row?.work?.site==='sanctum'){
      const w=actor.row.work;if(!working||w.q>working.q)working=w;
    }
    machine.userData.updateWork(dt,time,working,motionPreference.matches||quality===0);
  }
  const me = S.ents.get(S.myId);
  if (me && me.placed) {
    cam.update(me.pos, dt);
    // Pressed against a wall the camera sits in the character's head.
    me.holder.visible = me.inView && cam.dist > 1.3;
  }
  if (!inspectVfx || !S.paused) advanceEffects(dt * vfxTime);
  pressureZone.visible=!!S.you?.brineTrial?.ms;

  const target = S.ents.get(S.target) || null;
  if (me && me.placed) {
    // Whatever stands between the camera and the player or their target fades.
    viewPoints[0] = me.chest;
    viewPoints[1] = target && target.placed && !target.dead ? target.chest : null;
    world.update(dt, time, me.pos, { eye: camera.position, points: viewPoints, serverSeconds: Math.max(0,(now+(S.timeOffset??-now)-INTERP_MS)/1000) });
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
      ui.drawMinimap({ me, ents: S.ents, yaw: local.yaw, party: S.you.party?.members ?? [], daylight: world.severancePocket?.timeOfDay?.state });
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
    if(worldEntryPending&&me?.placed&&me.row&&S.you){
      // Never reveal the title camera's vacant aerial scene before the
      // selected, server-owned character is instantiated and framed.
      worldEntryPending=false;
      input.enabled=true;
      const curtain=$('world-entry-curtain');
      curtain.classList.add('dismissed');
      if(motionPreference.matches)curtain.hidden=true;
      else curtain.addEventListener('transitionend',()=>{
        if(!worldEntryPending)curtain.hidden=true;
      },{once:true});
    }
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
      followId:S.followId,
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
      ents: [...S.ents.values()].map((e) => ({ id: e.id, k: e.meta.k, c: e.meta.c, n: e.meta.n, a: e.meta.a, form: e.meta.form, x: e.pos.x, z: e.pos.z, row: e.row, dead: e.dead, model: e.model.kind || 'procedural', weaponVisual: e.meta.wv || null, weaponVisible: !!e.model.weaponEffectOrigin?.(), armourVisual: e.meta.av || null, armourWorn: e.model.armourWorn?.() || null, armourWornAll: e.model.armourWornAll?.() || null, armourFx: e.model.armourFxInfo?.() || null, socialVisual: e.meta.sv || null, socialWorn: e.model.socialWorn?.() || null, inView: e.inView,
        ...(e.model.haloRole ? { halo: { role: e.model.haloRole, variant: e.model.variant, meshes: e.model.meshes, yaw: e.displayYaw } } : {}), speed: Math.round(e.speed * 10) / 10, anim: e.model.animator ? e.model.animator.describe() : null })),
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
  ...(inspectVfx && { effects: {
    stats: () => vfx?.stats(),
    step(seconds) {
      if (!S.paused || !Number.isFinite(seconds) || seconds < 0 || seconds > 3) return;
      const count = Math.ceil(seconds * 60);
      for (let i = 0; i < count; i++) advanceEffects(seconds / count);
      renderer.render(scene, camera);
    },
  } }),
  /**
   * Severance Expanse time-of-day preview (presentation only, local, not a game clock).
   * timeOfDay({key:'night'}) | ({mode:'loop', period:28, t:0}) | ({mode:'hold', t:0.37}) | ({mode:'off'})
   */
  timeOfDay(req) {
    const tod = world.severancePocket?.timeOfDay;
    return req ? tod?.configure(req) : tod?.state;
  },
  /** Review captures: freeze the Expanse presentation clock, then advance it by exact steps. */
  severanceClock(manual) { world.severancePocket?.setManualClock(manual); },
  severanceStep(seconds, render = true) {
    if (!S.paused || !world.severancePocket?.step(seconds)) return false;
    if (!render) return true;
    camera.updateMatrixWorld();
    renderer.render(scene, camera);
    return true;
  },
  /** Pose the camera (and the character's facing) for repeatable screenshots. Presentation only. */
  view({ yaw, pitch, dist, face } = {}) {
    if (yaw !== undefined) cam.yaw = yaw;
    if (pitch !== undefined) cam.pitch = pitch;
    if (dist !== undefined) cam.want = cam.dist = dist;
    if (face !== undefined) local.yaw = face;
  },
};
