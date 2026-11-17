// Heads-up display. Pure presentation over state the server sent; every
// button just asks main.js to send an intent. Dynamic text (names, chat) is
// only ever written with textContent.

import { ABILITIES, CLASSES, COMPANIONS, ITEMS, DIRECTIVES, XP_TO_NEXT, MAX_LEVEL, SKILL_NAMES, ATTUNEMENT_NAMES, SLOTS, SLOT_NAMES, ENEMIES } from '../../shared/content.js';
import { describeRequirements, tryEquip, tryUnequip } from '../../shared/build.js';
import { WORLD, ZONES, COLLIDERS } from '../../shared/world.js';
import { surveyHint } from '../../shared/survey.js';

const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS = {
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
  glyph_rending_echo: { ability: 'rending_arc', text: 'Glyph of Rending Echo: also strikes every other enemy within 4.5m for 70%. An imprinted target moves the echo to its position, consuming the imprint.' },
  glyph_resonant_aegis: { ability: 'discharge', text: 'Glyph of Resonant Aegis: 40% less damage, but shields you and nearby allies for 60% of the Charge spent. Shared Pulse repairs an active damaged Aegis instead of splash healing.' },
  glyph_shared_pulse: { pet: 'triage', text: 'Glyph of Shared Pulse: each mend also heals allies within 8m of the patient for 60%. A partially depleted active Aegis is repaired instead.' },
  glyph_carapace: { pet: 'guard', text: 'Glyph of the Carapace: no regeneration; the host takes 45% less damage and melee attackers are stung, leaving a 4.5s imprint that redirects Rending Echo.' },
};

const ACT_TEXT = { idle: 'Following', mending: 'Mending', bonding: 'Moving to bond', bonded: 'Bonded to', harrying: 'Harrying', dormant: 'Dormant' };
const PET_KEYS = ['triage', 'guard', 'assist'];

function h(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
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
    this.petName = h('div', 'name');
    this.petAct = h('div', 'sub');
    this.pet.append(this.petName, this.petAct);
    this.pet.setAttribute('role', 'button');
    this.pet.setAttribute('tabindex', '0');
    this.pet.title = 'Inspect your companion (F2)';
    const inspectPet = () => {
      if (!this.companionId) return;
      const r = this.pet.getBoundingClientRect();
      this.a.inspectCompanion(this.companionId, { x: r.right + 10, y: r.top });
    };
    this.pet.addEventListener('click', inspectPet);
    this.pet.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
        inspectPet();
      }
    });
    const left = h('div', 'col');
    left.append(this.player.el, this.pet);
    frames.append(left, this.target.el);
    root.append(frames);

    // Compact, dismissible inspector beside the selected companion or its frame.
    // Unlike a combat target, inspection does not change server targeting.
    this.inspectBox = h('div', 'companion-inspector');
    this.inspectBox.hidden = true;
    this.inspectBox.setAttribute('role', 'dialog');
    this.inspectBox.setAttribute('aria-label', 'Companion details');
    this.inspectClose = h('button', 'inspect-close', '×');
    this.inspectClose.setAttribute('aria-label', 'Close companion details');
    this.inspectClose.addEventListener('click', () => this.a.closeInspect());
    this.inspectName = h('div', 'inspect-name');
    this.inspectSub = h('div', 'inspect-sub');
    this.inspectAction = h('div', 'inspect-action');
    this.inspectBox.append(this.inspectClose, this.inspectName, this.inspectSub, this.inspectAction);
    root.append(this.inspectBox);
    this.inspectAt = null;

    this.party = h('div', 'party');
    root.append(this.party);

    const side = h('div', 'side');
    this.minimap = document.createElement('canvas');
    this.minimap.width = 168;
    this.minimap.height = 168;
    this.minimap.className = 'minimap';
    this.zoneLabel = h('div', 'zone-label');
    this.tracker = h('div', 'tracker');
    this.trackerTitle = h('div', 'title');
    this.trackerText = h('div', 'text');
    this.trackerProgress = h('div', 'progress');
    this.tracker.append(h('div', 'kicker', 'Directive'), this.trackerTitle, this.trackerText, this.trackerProgress);
    this.surveyTracker = h('div', 'tracker');
    this.surveyText = h('div', 'text');
    this.surveyTracker.append(h('div', 'kicker', 'Field investigation · choose one'), this.surveyText);
    side.append(this.minimap, this.zoneLabel, this.tracker, this.surveyTracker);
    root.append(side);

    this.errors = h('div', 'errors');
    this.errors.setAttribute('role', 'alert');
    this.toasts = h('div', 'toasts');
    this.banner = h('div', 'banner');
    root.append(this.errors, this.toasts, this.banner);

    // Log + chat
    const logWrap = h('div', 'logwrap');
    this.logEl = h('div', 'log');
    this.logEl.setAttribute('aria-live', 'polite');
    this.chat = document.createElement('input');
    this.chat.className = 'chat';
    this.chat.maxLength = 140;
    this.chat.placeholder = 'Press Enter to talk';
    this.chat.setAttribute('aria-label', 'Chat message');
    this.chat.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = this.chat.value.trim();
        if (text) this.a.chat(text);
        this.chat.value = '';
        this.chat.blur();
      } else if (e.key === 'Escape') {
        this.chat.value = '';
        this.chat.blur();
      }
    });
    logWrap.append(this.logEl, this.chat);
    root.append(logWrap);

    // Bars
    const bars = h('div', 'bars');
    this.petBar = h('div', 'petbar');
    this.autoControl = h('div', 'auto-control');
    this.autoButton = h('button', 'auto-toggle', '[R] Auto-attack OFF');
    this.autoButton.addEventListener('click', () => this.a.autoAttack());
    this.autoStatus = h('span', 'auto-status', 'Select an enemy');
    this.autoControl.append(this.autoButton, this.autoStatus);
    this.actionBar = h('div', 'actionbar');
    this.xp = bar('xp');
    bars.append(this.petBar, this.autoControl, this.actionBar, this.xp.wrap);
    root.append(bars);
    this.abilityButtons = [];
    this.petButtons = [];

    // Corner menu
    const menu = h('div', 'menu');
    this.buildBtn = h('button', 'menubtn', 'Build [C]');
    this.buildBtn.addEventListener('click', () => this.toggleBuild());
    const helpBtn = h('button', 'menubtn', 'Help [H]');
    helpBtn.addEventListener('click', () => this.toggleHelp());
    this.charactersBtn = h('button', 'menubtn', 'Characters');
    this.charactersBtn.addEventListener('click', () => this.a.characters());
    this.signoutBtn = h('button', 'menubtn', 'Sign out');
    this.signoutBtn.hidden = true;
    this.signoutBtn.addEventListener('click', () => this.a.signOut());
    this.netLabel = h('div', 'net');
    menu.append(this.buildBtn, helpBtn, this.charactersBtn, this.signoutBtn, this.netLabel);
    root.append(menu);

    this.tooltip = h('div', 'tooltip');
    this.tooltip.hidden = true;
    root.append(this.tooltip);

    // Build panel
    this.panel = h('div', 'panel build');
    this.panel.hidden = true;
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Character build');
    const close = h('button', 'close', '×');
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => this.toggleBuild(false));
    this.panelBody = h('div', 'panel-body');
    this.panel.append(close, this.panelBody);
    root.append(this.panel);

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
      ['Wheel', 'Zoom'],
      ['Click / Tab', 'Select an enemy, ally or companion / cycle enemies'],
      ['Right-click', 'Engage auto-attack on an enemy, or use an object'],
      ['R', 'Toggle auto-attack. Switching targets or clearing target stops it.'],
      ['F1 / F2', 'Target yourself / inspect companion (Esc closes)'],
      ['1 – 4', 'Abilities'],
      ['Shift + 1 – 3', 'Companion: Triage / Bond / Harry'],
      ['F', 'Interact with what is in front of you'],
      ['V', 'Reset the camera behind you'],
      ['C', 'Build: devices, implants, glyphs'],
      ['Enter', 'Chat'],
    ];
    const table = h('div', 'keys');
    for (const [k, v] of rows) table.append(h('kbd', null, k), h('span', null, v));
    this.help.append(table);
    const forget = h('button', 'danger', 'Abandon this character and create a new one');
    forget.addEventListener('click', () => {
      if (forget.dataset.armed) this.a.forget();
      else {
        forget.dataset.armed = '1';
        forget.textContent = 'Click again to confirm — this cannot be undone from this browser';
      }
    });
    this.forgetBtn = forget;
    this.help.append(forget);
    this.recoveryBtn = h('button', 'menubtn', 'Copy guest recovery key');
    this.recoveryBtn.addEventListener('click', () => this.a.copyRecoveryKey());
    this.help.append(this.recoveryBtn);
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
    this.forgetBtn.hidden = !!linked;
    this.recoveryBtn.hidden = !!linked;
  }

  /** Build the class-specific action bars once the class is known. */
  setClass(cls) {
    if (this.cls === cls) return;
    this.cls = cls;
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
    this.petButtons = [];
    if (def.companion) {
      const cdef = COMPANIONS[def.companion];
      PET_KEYS.forEach((mode, i) => {
        const b = this.slotButton(ICONS[mode], `⇧${i + 1}`, cdef.modes[mode].name);
        b.el.classList.add('small');
        b.el.addEventListener('click', () => this.a.pet(mode));
        this.hover(b.el, () => this.petTip(mode));
        this.petBar.append(b.el);
        this.petButtons.push({ mode, ...b });
      });
    }
    set(this.pet, 'hidden', !def.companion);
    this.petBar.hidden = !def.companion;
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
    const show = () => {
      this.tipFor = el;
      this.tooltip.replaceChildren(...makeTip());
      this.tooltip.hidden = false;
      const r = el.getBoundingClientRect();
      const t = this.tooltip.getBoundingClientRect();
      this.tooltip.style.left = `${Math.max(8, Math.min(window.innerWidth - t.width - 8, r.left + r.width / 2 - t.width / 2))}px`;
      this.tooltip.style.top = `${Math.max(8, r.top - t.height - 10)}px`;
    };
    const hide = () => {
      if (this.tipFor === el) this.tooltip.hidden = true;
    };
    el.addEventListener('mouseenter', show);
    el.addEventListener('focus', show);
    el.addEventListener('mouseleave', hide);
    el.addEventListener('blur', hide);
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
    return out;
  }

  petTip(mode) {
    const cdef = COMPANIONS[CLASSES[this.cls].companion];
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

  zone(name) {
    set(this.zoneLabel, 'text', name);
    this.banner.textContent = name;
    this.banner.classList.remove('show');
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
  }

  focusChat() {
    this.chat.focus();
  }

  // --- panels ---------------------------------------------------------------

  toggleBuild(force) {
    const open = force ?? this.panel.hidden;
    this.panel.hidden = !open;
    if (open) {
      this.help.hidden = true;
      this.buildBtn.classList.remove('new');
      this.renderBuild();
    }
  }

  toggleHelp(force) {
    const open = force ?? this.help.hidden;
    this.help.hidden = !open;
    if (open) this.panel.hidden = true;
  }

  /** Close any open panel. Returns true if something was closed. */
  closePanels() {
    const any = !this.panel.hidden || !this.help.hidden || !this.inspectBox.hidden;
    this.panel.hidden = true;
    this.help.hidden = true;
    this.tooltip.hidden = true;
    if (!this.inspectBox.hidden) this.a.closeInspect();
    return any;
  }

  setSheet(sheet) {
    const grew = this.sheet && sheet.inventory.length > this.sheet.inventory.length;
    this.sheet = sheet;
    this.setClass(sheet.cls);
    if (grew && this.panel.hidden) this.buildBtn.classList.add('new');
    if (!this.panel.hidden) this.renderBuild();

    set(this.surveyText, 'text', surveyHint(sheet.survey));
    const q = sheet.quest;
    const d = DIRECTIVES[q.step];
    if (d) {
      set(this.trackerTitle, 'text', d.title);
      set(this.trackerText, 'text', d.text);
      set(this.trackerProgress, 'text', d.goal.kill ? `${Math.min(q.progress, d.goal.count)} / ${d.goal.count} defeated` : '');
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
    for (const b of this.abilityButtons) b.pip.hidden = !(note && note.ability === b.id);
    for (const b of this.petButtons) b.pip.hidden = !(note && note.pet === b.mode);
  }

  renderBuild() {
    const s = this.sheet;
    if (!s) return;
    const def = CLASSES[s.cls];
    const body = this.panelBody;
    body.replaceChildren();
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
      c1.append(row);
    }
    c1.append(h('h3', null, 'Derived'));
    const stat = (label, value, changed) => {
      const row = h('div', 'stat');
      row.append(h('span', null, label), h('span', `val${changed ? ' changed' : ''}`, value));
      c1.append(row);
    };
    const pct = (m) => `${m >= 1 ? '+' : ''}${Math.round((m - 1) * 100)}%`;
    stat('Maximum health', String(s.stats.maxHp));
    stat(`Power (from ${SKILL_NAMES[def.primary]})`, pct(s.stats.power), s.stats.power !== 1);
    stat('Damage dealt', pct(s.stats.dmgMul), s.stats.dmgMul !== 1);
    if (def.companion) stat('Healing done (you and symbiote)', pct(s.stats.healMul), s.stats.healMul !== 1);
    if (def.resource.id === 'charge') {
      stat('Charge generation', pct(s.stats.chargeMul), s.stats.chargeMul !== 1);
      stat('Discharge reach', `${ABILITIES.discharge.radius + s.stats.dischargeRadius}m`, s.stats.dischargeRadius > 0);
    }
    c1.append(h('h3', null, 'Attunements'));
    if (s.attunements.length) for (const a of s.attunements) c1.append(h('div', 'attune', `◈ ${ATTUNEMENT_NAMES[a]}`));
    else c1.append(h('div', 'muted', 'None yet. Some powers only answer the attuned.'));

    // Column 2: what is installed.
    const c2 = h('section', 'pcol');
    c2.append(h('h2', null, 'Loadout'));
    for (const slot of SLOTS) {
      const id = s.equipped[slot];
      const card = h('div', `card slotcard${id ? '' : ' empty'}`);
      card.append(h('div', 'kicker', SLOT_NAMES[slot]));
      if (id) {
        card.append(h('div', 'iname', ITEMS[id].name), h('div', 'idesc', ITEMS[id].desc));
        const res = tryUnequip(s, slot);
        const btn = h('button', null, 'Remove');
        btn.disabled = !res.ok || !!this.buildLock;
        btn.addEventListener('click', () => this.a.unequip(slot));
        card.append(btn);
        if (!res.ok) {
          card.append(h('div', 'why', res.reason));
          if (res.item && res.item !== id && ITEMS[res.item]) card.append(h('div', 'why-next', `Remove or replace ${ITEMS[res.item].name} first, or preserve its requirements with different equipment.`));
        }
      } else {
        card.append(h('div', 'muted', slot === 'device' ? 'Devices lend you skill.' : slot === 'implant' ? 'Implants demand skill and reshape your power.' : 'A glyph rewrites how one power behaves.'));
      }
      c2.append(card);
    }

    // Column 3: what you carry.
    const c3 = h('section', 'pcol wide');
    c3.append(h('h2', null, 'Inventory'));
    const spare = s.inventory.filter((id) => s.equipped[ITEMS[id].slot] !== id);
    if (!s.inventory.length) c3.append(h('div', 'muted', 'Empty. Follow your directive — the Reach provides.'));
    else if (!spare.length) c3.append(h('div', 'muted', 'Everything you own is installed.'));
    for (const id of spare) {
      const item = ITEMS[id];
      const card = h('div', 'card');
      card.append(h('div', 'kicker', SLOT_NAMES[item.slot]), h('div', 'iname', item.name), h('div', 'idesc', item.desc));
      for (const r of describeRequirements(s, id)) {
        const line = h('div', `req ${r.met ? 'met' : 'unmet'}`, `${r.met ? '✓' : '✗'} ${r.text}`);
        if (r.detail) {
          line.title = r.detail;
          line.setAttribute('aria-label', `${r.text}. ${r.detail}`);
        }
        card.append(line);
      }
      const res = tryEquip(s, id);
      const btn = h('button', res.ok ? 'primary' : '', s.equipped[item.slot] ? 'Swap in' : 'Equip');
      btn.disabled = !res.ok || !!this.buildLock;
      btn.addEventListener('click', () => this.a.equip(id));
      card.append(btn);
      if (!res.ok) card.append(h('div', 'why', res.reason));
      c3.append(card);
    }
    body.append(c1, c2, c3);
  }

  // --- per-frame ------------------------------------------------------------

  frameBars(f, hp, max) {
    set(f.hp.fill, 'width', `${max > 0 ? Math.max(0, Math.min(100, (hp / max) * 100)) : 0}%`);
    set(f.hp.label, 'text', `${hp} / ${max}`);
  }

  buffChips(el, keys) {
    const sig = keys.join(',');
    if (el._sig === sig) return;
    el._sig = sig;
    el.replaceChildren(...keys.filter((k) => BUFFS[k]).map((k) => h('span', `chip ${BUFFS[k][1]}`, BUFFS[k][0])));
  }

  /**
   * @param {object} st {me, you, target, ents, comp, now, cast, dist(ent), fps, latency, nearObject}
   */
  update(st) {
    const { me, you, target } = st;
    if (!me || !you || !this.sheet) return;
    const def = CLASSES[this.sheet.cls];

    const lock = me.dead ? 'dead' : (me.row.f & 8) ? 'combat' : '';
    if (lock !== this.buildLock) {
      this.buildLock = lock;
      if (!this.panel.hidden) this.renderBuild();
    }
    set(this.player.name, 'text', this.sheet.name);
    set(this.player.sub, 'text', `Level ${this.sheet.level} ${def.name}${you.safe ? ' · Sanctum' : ''}`);
    this.frameBars(this.player, me.row.h, me.row.m);
    set(this.player.res.fill, 'width', `${(you.res / def.resource.max) * 100}%`);
    set(this.player.res.label, 'text', `${def.resource.name} ${you.res}`);
    this.buffChips(this.player.buffs, me.row.b || []);

    // Target frame
    set(this.target.el, 'hidden', !target);
    if (target) {
      const enemy = target.meta.k === 'e';
      const neutral = enemy && target.meta.neu && !(target.row.f & 8);
      const hostile = enemy && !neutral;
      set(this.target.el, 'cls', `frame target ${hostile ? 'hostile' : neutral ? 'neutral' : 'friendly'}`);
      set(this.target.name, 'text', target.meta.n);
      const lvl = target.meta.l ? `Level ${target.meta.l}` : '';
      const companion = target.meta.k === 'c';
      const owner = companion ? st.ents.get(target.meta.o) : null;
      const kind = neutral ? 'Neutral · retaliates if attacked' : hostile ? (target.meta.el ? 'Elite' : 'Hostile') : companion ? `Companion · ${owner ? owner.meta.n : 'Owner unknown'}` : target.meta.k === 'p' ? CLASSES[target.meta.c].name : '';
      set(this.target.sub, 'text', [lvl, kind].filter(Boolean).join(' · '));
      set(this.target.details, 'hidden', true);
      const hasHp = target.row.m !== undefined;
      set(this.target.hp.wrap, 'hidden', !hasHp);
      if (hasHp) this.frameBars(this.target, target.row.h, target.row.m);
      set(this.target.res.wrap, 'hidden', true);
      this.buffChips(this.target.buffs, target.row.b || []);
      const cast = target.cast && st.now < target.cast.end ? target.cast : null;
      set(this.target.cast.wrap, 'hidden', !cast);
      if (cast) {
        set(this.target.cast.fill, 'width', `${Math.min(100, ((st.now - cast.start) / (cast.end - cast.start)) * 100)}%`);
        set(this.target.cast.label, 'text', cast.name);
      }
    }

    // Contextual companion inspection, anchored to the interaction point.
    const inspected = st.inspect && st.ents.get(st.inspect.id);
    set(this.inspectBox, 'hidden', !inspected || inspected.meta.k !== 'c');
    if (inspected && inspected.meta.k === 'c') {
      const owner = st.ents.get(inspected.meta.o);
      const c = inspected.row;
      const mode = COMPANIONS[inspected.meta.c]?.modes[c.md];
      const who = st.ents.get(c.t);
      const action = c.a === 'idle' && c.md === 'triage' ? 'Watching for wounds' : c.a === 'idle' && c.md === 'assist' ? 'Awaiting a target' : ACT_TEXT[c.a] || c.a;
      set(this.inspectName, 'text', inspected.meta.n);
      set(this.inspectSub, 'text', `${owner?.meta.n || 'Unknown owner'} · ${mode?.name || c.md}`);
      set(this.inspectAction, 'text', who && c.a !== 'idle' ? `${action} ${who.meta.n}` : action);
      if (st.inspect !== this.inspectAt) {
        const { x, y } = st.inspect;
        const w = this.inspectBox.offsetWidth || 250;
        const h = this.inspectBox.offsetHeight || 90;
        const left = x + w + 12 > window.innerWidth ? x - w - 12 : x;
        this.inspectBox.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, left))}px`;
        this.inspectBox.style.top = `${Math.max(8, Math.min(window.innerHeight - h - 8, y))}px`;
        this.inspectAt = st.inspect;
      }
    } else this.inspectAt = null;

    // Companion frame
    this.companionId = st.comp?.id || 0;
    if (st.comp) {
      const c = st.comp.row;
      const cdef = COMPANIONS[def.companion];
      set(this.petName, 'text', `${cdef.name} — ${cdef.modes[c.md].name}`);
      const who = c.t && st.ents.get(c.t);
      const whoName = who ? (who.id === me.id ? 'you' : who.meta.n) : '';
      const act = c.a === 'idle' && c.md === 'assist' ? 'Awaiting a target' : c.a === 'idle' && c.md === 'triage' ? 'Watching for wounds' : ACT_TEXT[c.a] || c.a;
      set(this.petAct, 'text', whoName && c.a !== 'idle' && c.a !== 'dormant' ? `${act} ${whoName}` : act);
      set(this.pet, 'cls', `frame pet mode-${c.a === 'dormant' ? 'dormant' : c.md}${inspected?.id === st.comp.id ? ' selected' : ''}`);
      for (const b of this.petButtons) b.el.classList.toggle('active', b.mode === c.md);
    }

    // Auto-attack state is server-authoritative: it does not chase enemies or
    // ignore range. Hostile abilities and right-click can also engage it.
    const autoTarget = target?.meta.k === 'e' && !target.dead;
    const engaging = !!you.auto;
    const reach = def.auto.range;
    const distance = autoTarget ? st.dist(target) : Infinity;
    this.autoButton.disabled = me.dead || (!autoTarget && !engaging);
    set(this.autoButton, 'text', `[R] Auto-attack ${engaging ? 'ON' : 'OFF'}`);
    set(this.autoControl, 'cls', `auto-control${engaging ? ' engaged' : ''}`);
    const autoText = me.dead ? 'Unavailable while defeated' : !engaging ? (autoTarget ? `${def.auto.kind === 'melee' ? 'Melee' : 'Ranged'} · ${reach}m · every ${def.auto.interval / 1000}s` : 'Select an enemy') : !autoTarget ? 'Disengaging…' : (target.row.f & 2) ? 'Target retreating' : distance > reach ? `Out of range (${distance.toFixed(1)}m / ${reach}m)` : you.autoCd > 100 ? `Next attack in ${(you.autoCd / 1000).toFixed(1)}s` : 'In range · attack ready';
    set(this.autoStatus, 'text', autoText);

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
      let ranged = true;
      if (ab.type === 'hostile') {
        if (!target || target.meta.k !== 'e' || target.dead) usable = false;
        else if (st.dist(target) > ab.range) ranged = false;
      } else if (ab.type === 'friendly' && target && target.meta.k === 'p' && target.id !== me.id && st.dist(target) > ab.range) ranged = false;
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

    // Death
    set(this.death, 'hidden', !me.dead);
    if (me.dead) {
      const wait = you.dead || 0;
      this.deathBtn.disabled = wait > 0;
      set(this.deathBtn, 'text', wait > 0 ? `Reconstituting in ${Math.ceil(wait / 1000)}…` : 'Reconstitute at the Sanctum');
    }

    set(this.interact, 'hidden', !st.nearObject);
    if (st.nearObject) set(this.interact, 'text', `[F] ${st.nearObject.meta.c === 'obelisk' ? 'Touch' : (st.nearObject.meta.c.startsWith('survey_') || st.nearObject.meta.c === 'sinter_sampler') ? 'Inspect' : 'Speak with'} ${st.nearObject.meta.n}`);

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
      el.append(name, hp);
      this.overlay.append(el);
      p = { el, name, hp, fill };
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
    for (const id of [...this.plates.keys()]) this.removePlate(id);
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
    const k = (R - 4) / WORLD.radius;
    g.clearRect(0, 0, c.width, c.height);
    g.save();
    g.translate(R, R);
    g.beginPath();
    g.arc(0, 0, R - 2, 0, Math.PI * 2);
    g.fillStyle = 'rgba(14, 26, 30, 0.82)';
    g.fill();
    g.clip();
    // Top-down with north (-Z) up and east (+X) to the right.
    const X = (x) => x * k;
    const Z = (z) => z * k;
    const zoneColours = { sanctum: '#6fe6ff', sporefield: '#c96fd0', relay: '#e0a35c', vault: '#a58cff', obelisk: '#7fd0ff', survey: '#d2a36e', sinter: '#bfb497' };
    for (const key of Object.keys(ZONES)) {
      const zn = ZONES[key];
      g.beginPath();
      g.arc(X(zn.x), Z(zn.z), zn.r * k, 0, Math.PI * 2);
      g.fillStyle = zoneColours[key] + '33';
      g.fill();
    }
    g.fillStyle = 'rgba(160, 175, 185, 0.5)';
    for (const col of COLLIDERS) {
      const r = Math.max(1, (col.r ?? Math.max(col.hw, col.hd)) * k);
      g.fillRect(X(col.x) - r, Z(col.z) - r, r * 2, r * 2);
    }
    for (const ent of st.ents.values()) {
      if (ent.id === st.me.id || ent.meta.k === 'c') continue;
      if (ent.meta.k === 'e' && ent.dead) continue;
      g.beginPath();
      const big = ent.meta.el || ent.meta.k === 'o';
      g.arc(X(ent.pos.x), Z(ent.pos.z), big ? 3.2 : 2.2, 0, Math.PI * 2);
      g.fillStyle = ent.meta.k === 'e' ? (ent.meta.neu && !(ent.row?.f & 8) ? '#e6c58d' : '#ff6a5a') : ent.meta.k === 'p' ? '#7dffc4' : '#ffd27a';
      g.fill();
    }
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
