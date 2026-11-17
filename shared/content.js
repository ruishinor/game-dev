// Content definitions: classes, abilities, enemies, items, directives.
// Data only. Rules live in shared/build.js (loadouts) and server/sim (combat).

import { ZONES } from './world.js';
import { GADGET_ITEMS, SENTINEL_GADGET_DROPS } from './gadgets.js';

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
    { id: 'aegis_keeper', name: 'Aegis Keeper', blurb: 'Compact field-protection specialist with an asymmetric projection array. Earn and inscribe Resonant Aegis to shield allies. Appearance only; Vanguard rules apply.' },
  ],
  symbiotech: [
    { id: 'conductor', name: 'Conductor Suit', blurb: 'Bio-lab field suit with a symbiote culture tank.' },
    { id: 'brine_surveyor', name: 'Brine Surveyor', blurb: 'Independent field technician with a sealed survey rig and insulated sampling equipment. Same abilities; different appearance.' },
  ],
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
      assist: { name: 'Harry', desc: 'Attacks your target. Its sting Corrodes: the target takes 12% more damage from everyone.' },
    },
  },
};

export const ENEMIES = {
  sinter_grazer: {
    name: 'Sinter Grazer',
    level: 1, hp: 85, speed: 3.1, radius: 0.62,
    neutral: true, aggro: 0, social: 0, leash: 19,
    attack: { range: 2.6, interval: 2000, dmg: 7, kind: 'melee' },
    xp: 0, respawn: 24000, loot: [],
  },
  quarantine_custodian: {
    name: 'Quarantine Custodian',
    level: 3, hp: 190, speed: 3.6, radius: 0.72,
    aggro: 7, social: 0, leash: 17,
    attack: { range: 3.0, interval: 2300, dmg: 12, kind: 'melee' },
    specials: [{ id: 'containment_sweep', name: 'Containment Sweep', cd: 10000, first: 3500, windup: 1900, radius: 4.7, dmg: 32, at: 'self' }],
    xp: 50, respawn: 38000, loot: [],
  },
  faultstalker: {
    name: 'Faultstalker',
    level: 2, hp: 148, speed: 4.3, radius: 0.85,
    aggro: 8, social: 0, leash: 24,
    attack: { range: 3.0, interval: 1900, dmg: 10, kind: 'melee' },
    specials: [{ id: 'fault_shear', name: 'Fault Shear', cd: 10500, first: 2800, windup: 1800, radius: 4.1, dmg: 28, at: 'target' }],
    xp: 46, respawn: 31000,
    loot: [{ item: 'sinter_laminate', chance: 0.45 }],
  },
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
    loot: [{ item: 'adrenal_shunt', chance: 0.35 }, ...SENTINEL_GADGET_DROPS],
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
// Routes are independent of combat RNG. Herd members share a circuit
// with offsets; there is no ambient loot farm.
// Different life stages have independent forage circuits. Their western and
// southern stations bring them within calling distance, then separate them.
const grazerCircuits = {
  juvenile: [[3,47],[4,53],[1,58],[2,65],[5,66],[6,58],[2,51]],
  adult: [[-1,47],[1,50],[3,56],[5,63],[7,67],[8,60],[7,51],[3,45]],
  shieldback: [[7,46],[9,51],[10,58],[7,64],[5,69],[3,61],[0,56],[0,50]],
};
const stalkerCircuit = [[17,58],[19,56],[18,51],[15,47],[11,46],[9,49],[10,57],[12,59],[18,60]];
const patrol = (type, circuit, dx = 0, dz = 0) => ({
  type, x: circuit[0][0] + dx, z: circuit[0][1] + dz,
  route: circuit.map(([x,z]) => ({ x: x + dx, z: z + dz })),
});
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
  { ...patrol('sinter_grazer', grazerCircuits.juvenile), form: 'juvenile' },
  { ...patrol('sinter_grazer', grazerCircuits.adult), form: 'adult' },
  { ...patrol('sinter_grazer', grazerCircuits.shieldback), form: 'shieldback' },
  patrol('faultstalker', stalkerCircuit),
  patrol('quarantine_custodian', [[-52,-8],[-54,-5.2],[-57,-5.2],[-57,-10.8],[-54,-10.8]]),
];

// Items. `skills` add to character skills; `mods` adjust derived stats;
// `req` must hold for the whole loadout while the item is equipped.
export const ITEMS = {
  ...GADGET_ITEMS,
  phase_damper: {
    name: 'Kestrel Phase Damper',
    slot: 'implant',
    req: { attune: 'resonance' },
    mods: { hpAdd: 30, dmgMul: 0.9 },
    desc: 'A stress-buffering neural laminate recovered from Kestrel Deep. +30 maximum health, -10% outgoing damage. Requires Resonance attunement.',
  },
  sinter_laminate: {
    name: 'Sinter Laminate',
    slot: 'device',
    skills: { kinetics: 1, biotech: 1 },
    mods: { hpAdd: 18 },
    desc: 'A mineral-biological composite obtained from predator plates or an isolated field collector. +1 Kinetics, +1 Biotech, +18 maximum health. Trades specialization for durability.',
  },
  sporeglass_focus: {
    name: 'Sporeglass Focus',
    slot: 'device',
    skills: { biotech: 3 },
    desc: 'A lens of living glass grown in the Sporefield. +3 Biotech.',
  },
  servo_harness: {
    name: 'Sentinel Servo Harness',
    slot: 'device',
    skills: { kinetics: 3 },
    desc: 'Salvaged actuators that amplify every motion. +3 Kinetics.',
  },
  wardstone_shard: {
    name: 'Wardstone Shard',
    slot: 'device',
    mods: { hpAdd: 35 },
    desc: 'A fragment of the Vault Warden, still humming. +35 maximum health.',
  },
  myelin_lattice: {
    name: 'Myelin Lattice',
    slot: 'implant',
    req: { skills: { biotech: 13 } },
    mods: { healMul: 1.3 },
    desc: 'Grown neural mesh. All healing you and your symbiote do is increased by 30%.',
  },
  kinetic_capacitor: {
    name: 'Kinetic Capacitor',
    slot: 'implant',
    req: { skills: { kinetics: 13 } },
    mods: { chargeMul: 1.5, dischargeRadius: 2 },
    desc: 'Sub-dermal capacitor bank. Charge generation +50%. Discharge reaches 2m further.',
  },
  adrenal_shunt: {
    name: 'Adrenal Shunt',
    slot: 'implant',
    mods: { dmgMul: 1.2, hpMul: 0.85 },
    desc: 'A crude sentinel-tech bypass. +20% damage dealt, but -15% maximum health.',
  },
  glyph_shared_pulse: {
    name: 'Glyph of Shared Pulse',
    slot: 'glyph',
    cls: 'symbiotech',
    req: { attune: 'resonance' },
    desc: 'Triage mends resonate: allies within 8m of the patient are also healed for 60%, or repair a damaged active Resonant Aegis instead (no extra duration).',
  },
  glyph_carapace: {
    name: 'Glyph of the Carapace',
    slot: 'glyph',
    cls: 'symbiotech',
    desc: 'Bond no longer regenerates. Instead the host takes 45% less damage and attackers in melee are stung for 6 and carry a Carapace Imprint for 4.5s. Rending Echo can redirect through that imprint.',
  },
  glyph_resonant_aegis: {
    name: 'Glyph of Resonant Aegis',
    slot: 'glyph',
    cls: 'vanguard',
    req: { attune: 'resonance' },
    desc: 'Discharge deals 40% less damage, but shields you and allies within reach for 60% of the Charge spent (8s). Shared Pulse can repair a partially depleted field instead of splash healing.',
  },
  glyph_rending_echo: {
    name: 'Glyph of Rending Echo',
    slot: 'glyph',
    cls: 'vanguard',
    desc: 'Rending Arc also strikes every other enemy within 4.5m of you for 70% damage. A Carapace-imprinted primary target relocates the echo to that target and consumes the imprint.',
  },
};

export const GLYPH = {
  sharedPulse: { radius: 8, pct: 0.6 },
  carapace: { dr: 0.45, reflect: 6, imprintMs: 4500 },
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
    text: 'Open your Build [C] and equip a Device. Devices raise skills.',
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
    text: 'You are attuned. Inscribe the glyph in your Build [C] and feel what changes.',
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
