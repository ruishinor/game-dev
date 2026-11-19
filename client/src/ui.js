import {FRAMES,RACES,HAIR_STYLES,HAIR_COLOURS,LOOK_RACE,normalizeAppearance,encodeAppearance} from '../../shared/appearance.js';
// Heads-up display. Pure presentation over state the server sent; every
// button just asks main.js to send an intent. Dynamic text (names, chat) is
// only ever written with textContent.

import { ABILITIES, CLASSES, COMPANIONS, ITEMS, directiveFor, SURVEYOR, XP_TO_NEXT, MAX_LEVEL, SKILL_NAMES, ATTUNEMENT_NAMES, SLOTS, SLOT_NAMES, ENEMIES } from '../../shared/content.js';
import { describeRequirements, tryEquip, tryUnequip } from '../../shared/build.js';
import { ATTRIBUTE_DISPLAY } from '../../shared/attributes.js';
import { BLOOM_RELAY } from '../../shared/gadgets.js';
import { WORLD, ZONES, COLLIDERS, RIFT_ANNEX, inRiftAnnex, sameTravelRegion, SEVERANCE_POCKET, inSeverancePocket } from '../../shared/world.js';
import { conditionOf, weaponReach } from '../../shared/condition.js';
import { ENTRIES } from './journal.js';
import { renderLoadout, renderInventory, renderCodex } from './journal-ui.js';
import { brineHint, FIELD_RECORDS } from '../../shared/survey.js';
import { RECIPES } from '../../shared/crafting.js';
import { GOODS } from '../../shared/goods.js';
import { canSalvageEquipment } from '../../shared/item-actions.js';
import { renderWorkshop, updateProduction } from './workshop-ui.js';
import { WindowLayout } from './window-layout.js';
import { RadioPanel } from './radio.js';
import { LootPanel } from './loot-ui.js';
import { QuestJournal } from './quest-journal-ui.js';
import { QuestTracker } from './quest-tracker-ui.js';
import { VendorPanel } from './vendor-ui.js';
import { enemyTargetStatus } from './target-status.js';
import { npcProfile, starterFabrication } from './npc-interaction.js';
import { placePartyMarker } from './minimap-party.js';
import {recoverySamples,recoveryRank,RECOVERY_MASTERY} from '../../shared/recovery.js';
import {CRAFTING_DISCIPLINES,disciplineProgress} from '../../shared/crafting-disciplines.js';

const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS = {
  recover:svg('<path d="M4 9h16v12H4zM8 9V6a4 4 0 0 1 8 0v3M9 14h6M12 11v6"/>'),
  screen:svg('<path d="m12 3 8 4v6c0 4-8 8-8 8s-8-4-8-8V7zM8 12h8M12 8v8"/>'),
  phase_needle:svg('<path d="M3 20 21 3M10 17l7-7M16 3h5v5"/>'),
  hinge_field:svg('<path d="M3 19V9l9-6 9 6v10M3 19h18M12 3v16"/>'),
  resonant_reversal:svg('<path d="M4 7h12l-4-4m4 4-4 4M20 17H8l4-4m-4 4 4 4"/>'),
  lattice_relay:svg('<path d="m12 3 9 9-9 9-9-9zM3 12h18M12 3v18"/><circle cx="12" cy="12" r="3"/>'),
  phase_transposition:svg('<path d="M2 8l5-3 5 3v4c0 4-5 7-5 7s-5-3-5-7zM14 5h6m-3-3 3 3-3 3M14 14l4-2 4 2v3c0 3-4 5-4 5s-4-2-4-5z"/>'),
  fault_scan: svg('<circle cx="12" cy="12" r="8"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5M12 12l5-4"/>'),
  core_bore: svg('<path d="M3 20 18 5m-5 0h5v5M5 14l5 5M9 10l5 5"/>'),
  field_rig: svg('<rect x="8" y="3" width="8" height="10" rx="1"/><path d="M12 13v8M8 13l-5 8m13-8 5 8M10 6h4m-4 3h4"/>'),
  controlled_blast: svg('<circle cx="12" cy="12" r="3"/><path d="M12 1v5m0 12v5M1 12h5m12 0h5M4 4l4 4m8 8 4 4M4 20l4-4m8-8 4-4"/>'),
  rending_arc: svg('<path d="M4 19C7 8 14 4 21 5"/><path d="M7 21 19 9"/>'),
  graviton_tether: svg('<circle cx="6" cy="18" r="3"/><circle cx="18" cy="6" r="3"/><path d="M8.5 15.5 15.5 8.5"/><path d="M11 7h-4M17 13v4"/>'),
  kinetic_ward: svg('<path d="M12 3 20 7.5v9L12 21 4 16.5v-9z"/><path d="M12 8v8"/>'),
  discharge: svg('<circle cx="12" cy="12" r="2.5"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5 19 19M19 5l-3.5 3.5M8.5 15.5 5 19"/>'),
  neural_lash: svg('<path d="M3 20 8 12l4 3 4-8 5-3"/>'),
  mending_graft: svg('<path d="M12 5v14M5 12h14"/><path d="M12 5c4 0 7 3 7 7"/>'),
  spore_snare: svg('<circle cx="12" cy="6" r="2.5"/><path d="M12 9v3M12 12 6 20M12 12v9M12 12l6 8"/>'),
  overgrowth_surge: svg('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/>'),
  triage: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/>'),
  guard: svg('<path d="M12 3 20 6v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/>'),
  assist: svg('<path d="M4 20 20 4M20 4h-7M20 4v7"/>'),
  inspect: svg('<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6m-3-3v6"/>'),
  follow: svg('<circle cx="12" cy="5" r="2.5"/><path d="M12 8v6m-4-3 4-3 4 3m-4 3-4 6m4-6 4 6"/>'),
  stay: svg('<rect x="7" y="7" width="10" height="10" rx="1"/><circle cx="12" cy="12" r="9"/>'),
};

const BUFFS = {
  ward: ['Kinetic Ward', 'good'],
  hot: ['Mending Graft', 'good'],
  bond: ['Symbiote Bond', 'good'],
  shield: ['Aegis', 'good'],
  sap: ['Sapped', 'bad'],
  corrode: ['Corroded', 'bad'],
  carapace_imprint: ['Carapace Imprint', 'bad'],
  root: ['Rooted', 'bad'],
};

const GLYPH_NOTES = {
  glyph_hinge:{ability:'hinge_field',text:'Hinge + Lattice Resonator: Shared Pulse can restore active barrier capacity.'},
  glyph_reversal:{ability:'resonant_reversal',text:'Divide: retains 25% of remaining barrier and releases the other 75%.'},
  glyph_faultline: { ability: 'controlled_blast', text: 'Glyph of the Faultline: 7m demolition radius.' },
  glyph_wideband: { ability: 'fault_scan', text: 'Glyph of Wideband: 14s target analysis.' },
  glyph_rending_echo: { ability: 'rending_arc', text: 'Glyph of Rending Echo: also strikes every other enemy within 4.5m for 70%. An imprinted target moves the echo to its position, consuming the imprint.' },
  glyph_resonant_aegis: { ability: 'discharge', text: 'Glyph of Resonant Aegis: 40% less damage, but shields you and nearby allies for 60% of the Charge spent. Shared Pulse repairs an active damaged Aegis instead of splash healing.' },
  glyph_shared_pulse: { pet: 'triage', text: 'Glyph of Shared Pulse: each mend also heals you and party members within 8m of the patient for 60%. A partially depleted active Aegis is repaired instead.' },
  glyph_carapace: { pet: 'guard', text: 'Glyph of the Carapace: no regeneration; the host takes 45% less damage and melee attackers are stung, leaving a 4.5s imprint that redirects Rending Echo.' },
};

const ACT_TEXT = { idle: 'Following', mending: 'Mending', bonding: 'Moving to bond', bonded: 'Bonded to', harrying: 'Attacking', surveying:'Analyzing', screening:'Projecting screen', approaching: 'Moving to inspect', inspecting: 'Inspecting equipment on', stranded:'Tether lost — redeploy outside combat', dormant: 'Dormant' };
const PET_KEYS = ['triage', 'guard', 'assist', 'follow', 'stay'];
const SPINDLE_KEYS = ['inspect', null, null, 'follow', 'stay'];
const STRIDER_KEYS=['screen','recover','assist','follow','stay'];
export const companionCommandKeys = type => type === 'spindle' ? SPINDLE_KEYS : type==='survey_strider'?STRIDER_KEYS:PET_KEYS;
const SKILL_INFO = {
  instrumentation: 'Surveyor primary skill: improves Power by 2 percentage points per point above 10 and meets instrument requirements.',
  kinetics: 'Vanguard primary skill: increases Power by 2 percentage points per point above 10 and meets Kinetics equipment requirements. Does not change movement speed.',
  biotech: 'Conductor primary skill: increases Power by 2 percentage points per point above 10 and meets Biotech equipment requirements.',
};

function h(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

// Keep native button activation and tab navigation inside the pet management
// flow. The world otherwise binds these keys to chat, jump and target cycling.
function menuKeys(event) {
  if (['Enter', 'Space', 'Tab'].includes(event.code)) event.stopPropagation();
}

/** Write a style/text property only when it changed (avoids layout churn). */
function set(el, key, value) {
  if (el[`_${key}`] === value) return;
  el[`_${key}`] = value;
  if (key === 'text') el.textContent = value;
  else if (key === 'hidden') el.hidden = value;
  else if (key === 'cls') el.className = value;
  else el.style.setProperty(key, value);
}

function companionIcon(kind, action) {
  const rename = kind === 'rename';
  const btn = h('button', `companion-icon companion-${kind}`);
  btn.type = 'button';
  btn.title = rename ? 'Rename companion' : 'Companion Codex';
  btn.setAttribute('aria-label', btn.title);
  btn.innerHTML = rename
    ? svg('<path d="m4 16-1 5 5-1L20 8l-4-4L4 16Zm10-10 4 4"/>')
    : svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>');
  btn.addEventListener('click', (e) => { e.stopPropagation(); action(); });
  btn.addEventListener('keydown', (e) => {
    if (e.code === 'Enter' || e.code === 'Space') e.stopPropagation();
  });
  return btn;
}

function bar(cls) {
  const wrap = h('div', `bar ${cls}`);
  const fill = h('div', 'fill');
  const label = h('span', 'label');
  wrap.append(fill, label);
  return { wrap, fill, label };
}

function unitFrame(cls) {
  const el = h('div', `frame ${cls}`);
  const name = h('div', 'name');
  const sub = h('div', 'sub');
  const hp = bar('hp');
  const res = bar('res');
  const buffs = h('div', 'buffs');
  el.append(name, sub, hp.wrap, res.wrap, buffs);
  return { el, name, sub, hp, res, buffs };
}

export class UI {
  constructor(actions) {
    this.a = actions;
    this.sheet = null;
    this.unseenItems = new Set();
    this.workshopSite=null;
    this.cls = null;
    this.plates = new Map();
    this.partyRows = new Map();
    this.lastInventory = 0;
    this.tipFor = null;
    this.buildLock = '';
    this.companionId = 0;
    this.root = document.getElementById('hud');
    this.overlay = document.getElementById('overlay');
    this.build();
  }

  // --- construction ---------------------------------------------------------

  build() {
    const root = this.root;

    const frames = h('div', 'frames');
    this.player = unitFrame('player');
    this.target = unitFrame('target');
    this.target.cast = bar('cast');
    this.target.details = h('div', 'target-details');
    this.target.details.hidden = true;
    this.target.el.append(this.target.cast.wrap, this.target.details);
    this.pet = h('div', 'frame pet');
    this.petName = h('button', 'name pet-select');
    this.petName.type = 'button';
    this.petName.title = 'Select companion (F2)';
    this.petAct = h('div', 'sub');
    const petHead = h('div', 'pet-head');
    const petActions = h('div', 'companion-actions');
    petActions.append(
      companionIcon('rename', () => this.openCompanionDetails(this.currentCompanion, 'rename')),
      companionIcon('info', () => this.openCompanionDetails(this.currentCompanion, 'info')),
    );
    petHead.append(this.petName, petActions);
    this.pet.append(petHead, this.petAct);
    const inspectPet = () => {
      if (this.companionId) this.a.inspectCompanion(this.companionId, { x: 0, y: 0 });
    };
    this.pet.addEventListener('click', inspectPet);
    this.pet.addEventListener('contextmenu', e => {
      e.preventDefault();
      e.stopPropagation();
      this.openCompanionMenu(e.clientX, e.clientY);
    });
    this.petName.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' || e.code === 'Space') e.stopPropagation();
      if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
        e.preventDefault();
        e.stopPropagation();
        const r = this.petName.getBoundingClientRect();
        this.openCompanionMenu(r.left, r.bottom);
      }
    });
    this.summonPet = h('button', 'summon-pet', 'Summon companion');
    this.summonPet.type = 'button';
    this.summonPet.hidden = true;
    this.summonPet.addEventListener('click', () => this.a.managePet('summon'));
    const left = h('div', 'col');
    left.append(this.player.el, this.pet, this.summonPet);
    frames.append(left, this.target.el);
    root.append(frames);

    // Selection itself opens nothing. Explicit nameplate actions open a
    // small dialog, separate from combat controls on the companion hotbar.
    this.inspectBox = h('div', 'panel companion-dialog');
    this.inspectBox.hidden = true;
    this.inspectBox.setAttribute('role', 'dialog');
    this.inspectBox.setAttribute('aria-label', 'Companion details');
    this.inspectClose = h('button', 'close inspect-close', '×');
    this.inspectClose.setAttribute('aria-label', 'Close companion details');
    this.inspectClose.addEventListener('click', () => this.closeCompanionDetails());
    this.inspectName = h('h2', 'inspect-name');
    this.inspectSub = h('div', 'inspect-sub');
    this.codexBody = h('div', 'companion-codex');
    this.renameRow = h('form', 'rename-row');
    this.renameInput = h('input');
    this.renameInput.maxLength = 18;
    this.renameInput.setAttribute('aria-label', 'New companion name');
    this.renameInput.placeholder = 'Companion name';
    this.renameInput.autocomplete = 'off';
    const rename = h('button', 'primary', 'Save');
    rename.type = 'submit';
    this.renameRow.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = this.renameInput.value.trim();
      if (name && this.dialogCompanionId === this.companionId) {
        this.a.petRename(name);
        this.closeCompanionDetails();
      }
    });
    this.renameInput.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.closeCompanionDetails();
      }
    });
    this.renameRow.append(this.renameInput, rename);
    this.inspectBox.append(this.inspectClose, this.inspectName, this.inspectSub, this.codexBody, this.renameRow);
    root.append(this.inspectBox);

    this.party = h('div', 'party');
    root.append(this.party);
    this.playerContext = h('div', 'player-context');
    this.playerContext.hidden = true;
    root.append(this.playerContext);
    this.bindPlayerContext(this.target.el, () => this.currentTarget?.id);
    this.npcPanel=h('div','panel npc-panel');
    this.npcPanel.hidden=true;
    this.npcPanel.setAttribute('role','dialog');
    this.npcPanel.setAttribute('aria-label','NPC interaction');
    this.npcPanel.setAttribute('aria-modal','false');
    this.npcPanel.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();this.closeNpc();}
      else if(['Tab','Enter',' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))e.stopPropagation();
    });
    root.append(this.npcPanel);
    this.fieldRecordPanel=h('aside','field-record');this.fieldRecordPanel.hidden=true;
    this.fieldRecordPanel.setAttribute('aria-label','Field record');root.append(this.fieldRecordPanel);
    document.addEventListener('pointerdown', (e) => {
      if (!this.playerContext.contains(e.target)) this.closePlayerContext();
    });
    this.playerContext.addEventListener('keydown', e => {
      // Prevent game hotkeys (including Tab targeting, Space jump and Enter
      // chat) from consuming keyboard interactions with the menu buttons.
      e.stopPropagation();
      if(e.key==='Escape'){
        e.preventDefault();
        this.a.cancelMovement();
        this.closePlayerContext(true);
      }else if(['Tab','ArrowUp','ArrowDown','Home','End'].includes(e.key)){
        e.preventDefault();
        const buttons=[...this.playerContext.querySelectorAll('button:not(:disabled)')];
        if(!buttons.length)return;
        const i=buttons.indexOf(document.activeElement);
        const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:
          (i+(e.key==='ArrowUp'||e.shiftKey?-1:1)+buttons.length)%buttons.length;
        buttons[next].focus({preventScroll:true});
      }
    });

    const side = h('div', 'side');
    this.minimap = document.createElement('canvas');
    this.minimap.width = 168;
    this.minimap.height = 168;
    this.minimap.className = 'minimap';
    this.minimap.setAttribute('role', 'img');
    this.minimap.setAttribute('aria-label', 'World minimap');
    this.zoneLabel = h('div', 'zone-label');
    this.tracker = h('div', 'tracker');
    this.trackerTitle = h('div', 'title');
    this.trackerText = h('div', 'text');
    this.trackerProgress = h('div', 'progress');
    this.tracker.append(h('div', 'kicker', 'Directive'), this.trackerTitle, this.trackerText, this.trackerProgress);
    this.surveyTracker = h('div', 'tracker');
    this.surveyText = h('div', 'text');
    this.brineWorkshop=h('button','brine-workshop','Open field Workshop [B]');
    this.brineWorkshop.hidden=true;
    this.brineWorkshop.addEventListener('click',()=>{this.workshopTab='fabrication';this.toggleWorkshop(true);});
    this.surveyTracker.append(h('div', 'kicker', 'Brineworks · field investigation'), this.surveyText,this.brineWorkshop);
    this.questTracker=new QuestTracker(this);
    side.append(this.minimap, this.zoneLabel, this.questTracker.el);
    root.append(side);

    this.errors = h('div', 'errors');
    this.errors.setAttribute('role', 'alert');
    this.toasts = h('div', 'toasts');
    this.banner = h('div', 'banner');
    this.kestrelWarning=h('div','kestrel-warning','CONTAINMENT ALARM · Resolve Custodian engagement');
    this.kestrelWarning.hidden=true;this.kestrelWarning.setAttribute('role','status');
    root.append(this.errors,this.toasts,this.banner,this.kestrelWarning);
    this.radio=new RadioPanel(root,{tracker:this.questTracker.el,portrait:key=>{const ent=[...(this.liveEntities?.values()??[])].find(e=>e.meta?.k==='o'&&e.meta?.c===key);return ent?this.a.portrait(ent.meta):null;}});

    // Log + chat
    const logWrap = h('div', 'logwrap');
    this.logEl = h('div', 'log');
    this.logEl.setAttribute('aria-live', 'polite');
    this.chat = document.createElement('input');
    this.chat.className = 'chat';
    this.chat.maxLength = 140;
    this.chatChannel = 'vicinity';
    this.whisperTarget = null;
    this.chat.setAttribute('aria-label', 'Chat message');
    const chatRow=h('div','chat-row');
    this.chatModeButton=h('button','chat-mode');
    this.chatModeButton.type='button';
    this.chatModeButton.setAttribute('aria-label','Choose chat channel');
    this.chatModeButton.setAttribute('aria-expanded','false');
    this.chatModeButton.innerHTML=svg('<path d="M4 4h16v12H10l-6 4zM8 8h8M8 12h5"/>');
    this.chatChannelLabel=h('span','chat-channel-label');
    this.chatModeButton.append(this.chatChannelLabel);
    this.chatOptions=h('div','chat-options');
    this.chatOptions.hidden=true;
    for(const [channel,label] of [['vicinity','Vicinity /v'],['party','Party /p']]){
      const btn=h('button','chat-option',label);
      btn.type='button';
      btn.dataset.channel=channel;
      btn.addEventListener('click',()=>this.selectChatChannel(channel));
      this.chatOptions.append(btn);
    }
    this.chatModeButton.addEventListener('click',()=>{
      const open=this.chatOptions.hidden;
      this.setChatOptions(open);
      if(open)this.chatOptions.querySelector('[aria-pressed="true"]')?.focus();
    });
    this.chatOptions.addEventListener('keydown',e=>{
      e.stopPropagation();
      if(e.key==='Escape'){e.preventDefault();this.setChatOptions(false);this.chatModeButton.focus();}
      else if(['Tab','ArrowDown','ArrowUp'].includes(e.key)){
        e.preventDefault();
        const b=[...this.chatOptions.querySelectorAll('button')];
        b[(b.indexOf(document.activeElement)+1)%b.length].focus();
      }
    });
    this.chatModeButton.addEventListener('keydown',e=>{
      e.stopPropagation();
      if(e.key==='Escape'){e.preventDefault();this.setChatOptions(false);}
      else if(e.key==='Tab'){e.preventDefault();this.chat.focus();}
    });
    document.addEventListener('pointerdown',e=>{
      if(!chatRow.contains(e.target))this.setChatOptions(false);
    });
    this.chat.addEventListener('input',()=>{
      const match=/^\/([pv])\s+/i.exec(this.chat.value);
      if(!match)return;
      const rest=this.chat.value.slice(match[0].length);
      this.selectChatChannel(match[1].toLowerCase()==='p'?'party':'vicinity');
      this.chat.value=rest;
    });
    this.chat.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        const text = this.chat.value.trim();
        const command=/^\/([pv])(?:\s+(.*))?$/i.exec(text);
        const follow=/^\/follow(?:\s+(.+))?$/i.exec(text);
        if(follow){this.a.followChat((follow[1]||'').trim());this.resetChatTarget();return;}
        if(/^\/unfollow$/i.test(text)){this.a.cancelMovement();this.resetChatTarget();return;}
        if(command){
          this.selectChatChannel(command[1].toLowerCase()==='p'?'party':'vicinity');
          const message=(command[2]||'').trim();
          if(!message){this.chat.value='';return;}
          this.a.chat(message,this.chatChannel);
        } else if (text) {
          if (this.whisperTarget) this.a.whisper(this.whisperTarget.id, text);
          else this.a.chat(text,this.chatChannel);
        }
        this.resetChatTarget();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.resetChatTarget();
      }
    });
    chatRow.append(this.chatModeButton,this.chat,this.chatOptions);
    logWrap.append(this.logEl,chatRow);
    this.updateChatChannel();
    root.append(logWrap);

    // Bars
    const bars = h('div', 'bars');
    this.petBar = h('div', 'petbar');
    this.autoButton = h('button', 'auto-toggle');
    this.autoButton.type = 'button';
    this.autoButton.setAttribute('aria-label', 'Auto-attack');
    this.autoButton.setAttribute('aria-keyshortcuts', 'R');
    this.autoButton.setAttribute('aria-pressed', 'false');
    this.autoButton.innerHTML = svg('<path d="m19 4 1 1-3 12-2-3-6 6-2-2 6-6-3-2z"/>');
    this.autoButton.append(h('kbd', null, 'R'));
    this.autoIndicator = h('span', 'auto-indicator', '○');
    this.autoIndicator.setAttribute('aria-hidden', 'true');
    this.autoButton.append(this.autoIndicator);
    this.autoButton.addEventListener('click', () => this.a.autoAttack());
    this.actionBar = h('div', 'actionbar');
    const actions = h('div', 'action-row');
    actions.append(this.autoButton, this.actionBar);
    this.xp = bar('xp');
    this.moveStatus = h('div', 'move-status');
    this.moveStatus.hidden = true;
    this.surveyStatus = h('div', 'auto-status');
    this.surveyStatus.hidden = true;
    this.rescueStatus=h('div','auto-status');this.rescueStatus.hidden=true;
    this.inscription = h('div', 'inscription-status');
    this.inscription.hidden = true;
    this.inscriptionName = h('span', null);
    this.inscriptionName.setAttribute('role', 'status');
    this.inscriptionProgress = h('progress');
    this.inscriptionProgress.setAttribute('aria-label', 'Inscription progress');
    const cancelInscription = h('button', null, 'Cancel');
    cancelInscription.type = 'button';
    cancelInscription.addEventListener('click', () => this.a.cancelInscription());
    this.inscription.append(this.inscriptionName, cancelInscription, this.inscriptionProgress);
    this.productionStatus = h('div', 'production-status');
    this.productionStatus.hidden = true;
    this.productionName = h('span', null);
    this.productionName.setAttribute('role', 'status');
    this.productionProgress = h('progress');
    this.productionProgress.setAttribute('aria-label', 'Fabrication progress');
    const cancelProduction = h('button', null, 'Cancel');
    cancelProduction.type = 'button';
    cancelProduction.addEventListener('click', () => this.a.cancelProduction());
    this.productionStatus.append(this.productionName, cancelProduction, this.productionProgress);
    bars.append(this.petBar, this.moveStatus, this.surveyStatus, this.rescueStatus, this.inscription, this.productionStatus, actions, this.xp.wrap);
    root.append(bars);
    this.abilityButtons = [];
    this.petButtons = [];

    // Corner menu
    const menu = h('div', 'menu');
    this.buildBtn = h('button', 'menubtn', 'Character [C]');
    this.buildBtn.addEventListener('click', () => this.toggleBuild());
    this.inventoryBtn = h('button', 'menubtn', 'Inventory [I]');
    this.inventoryBtn.addEventListener('click', () => this.toggleInventory());
    this.partyBtn = h('button', 'menubtn', 'Party [P]');
    this.partyBtn.addEventListener('click', () => this.toggleParty());
    this.settingsBtn = h('button', 'menubtn', 'Settings [O]');
    this.settingsBtn.addEventListener('click', () => this.toggleSettings());
    const helpBtn = h('button', 'menubtn', 'Help [H]');
    helpBtn.addEventListener('click', () => this.toggleHelp());
    this.menuBtn = h('button', 'menubtn', 'Menu [M]');
    this.menuBtn.addEventListener('keydown', menuKeys);
    this.menuBtn.addEventListener('click', () => this.toggleMenu());
    this.menuItems = h('div', 'menu-items');
    this.menuItems.addEventListener('keydown', menuKeys);
    this.menuItems.hidden = true;
    this.charactersBtn = h('button', 'menubtn', 'Characters');
    this.charactersBtn.addEventListener('click', () => { this.toggleMenu(false); this.a.characters(); });
    this.signoutBtn = h('button', 'menubtn', 'Sign out');
    this.signoutBtn.hidden = true;
    this.signoutBtn.addEventListener('click', () => { this.toggleMenu(false); this.a.signOut(); });
    this.codexBtn = h('button', 'menubtn', 'Codex [J]');
    this.codexBtn.addEventListener('click', () => this.toggleCodex());
    this.questJournalBtn=h('button','menubtn','Journal [L]');
    this.questJournalBtn.addEventListener('click',()=>this.toggleQuestJournal());
    this.workshopBtn=h('button','menubtn','Build [B]');
    this.workshopBtn.addEventListener('click',()=>this.toggleWorkshop());
    const companionsBtn = h('button', 'menubtn', 'Companion Sheet');
    companionsBtn.addEventListener('click', () => this.toggleCompanionSheet(true));
    this.menuItems.append(this.inventoryBtn,this.workshopBtn,this.questJournalBtn,this.codexBtn,companionsBtn,this.partyBtn,this.settingsBtn,this.charactersBtn,this.signoutBtn);
    this.netLabel = h('div', 'net');
    menu.append(this.buildBtn, this.menuBtn, helpBtn, this.netLabel, this.menuItems);
    root.append(menu);

    this.tooltip = h('div', 'tooltip');
    this.tooltip.hidden = true;
    root.append(this.tooltip);
    this.loot=new LootPanel(this);
    this.questJournal=new QuestJournal(this);
    this.vendor=new VendorPanel(this);
    this.companionSheet = h('section', 'panel companion-sheet');
    this.companionSheet.addEventListener('keydown', menuKeys);
    this.companionSheet.hidden = true;
    this.companionSheet.setAttribute('role', 'dialog');
    this.companionSheet.setAttribute('aria-label', 'Companion Sheet');
    const closeCompanions = h('button', 'close', '×');
    closeCompanions.setAttribute('aria-label', 'Close Companion Sheet');
    closeCompanions.addEventListener('click', () => this.toggleCompanionSheet(false));
    this.companionSheetBody = h('div', 'companion-sheet-body');
    this.companionSheet.append(closeCompanions, h('h2', null, 'Companion Sheet'), this.companionSheetBody);
    root.append(this.companionSheet);


    // Build panel
    this.panel = h('div', 'panel build');
    this.panel.hidden = true;
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Character and loadout');
    const close = h('button', 'close', '×');
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => this.toggleBuild(false));
    this.panelBody = h('div', 'panel-body');
    this.panel.append(h('div','journal-brand','ATTUNEMENT'), h('h2','journal-title','Character & Loadout'), close, this.panelBody);
    root.append(this.panel);

    this.inventoryPanel = h('div','panel inventory-window');
    this.inventoryPanel.hidden = true;
    this.inventoryPanel.setAttribute('role','dialog');
    this.inventoryPanel.setAttribute('aria-label','Inventory');
    const invClose = h('button','close','×');
    invClose.setAttribute('aria-label','Close inventory');
    invClose.addEventListener('click',()=>this.toggleInventory(false));
    // Cycle the window's surface transparency without fading readable content.
    this.inventoryOpacityButton = h('button','inventory-opacity');
    this.inventoryOpacityButton.type='button';
    this.inventoryOpacityButton.innerHTML=svg('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none"/>');
    this.inventoryOpacity=100;
    try {
      const saved=Number(localStorage.getItem('attunement.inventoryOpacity'));
      if([100,80,60,40].includes(saved))this.inventoryOpacity=saved;
    }catch{}
    this.inventoryOpacityButton.addEventListener('click',()=>{
      const levels=[100,80,60,40];
      this.inventoryLayout.setOpacity(levels[(levels.indexOf(this.inventoryOpacity)+1)%levels.length]);
    });
    this.inventoryOpacityButton.addEventListener('keydown',e=>{
      if(e.key==='Enter'||e.key===' ')e.stopPropagation();
    });
    this.inventoryBody = h('div','inventory-body');
    this.inventoryPanel.append(h('div','journal-brand','ATTUNEMENT'),h('h2','journal-title','Inventory'),this.inventoryOpacityButton,invClose,this.inventoryBody);
    root.append(this.inventoryPanel);
    this.setInventoryOpacity(this.inventoryOpacity);
    // On smaller screens, either overlapping window can be brought forward
    // by clicking its visible area. Large screens use side-by-side positioning.
    root.addEventListener('pointerdown',e=>{
      const panel=e.target.closest('.panel');
      if(panel)root.classList.toggle('inventory-front',panel===this.inventoryPanel);
    });
    this.inventoryFilter = 'all';
    this.inventorySelection = this.loadoutSelection = null;
    this.unseenItems.clear();this.sheet=null;this.buildBtn.classList.remove('new');this.inventoryBtn.classList.remove('new');this.workshopSite=null;
    this.loadoutTab = 'character';
    this.loadoutSlot = null;

    this.codexPanel = h('div','panel codex-window');
    this.codexPanel.hidden = true;
    this.codexPanel.setAttribute('role','dialog');
    this.codexPanel.setAttribute('aria-label','Codex');
    const codexClose = h('button','close codex-close','×');
    codexClose.setAttribute('aria-label','Close Codex');
    codexClose.addEventListener('click',()=>this.toggleCodex(false));
    this.codexContent = h('div','codex-layout');
    const searchRow = h('div','codex-search-row');
    this.codexSearch = h('input','codex-search');
    this.codexSearch.type = 'search';
    this.codexSearch.placeholder = 'Search the Codex…';
    this.codexSearch.setAttribute('aria-label','Search Codex');
    this.codexSearch.autocomplete = 'off';
    this.codexSearch.maxLength = 100;
    this.codexQuery = '';
    this.codexSearch.addEventListener('input',()=>{
      this.codexQuery = this.codexSearch.value;
      renderCodex(this, ICONS);
    });
    this.codexSearch.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();this.toggleCodex(false);}
      else if(e.key==='Enter'){e.preventDefault();this.codexContent.querySelector('.codex-entry')?.click();}
    });
    searchRow.append(this.codexSearch);
    this.codexPanel.append(h('div','journal-brand','ATTUNEMENT'),h('h2','journal-title','Codex'),codexClose,searchRow,this.codexContent);
    root.append(this.codexPanel);
    this.codexGroup = 'Creatures';
    this.codexSelection = 'skitter';

    this.workshopPanel=h('div','panel workshop-window');
    this.workshopPanel.hidden=true;
    this.workshopPanel.setAttribute('role','dialog');
    this.workshopPanel.setAttribute('aria-label','Build Planner and Workshop');
    const workshopClose=h('button','close','×');
    workshopClose.setAttribute('aria-label','Close Build');
    workshopClose.addEventListener('click',()=>this.toggleWorkshop(false));
    this.workshopBody=h('div','workshop-body');
    this.workshopPanel.append(h('div','journal-brand','ATTUNEMENT'),h('h2','journal-title','Build & Fabrication'),workshopClose,this.workshopBody);
    root.append(this.workshopPanel);
    this.workshopLayout=new WindowLayout(this.workshopPanel,this.workshopBody,'workshop');
    this.inventoryLayout=new WindowLayout(this.inventoryPanel,this.inventoryBody,'inventory',{
      min:{w:280,h:240},initialOpacity:this.inventoryOpacity,
      onOpacity:value=>{if(value!==this.inventoryOpacity)this.setInventoryOpacity(value);}
    });
    this.characterLayout=new WindowLayout(this.panel,this.panelBody,'character',{min:{w:320,h:260}});
    this.codexLayout=new WindowLayout(this.codexPanel,this.codexContent,'codex',{min:{w:320,h:260}});
    this.companionLayout=new WindowLayout(this.companionSheet,this.companionSheetBody,'companions',{min:{w:280,h:240}});
    this.questLayout=new WindowLayout(this.questJournal.el,this.questJournal.content,'quest',{min:{w:300,h:240}});
    this.vendorLayout=new WindowLayout(this.vendor.el,this.vendor.content,'vendor',{min:{w:300,h:240}});
    this.lootLayout=new WindowLayout(this.loot.el,this.loot.content,'loot',{min:{w:230,h:180}});
    this.windowLayouts=[this.characterLayout,this.inventoryLayout,this.workshopLayout,this.codexLayout,this.companionLayout,this.questLayout,this.vendorLayout,this.lootLayout];
    this.workshopTab='planner';
    this.recipeId=null;
    this.plannedLoadout=null;
    // First-use guidance is browser-local; completing it suppresses automatic reopening.
    this.workshopTutorialSeen=false;
    try{this.workshopTutorialSeen=localStorage.getItem('attunement.workshopTutorial')==='1';}catch{}
    this.workshopLesson=0;
    this.workshopTutorialOpen=!this.workshopTutorialSeen;
    this.atSanctum=false;

    this.partyPanel = h('div', 'panel party-panel');
    this.partyPanel.hidden = true;
    this.partyPanel.setAttribute('role', 'dialog');
    this.partyPanel.setAttribute('aria-label', 'Party management');
    const pc = h('button', 'close', '×');
    pc.setAttribute('aria-label', 'Close party');
    pc.addEventListener('click', () => this.toggleParty(false));
    this.partyBody = h('div');
    this.partyPanel.append(pc, h('h2', null, 'Party'), this.partyBody);
    root.append(this.partyPanel);
    this.partySignature = '';

    this.settingsPanel = h('div', 'panel settings-panel');
    this.settingsPanel.hidden = true;
    this.settingsPanel.setAttribute('role', 'dialog');
    this.settingsPanel.setAttribute('aria-label', 'Settings');
    this.settingsPanel.addEventListener('keydown', e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();this.toggleSettings(false);document.getElementById('view')?.focus({preventScroll:true});}
    });
    const sc = h('button', 'close', '×');
    sc.setAttribute('aria-label', 'Close settings');
    sc.addEventListener('click', () => this.toggleSettings(false));
    const qualityLabel = h('label', null, 'Graphics preset');
    qualityLabel.setAttribute('for', 'graphics-quality');
    this.qualitySelect = h('select');
    this.qualitySelect.id = 'graphics-quality';
    for (const [value, name] of [['2', 'High'], ['1', 'Medium'], ['0', 'Low']]) {
      const opt = h('option', null, name);
      opt.value = value;
      this.qualitySelect.append(opt);
    }
    this.qualitySelect.value = new URLSearchParams(location.search).get('q') || '2';
    const applyQuality = h('button', 'primary', 'Apply and reload');
    applyQuality.addEventListener('click', () => this.a.quality(this.qualitySelect.value));
    const plateLabel = h('label');
    this.nameplatesSetting = h('input');
    this.nameplatesSetting.type = 'checkbox';
    let showNames = true;
    try { showNames = localStorage.getItem('attunement.showNameplates') !== '0'; } catch {}
    this.nameplatesSetting.checked = showNames;
    document.body.classList.toggle('hide-nameplates', !showNames);
    this.nameplatesSetting.addEventListener('change', () => {
      document.body.classList.toggle('hide-nameplates', !this.nameplatesSetting.checked);
      try { localStorage.setItem('attunement.showNameplates', this.nameplatesSetting.checked ? '1' : '0'); } catch {}
    });
    plateLabel.append(this.nameplatesSetting, document.createTextNode(' Show world nameplates'));
    // Effect comfort: intensity of ability effects and flash limiting. Hostile
    // telegraphs and other gameplay warnings are always drawn in full.
    const fxLabel = h('label', null, 'Ability effects');
    fxLabel.setAttribute('for', 'fx-intensity');
    this.fxSelect = h('select');
    this.fxSelect.id = 'fx-intensity';
    for (const [value, name] of [['1', 'Full'], ['0.6', 'Reduced'], ['0.3', 'Minimal']]) {
      const opt = h('option', null, name);
      opt.value = value;
      this.fxSelect.append(opt);
    }
    const fxNow = this.a.fxPrefs?.() || { level: 1, calm: false };
    this.fxSelect.value = String(fxNow.level);
    const calmLabel = h('label');
    this.calmSetting = h('input');
    this.calmSetting.type = 'checkbox';
    this.calmSetting.checked = !!fxNow.calm;
    calmLabel.append(this.calmSetting, document.createTextNode(' Limit bright flashes'));
    const saveFx = () => this.a.setFxPrefs?.(Number(this.fxSelect.value), this.calmSetting.checked);
    this.fxSelect.addEventListener('change', saveFx);
    this.calmSetting.addEventListener('change', saveFx);
    this.settingsPanel.append(sc, h('h2', null, 'Settings'),
      qualityLabel, this.qualitySelect, applyQuality,
      h('p', 'muted', 'Changing graphics reloads the world. The high preset remains available.'),
      fxLabel, this.fxSelect, calmLabel,
      h('p', 'muted', 'Enemy warnings stay fully visible at every setting.'),
      plateLabel,this.loot.settings(),this.radio.settings());
    const resetWindows=h('button',null,'Reset all window layouts');
    resetWindows.type='button';resetWindows.addEventListener('click',()=>{for(const layout of this.windowLayouts)layout.reset();});
    this.settingsPanel.append(resetWindows);
    const alarmLabel=h('label'),alarmAudio=h('input');alarmAudio.type='checkbox';alarmAudio.checked=this.a.alarmAudio?.()??true;
    alarmAudio.addEventListener('change',()=>this.a.setAlarmAudio?.(alarmAudio.checked));
    alarmLabel.append(alarmAudio,document.createTextNode(' Environmental alarm sound'));this.settingsPanel.append(alarmLabel);
    root.append(this.settingsPanel);

    // Help panel
    this.help = h('div', 'panel help');
    this.help.hidden = true;
    const hc = h('button', 'close', '×');
    hc.setAttribute('aria-label', 'Close');
    hc.addEventListener('click', () => this.toggleHelp(false));
    this.help.append(hc, h('h2', null, 'Controls'));
    const rows = [
      ['W / S', 'Run forward / back'],
      ['A / D', 'Turn (strafe while holding the right mouse button)'],
      ['Q / E', 'Strafe'],
      ['Space', 'Jump'],
      ['Right-drag', 'Steer: turn the camera and your character'],
      ['Left-drag', 'Look around without turning'],
      ['Both buttons', 'Run forward'],
      ['Num Lock', 'Toggle auto-run; movement keys or Esc stop it.'],
      ['Right-click player', 'On players, nameplates, target or party frames: invite, follow, stop following or whisper.'],
      ['/follow [name] · /unfollow', 'Follow the selected player or a nearby player by exact name; stop following.'],
      ['Wheel', 'Zoom'],
      ['Click / Tab', 'Select an enemy, ally or companion / cycle enemies'],
      ['Right-click', 'Engage auto-attack on an enemy, or use an object / loot eligible remains'],
      ['R', 'Toggle auto-attack. Switching targets or clearing target stops it.'],
      ['F1 / F2', 'Target yourself / select companion (Esc clears selection)'],
      ['1 – 9', 'Available abilities'],
      ['Shift + 1 – 5', 'Companion commands (depend on active companion)'],
      ['F', 'Interact with nearby equipment, NPC or lootable remains'],
      ['Shift + F', 'Inspect loot manually even when auto-loot is enabled'],
      ['V', 'Reset the camera behind you'],
      ['C / I', 'Character & Loadout / independent Inventory (I or × closes it).'],
      ['B', 'Build Planner and Workshop: compare equipment or fabricate in the Sanctum.'],
      ['Window layout', 'Drag titles or window edges; use individual opacity and layout controls. Reset all layouts from Settings.'],
      ['J', 'Codex: creatures, locations, equipment, lore and abilities'],
      ['L', 'Quest Journal: active, available and completed objectives'],
      ['P', 'Party: invite, accept, leave'],
      ['O', 'Settings: graphics preset, nameplates'],
      ['M', 'Open the corner menu'],
      ['H', 'Help and command reference'],
      ['Enter / /', 'Open chat. /p switches to party; /v switches to vicinity. Type a space or press Enter after the command.'],
      ['Chat icon', 'Choose vicinity or party. Right-click a player for private whispers.'],
    ];
    const table = h('div', 'keys');
    for (const [k, v] of rows) table.append(h('kbd', null, k), h('span', null, v));
    this.help.append(table);
    root.append(this.help);

    // Death overlay
    this.death = h('div', 'death');
    this.death.hidden = true;
    this.deathBtn = h('button', 'primary', 'Reconstitute at the Sanctum');
    this.deathBtn.addEventListener('click', () => this.a.respawn());
    this.death.append(h('h2', null, 'You have been defeated'), h('p', null, 'The Sanctum lattice still holds your pattern.'), this.deathBtn);
    root.append(this.death);

    this.interact = h('div', 'interact');
    this.interact.hidden = true;
    root.append(this.interact);
  }

  setAccountLinked(linked) {
    this.signoutBtn.hidden = !linked;
    this.charactersBtn.textContent = linked ? 'Characters' : 'Account';
  }

  /** Build the class-specific action bars once the class is known. */
  setClass(cls,companionType=CLASSES[cls].companion) {
    if (this.cls === cls&&this.companionType===companionType) return;
    this.cls = cls;this.companionType=companionType;
    const def = CLASSES[cls];
    this.actionBar.replaceChildren();
    this.petBar.replaceChildren();
    this.abilityButtons = def.abilities.map((id, i) => {
      const b = this.slotButton(ICONS[id], String(i + 1), ABILITIES[id].name);
      b.el.addEventListener('click', () => this.a.useAbility(id));
      this.hover(b.el, () => this.abilityTip(id));
      this.actionBar.append(b.el);
      return { id, ...b };
    });
    this.summonSlot=this.slotButton(svg('<path d="M12 3v18M3 12h18M5 5l3 3m8 8 3 3M19 5l-3 3M8 16l-3 3"/>'),String(def.abilities.length+1),'Summon default companion');
    this.summonSlot.el.hidden=true;this.summonSlot.el.addEventListener('click',()=>this.a.managePet('summon'));
    this.actionBar.append(this.summonSlot.el);
    this.petButtons = [];
    if (companionType) {
      const cdef = COMPANIONS[companionType];
      companionCommandKeys(companionType).forEach((mode, i) => {
        if(!Object.hasOwn(cdef.modes,mode))return;
        const b = this.slotButton(ICONS[mode], `⇧${i + 1}`, cdef.modes[mode].name);
        b.el.classList.add('small');
        b.el.addEventListener('click', () => this.a.pet(mode));
        this.hover(b.el, () => this.petTip(mode));
        this.petBar.append(b.el);
        this.petButtons.push({ mode, ...b });
      });
    }
    set(this.pet, 'hidden', !companionType);
    this.petBar.hidden = !companionType;
    this.autoButton.title = `${def.auto.kind === 'melee' ? 'Melee' : 'Ranged'} auto-attack: ${def.auto.range}m range, one attack every ${def.auto.interval / 1000}s while in range. Right-click and some hostile abilities engage; R toggles. There is no automatic chasing.`;
    this.player.res.wrap.classList.toggle('charge', def.resource.id === 'charge');
  }

  slotButton(icon, key, label) {
    const el = h('button', 'slot');
    el.setAttribute('aria-label', label);
    const ic = h('span', 'icon');
    ic.innerHTML = icon; // static, trusted markup defined above
    const cd = h('span', 'cd');
    const cdText = h('span', 'cdtext');
    const pip = h('span', 'pip');
    pip.hidden = true;
    el.append(ic, cd, cdText, h('span', 'key', key), pip);
    return { el, cd, cdText, pip };
  }

  hover(el, makeTip) {
    let pointer=null;
    const place = () => {
      const r=el.getBoundingClientRect(),t=this.tooltip.getBoundingClientRect(),margin=8;
      const clamp=(n,limit)=>Math.max(margin,Math.min(limit-margin,n));
      const x=pointer?(pointer.x+t.width+16<=window.innerWidth?pointer.x+16:pointer.x-t.width-16):r.left+(r.width-t.width)/2;
      const y=pointer?(pointer.y+t.height+18<=window.innerHeight?pointer.y+18:pointer.y-t.height-12):(r.top-t.height-10>=margin?r.top-t.height-10:r.bottom+8);
      this.tooltip.style.left=clamp(x,window.innerWidth-t.width)+'px';
      this.tooltip.style.top=clamp(y,window.innerHeight-t.height)+'px';
    };
    const show = () => {
      this.tipFor=el;
      this.tooltip.replaceChildren(...makeTip());
      this.tooltip.hidden=false;
      place();
    };
    const hide = () => {
      if(this.tipFor===el){this.tooltip.hidden=true;this.tipFor=null;}
    };
    const move=e=>{
      if(e.pointerType==='touch')return;
      pointer={x:e.clientX,y:e.clientY};
      if(this.tipFor===el&&!this.tooltip.hidden)place();
    };
    el.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch'){move(e);show();}});
    el.addEventListener('pointermove',move);
    el.addEventListener('pointerleave',()=>{pointer=null;if(document.activeElement===el&&el.matches(':focus-visible'))show();else hide();});
    el.addEventListener('focus',()=>{if(el.matches(':focus-visible'))pointer=null;show();});
    el.addEventListener('blur',()=>{if(pointer&&el.matches(':hover'))show();else hide();});
  }

  abilityTip(id) {
    const ab = ABILITIES[id];
    const res = CLASSES[this.cls].resource.name;
    const bits = [];
    if (ab.cost) bits.push(`${ab.cost} ${res}`);
    if (ab.minRes) bits.push(`${ab.minRes}+ ${res}`);
    if (ab.range) bits.push(`${Math.round(ab.range)}m range`);
    bits.push(`${ab.cd / 1000}s cooldown`);
    const out = [h('div', 'tip-title', ab.name), h('div', 'tip-meta', bits.join(' · ')), h('div', 'tip-body', ab.desc)];
    const note = this.sheet && GLYPH_NOTES[this.sheet.equipped.glyph];
    if (note && note.ability === id) out.push(h('div', 'tip-glyph', note.text));
    if (id==='overgrowth_surge' && this.sheet?.equipped.device===BLOOM_RELAY.device) {
      out[2]=h('div','tip-body','Bloom Relay: the restorative bloom heals you and party members within '+BLOOM_RELAY.radius+'m of you. The Mender is still required.');
    }
    return out;
  }

  petTip(mode) {
    const cdef = COMPANIONS[this.companionType];
    if(!cdef?.modes[mode])return [];
    const out = [h('div', 'tip-title', `${cdef.name}: ${cdef.modes[mode].name}`), h('div', 'tip-body', cdef.modes[mode].desc)];
    const note = this.sheet && GLYPH_NOTES[this.sheet.equipped.glyph];
    if (note && note.pet === mode) out.push(h('div', 'tip-glyph', note.text));
    return out;
  }

  // --- messages -------------------------------------------------------------

  log(text, cls = '') {
    const line = h('div', `line ${cls}`, text);
    this.logEl.append(line);
    while (this.logEl.childElementCount > 80) this.logEl.firstElementChild.remove();
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  chatLine(name, text, cls = 'chatline') {
    const line = h('div', `line ${cls}`);
    line.append(h('b', null, `${name}: `), document.createTextNode(text));
    this.logEl.append(line);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  error(text) {
    this.errors.textContent = text;
    this.errors.classList.remove('show');
    void this.errors.offsetWidth;
    this.errors.classList.add('show');
  }

  toast(text, cls = '') {
    const t = h('div', `toast ${cls}`, text);
    this.toasts.append(t);
    while (this.toasts.childElementCount > 4) this.toasts.firstElementChild.remove();
    setTimeout(() => t.remove(), 4600);
  }

  attributeToast(item, changes) {
    const increase = changes.some(({delta}) => delta > 0);
    const decrease = changes.some(({delta}) => delta < 0);
    const heading = increase && decrease ? 'Mixed attribute changes' : increase ? 'Attributes increased' : 'Attributes decreased';
    const lines = changes.map(({ key, delta }) => {
      const { name, unit = '' } = ATTRIBUTE_DISPLAY[key];
      return `${delta > 0 ? '+' : '−'}${Math.abs(delta)}${unit} ${name}`;
    });
    const t = h('div', 'toast attribute-toast');
    t.setAttribute('role', 'status');
    t.append(h('strong', null, heading), h('div', null, item), h('div', null, lines.join(' · ')));
    this.toasts.append(t);
    while (this.toasts.childElementCount > 4) this.toasts.firstElementChild.remove();
    setTimeout(() => t.remove(), 4600);
  }

  zone(name) {
    set(this.zoneLabel, 'text', name);
    this.banner.textContent = name;
    this.banner.classList.remove('show');
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
  }

  focusChat(prefix='') {
    this.setChatOptions(false);
    this.chat.focus();
    if(prefix&&!this.chat.value)this.chat.value=prefix;
  }

  // --- panels ---------------------------------------------------------------

  toggleMenu(force) {
    this.menuItems.hidden = !(force ?? this.menuItems.hidden);
    if (!this.menuItems.hidden) this.menuItems.querySelector('button')?.focus({ preventScroll: true });
  }

  hideJournalPanels() {
    this.questJournal.dismiss();
    if(document.activeElement === this.codexSearch) this.codexSearch.blur();
    this.panel.hidden = this.codexPanel.hidden = this.workshopPanel.hidden = true;
    this.companionSheet.hidden = true;
    this.closeNpc();
    this.loot.dismiss();
    this.vendor.dismiss();
    this.fieldRecordPanel.hidden=true;
    this.root.classList.remove('inventory-front');
    this.help.hidden = this.partyPanel.hidden = this.settingsPanel.hidden = true;
    this.menuItems.hidden = this.tooltip.hidden = true;
    this.closePlayerContext();
    this.closeCompanionDetails();
  }

  // Non-modal gameplay windows coexist. Keep existing explicit dismissal
  // policies for NPC conversations, modal screens and world actions.
  prepareManagedWindow() {
    this.closeNpc();
    this.fieldRecordPanel.hidden=true;
    this.help.hidden=this.partyPanel.hidden=this.settingsPanel.hidden=true;
    this.menuItems.hidden=this.tooltip.hidden=true;
    this.closePlayerContext();
    this.closeCompanionDetails();
  }

  openCompanionMenu(x, y) {
    if (!this.companionId) return;
    this.closePlayerContext();
    this.contextAnchor = this.petName;
    const dismiss = h('button', null, 'Dismiss companion');
    dismiss.disabled = !!this.buildLock;
    dismiss.addEventListener('click', () => { this.closePlayerContext(); this.a.managePet('dismiss'); });
    const sheet = h('button', null, 'Companion Sheet');
    sheet.addEventListener('click', () => this.toggleCompanionSheet(true));
    this.playerContext.replaceChildren(h('div', 'context-title', this.petName.textContent), dismiss, sheet);
    this.playerContext.hidden = false;
    this.playerContext.style.left = `${Math.max(8, Math.min(window.innerWidth - this.playerContext.offsetWidth - 8, x))}px`;
    this.playerContext.style.top = `${Math.max(8, Math.min(window.innerHeight - this.playerContext.offsetHeight - 8, y))}px`;
    (dismiss.disabled ? sheet : dismiss).focus({ preventScroll: true });
  }

  toggleCompanionSheet(open) {
    if(open)this.prepareManagedWindow();
    this.companionSheet.hidden = !open;
    if (open) {
      this.renderCompanionSheet();
      this.companionSheet.querySelector('.close').focus({ preventScroll: true });
    } else this.menuBtn.focus({ preventScroll: true });
  }

  renderCompanionSheet() {
    const body = this.companionSheetBody;
    const focusedAction = document.activeElement?.dataset.companionAction;
    body.replaceChildren();
    for (const companion of this.companionRoster || []) {
      const { type, name, active, available, isDefault } = companion;
      const definition = COMPANIONS[type];
      const section = h('section', 'companion-sheet-entry');
      const portrait = this.a.portrait({ k: 'c', c: type });
      if (portrait) {
        const image = h('img', 'companion-sheet-portrait');
        image.src = portrait;
        image.alt = '';
        section.append(image);
      }
      section.append(h('h3', null, name));
      if (definition.name !== name) section.append(h('p', 'muted', definition.name));
      section.append(h('p', null, active ? 'Active' : available ? 'Learned · ready to summon' : 'Unavailable during combat or defeat'));
      const modes = h('ul');
      for (const mode of Object.values(definition.modes)) {
        const row = h('li');
        row.append(h('strong', null, mode.name + ' · '), document.createTextNode(mode.desc));
        modes.append(row);
      }
      const useDefault = h('button', null, isDefault ? 'Default summon' : 'Set as default summon');
      useDefault.disabled = isDefault;
      useDefault.dataset.companionAction = 'default-' + type;
      useDefault.addEventListener('click', () => this.a.managePet('default', type));
      section.append(modes);
      if (!active) {
        const summon = h('button', null, 'Summon ' + name);
        summon.disabled = !available;
        summon.dataset.companionAction = 'summon-' + type;
        summon.addEventListener('click', () => this.a.managePet('summon', type));
        section.append(summon);
      } else {
        const dismiss=h('button',null,'Dismiss '+name);dismiss.disabled=!available;
        dismiss.dataset.companionAction='dismiss-'+type;
        dismiss.addEventListener('click',()=>this.a.managePet('dismiss'));section.append(dismiss);
      }
      section.append(useDefault);
      body.append(section);
    }
    if (!this.companionRoster?.some(entry => entry.type === 'spindle')) {
      const section = h('section', 'companion-sheet-entry');
      const commission = h('button', null, 'Commission Spindle');
      commission.dataset.companionAction = 'commission-spindle';
      commission.disabled = !this.canCommissionSpindle;
      commission.addEventListener('click', () => this.a.managePet('commission', 'spindle'));
      section.append(h('h3', null, 'Spindle'), h('p', null, 'A rolling precision machine that inspects your equipment. Commission it free in Lattice Sanctum while alive and outside combat.'), commission);
      body.append(section);
    }
    if (focusedAction) {
      const next = [...body.querySelectorAll('button:enabled')].find(button => button.dataset.companionAction === focusedAction)
        || body.querySelector('[data-companion-action="summon-spindle"]:enabled')
        || this.companionSheet.querySelector('.close');
      next.focus({ preventScroll: true });
    }
  }

  // Only the owner's authoritative action-start snapshot closes these panels.
  // Later batch cycles and completion do not change window visibility.
  dismissWorldActionPanels() {
    const panels = [this.panel, this.inventoryPanel, this.workshopPanel];
    const restoreView = panels.some(panel => !panel.hidden && panel.contains(document.activeElement)) ||
      this.playerContext.contains(document.activeElement);
    for (const panel of panels) panel.hidden = true;
    this.root.classList.remove('inventory-front');
    this.tooltip.hidden = true;
    this.closePlayerContext();
    if(restoreView)this.a.focusView();
  }

  toggleBuild(force) {
    const open = force ?? this.panel.hidden;
    if(open)this.prepareManagedWindow();
    this.panel.hidden = !open;
    if (open) {
      this.renderBuild();
    }
  }

  toggleWorkshop(force,recipeId=null) {
    const open=force??this.workshopPanel.hidden;
    if(open)this.prepareManagedWindow();
    this.workshopPanel.hidden=!open;
    if(!open)return;
    if(recipeId&&Object.hasOwn(RECIPES,recipeId)){
      this.workshopTab='fabrication';this.recipeId=recipeId;this.productionQuantity=null;
      this.recipeReveal=recipeId;
      // An explicit recipe link must not land on a hidden result.
      if(this.recipeFilter)Object.assign(this.recipeFilter,{query:'',discipline:'All disciplines',materials:false,learned:false});
    }
    renderWorkshop(this);
    this.workshopLayout.sync();
  }

  setInventoryOpacity(value) {
    if(![100,80,60,40].includes(value))return;
    this.inventoryOpacity=value;
    this.inventoryPanel.style.setProperty('--inventory-alpha',String(value/100));
    this.inventoryOpacityButton.title='Inventory opacity: '+value+'% · click to cycle';
    this.inventoryOpacityButton.setAttribute('aria-label',this.inventoryOpacityButton.title);
    try{localStorage.setItem('attunement.inventoryOpacity',String(value));}catch{}
  }

  toggleInventory(force) {
    const open = force ?? this.inventoryPanel.hidden;
    this.menuItems.hidden=true;
    if(this.tipFor&&this.inventoryPanel.contains(this.tipFor))this.tooltip.hidden=true;
    if(!open&&this.inventoryPanel.contains(document.activeElement))document.activeElement.blur();
    this.inventoryPanel.hidden = !open;
    this.root.classList.toggle('inventory-open',open);
    this.root.classList.toggle('inventory-front',open);
    if (open) renderInventory(this);
  }

  toggleQuestJournal(force) {
    const open=force??this.questJournal.el.hidden;
    if(!open){this.questJournal.dismiss();return;}
    this.prepareManagedWindow();
    this.questJournal.show(this.sheet,this.questTrial);
  }

  toggleCodex(force, id = null) {
    const open = force ?? this.codexPanel.hidden;
    if(open)this.prepareManagedWindow();
    this.codexPanel.hidden = !open;
    if (!open) return;
    if (id) {
      this.codexQuery = '';
      this.codexSearch.value = '';
      const entry = ENTRIES.find(e => e.id === id);
      if (entry) { this.codexGroup = entry.group; this.codexSelection = id; }
    }
    renderCodex(this, ICONS);
  }

  toggleParty(force) {
    const open = force ?? this.partyPanel.hidden;
    this.hideJournalPanels();
    this.partyPanel.hidden = !open;
    if (open) this.partySignature = '';
  }

  toggleSettings(force) {
    const open = force ?? this.settingsPanel.hidden;
    this.hideJournalPanels();
    this.settingsPanel.hidden = !open;
  }

  renderParty(st) {
    const data = st.you.party || { members: [], invite: null, cap: 4 };
    const nearby = [...st.ents.values()].filter((e) => e.meta.k === 'p' && e.id !== st.me.id);
    const signature = JSON.stringify([data, nearby.map((e) => [e.id, e.meta.n])]);
    if (signature === this.partySignature) return;
    this.partySignature = signature;
    this.partyBody.replaceChildren();
    if (data.invite) {
      this.partyBody.append(h('p', null, `${data.invite.name} invited you to a party.`));
      const accept = h('button', 'primary', 'Accept');
      accept.addEventListener('click', () => this.a.partyAnswer(true));
      const decline = h('button', null, 'Decline');
      decline.addEventListener('click', () => this.a.partyAnswer(false));
      this.partyBody.append(accept, decline);
    }
    if (data.members.length) {
      this.partyBody.append(h('h3', null, `Members (${data.members.length} / ${data.cap})`));
      for (const m of data.members) {
        const row=h('div','party-member',`${m.name} · L${m.level} ${CLASSES[m.cls]?.name || m.cls}`);
        if(m.id!==st.me.id){
          row.tabIndex=0;
          row.addEventListener('click',()=>{if(this.liveEntities?.get(m.id)?.meta.k==='p')this.a.target(m.id);});
          this.bindPlayerContext(row,()=>m.id);
        }
        this.partyBody.append(row);
      }
      const leave = h('button', null, 'Leave party');
      leave.addEventListener('click', () => this.a.partyLeave());
      this.partyBody.append(leave);
    } else this.partyBody.append(h('p', 'muted', 'No party. Invite a connected player to cooperate without attendance obligations.'));
    const members = new Set(data.members.map((m) => m.id));
    if (nearby.length && data.members.length < data.cap) {
      this.partyBody.append(h('h3', null, 'Available players'));
      for (const ent of nearby) {
        if (members.has(ent.id)) continue;
        const row = h('div', 'party-member');
        row.tabIndex=0;
        row.addEventListener('click',e=>{if(!e.target.closest('button')&&this.liveEntities?.get(ent.id)?.meta.k==='p')this.a.target(ent.id);});
        this.bindPlayerContext(row,()=>ent.id);
        row.append(h('span', null, ent.meta.n));
        const invite = h('button', null, 'Invite');
        invite.addEventListener('click', () => this.a.partyInvite(ent.id));
        row.append(invite);
        this.partyBody.append(row);
      }
    }
  }

  toggleHelp(force) {
    const open = force ?? this.help.hidden;
    this.hideJournalPanels();
    this.help.hidden = !open;
  }

  setChatOptions(open) {
    this.chatOptions.hidden=!open;
    this.chatModeButton.setAttribute('aria-expanded',String(open));
  }

  updateChatChannel() {
    const name=this.whisperTarget?'Whisper':this.chatChannel==='party'?'Party':'Vicinity';
    this.chatChannelLabel.textContent=name;
    this.chatModeButton.dataset.channel=this.whisperTarget?'whisper':this.chatChannel;
    this.chat.placeholder=this.whisperTarget?'Whisper to '+this.whisperTarget.name:'Press Enter to talk';
    this.chat.setAttribute('aria-label',this.whisperTarget?'Whisper to '+this.whisperTarget.name:name+' chat message');
    for(const option of this.chatOptions.querySelectorAll('button'))option.setAttribute('aria-pressed',String(!this.whisperTarget&&option.dataset.channel===this.chatChannel));
  }

  selectChatChannel(channel) {
    if(channel!=='party'&&channel!=='vicinity')return;
    if(this.whisperTarget||this.chatChannel!==channel)this.chat.value='';
    this.whisperTarget=null;
    this.chatChannel=channel;
    this.updateChatChannel();
    this.setChatOptions(false);
    this.chat.focus();
  }

  resetChatTarget() {
    this.whisperTarget = null;
    this.chat.value = '';
    this.updateChatChannel();
    this.setChatOptions(false);
    this.chat.blur();
  }

  // All player surfaces use the same live-entity resolution and menu.
  bindPlayerContext(el, getId) {
    const open=(x,y)=>{
      const ent=this.liveEntities?.get(getId());
      if(!ent||ent.meta.k!=='p'||ent.id===this.selfId)return false;
      this.openPlayerContext(ent,x,y,el);
      return true;
    };
    el.addEventListener('contextmenu', e=>{
      if(open(e.clientX,e.clientY)){e.preventDefault();e.stopPropagation();}
    });
    el.addEventListener('keydown', e=>{
      if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){
        const r=el.getBoundingClientRect();
        if(open(r.left+12,r.bottom)){e.preventDefault();e.stopPropagation();}
      }
    });
  }

  closePlayerContext(restoreFocus=false) {
    if(this.playerContext.contains(document.activeElement))document.activeElement.blur();
    this.playerContext.hidden=true;
    const anchor=this.contextAnchor;
    this.contextAnchor=null;
    this.contextPlayerId=0;
    if(restoreFocus&&anchor?.isConnected&&anchor.tabIndex>=0)anchor.focus();
  }

  openPlayerContext(ent, x, y, anchor=null) {
    ent=this.liveEntities?.get(ent?.id);
    if(!ent||ent.meta.k!=='p'||ent.id===this.selfId)return;
    this.closePlayerContext();
    this.tooltip.hidden=true;
    const id=ent.id;
    this.contextPlayerId=id;
    this.contextAnchor=anchor;
    this.playerContext.replaceChildren(h('div','context-title',ent.meta.n));
    const action=(label,cb)=>{
      const btn=h('button',null,label);
      btn.type='button';
      btn.addEventListener('click',()=>{
        this.closePlayerContext();
        const current=this.liveEntities?.get(id);
        if(current?.meta.k==='p'&&id!==this.selfId)cb(current);
        else this.error('That player is unavailable.');
      });
      this.playerContext.append(btn);
    };
    action('Invite to party',()=>this.a.partyInvite(id));
    if(this.a.isFollowing(id))action('Stop following',()=>this.a.stopFollowing(id));
    else action('Follow',()=>this.a.followPlayer(id));
    action('Whisper',current=>{
      // A draft for a different recipient must never be silently redirected.
      this.chat.value='';
      this.whisperTarget={id,name:current.meta.n};
      this.updateChatChannel();
      this.setChatOptions(false);
      this.chat.focus();
    });
    this.playerContext.hidden=false;
    const w=this.playerContext.offsetWidth,hgt=this.playerContext.offsetHeight;
    this.playerContext.style.left=`${Math.max(8,Math.min(window.innerWidth-w-8,x))}px`;
    this.playerContext.style.top=`${Math.max(8,Math.min(window.innerHeight-hgt-8,y))}px`;
    this.playerContext.querySelector('button')?.focus({preventScroll:true});
  }

  acknowledgeItem(id) {
    // Keep the indicator authoritative until the private sheet confirms Seen.
    // Stale revision or rate-limited requests may be refused.
    if(!this.sheet||!this.unseenItems.has(id))return false;
    this.a.itemSeen(id, this.sheet.inventoryRev);
    return true;
  }

  resetInventoryPresentation() {
    this.sheet=null;
    this.unseenItems.clear();
    this.workshopSite=null;
    this.buildLock='';
    // Do not expose old details before the first private sheet of a new world.
    for(const body of [this.panelBody,this.inventoryBody,this.workshopBody])body.replaceChildren();
    this.updateItemIndicators();
  }

  updateItemIndicators() {
    // Character exposes equipment only; materials and trade goods belong to Inventory.
    this.buildBtn.classList.toggle('new',[...this.unseenItems].some(id=>Object.hasOwn(ITEMS,id)));
    this.inventoryBtn.classList.toggle('new',this.unseenItems.size>0);
    for (const el of this.root.querySelectorAll('[data-seen-item]')) {
      el.classList.toggle('new-equipment', this.unseenItems.has(el.dataset.seenItem));
    }
    for (const el of this.root.querySelectorAll('[data-seen-group]')) {
      const group = el.dataset.seenGroup;
      const count = [...this.unseenItems].filter(id => group === 'all' ||
        (ITEMS[id]?.slot==='chest'?'device':ITEMS[id]?.slot ?? GOODS[id]?.category ?? 'materials') === group).length;
      el.classList.toggle('new-equipment', count > 0);
      el.title = count ? `${count} new item(s)` : '';
      el.setAttribute('aria-label', el.textContent);
      if (count) el.setAttribute('aria-description', `${count} new item(s)`);
      else el.removeAttribute('aria-description');
    }
  }

  itemAction(id,action) {
    const s=this.sheet;
    if(!s||!Object.hasOwn(ITEMS,id)||!s.inventory.includes(id))return this.error('Item is unavailable.');
    if(this.buildLock)return this.error('Equipment changes are locked in combat or defeat.');
    const slot=ITEMS[id].slot, installed=s.equipped[slot]===id;
    if((action==='remove'&&!installed)||(action==='equip'&&installed))return;
    const res=action==='remove'?tryUnequip(s,slot):tryEquip(s,id);
    if(!res.ok)return this.error(res.reason);
    if(action==='remove')this.a.unequip(slot);
    else this.a.equip(id);
  }

  openItemContext(id,x,y,anchor) {
    const s=this.sheet;
    if (!s) return;
    const equipment = Object.hasOwn(ITEMS, id) && s.inventory.includes(id);
    const good = Object.hasOwn(GOODS, id) && s.goods?.[id] > 0;
    if (!equipment && !good) return;
    const item = equipment ? ITEMS[id] : GOODS[id];
    const installed = equipment && s.equipped[item.slot] === id;
    this.closePlayerContext();
    this.tooltip.hidden=true;
    this.contextAnchor=anchor;
    this.playerContext.replaceChildren(h('div','context-title',item.name));
    if (equipment) {
      const res=installed?tryUnequip(s,item.slot):tryEquip(s,id);
      const equip=h('button',null,installed?'Unequip':item.slot==='glyph'?'Inscribe':s.equipped[item.slot]?'Swap in':'Equip');
      equip.disabled=!!this.buildLock||!res.ok;
      equip.addEventListener('click',()=>{this.closePlayerContext();this.itemAction(id,installed?'remove':'equip');});
      this.playerContext.append(equip);
      if(id==='electrical_combat_rod'&&installed){
        const dual=s.electricalRodMode==='dual';
        const mode=h('button',null,dual?'Join into combat rod':'Separate into dual batons');
        mode.disabled=!!this.buildLock;
        mode.addEventListener('click',()=>{this.closePlayerContext();this.a.rodMode(dual?'rod':'dual');});
        this.playerContext.append(mode);
      }
      if(res.alsoRemoved?.length)this.playerContext.append(h('div','why','Also removes '+res.alsoRemoved.map(key=>ITEMS[key].name).join(', ')+'.'));
      if(!res.ok||this.buildLock)this.playerContext.append(h('div','why',this.buildLock?'Unavailable in combat or defeat.':res.reason));
    }
    if (id === 'field_maintenance_kit') {
      const weapon = s.equipped.weapon;
      const condition = conditionOf(s, weapon);
      const use = h('button', null, 'Use maintenance kit');
      use.disabled = !!this.buildLock || condition === null || condition >= 100;
      use.addEventListener('click', () => { this.closePlayerContext(); this.a.useUtility(id, weapon, s.utilityRev); });
      this.playerContext.append(use);
      if (condition === null) this.playerContext.append(h('div', 'why', 'Equip a damaged repairable weapon first.'));
    }
    const salvage = equipment && !installed && canSalvageEquipment(id);
    for (const action of salvage ? ['Salvage', 'Destroy'] : good && item.category === 'junk' ? ['Destroy'] : []) {
      const button = h('button', null, action);
      button.disabled = !!this.buildLock;
      button.addEventListener('click', () => {
        const destroying = action === 'Destroy';
        const cancel = h('button', null, 'Cancel');
        cancel.addEventListener('click', () => this.openItemContext(id, x, y, anchor));
        const confirm = h('button', 'danger', destroying ? 'Destroy one permanently' : 'Salvage item');
        confirm.addEventListener('click', () => {
          this.closePlayerContext();
          this.a.disposeItem(id, action.toLowerCase(), s.inventoryRev);
        });
        this.playerContext.replaceChildren(h('div', 'context-title', item.name),
          h('p', 'why', destroying ? 'Removes one item permanently.' : 'Consumes the original item, even if no material is recovered.'), cancel, confirm);
        cancel.focus({ preventScroll: true });
      });
      this.playerContext.append(button);
    }
    const info=h('button',null,'Info · Codex');
    info.addEventListener('click',()=>{this.closePlayerContext();this.toggleCodex(true,id);});
    this.playerContext.append(info);
    const recipe=Object.entries(RECIPES).find(([,r])=>r.target===id&&r.kind==='upgrade');
    if(recipe){const upgrade=h('button',null,'Upgrade · Workshop');upgrade.addEventListener('click',()=>{this.closePlayerContext();this.toggleWorkshop(true,recipe[0]);});this.playerContext.append(upgrade);}
    this.playerContext.hidden=false;
    const w=this.playerContext.offsetWidth,hgt=this.playerContext.offsetHeight;
    this.playerContext.style.left=Math.max(8,Math.min(window.innerWidth-w-8,x))+'px';
    this.playerContext.style.top=Math.max(8,Math.min(window.innerHeight-hgt-8,y))+'px';
    this.playerContext.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
  }

  appearanceApplied(appearance){
    this.fieldRecordPanel.querySelector('[data-appearance-status]')
      ?.dispatchEvent(new CustomEvent('appearance-result',{detail:{appearance}}));
  }

  appearanceRejected(reason){
    this.fieldRecordPanel.querySelector('[data-appearance-status]')
      ?.dispatchEvent(new CustomEvent('appearance-result',{detail:{reason}}));
  }

  initiationControls(panel){
    if(!this.sheet)return;
    const look=this.sheet.look;
    let saved=encodeAppearance(normalizeAppearance(this.sheet.appearance,look));
    let draft=normalizeAppearance(saved,look);
    let pending=false;
    const controls=h('section','initiation-controls');
    controls.append(h('h3',null,'Character initiation'),h('p','muted','Customize the character standing in the arrival hall. Changes are cosmetic and apply to the actual world model. Profession and equipment remain unchanged.'));
    const fields=h('div','initiation-fields'),status=h('p','muted','Choose your appearance, then apply.');status.dataset.appearanceStatus='true';status.setAttribute('role','status');
    const updateDraft=(key,value)=>{
      draft={...draft,[key]:value};
      if(key==='race')draft.skin=0;
      draft=normalizeAppearance(draft,look);
      if(!pending)status.textContent=encodeAppearance(draft)===saved?'Current appearance.':'Appearance changes not applied.';
      apply.disabled=pending||encodeAppearance(draft)===saved;
      render();
    };
    const render=()=>{
      fields.replaceChildren();
      const options=(key,label,values)=>{
        const wrap=h('label',null,label),select=h('select');select.setAttribute('aria-label',label);
        for(const [value,name] of values){const opt=h('option',null,name);opt.value=String(value);opt.selected=String(draft[key])===opt.value;select.append(opt);}
        select.disabled=values.length<2;
        select.addEventListener('change',()=>{
          const value=key==='skin'||key==='hairColour'?Number(select.value):select.value;
          updateDraft(key,value);
          fields.querySelector('[aria-label="'+label+'"]')?.focus();
        });
        wrap.append(select);fields.append(wrap);
      };
      const race=RACES[draft.race];
      options('frame','Body frame',Object.values(FRAMES).map(v=>[v.id,v.name]));
      options('race','Origin',Object.values(RACES).filter(v=>!LOOK_RACE[look]||v.id===LOOK_RACE[look]).map(v=>[v.id,v.name]));
      options('skin','Skin tone',race.skins.map((v,i)=>[i,'Tone '+(i+1)]));
      options('hair','Hair',race.hair.map(v=>[v,HAIR_STYLES[v].name]));
      options('hairColour','Hair colour',HAIR_COLOURS.map((v,i)=>[i,v.name]));
    };
    render();
    const actions=h('div','initiation-actions'),apply=h('button','primary','Apply appearance'),inspect=h('button',null,'Inspect in world');
    apply.type=inspect.type='button';
    apply.disabled=true;
    apply.addEventListener('click',()=>{
      pending=true;
      apply.disabled=true;
      status.textContent='Saving appearance…';
      this.a.changeAppearance(encodeAppearance(draft));
    });
    status.addEventListener('appearance-result',({detail})=>{
      pending=false;
      if(detail.appearance)saved=detail.appearance;
      apply.disabled=encodeAppearance(draft)===saved;
      status.textContent=detail.reason||(apply.disabled?'Applied to your in-world character and saved.':'Saved. New preview changes are still pending.');
    });
    inspect.addEventListener('click',()=>{panel.hidden=true;this.a.inspectAppearance();this.a.focusView();});
    const preview=h('section','hall-preview');preview.setAttribute('aria-label','Live appearance preview');
    const canvas=h('canvas');canvas.tabIndex=0;canvas.setAttribute('aria-label','Full-body gameplay model. Drag or use arrow keys to rotate or zoom.');
    const buttons=h('div','preview-controls');
    for(const [attr,value,label,accessible] of [['data-preview-mode','body','Full body'],['data-preview-mode','face','Face'],['data-preview-mode','frames','Compare frames'],['data-preview-left','','←','Rotate left'],['data-preview-right','','→','Rotate right'],['data-preview-out','','−','Zoom out'],['data-preview-in','','+','Zoom in'],['data-preview-reset','','Reset camera']]){
      const b=h('button',null,label);b.type='button';b.setAttribute(attr,value);if(accessible)b.setAttribute('aria-label',accessible);buttons.append(b);
    }
    const previewStatus=h('p','muted','Loading gameplay model when visible.');previewStatus.dataset.previewStatus='';previewStatus.setAttribute('role','status');
    const labels=h('div','preview-frame-labels');labels.dataset.previewFrames='';labels.hidden=true;
    labels.setAttribute('role','group');labels.setAttribute('aria-label','Select body frame');
    for(const {id,name} of Object.values(FRAMES)){
      const label=h('button',null,name);label.type='button';label.dataset.frame=id;labels.append(label);
    }
    preview.append(canvas,labels,buttons,previewStatus);
    actions.append(apply,inspect);controls.append(fields,preview,actions,status);panel.append(controls);
    this.a.startAppearancePreview(preview,()=>encodeAppearance(draft),frame=>updateDraft('frame',frame));
  }

  showFieldRecord(key) {
    const record=FIELD_RECORDS[key];if(!record)return;
    const panel=this.fieldRecordPanel;panel.replaceChildren();
    const close=h('button','close','×');close.type='button';close.setAttribute('aria-label','Close field record');
    close.addEventListener('click',()=>{panel.hidden=true;});
    panel.append(h('div','kicker','LOCAL ARCHIVE'),h('h2',null,record.title),h('p','muted',record.subtitle),close);
    if(key==='initiation_terminal')this.initiationControls(panel);
    const lines=h('div','field-record-lines');
    for(const [time,note] of record.lines){const row=h('div','field-record-row');row.append(h('strong',null,time),h('p',null,note));lines.append(row);}
    panel.append(lines,h('p','muted','Esc / close to dismiss. Continue field interactions with F.'));panel.hidden=false;
  }

  closeNpc() {
    const focused=this.npcPanel.contains(document.activeElement);
    this.npcId=0;
    this.npcPanel.hidden=true;
    if(focused)this.a.focusView();
  }

  syncNpc() {
    if(this.npcId&&this.a.npcAccess(this.npcId))this.closeNpc();
  }

  openNpc(ent) {
    const profile=npcProfile(ent);
    if(!profile)return false;
    const reason=this.a.npcAccess(ent.id);
    if(reason){this.error(reason);return false;}
    if(this.npcId===ent.id&&!this.npcPanel.hidden)return true;
    this.hideJournalPanels();
    this.a.target(0);
    this.npcId=ent.id;
    const panel=this.npcPanel;
    panel.replaceChildren();
    const close=h('button','close','×');
    close.type='button';close.setAttribute('aria-label','Close NPC interaction');
    close.addEventListener('click',()=>this.closeNpc());
    const identity=h('div','npc-identity');
    const art=this.a.portrait(ent.meta,'bust');
    if(art){const img=h('img','npc-portrait');img.src=art;img.alt='';identity.append(img);}
    else {const fallback=h('span','npc-portrait-fallback',ent.meta.n.slice(0,1));fallback.setAttribute('aria-hidden','true');identity.append(fallback);}
    const name=h('div','npc-name');
    name.append(h('h2',null,ent.meta.n),h('div','muted',profile.role));identity.append(name);
    this.npcDialogue=h('p','npc-dialogue',profile.intro);
    this.npcDialogue.setAttribute('aria-live','polite');
    const speak=()=>{const why=this.a.npcAccess(ent.id);if(why){this.closeNpc();this.error(why);return;}this.a.interact(ent.id);};
    const actions=h('div','npc-actions');
    for(const service of profile.services){
      const btn=h('button',service==='talk'?'primary':null,service==='talk'?'Talk':service==='codex'?'Info · Codex':'Workshop');
      btn.type='button';
      btn.addEventListener('click',()=>{
        if(service==='talk'){speak();return;}
        const why=this.a.npcAccess(ent.id);if(why){this.closeNpc();this.error(why);return;}
        if(service==='codex')this.toggleCodex(true,ent.meta.c);
        if(service==='workshop'){
          this.workshopTutorialOpen=true;this.workshopLesson=1;
          if(this.recipeFilter)Object.assign(this.recipeFilter,{query:'',discipline:'All disciplines',materials:false,learned:false});
          this.productionQuantity=null;
          this.toggleWorkshop(true,starterFabrication(this.sheet));
        }
      });
      actions.append(btn);
    }
    panel.append(close,identity,this.npcDialogue,actions);panel.hidden=false;
    actions.querySelector('button')?.focus({preventScroll:true});
    speak();
    return true;
  }

  showNpcDialogue(id,message) {
    if(id!==this.npcId||this.npcPanel.hidden||typeof message!=='string')return false;
    this.npcDialogue.textContent=message;
    return true;
  }

  openCompanionDetails(ent, kind) {
    if (!ent || ent.meta.k !== 'c') return;
    if (kind === 'info') { this.toggleCodex(true, ent.meta.c); return; }
    if (ent.id !== this.companionId) return;
    this.hideJournalPanels();
    this.dialogCompanionId = ent.id;
    this.inspectName.textContent = 'Rename companion';
    this.inspectSub.textContent = '3–18 letters, spaces or hyphens. Outside combat.';
    this.renameRow.hidden = false;
    this.codexBody.hidden = true;
    this.renameInput.value = ent.meta.n;
    this.inspectBox.hidden = false;
    this.renameInput.focus();
    this.renameInput.select();
  }

  closeCompanionDetails() {
    if (this.inspectBox.contains(document.activeElement)) document.activeElement.blur();
    this.inspectBox.hidden = true;
    this.dialogCompanionId = 0;
  }

  /** Close transient panels; the persistent inventory has its own close control. */
  closePanels() {
    const any = !this.companionSheet.hidden || !this.questJournal.el.hidden || !this.vendor.el.hidden || !this.loot.el.hidden || !this.fieldRecordPanel.hidden || !this.workshopPanel.hidden || !this.npcPanel.hidden || !this.panel.hidden || !this.codexPanel.hidden || !this.help.hidden || !this.inspectBox.hidden || !this.partyPanel.hidden || !this.settingsPanel.hidden || !this.menuItems.hidden || !!this.selectedCompanionId || !this.playerContext.hidden;
    this.companionSheet.hidden = true;
    this.questJournal.dismiss();
    this.codexPanel.hidden = this.workshopPanel.hidden = true;
    this.closeNpc();
    this.loot.dismiss();
    this.vendor.dismiss();
    this.fieldRecordPanel.hidden=true;
    this.root.classList.toggle('inventory-front',!this.inventoryPanel.hidden);
    this.closePlayerContext();
    this.menuItems.hidden = true;
    this.panel.hidden = true;
    this.partyPanel.hidden = true;
    this.settingsPanel.hidden = true;
    this.help.hidden = true;
    this.tooltip.hidden = true;
    this.closeCompanionDetails();
    if (this.selectedCompanionId) this.a.closeInspect();
    return any;
  }

  setSheet(sheet) {
    const previous=this.sheet;
    this.unseenItems = new Set(sheet.unseenItems);
    this.sheet = sheet;
    // An acknowledgement updates the indicators without rebuilding the
    // control the player is currently hovering or focusing.
    if (previous && previous.inventoryRev === sheet.inventoryRev &&
      Object.keys(sheet).every(key => key === 'unseenItems' || JSON.stringify(sheet[key]) === JSON.stringify(previous[key]))) {
      this.updateItemIndicators();
      return;
    }
    this.questTracker.sync(sheet,this.questTrial);
    this.questJournal.sync(sheet,this.questTrial);
    this.setClass(sheet.cls,sheet.companion);
    if (!this.panel.hidden) this.renderBuild();
    if (!this.inventoryPanel.hidden) renderInventory(this);
    if(!this.workshopPanel.hidden)renderWorkshop(this);
    this.updateItemIndicators();

    set(this.surveyText, 'text', brineHint(sheet.survey,sheet.brineStage,null));
    const q = sheet.quest;
    const d = directiveFor(sheet.cls, q.step);
    if (d) {
      set(this.trackerTitle, 'text', d.title);
      set(this.trackerText, 'text', d.text);
      set(this.trackerProgress, 'text', (d.goal.kill || d.goal.ability) ? `${Math.min(q.progress, d.goal.count)} / ${d.goal.count} ${d.goal.ability ? 'successful strikes' : 'defeated'}` : '');
    } else {
      set(this.trackerTitle, 'text', 'The Reach is yours');
      set(this.trackerText, 'text', 'Every directive is complete. Experiment with your glyphs and implants, or help another traveller.');
      set(this.trackerProgress, 'text', '');
    }
    const max = sheet.level >= MAX_LEVEL;
    const need = XP_TO_NEXT[sheet.level] || 1;
    set(this.xp.fill, 'width', max ? '100%' : `${(sheet.xp / need) * 100}%`);
    set(this.xp.label, 'text', max ? `Level ${sheet.level} (max)` : `Level ${sheet.level} — ${sheet.xp} / ${need} XP`);

    // Mark abilities and commands the equipped glyph alters.
    const note = GLYPH_NOTES[sheet.equipped.glyph];
    for (const b of this.abilityButtons) b.pip.hidden = !((note && note.ability === b.id) || (b.id==='overgrowth_surge' && sheet.equipped.device===BLOOM_RELAY.device));
    for (const b of this.petButtons) b.pip.hidden = !(note && note.pet === b.mode);
  }

  renderBuild() {
    const s = this.sheet;
    if (!s) return;
    const def = CLASSES[s.cls];
    const body = this.panelBody;
    if (this.tipFor && body.contains(this.tipFor)) this.tooltip.hidden = true;
    body.replaceChildren();
    const explain = (el, title, detail) => this.hover(el, () => [h('div', 'tip-title', title), h('div', 'tip-body', detail)]);
    if (this.buildLock) body.append(h('div', 'build-lock', this.buildLock === 'dead' ? 'Build changes are unavailable while defeated.' : 'Build changes are locked during combat. Disengage and wait for combat to end.'));

    // Column 1: who you are.
    const c1 = h('section', 'pcol');
    c1.append(h('h2', null, s.name), h('div', 'muted', `Level ${s.level} ${def.name} — ${def.role}`));
    c1.append(h('h3', null, 'Skills'));
    for (const k of Object.keys(SKILL_NAMES)) {
      const base = def.skills[k] + (def.primary === k ? s.level - 1 : 0);
      const total = s.stats.skills[k];
      const row = h('div', 'stat');
      row.append(h('span', null, SKILL_NAMES[k] + (def.primary === k ? ' (primary)' : '')));
      const v = h('span', `val${total > base ? ' changed' : ''}`, total > base ? `${base} + ${total - base} = ${total}` : String(total));
      v.title = total > base ? `${base} base + ${total - base} equipment = ${total} effective` : `${total} base / effective`;
      row.append(v);
      explain(row, SKILL_NAMES[k], `${SKILL_INFO[k]} ${base} base + ${total - base} equipment = ${total}.`);
      c1.append(row);
    }
    c1.append(h('h3', null, 'Derived'));
    const stat = (label, value, changed, detail) => {
      const row = h('div', 'stat');
      row.append(h('span', null, label), h('span', `val${changed ? ' changed' : ''}`, value));
      if (detail) explain(row, label, detail);
      c1.append(row);
    };
    const pct = (m) => `${m >= 1 ? '+' : ''}${Math.round((m - 1) * 100)}%`;
    stat('Maximum health', String(s.stats.maxHp), false, 'Total health capacity after level and equipment modifiers.');
    stat(`Power (from ${SKILL_NAMES[def.primary]})`, pct(s.stats.power), s.stats.power !== 1, 'Multiplies damage and healing before other modifiers. Each primary skill point above 10 adds 2 percentage points.');
    stat('Damage modifier', pct(s.stats.dmgMul), s.stats.dmgMul !== 1, 'Additional equipment damage multiplier, applied separately from Power.');
    if (def.companion) stat('Healing modifier', pct(s.stats.healMul), s.stats.healMul !== 1, 'Additional equipment healing multiplier for you and your symbiote, separate from Power.');
    if (def.resource.id === 'charge') {
      stat('Charge generation', pct(s.stats.chargeMul), s.stats.chargeMul !== 1, 'Equipment multiplier for Charge gained by your abilities and combat actions.');
      stat('Discharge reach', `${ABILITIES.discharge.radius + s.stats.dischargeRadius}m`, s.stats.dischargeRadius > 0, 'Area radius of Discharge around your character.');
    }
    c1.append(h('h3', null, 'Attunements'));
    if (s.attunements.length) for (const a of s.attunements) {
      const entry = h('div', 'attune', `◈ ${ATTUNEMENT_NAMES[a]}`);
      if (a === 'resonance') explain(entry, 'Resonance', 'Granted by interacting with the Listening Stone. Unlocks Resonance-dependent glyphs; does not itself increase Power.');
      c1.append(entry);
    }
    else c1.append(h('div', 'muted', 'None yet. Some powers only answer the attuned.'));

    c1.append(h('h3',null,'Profession abilities'));
    for(const [i,id] of def.abilities.entries()){
      const ability=ABILITIES[id];
      const link=h('button','ability-guide',`[${i+1}] ${ability.name}`);
      link.type='button';link.addEventListener('click',()=>this.toggleCodex(true,id));
      c1.append(link);
      if(id==='phase_transposition')c1.append(h('p','muted',s.attunements.includes('resonance')?'Resonance attuned · transfer your own active barrier to an eligible ally.':'Locked · learn Resonance at the Listening Stone.'));
    }
    c1.append(h('p','muted','Glyphs can modify existing abilities; inspect equipped glyphs for details.'));

    c1.append(h('h3',null,'Crafting disciplines'));
    for(const name of CRAFTING_DISCIPLINES){
      const mastery=disciplineProgress(s.craftingDisciplines,name);
      stat(name,'Level '+mastery.level,false,mastery.speedBonus+'% faster production. Gain experience through successfully committed crafting.');
      c1.append(h('div','muted',mastery.required===null?'Maximum level':mastery.progress+' / '+mastery.required+' XP'));
    }
    c1.append(h('h3',null,'Field disciplines'));
    const count=recoverySamples(s.recoverySamples),rank=recoveryRank(count);
    stat('Field Recovery','Rank '+rank,false,'Collect loose sinter shedding without harming wildlife. Rank 2 unlocks material reconditioning.');
    c1.append(h('div','muted',rank===2?'Maintenance cassette reconditioning unlocked.':count+' / '+RECOVERY_MASTERY+' recovered samples'));
    renderLoadout(this, body, c1);
  }

  // --- per-frame ------------------------------------------------------------

  frameBars(f, hp, max) {
    set(f.hp.fill, 'width', `${max > 0 ? Math.max(0, Math.min(100, (hp / max) * 100)) : 0}%`);
    set(f.hp.label, 'text', `${hp} / ${max}`);
  }

  buffChips(el, keys, barrier=null) {
    const sig = keys.join(',')+'|'+(barrier?`${barrier.remaining}/${barrier.capacity}/${Math.ceil(barrier.ms/1000)}`:'');
    if (el._sig === sig) return;
    el._sig = sig;
    el.replaceChildren(...keys.filter((k) => BUFFS[k]).map((k) => {
      const chip=h('span',`chip ${BUFFS[k][1]}`,k==='shield'&&barrier?`Aegis ${barrier.remaining}/${barrier.capacity} · ${Math.ceil(barrier.ms/1000)}s`:BUFFS[k][0]);
      if(k==='shield')chip.title='Damage absorption; finite capacity, not a solid collision wall.';
      return chip;
    }));
  }

  /**
   * @param {object} st {me, you, target, ents, comp, now, cast, dist(ent), fps, latency, nearObject}
   */
  update(st) {
    const { me, you, target } = st;
    this.currentTarget = target;
    this.selfId = me?.id;
    this.liveEntities = st.ents;
    if(this.contextPlayerId&&!st.ents.has(this.contextPlayerId))this.closePlayerContext();
    set(this.moveStatus, 'hidden', !st.movement);
    set(this.moveStatus, 'text', st.movement || '');
    if (!me || !you || !this.sheet) return;
    const def = CLASSES[this.sheet.cls];
    this.questTrial=you.brineTrial??null;
    this.questTracker.sync(this.sheet,this.questTrial);
    if(!this.questJournal.el.hidden)this.questJournal.sync(this.sheet,this.questTrial);
    set(this.surveyText,'text',brineHint(this.sheet.survey,this.sheet.brineStage,you.brineTrial));

    const lock = me.dead ? 'dead' : (me.row.f & 8) ? 'combat' : '';
    const site=you.workshop??null;
    const workshopChanged=site!==this.workshopSite||lock!==this.buildLock||you.production?.id!==this.production?.id;
    const productionStarted=!!you.production&&!this.production;
    const inscriptionStarted=!!you.inscription&&!this.inscriptionActive;
    this.production = you.production;
    this.inscriptionActive=!!you.inscription;
    if(productionStarted||inscriptionStarted)this.dismissWorldActionPanels();
    set(this.productionStatus,'hidden',!this.production);
    if(this.production){
      const job=this.production,recipe=RECIPES[job.id];
      const units=recipe?.output.count||1;
      set(this.productionName,'text',recipe?recipe.name+' · '+job.complete*units+'/'+job.quantity+' produced':'Fabricating');
      this.productionProgress.max=job.cycles;
      this.productionProgress.value=job.complete+Math.max(0,Math.min(1,(job.total-job.ms)/job.total));
    }
    this.workshopSite=site;this.atSanctum=!!you.safe;
    set(this.brineWorkshop,'hidden',!site?.startsWith('brine_'));
    set(this.rescueStatus,'hidden',you.rescueReady===undefined);
    if(you.rescueReady!==undefined)set(this.rescueStatus,'text',you.rescueReady?'Rescue Lattice · emergency barrier ready':'Rescue Lattice · re-arms after combat');
    if (lock !== this.buildLock) {
      this.buildLock = lock;
      if (!this.panel.hidden) this.renderBuild();
      if (!this.inventoryPanel.hidden) renderInventory(this);
    }
    if(workshopChanged&&!this.workshopPanel.hidden)renderWorkshop(this);
    else if (this.production && !this.workshopPanel.hidden) updateProduction(this);
    set(this.player.name, 'text', this.sheet.name);
    set(this.player.sub, 'text', `Level ${this.sheet.level} ${def.name}${you.safe ? ' · Sanctum' : ''}`);
    this.frameBars(this.player, me.row.h, me.row.m);
    set(this.player.res.fill, 'width', `${(you.res / def.resource.max) * 100}%`);
    set(this.player.res.label, 'text', `${def.resource.name} ${you.res}`);
    this.buffChips(this.player.buffs, me.row.b || [], you.barrier);
    const kit = you.surveyKit;
    set(this.surveyStatus, 'hidden', !kit && you.keeperShield===undefined);
    if (you.keeperShield!==undefined) set(this.surveyStatus,'text','Own barrier: '+you.keeperShield+' · Reversal consumes available protection');
    if (kit) {
      const marked = kit.mark && st.ents.get(kit.mark);
      const markText = marked && kit.markMs > 0 ? 'Analyzed: ' + marked.meta.n + ' · ' + Math.ceil(kit.markMs / 1000) + 's' : 'Scan a target [1]';
      const rigText = kit.rigMs > 0 ? 'Rig: ' + Math.ceil(kit.rigMs / 1000) + 's · ' + kit.rigDistance.toFixed(1) + 'm · ' + (kit.rigDistance <= SURVEYOR.rechargeRadius ? 'charging' : kit.rigDistance <= SURVEYOR.remoteRange ? 'remote ready' : 'out of remote range') : 'Deploy rig [3]';
      set(this.surveyStatus, 'text', markText + ' | ' + rigText);
    }

    // Target frame
    set(this.target.el, 'hidden', !target);
    if (target) {
      const enemy = target.meta.k === 'e';
      const status = enemy ? enemyTargetStatus(target.meta,target.row,target.dead) : null;
      set(this.target.el, 'cls', `frame target ${status?.tone ?? 'friendly'}`);
      this.target.el.tabIndex = target.meta.k==='p'&&target.id!==me.id?0:-1;
      set(this.target.name, 'text', target.meta.n);
      const lvl = target.meta.l ? `Level ${target.meta.l}` : '';
      const companion = target.meta.k === 'c';
      const owner = companion ? st.ents.get(target.meta.o) : null;
      const kind = status ? status.label : companion ? `Companion · ${owner ? owner.meta.n : 'Owner unknown'}` : target.meta.k === 'p' ? CLASSES[target.meta.c].name : '';
      const form=target.meta.form&&!target.dead&&!(target.row.f&1)?
        [target.meta.form,target.row.mineral?'calcified':null,target.row.scar?'scarred':null].filter(Boolean).join(' / '):'';
      set(this.target.sub, 'text', [lvl, kind, form].filter(Boolean).join(' · '));
      set(this.target.details, 'hidden', true);
      const hasHp = target.row.m !== undefined;
      set(this.target.hp.wrap, 'hidden', !hasHp);
      if (hasHp) this.frameBars(this.target, target.row.h, target.row.m);
      set(this.target.res.wrap, 'hidden', true);
      this.buffChips(this.target.buffs, target.row.b || []);
      const cast = !target.dead && !(target.row.f & 1) && target.cast && st.now < target.cast.end ? target.cast : null;
      set(this.target.cast.wrap, 'hidden', !cast);
      if (cast) {
        set(this.target.cast.fill, 'width', `${Math.min(100, ((st.now - cast.start) / (cast.end - cast.start)) * 100)}%`);
        set(this.target.cast.label, 'text', cast.name);
      }
    }

    // World selection only reveals the nameplate icons. Do not open a panel.
    const inspected = st.inspect && st.ents.get(st.inspect.id);
    this.selectedCompanionId = inspected?.id || 0;
    if (this.dialogCompanionId && !st.ents.has(this.dialogCompanionId)) this.closeCompanionDetails();

    // Companion frame
    this.companionId = st.comp?.id || 0;
    this.currentCompanion = st.comp;
    const roster = you.companions ?? [];
    const rosterSignature = JSON.stringify(roster);
    if (this.companionRosterSignature !== rosterSignature || this.canCommissionSpindle !== you.canCommissionSpindle) {
      this.companionRoster = roster;
      this.companionRosterSignature = rosterSignature;
      this.canCommissionSpindle = you.canCommissionSpindle;
      if (!this.companionSheet.hidden) this.renderCompanionSheet();
    }
    const summon = roster.find(entry => entry.isDefault);
    this.summonPet.hidden = !!st.comp || !summon;
    this.summonPet.disabled = !summon?.available;
    this.summonPet.title = summon?.available ? `Summon ${summon.name}` : 'Available outside combat while alive.';
    if(this.summonSlot){this.summonSlot.el.hidden=!summon;this.summonSlot.el.disabled=!!st.comp||!summon?.available;this.summonSlot.el.title=st.comp?'Companion already active':this.summonPet.title;}
    if (st.comp) {
      const c = st.comp.row;
      this.activePetMode = c.md;
      const cdef = COMPANIONS[st.comp.meta.c];
      set(this.petName, 'text', st.comp.meta.n);
      const who = c.t && st.ents.get(c.t);
      const whoName = who ? (who.id === me.id ? 'you' : who.meta.n) : '';
      const act = c.a === 'idle' && c.md === 'stay' ? 'Holding position' : c.a === 'idle' && c.md === 'assist' ? 'Awaiting a target' : c.a === 'idle' && c.md === 'triage' ? 'Watching for wounds' : ACT_TEXT[c.a] || c.a;
      set(this.petAct, 'text', `${cdef.modes[c.md].name} · ${whoName && c.a !== 'idle' && c.a !== 'dormant' ? `${act} ${whoName}` : act}`);
      set(this.pet, 'cls', `frame pet mode-${c.a === 'dormant' ? 'dormant' : c.md}${inspected?.id === st.comp.id ? ' selected' : ''}`);
      for (const b of this.petButtons) b.el.classList.toggle('active', b.mode === c.md);
    }

    // Auto-attack state is server-authoritative: it does not chase enemies or
    // ignore range. Hostile abilities and right-click can also engage it.
    const autoTarget = target?.meta.k === 'e' && !target.dead;
    this.inscription.hidden = !you.inscription;
    if (you.inscription) {
      set(this.inscriptionName, 'text', `Inscribing ${you.inscription.name}`);
      this.inscriptionProgress.max = you.inscription.total;
      this.inscriptionProgress.value = you.inscription.total - you.inscription.ms;
    }
    const engaging = !!you.auto;
    const obstructed = !!target && you.losTarget === target.id && you.los === 0;
    const effectiveReach=this.sheet?weaponReach(this.sheet):def.auto.range;
    const reach=Number(effectiveReach.toFixed(2));
    const autoTitle=`${def.auto.kind === 'melee' ? 'Melee' : 'Ranged'} auto-attack: ${reach}m range, one attack every ${def.auto.interval / 1000}s while in range. Right-click and some hostile abilities engage; R toggles. There is no automatic chasing.`;
    const distance = autoTarget ? st.dist(target) : Infinity;
    this.autoButton.disabled = me.dead || (!autoTarget && !engaging);
    if (this.autoButton.getAttribute('aria-pressed') !== String(engaging)) this.autoButton.setAttribute('aria-pressed', String(engaging));
    set(this.autoIndicator, 'text', engaging ? '●' : '○');
    const autoText = me.dead ? 'Unavailable while defeated' : !engaging ? (autoTarget ? `${def.auto.kind === 'melee' ? 'Melee' : 'Ranged'} · ${reach}m · every ${def.auto.interval / 1000}s` : 'Select an enemy') : !autoTarget ? 'Disengaging…' : (target.row.f & 2) ? 'Target retreating' : obstructed ? 'Line of sight blocked' : distance > effectiveReach ? `Out of range (${distance.toFixed(1)}m / ${reach}m)` : you.autoCd > 100 ? `Next attack in ${(you.autoCd / 1000).toFixed(1)}s` : 'In range · attack ready';
    const title = `${autoText}. ${autoTitle}`;
    if (this.autoButton.title !== title) this.autoButton.title = title;

    // Action bar
    for (const b of this.abilityButtons) {
      const ab = ABILITIES[b.id];
      const cd = Math.max(st.cd(b.id), ab.offGcd ? 0 : st.gcd());
      const total = st.cd(b.id) > st.gcd() || ab.offGcd ? ab.cd : 1000;
      set(b.cd, '--cd', cd > 0 ? String(Math.min(1, cd / total).toFixed(2)) : '0');
      set(b.cdText, 'text', cd > 1000 ? String(Math.ceil(cd / 1000)) : '');
      let usable = !me.dead;
      if (ab.cost && you.res < ab.cost) usable = false;
      if (ab.minRes && you.res < ab.minRes) usable = false;
      if (kit) {
        if (you.safe) usable = false;
        if (b.id === 'core_bore' && (kit.mark !== target?.id || kit.markMs <= 0)) usable = false;
        if (b.id === 'field_rig' && kit.rigMs > 0) usable = false;
        if (b.id === 'controlled_blast' && (kit.rigMs <= 0 || kit.rigDistance > SURVEYOR.remoteRange)) usable = false;
      }
      if(b.id==='resonant_reversal' && !(you.keeperShield>0))usable=false;
      if(b.id==='phase_transposition' && (!(you.keeperShield>0)||!this.sheet?.attunements?.includes('resonance')||!target||target.meta.k!=='p'||target.id===me.id||target.dead||target.row.b?.includes('shield')))usable=false;
      let ranged = true;
      if (ab.type === 'hostile') {
        if (!target || target.meta.k !== 'e' || target.dead) usable = false;
        else if (st.dist(target) > ab.range || obstructed) ranged = false;
      } else if (ab.type === 'friendly' && target && target.meta.k === 'p' && target.id !== me.id && st.dist(target) > ab.range) ranged = false;
      if(b.id==='phase_transposition' && obstructed)ranged=false;
      b.el.classList.toggle('unusable', !usable);
      b.el.classList.toggle('far', usable && !ranged);
    }

    // Party frames (other players)
    const seen = new Set();
    for (const ent of st.ents.values()) {
      if (ent.meta.k !== 'p' || ent.id === me.id) continue;
      seen.add(ent.id);
      let row = this.partyRows.get(ent.id);
      if (!row) {
        row = unitFrame('ally');
        row.el.setAttribute('role', 'button');
        row.el.addEventListener('click', () => this.a.target(ent.id));
        row.el.tabIndex=0;
        this.bindPlayerContext(row.el,()=>ent.id);
        this.party.append(row.el);
        this.partyRows.set(ent.id, row);
      }
      set(row.name, 'text', ent.meta.n);
      set(row.sub, 'text', `Level ${ent.meta.l} ${CLASSES[ent.meta.c].name}`);
      this.frameBars(row, ent.row.h, ent.row.m);
      this.buffChips(row.buffs, ent.row.b || []);
      row.el.classList.toggle('selected', !!target && target.id === ent.id);
      row.el.classList.toggle('dead', ent.dead);
    }
    for (const [id, row] of this.partyRows) {
      if (!seen.has(id)) {
        row.el.remove();
        this.partyRows.delete(id);
      }
    }

    if (!this.partyPanel.hidden) this.renderParty(st);

    // Death
    set(this.kestrelWarning,'hidden',!you.kestrelAlarm||me.dead);
    set(this.death, 'hidden', !me.dead);
    if (me.dead) {
      const wait = you.dead || 0;
      this.deathBtn.disabled = wait > 0;
      set(this.deathBtn, 'text', wait > 0 ? `Reconstituting in ${Math.ceil(wait / 1000)}…` : 'Reconstitute at the Sanctum');
    }

    set(this.interact, 'hidden', !st.nearObject);
    if(st.nearObject?.meta.k==='e')set(this.interact,'text',(this.loot.auto?'[F] Auto-loot · [Shift+F] Inspect ':'[F] Loot ')+st.nearObject.meta.n);
    else if(st.nearObject?.meta.c==='sinter_recovery')set(this.interact,'text',lock?'Field Recovery · disengage first':you.recoveryMs>0?'Loose mineral shedding · recover in '+Math.ceil(you.recoveryMs/1000)+'s':'[F] Recover loose mineral shedding');
    else if(st.nearObject?.meta.c==='rift_return')set(this.interact,'text',lock?'Phase gate · disengage first':'[F] Return to the Severance Gate');
    else if(st.nearObject?.meta.c==='severance_return')set(this.interact,'text',lock?'Return beacon · disengage first':'[F] Return to the Reach');
    else if(st.nearObject?.meta.c==='severance_gate')set(this.interact,'text',lock?'Severance Gate · disengage first':st.nearObject.row?.gp==='active'?'[F] Enter the Severance Gate':'Severance Gate · the portal is still resonating');
    else if(st.nearObject?.meta.c==='phase_scar')set(this.interact,'text',lock?'Phase Scar · disengage first':'[F] Inspect / traverse Phase Scar');
    else if(st.nearObject?.meta.c==='annex_cache')set(this.interact,'text',lock?'Recovery cache · disengage first':'[F] Open Null Chamber cache');
    else if (st.nearObject) set(this.interact, 'text', `[F] ${st.nearObject.meta.c === 'obelisk' ? 'Touch' : (st.nearObject.meta.c.startsWith('brine_') || ['sanctum_fabricator','initiation_terminal'].includes(st.nearObject.meta.c)) ? 'Operate' : (st.nearObject.meta.c.startsWith('survey_') || st.nearObject.meta.c === 'sinter_sampler' || st.nearObject.meta.c === 'deep_console') ? 'Inspect' : 'Speak with'} ${st.nearObject.meta.n}`);

    set(this.netLabel, 'text', `${st.latency ?? '–'} ms · ${st.fps} fps`);
  }

  // --- nameplates and floating text ------------------------------------------

  plate(ent) {
    let p = this.plates.get(ent.id);
    if (!p) {
      const el = h('div', 'plate');
      const name = h('div', 'pname', ent.meta.n);
      const hp = h('div', 'php');
      const fill = h('div', 'pfill');
      hp.append(fill);
      let actions = null, rename = null;
      if (ent.meta.k === 'c') {
        const head = h('div', 'plate-head');
        actions = h('div', 'companion-actions');
        actions.hidden = true;
        rename = companionIcon('rename', () => this.openCompanionDetails(ent, 'rename'));
        actions.append(rename, companionIcon('info', () => this.openCompanionDetails(ent, 'info')));
        head.append(name, actions);
        el.append(head, hp);
      } else el.append(name, hp);
      if(ent.meta.k==='o'&&ent.meta.c==='quartermaster'){
        const interact=e=>{e.preventDefault();e.stopPropagation();this.a.interact(ent.id);};
        el.tabIndex=0;el.setAttribute('role','button');el.classList.add('npc-plate');el.dataset.npc='quartermaster';
        el.addEventListener('click',interact);el.addEventListener('contextmenu',interact);
        el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')interact(e);});
      }
      if(npcProfile(ent)){
        el.tabIndex=0;el.setAttribute('role','button');el.classList.add('npc-plate');
        el.addEventListener('click',()=>this.openNpc(this.liveEntities?.get(ent.id)));
        el.addEventListener('contextmenu',e=>{e.preventDefault();this.openNpc(this.liveEntities?.get(ent.id));});
        el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();this.openNpc(this.liveEntities?.get(ent.id));}});
        el.dataset.npc=ent.meta.c;
      }
      if(ent.meta.k==='e'){
        const open=e=>{if(!this.loot.canLoot(ent.id))return;e.preventDefault();e.stopPropagation();this.loot.open(ent.id,e.shiftKey===true);};
        el.addEventListener('click',open);el.addEventListener('contextmenu',open);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')open(e);});
      }
      if(ent.meta.k==='p'){
        el.dataset.playerId=String(ent.id);
        el.tabIndex=0;
        el.setAttribute('role','button');
        el.addEventListener('click',()=>{if(this.liveEntities?.get(ent.id)?.meta.k==='p')this.a.target(ent.id);});
        this.bindPlayerContext(el,()=>ent.id);
      }
      this.overlay.append(el);
      p = { el, name, hp, fill, actions, rename };
      this.plates.set(ent.id, p);
    }
    return p;
  }

  removePlate(id) {
    const p = this.plates.get(id);
    if (p) {
      p.el.remove();
      this.plates.delete(id);
    }
  }

  clearPlates() {
    this.radio.clear();this.loot.reset();this.vendor.reset();this.questJournal.reset();this.questTracker.reset();this.questTrial=null;
    for (const id of [...this.plates.keys()]) this.removePlate(id);
    this.closePanels();
    // Do not carry an old character's inventory or Seen state into a world reset.
    this.toggleInventory(false);
    this.resetInventoryPresentation();
    this.inventorySelection = this.loadoutSelection = null;
    this.loadoutTab = 'character';
    this.loadoutSlot = null;
    this.workshopTab='planner';this.plannedLoadout=null;this.recipeId=null;this.atSanctum=false;
    this.production = null;
    this.productionStatus.hidden = true;
    this.inscriptionActive = false;
    this.inscription.hidden = true;
    this.productionQuantity = 1;
    this.codexQuery = this.codexSearch.value = '';
    this.selectedCompanionId = 0;
    this.currentCompanion = null;
    this.companionId = 0;
    this.closePlayerContext();
    this.liveEntities=null;
    this.dragItem=null;
    this.chatChannel='vicinity';
    this.resetChatTarget();
  }

  /** Position a nameplate at screen coordinates, or hide it. */
  placePlate(ent, screen, opts) {
    const p = this.plate(ent);
    if (!screen) {
      set(p.el, 'hidden', true);
      return;
    }
    set(p.el, 'hidden', false);
    p.el.style.transform = `translate(-50%, -100%) translate(${screen.x.toFixed(1)}px, ${screen.y.toFixed(1)}px)`;
    set(p.el, 'cls', `plate ${opts.cls}${opts.selected ? ' selected' : ''}`);
    set(p.name, 'text', opts.label);
    if(ent.meta.k==='p') p.el.setAttribute('aria-label',opts.label+' player');
    if(ent.meta.k==='e'&&p.el.dataset.lootable!==String(!!opts.lootable)){
      p.el.dataset.lootable=String(!!opts.lootable);
      if(opts.lootable){p.el.tabIndex=0;p.el.setAttribute('role','button');p.el.setAttribute('aria-label','Loot '+ent.meta.n);}
      else{p.el.removeAttribute('tabindex');p.el.removeAttribute('role');p.el.removeAttribute('aria-label');}
    }
    if (p.actions) {
      set(p.actions, 'hidden', !opts.selected);
      set(p.rename, 'hidden', !opts.owned);
    }
    set(p.hp, 'hidden', !opts.hp);
    if (opts.hp) set(p.fill, 'width', `${opts.hp * 100}%`);
  }

  /** Spawn floating combat text at a screen position. */
  floatText(screen, text, cls) {
    if (!screen) return;
    const el = h('div', `float ${cls}`, text);
    el.style.left = `${screen.x + (Math.random() - 0.5) * 36}px`;
    el.style.top = `${screen.y - Math.random() * 14}px`;
    this.overlay.append(el);
    setTimeout(() => el.remove(), 1150);
  }

  // --- minimap --------------------------------------------------------------

  drawMinimap(st) {
    const c = this.minimap;
    const g = c.getContext('2d');
    const R = c.width / 2;
    const annex=inRiftAnnex(st.me.pos.x,st.me.pos.z,2);
    const pocket=!annex&&inSeverancePocket(st.me.pos.x,st.me.pos.z,2);
    const area=annex?RIFT_ANNEX:pocket?SEVERANCE_POCKET:null;
    const k = (R - 4) / (area?Math.hypot(area.hw,area.hd)*(pocket?.62:1):WORLD.radius);
    g.clearRect(0, 0, c.width, c.height);
    g.save();
    g.translate(R, R);
    g.beginPath();
    g.arc(0, 0, R - 2, 0, Math.PI * 2);
    g.fillStyle = 'rgba(14, 26, 30, 0.82)';
    g.fill();
    g.clip();
    // Top-down with north (-Z) up and east (+X) to the right.
    // The pocket map follows the player; the Annex and the Reach are fixed.
    const cx=annex?RIFT_ANNEX.x:pocket?st.me.pos.x:0,cz=annex?RIFT_ANNEX.z:pocket?st.me.pos.z:0;
    const X = (x) => (x-cx) * k;
    const Z = (z) => (z-cz) * k;
    if(area){g.strokeStyle=pocket?'#9c7a63':'#638e9c';const lx=pocket?area.hw-area.rim:area.hw,lz=pocket?area.hd-area.rim:area.hd;g.strokeRect(X(area.x-lx),Z(area.z-lz),2*lx*k,2*lz*k);}
    const zoneColours = { sanctum: '#6fe6ff', sporefield: '#c96fd0', relay: '#e0a35c', vault: '#a58cff', obelisk: '#7fd0ff', survey: '#d2a36e', sinter: '#bfb497', deep: '#788b88' };
    for (const key of area?[]:Object.keys(ZONES)) {
      const zn = ZONES[key];
      g.beginPath();
      g.arc(X(zn.x), Z(zn.z), zn.r * k, 0, Math.PI * 2);
      g.fillStyle = zoneColours[key] + '33';
      g.fill();
    }
    g.fillStyle = 'rgba(160, 175, 185, 0.5)';
    for (const col of annex?[]:pocket?COLLIDERS.filter(c=>inSeverancePocket(c.x,c.z)):COLLIDERS) {
      const r = Math.max(1, (col.r ?? Math.max(col.hw, col.hd)) * k);
      g.fillRect(X(col.x) - r, Z(col.z) - r, r * 2, r * 2);
    }
    const partyIds = new Set(st.party.map(member => member.id));
    for (const ent of st.ents.values()) {
      if (ent.id === st.me.id || ent.meta.k === 'c' || partyIds.has(ent.id)||!sameTravelRegion(st.me.pos,ent.pos)) continue;
      if (ent.meta.k === 'e' && ent.dead) continue;
      g.beginPath();
      const big = ent.meta.el || ent.meta.k === 'o';
      g.arc(X(ent.pos.x), Z(ent.pos.z), big ? 3.2 : 2.2, 0, Math.PI * 2);
      g.fillStyle = ent.meta.k === 'e' ? (ent.meta.neu && !(ent.row?.f & 8) ? '#e6c58d' : '#ff6a5a') : ent.meta.k === 'p' ? '#7dffc4' : '#ffd27a';
      g.fill();
    }
    const partyLabels = [];
    const placed = [{ x: X(st.me.pos.x), z: Z(st.me.pos.z) }];
    let number = 0;
    for (const member of st.party) {
      if (member.id === st.me.id) continue;
      number++;
      const ent = st.ents.get(member.id);
      if (ent?.meta.k !== 'p'||!sameTravelRegion(st.me.pos,ent.pos)) continue;
      const x = X(ent.pos.x), z = Z(ent.pos.z);
      const marker = placePartyMarker(x, z, R - 9, placed);
      placed.push(marker);
      const dx = ent.pos.x - st.me.pos.x, dz = ent.pos.z - st.me.pos.z;
      partyLabels.push(`${number} ${member.name}, ${Math.round(Math.hypot(dx, dz))} metres${ent.dead ? ', defeated' : ''}`);
      if (Math.hypot(marker.x - x, marker.z - z) > 6.5) {
        g.beginPath();
        g.moveTo(x, z);
        g.lineTo(marker.x, marker.z);
        g.strokeStyle = '#8dbac5';
        g.lineWidth = 1;
        g.stroke();
      }
      g.beginPath();
      g.arc(marker.x, marker.z, 6.5, 0, Math.PI * 2);
      g.fillStyle = ent.dead ? '#43332c' : '#123a46';
      g.fill();
      g.strokeStyle = '#a8e8f6';
      g.lineWidth = 1;
      g.stroke();
      g.fillStyle = '#fff';
      g.font = 'bold 9px sans-serif';
      g.textAlign = 'center';
      g.fillText(ent.dead ? '×' : String(number), marker.x, marker.z + 3);
    }
    const mapLabel = [annex?'Phase Annex minimap':'World minimap', ...partyLabels].join('. ');
    if (c.getAttribute('aria-label') !== mapLabel) c.setAttribute('aria-label', mapLabel);
    // Player arrow
    g.translate(X(st.me.pos.x), Z(st.me.pos.z));
    g.rotate(Math.PI - st.yaw);
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(4.2, 5);
    g.lineTo(0, 2.5);
    g.lineTo(-4.2, 5);
    g.closePath();
    g.fillStyle = '#ffffff';
    g.fill();
    g.restore();
    g.beginPath();
    g.arc(R, R, R - 2, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(111, 230, 255, 0.55)';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = '#cfefff';
    g.font = 'bold 11px sans-serif';
    g.textAlign = 'center';
    g.fillText('N', R, 13);
  }
}

export { ENEMIES };
