// Content definitions: classes, abilities, enemies, items, directives.
// Data only. Rules live in shared/build.js (loadouts) and server/sim (combat).

import { ZONES } from './world.js';

export const GCD_MS = 1000;
export const MAX_LEVEL = 5;
/** XP needed to advance from level L to L+1 (index L). */
export const XP_TO_NEXT = [0, 90, 200, 340, 520];

export const SKILL_NAMES = { kinetics: 'Kinetics', biotech: 'Biotech' };
export const ATTUNEMENT_NAMES = { resonance: 'Resonance' };
export const SLOT_NAMES = { device: 'Device', implant: 'Implant', glyph: 'Glyph' };
export const SLOTS = ['device', 'implant', 'glyph'];

export const CLASSES = {
  vanguard: {
    id: 'vanguard',
    name: 'Kinetic Vanguard',
    role: 'Defender',
    blurb:
      'A front-line defender with no shield. Incoming blows are stored as kinetic Charge, then released to break enemies — or, with the right glyph, to protect allies.',
    baseHp: 230,
    hpPerLevel: 22,
    resource: { id: 'charge', name: 'Charge', max: 100, start: 0, regen: 0, decay: 3 },
    skills: { kinetics: 10, biotech: 4 },
    primary: 'kinetics',
    threatMul: 2.2,
    auto: { range: 3.6, interval: 2000, dmg: 10, kind: 'melee' },
    abilities: ['rending_arc', 'graviton_tether', 'kinetic_ward', 'discharge'],
    companion: null,
  },
  symbiotech: {
    id: 'symbiotech',
    name: 'Symbiotech Conductor',
    role: 'Healer / Support',
    blurb:
      'A support specialist bonded to a Mender Symbiote — a living machine that triages the wounded, bonds to an ally as living armour, or harries your target on command.',
    baseHp: 155,
    hpPerLevel: 15,
    resource: { id: 'energy', name: 'Bio-energy', max: 100, start: 100, regen: 5, decay: 0 },
    skills: { kinetics: 4, biotech: 10 },
    primary: 'biotech',
    threatMul: 1,
    auto: { range: 26, interval: 2000, dmg: 5, kind: 'bolt' },
    abilities: ['neural_lash', 'mending_graft', 'spore_snare', 'overgrowth_surge'],
    companion: 'mender',
  },
};

/**
 * Appearances ("looks") a class may wear. Purely cosmetic: a look never changes
 * stats or rules. The server stores the choice and tells other players; the
 * client decides how to draw it (client/src/looks.js). The first entry is the
 * class default.
 */
export const LOOKS = {
  vanguard: [
    { id: 'vanguard_plate', name: 'Capacitor Plate', blurb: 'Standard-issue kinetic harness: storage plates and gauntlet coils.' },
    { id: 'red_rucker', name: 'Red Rucker', blurb: 'Veyran Burdenkeeper. A faceless crimson endurance fighter who carries the load for others.' },
  ],
  symbiotech: [{ id: 'conductor', name: 'Conductor Suit', blurb: 'Bio-lab field suit with a symbiote culture tank.' }],
};
export const defaultLook = (cls) => LOOKS[cls][0].id;
export const validLook = (cls, look) => typeof look === 'string' && Object.hasOwn(LOOKS, cls) && LOOKS[cls].some((l) => l.id === look);

// type: 'hostile' needs a living enemy target; 'friendly' uses a friendly
// player target or falls back to self; 'self' needs no target.
export const ABILITIES = {
  rending_arc: {
    name: 'Rending Arc',
    type: 'hostile',
    range: 4.2,
    cd: 4000,
    dmg: 22,
    gain: 15,
    desc: 'Strike your target for heavy kinetic damage. Generates 15 Charge.',
  },
  graviton_tether: {
    name: 'Graviton Tether',
    type: 'hostile',
    range: 24,
    cd: 10000,
    dmg: 6,
    gain: 10,
    pullTo: 2.6,
    taunt: 4000,
    desc: 'Yank an enemy to your feet and force it to attack you for 4s. Generates 10 Charge.',
  },
  kinetic_ward: {
    name: 'Kinetic Ward',
    type: 'self',
    cd: 18000,
    offGcd: true,
    dur: 6000,
    absorb: 0.4,
    desc: 'For 6s, take 40% less damage. Every point prevented becomes Charge.',
  },
  discharge: {
    name: 'Discharge',
    type: 'self',
    cd: 6000,
    minRes: 30,
    radius: 7,
    base: 10,
    perCharge: 0.55,
    desc: 'Spend all Charge (min 30) to blast enemies within 7m. Damage scales with Charge spent.',
  },
  neural_lash: {
    name: 'Neural Lash',
    type: 'hostile',
    range: 26,
    cd: 1500,
    dmg: 11,
    sap: { dur: 6000, mul: 0.8 },
    desc: 'Lash an enemy with a bio-electric filament. The target is Sapped: it deals 20% less damage for 6s.',
  },
  mending_graft: {
    name: 'Mending Graft',
    type: 'friendly',
    range: 30,
    cd: 3000,
    cost: 25,
    heal: 24,
    hot: { total: 30, dur: 6000 },
    desc: 'Graft regenerative tissue onto an ally (or yourself): heals now and again over 6s.',
  },
  spore_snare: {
    name: 'Spore Snare',
    type: 'hostile',
    range: 26,
    cd: 14000,
    cost: 20,
    dmg: 4,
    root: 4000,
    desc: 'Root an enemy in place for 4s. Rooted enemies can still strike anything in reach.',
  },
  overgrowth_surge: {
    name: 'Overgrowth Surge',
    type: 'self',
    cd: 30000,
    cost: 40,
    heal: 48,
    radius: 10,
    desc: 'Your symbiote erupts in a restorative bloom, healing every ally within 10m of it.',
  },
};

export const validCompanionName = (name) =>
  typeof name === 'string' && /^[A-Za-z][A-Za-z '-]{1,16}[A-Za-z]$/.test(name) && !/[ '-]{2}/.test(name);

export const COMPANIONS = {
  mender: {
    name: 'Mender Symbiote',
    followDist: 2.4,
    speed: 11,
    leash: 45,
    triage: { interval: 2000, heal: 9, range: 7, seek: 28, threshold: 0.97 },
    guard: { regen: 5, dr: 0.2, range: 40 },
    assist: { interval: 1500, dmg: 4, range: 8, corrode: { dur: 4000, mul: 1.12 } },
    modes: {
      triage: { name: 'Triage', desc: 'Roams near you and mends the most injured ally in reach.' },
      guard: { name: 'Bond', desc: 'Bonds to your friendly target (or you): steady regeneration and 20% less damage taken.' },
      assist: { name: 'Attack', desc: 'Attacks your target. Its sting makes the target take 12% more damage.' },
      follow: { name: 'Follow', desc: 'Stays near you without automatically attacking, healing or bonding.' },
      stay: { name: 'Stay', desc: 'Holds position without engaging. Returns to you if you move beyond its tether.' },
    },
  },
};

export const ENEMIES = {
  skitter: {
    name: 'Mire Skitter',
    level: 1,
    hp: 62,
    speed: 4.6,
    radius: 0.7,
    aggro: 9,
    social: 6,
    leash: 34,
    attack: { range: 2.4, interval: 1800, dmg: 6, kind: 'melee' },
    xp: 22,
    respawn: 18000,
    loot: [],
  },
  sentinel: {
    name: 'Rogue Sentinel',
    level: 2,
    hp: 115,
    speed: 3.8,
    radius: 0.8,
    aggro: 12,
    social: 0,
    leash: 38,
    attack: { range: 13, interval: 2200, dmg: 9, kind: 'bolt' },
    specials: [{ id: 'arc_pulse', name: 'Arc Pulse', cd: 9000, first: 4000, windup: 1600, radius: 4.5, dmg: 24, at: 'target' }],
    xp: 42,
    respawn: 28000,
    loot: [{ item: 'adrenal_shunt', chance: 0.35 }],
  },
  warden: {
    name: 'Vault Warden',
    level: 4,
    elite: true,
    hp: 900,
    // Each additional engaged player adds this fraction of base health.
    perPlayer: 0.65,
    speed: 4.4,
    radius: 1.6,
    aggro: 11,
    social: 0,
    leash: 30,
    attack: { range: 4.2, interval: 2000, dmg: 27, kind: 'melee', far: { range: 32, dmg: 13, interval: 2600 } },
    specials: [
      { id: 'seismic_slam', name: 'Seismic Slam', cd: 13000, first: 6000, windup: 2200, radius: 7.5, dmg: 55, at: 'self' },
      { id: 'resonance_burst', name: 'Resonance Burst', cd: 9000, first: 9500, windup: 1200, radius: 40, dmg: 12, at: 'all' },
    ],
    xp: 180,
    respawn: 60000,
    loot: [{ item: 'wardstone_shard', chance: 1 }],
  },
};

const sp = (type, zone, dx, dz) => ({ type, x: ZONES[zone].x + dx, z: ZONES[zone].z + dz });
export const SPAWNS = [
  sp('skitter', 'sporefield', 9, -6),
  sp('skitter', 'sporefield', 5, 5),
  sp('skitter', 'sporefield', -6, -4),
  sp('skitter', 'sporefield', -9, 8),
  sp('skitter', 'sporefield', 2, 14),
  sp('skitter', 'sporefield', -14, -9),
  sp('sentinel', 'relay', -9, 2),
  sp('sentinel', 'relay', 6, 5),
  sp('sentinel', 'relay', 4, -13),
  sp('warden', 'vault', 0, 0),
];

// Items. `skills` add to character skills; `mods` adjust derived stats;
// `req` must hold for the whole loadout while the item is equipped.
export const ITEMS = {
  sporeglass_focus: {
    summary: "+3 Biotech · +6 percentage points of Power (Conductors)",
    name: 'Sporeglass Focus',
    slot: 'device',
    skills: { biotech: 3 },
    desc: '+3 Biotech. For Conductors: +6 percentage points of Power; unlocks Biotech equipment.',
  },
  servo_harness: {
    summary: "+3 Kinetics · +6 percentage points of Power (Vanguards)",
    name: 'Sentinel Servo Harness',
    slot: 'device',
    skills: { kinetics: 3 },
    desc: '+3 Kinetics. For Vanguards: +6 percentage points of Power; unlocks Kinetics equipment.',
  },
  wardstone_shard: {
    summary: "+35 maximum health",
    name: 'Wardstone Shard',
    slot: 'device',
    mods: { hpAdd: 35 },
    desc: 'A fragment of the Vault Warden, still humming. +35 maximum health.',
  },
  myelin_lattice: {
    summary: "+30% healing (you and symbiote)",
    name: 'Myelin Lattice',
    slot: 'implant',
    req: { skills: { biotech: 13 } },
    mods: { healMul: 1.3 },
    desc: 'Grown neural mesh. All healing you and your symbiote do is increased by 30%.',
  },
  kinetic_capacitor: {
    summary: "+50% Charge generation · +2m Discharge radius",
    name: 'Kinetic Capacitor',
    slot: 'implant',
    req: { skills: { kinetics: 13 } },
    mods: { chargeMul: 1.5, dischargeRadius: 2 },
    desc: 'Sub-dermal capacitor bank. Charge generation +50%. Discharge reaches 2m further.',
  },
  adrenal_shunt: {
    summary: "+20% damage · −15% maximum health",
    name: 'Adrenal Shunt',
    slot: 'implant',
    mods: { dmgMul: 1.2, hpMul: 0.85 },
    desc: 'A crude sentinel-tech bypass. +20% damage dealt, but -15% maximum health.',
  },
  calibrated_servo: {
    name:'Calibrated Servo Harness',slot:'device',cls:'vanguard',
    skills:{kinetics:3},mods:{chargeMul:1.2,hpMul:.93},
    summary:'+3 Kinetics · +20% Charge generation · −7% maximum health',
    desc:'A calibrated kinetic interface accelerates Charge transfer at the cost of protective mass. +3 Kinetics, +20% Charge generation, −7% maximum health.',
  },
  cultured_focus: {
    name:'Cultured Sporeglass Focus',slot:'device',cls:'symbiotech',
    skills:{biotech:3},mods:{healMul:1.1,dmgMul:.9},
    summary:'+3 Biotech · +10% healing · −10% damage',
    desc:'A stabilized living scaffold amplifies restorative signals while diverting offensive energy. +3 Biotech, +10% healing, −10% damage.',
  },
  resonance_buffer: {
    name:'Resonance Buffer',slot:'implant',req:{attune:'resonance'},
    mods:{hpAdd:25,dmgMul:.9},
    summary:'+25 maximum health · −10% damage',
    desc:'A damped resonance implant reinforces structural tolerance at the expense of offensive output. +25 maximum health, −10% damage.',
  },
  glyph_shared_pulse: {
    summary: "Triage: 60% splash healing within 8m of patient",
    name: 'Glyph of Shared Pulse',
    slot: 'glyph',
    cls: 'symbiotech',
    req: { attune: 'resonance' },
    desc: 'Triage mends resonate: allies within 8m of the patient are also healed for 60%.',
  },
  glyph_carapace: {
    summary: "Bond: 45% damage reduction · 6 melee retaliation · no regeneration",
    name: 'Glyph of the Carapace',
    slot: 'glyph',
    cls: 'symbiotech',
    desc: 'Bond no longer regenerates. Instead the host takes 45% less damage and attackers in melee are stung for 6.',
  },
  glyph_resonant_aegis: {
    summary: "Discharge: −40% damage · shield for 60% of Charge spent (8s)",
    name: 'Glyph of Resonant Aegis',
    slot: 'glyph',
    cls: 'vanguard',
    req: { attune: 'resonance' },
    desc: 'Discharge deals 40% less damage, but shields you and allies within reach for 60% of the Charge spent (8s).',
  },
  glyph_rending_echo: {
    summary: "Rending Arc: 70% splash damage within 4.5m",
    name: 'Glyph of Rending Echo',
    slot: 'glyph',
    cls: 'vanguard',
    desc: 'Rending Arc also strikes every other enemy within 4.5m of you for 70% damage.',
  },
};

export const GLYPH = {
  sharedPulse: { radius: 8, pct: 0.6 },
  carapace: { dr: 0.45, reflect: 6 },
  aegis: { dmgMul: 0.6, shieldPct: 0.6, dur: 8000 },
  echo: { radius: 4.5, pct: 0.7 },
};

// The directive chain is the guided path through the slice. Rewards are
// granted by the server the moment a goal completes.
export const DIRECTIVES = [
  {
    id: 'field_trial',
    title: 'Field Trial',
    text: 'Cull Mire Skitters in the Sporefield, west of the Sanctum.',
    goal: { kill: 'skitter', count: 3 },
    reward: { xp: 30, classItem: { symbiotech: 'sporeglass_focus', vanguard: 'servo_harness' } },
  },
  {
    id: 'calibrate',
    title: 'Calibrate',
    text: 'Open your Character [C] and equip a Device. Devices raise skills.',
    goal: { equip: 'device' },
    reward: { classItem: { symbiotech: 'myelin_lattice', vanguard: 'kinetic_capacitor' } },
  },
  {
    id: 'integrate',
    title: 'Integrate',
    text: 'Install an Implant. Implants demand skill — your Device supplies it.',
    goal: { equip: 'implant' },
    reward: { xp: 40 },
  },
  {
    id: 'relay',
    title: 'The Derelict Relay',
    text: 'Destroy Rogue Sentinels at the relay, east of the Sanctum. Step out of their Arc Pulse.',
    goal: { kill: 'sentinel', count: 2 },
    reward: { xp: 60, classItem: { symbiotech: 'glyph_shared_pulse', vanguard: 'glyph_resonant_aegis' } },
  },
  {
    id: 'listening_stone',
    title: 'An Inert Glyph',
    text: 'The glyph will not answer you. Something hums in a rock hollow far to the north-west — find it.',
    goal: { attune: 'resonance' },
    reward: { xp: 60 },
  },
  {
    id: 'inscribe',
    title: 'Inscribe',
    text: 'You are attuned. Inscribe the glyph in your Character [C] and feel what changes.',
    goal: { equip: 'glyph' },
    reward: { xp: 40 },
  },
  {
    id: 'warden',
    title: 'The Vault Warden',
    text: 'Defeat the Vault Warden in the monolith ring to the north. Bring an ally, or come prepared.',
    goal: { kill: 'warden', count: 1 },
    reward: { xp: 120, classItem: { symbiotech: 'glyph_carapace', vanguard: 'glyph_rending_echo' } },
  },
];

export const ARCHIVIST_LINES = [
  'The skitters breed faster than the bog can hold them. Thin them out.',
  'Devices lend you skill you have not earned yet. That is not cheating. That is engineering.',
  'An implant asks more of you than you have. Borrow the difference from your Device.',
  'The relay sentinels still guard a signal nobody is sending. Mind the ground when it glows.',
  'A glyph is a question. The Listening Stone, north-west past the ridge, teaches you to answer.',
  'One glyph slot. Choose what your power means today — you can choose again tomorrow.',
  'The Warden wakes for anyone who crosses the ring. It hits like a falling moon.',
  'You have walked the whole Reach. Keep experimenting — the combinations are yours to find.',
];
