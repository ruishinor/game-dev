// Content definitions: classes, abilities, enemies, items, directives.
// Data only. Rules live in shared/build.js (loadouts) and server/sim (combat).

import { ZONES } from './world.js';
import { GADGET_ITEMS } from './gadgets.js';

export const GCD_MS = 1000;
export const MAX_LEVEL = 5;
/** XP needed to advance from level L to L+1 (index L). */
export const XP_TO_NEXT = [0, 90, 200, 340, 520];

export const SKILL_NAMES = { kinetics: 'Kinetics', biotech: 'Biotech', instrumentation: 'Instrumentation' };
export const ATTUNEMENT_NAMES = { resonance: 'Resonance' };
export const SLOT_NAMES = { device: 'Device', implant: 'Implant', glyph: 'Glyph', weapon: 'Weapon', chest:'Chest' };
export const SLOTS = ['device', 'implant', 'glyph', 'weapon', 'chest'];

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
    skills: { kinetics: 10, biotech: 4, instrumentation: 4 },
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
    skills: { kinetics: 4, biotech: 10, instrumentation: 4 },
    primary: 'biotech',
    threatMul: 1,
    auto: { range: 26, interval: 2000, dmg: 5, kind: 'bolt' },
    abilities: ['neural_lash', 'mending_graft', 'spore_snare', 'overgrowth_surge'],
    companion: 'mender',
  },
  keeper: {
    id:'keeper', name:'Aegis Keeper', role:'Resonance / Barrier Architect',
    blurb:'Project a Hinge field, redirect stored protection into an offensive reversal, or share a lattice with nearby allies. No Charge conversion or companion.',
    baseHp:185,hpPerLevel:18,resource:{id:'coherence',name:'Coherence',max:100,start:80,regen:4,decay:0},
    skills:{kinetics:6,biotech:4,instrumentation:10},primary:'instrumentation',threatMul:1.25,
    auto:{range:22,interval:2000,dmg:6,kind:'bolt'},
    abilities:['phase_needle','hinge_field','resonant_reversal','lattice_relay','phase_transposition'],companion:null,
  },
  surveyor: {
    id: 'surveyor', name: 'Brine Surveyor', role: 'Field Engineer / Ranged Control',
    blurb: 'An independent field technician. Survey hostile structures, bore through their weak points, deploy a stationary power rig and trigger controlled demolition. No symbiote or healing magic.',
    baseHp: 175, hpPerLevel: 17,
    resource: { id: 'cells', name: 'Power Cells', max: 100, start: 60, regen: 0, decay: 0 },
    skills: { kinetics: 5, biotech: 3, instrumentation: 10 }, primary: 'instrumentation', threatMul: 1,
    auto: { range: 22, interval: 1800, dmg: 7, kind: 'bolt' },
    abilities: ['fault_scan', 'core_bore', 'field_rig', 'controlled_blast'], companion: null,
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
  symbiotech: [
    { id: 'conductor', name: 'Conductor Suit', blurb: 'Bio-lab field suit with a symbiote culture tank.' },
  ],
  keeper: [{id:'aegis_keeper',name:'Projection Array',blurb:'Asymmetric forearm projector and reserve cell; dedicated resonance discipline.'}],
  surveyor: [
    { id: 'brine_surveyor', name: 'Brine Field Rig', blurb: 'Sealed power cartridges, insulated sampling equipment and an independent field instrument.' },
  ],
};
export const defaultLook = (cls) => LOOKS[cls][0].id;
export const validLook = (cls, look) => typeof look === 'string' && Object.hasOwn(LOOKS, cls) && LOOKS[cls].some((l) => l.id === look);

// type: 'hostile' needs a living enemy target; 'friendly' uses a friendly
// player target or falls back to self; 'self' needs no target.
export const SURVEYOR = Object.freeze({ markMs: 9000, extendedMarkMs: 14000, rigMs: 12000, rechargeRadius: 4, rechargePerSecond: 8, blastRadius: 5, faultlineRadius: 7, remoteRange: 30 });

export const ABILITIES = {
  phase_needle:{name:'Phase Needle',type:'hostile',range:24,cd:2200,dmg:16,desc:'Project a focused resonance strike and recover 12 Coherence.'},
  hinge_field:{name:'Hinge Field',type:'friendly',range:20,cd:6000,cost:30,dur:9000,desc:'Project a 40-point damage-absorption barrier onto an ally or yourself for 9 seconds. It is not a solid wall. Cover blocks projection.'},
  resonant_reversal:{name:'Resonant Reversal',type:'hostile',range:22,cd:5000,cost:15,desc:'Consume your own remaining Hinge or Relay barrier. Inflict 12 plus 65% of its remaining capacity as damage.'},
  lattice_relay:{name:'Lattice Relay',type:'self',cd:12000,cost:40,radius:8,dur:8000,desc:'Project 24-point damage-absorption barriers onto yourself and unobstructed allies within 8m for 8s. Does not replace a stronger barrier.'},
  phase_transposition:{name:'Phase Transposition',type:'friendly',range:18,cd:8000,cost:10,desc:'Requires Resonance attunement. Transfer your own active Hinge or Relay barrier to an unshielded ally within 18m. Remaining capacity and expiry are preserved. Cover blocks transfer.'},
  fault_scan: { name: 'Fault Scan', type: 'hostile', range: 30, cd: 4000, desc: 'Analyze one hostile target for 9s and recover 30 Power Cells. Does not deal damage or engage auto-attack.' },
  core_bore: { name: 'Core Bore', type: 'hostile', range: 24, cd: 2500, cost: 30, dmg: 30, desc: 'Fire a focused boring pulse into your own scanned target. Consumes its scan and 30 Power Cells.' },
  field_rig: { name: 'Field Rig', type: 'self', cd: 16000, desc: 'Deploy a stationary power rig at your feet for 12s. Recover 8 Power Cells per second within 4m. Cannot deploy in the Sanctum.' },
  controlled_blast: { name: 'Controlled Blast', type: 'self', cd: 5000, cost: 25, dmg: 28, desc: 'Destroy your active rig from up to 30m away, damaging enemies within 5m of it. Costs 25 Power Cells; ends recharge.' },
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
    desc: 'Your symbiote erupts in a restorative bloom, healing you and party members within 10m of it.',
  },
};

export const validCompanionName = (name) =>
  typeof name === 'string' && /^[A-Za-z][A-Za-z '-]{1,16}[A-Za-z]$/.test(name) && !/[ '-]{2}/.test(name);

export const COMPANIONS = {
  survey_strider:{
    name:'Survey Strider',followDist:2.8,speed:8,leash:28,radius:.9,
    modes:{
      assist:{name:'Analyze target',desc:'Approaches your selected hostile target and applies a 6s analysis if you have no active scan. Transfers 15 Power Cells, but deals no damage. Cover and tether limit its reach.'},
      follow:{name:'Follow',desc:'Walks near you along clear ground routes without scanning.'},
      stay:{name:'Stay',desc:'Holds position; attempts to follow when you leave its tether. Cannot teleport through obstacles.'}
    }
  },
  mender: {
    name: 'Mender Symbiote',
    followDist: 2.4,
    speed: 11,
    leash: 45,
    triage: { interval: 2000, heal: 9, range: 7, seek: 28, threshold: 0.97 },
    guard: { regen: 5, dr: 0.2, range: 40 },
    assist: { interval: 1500, dmg: 4, range: 8, corrode: { dur: 4000, mul: 1.12 } },
    modes: {
      triage: { name: 'Triage', desc: 'Roams near you and mends you or the most injured party member in reach.' },
      guard: { name: 'Bond', desc: 'Bonds to you or your selected party member for steady regeneration and 20% less damage taken.' },
      assist: { name: 'Attack', desc: 'Attacks your target. Its sting makes the target take 12% more damage.' },
      follow: { name: 'Follow', desc: 'Stays near you without automatically attacking, healing or bonding.' },
      stay: { name: 'Stay', desc: 'Holds position without engaging. Returns to you if you move beyond its tether.' },
    },
  },
};

export const ENEMIES = {
  sinter_grazer: {
    name: 'Sinter Grazer',
    level: 1, hp: 85, speed: 3.1, radius: 0.62,
    neutral: true, aggro: 0, social: 0, leash: 19,
    attack: { range: 2.6, interval: 2000, dmg: 7, kind: 'melee' },
    xp: 0, respawn: 24000,
  },
  quarantine_custodian: {
    name: 'Quarantine Custodian',
    level: 3, hp: 190, speed: 3.6, radius: 0.72,
    aggro: 7, social: 0, leash: 17,
    attack: { range: 3.0, interval: 2300, dmg: 12, kind: 'melee' },
    specials: [{ id: 'containment_sweep', name: 'Containment Sweep', cd: 10000, first: 3500, windup: 1900, radius: 4.7, dmg: 32, at: 'self' }],
    xp: 50, respawn: 38000,
  },
  faultstalker: {
    name: 'Faultstalker',
    level: 2, hp: 148, speed: 4.3, radius: 0.85,
    aggro: 8, social: 0, leash: 24,
    attack: { range: 3.0, interval: 1900, dmg: 10, kind: 'melee' },
    specials: [{ id: 'fault_shear', name: 'Fault Shear', cd: 10500, first: 2800, windup: 1800, radius: 4.1, dmg: 28, at: 'target' }],
    xp: 46, respawn: 31000,
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
  field_chest:{name:'Field Composite Vest',slot:'chest',rarity:'Common',mods:{hpAdd:10},summary:'+10 maximum health',desc:'A fitted composite chest layer for field operations. Adds 10 maximum health; independent of your device and implant.'},
  reinforced_chest:{name:'Reinforced Relay Vest',slot:'chest',rarity:'Rare',mods:{hpAdd:18},summary:'+18 maximum health',desc:'A reinforced composite layer assembled from a field vest using recovered engineering knowledge.'},
  resonant_chest:{name:'Resonance-Lined Vest',slot:'chest',rarity:'Very rare',mods:{hpAdd:24},req:{attune:'resonance'},summary:'+24 maximum health',desc:'A resonance-lined composite layer. Requires Resonance; no active shield or damage immunity.'},
  field_emitter:{name:'Field Pulse Emitter',slot:'weapon',ql:1,repairable:true,autoBonus:2,summary:'QL 1 · +2 base auto-attack damage at full condition',desc:'A modest pulse-channeling weapon core for existing class attacks. Defeat wears its bonus; the quartermaster can restore it. At zero condition, your class still attacks normally.'},
  tuned_emitter:{name:'Tuned Pulse Emitter',slot:'weapon',ql:3,repairable:true,autoBonus:4,summary:'QL 3 · +4 base auto-attack damage at full condition',desc:'A reinforced field emitter rebuilt from a carried, unequipped Field Pulse Emitter and fabrication materials. Condition scales only its added auto-attack damage.'},
  dense_pulse_core:{name:'Dense Pulse Core',slot:'weapon',ql:5,repairable:true,autoBonus:6,req:{attune:'resonance',skills:{kinetics:13}},summary:'QL 5 · +6 base auto-attack damage at full condition',desc:'A reinforced kinetic pulse core built from a tuned emitter and machined couplers. Concentrates energy into higher damage without changing the class attack or its reach. Requires Resonance and Kinetics 13.'},
  longpoint_emitter:{name:'Longpoint Emitter',slot:'weapon',ql:5,repairable:true,autoBonus:2,autoReachBonus:4,req:{attune:'resonance',skills:{instrumentation:13}},summary:'QL 5 · +2 base auto-attack damage · +4m ranged auto-attack reach at full condition',desc:'An instrument-grade phase lens trades damage for precision at distance. Adds up to 4m reach to ranged auto-attacks only, scaled by condition; melee and ability ranges are unchanged. Requires Resonance and Instrumentation 13.'},
  keeper_prism:{name:'Hinge Projection Prism',slot:'device',cls:'keeper',skills:{instrumentation:3},summary:'+3 Instrumentation',desc:'A tuned field prism stabilizes the projection array.'},
  keeper_resonator:{name:'Lattice Resonator',slot:'implant',cls:'keeper',req:{skills:{instrumentation:13}},summary:'Hinge Glyph: enables Shared Pulse harmonic restoration',desc:'With the Hinge glyph installed, a Conductor’s Shared Pulse can refill your Hinge barriers to their original capacity.'},
  glyph_hinge:{name:'Glyph of Hinge',slot:'glyph',cls:'keeper',req:{attune:'resonance'},summary:'Hinge and Lattice Relay interact with Shared Pulse when Lattice Resonator is installed',desc:'The hinge receives compatible restorative resonance rather than rejecting it. Requires the Lattice Resonator for the harmonic effect.'},
  glyph_reversal:{name:'Glyph of Divide',slot:'glyph',cls:'keeper',summary:'Resonant Reversal retains 25% barrier capacity',desc:'Divide partitions the field before reversal, leaving a quarter of its remaining capacity.'},
  brine_phase_filter: { name:'Brine Phase Filter', slot:'device', summary:'+2 to all three skills', skills:{kinetics:2,biotech:2,instrumentation:2}, desc:'A passive receiver recovered from Brineworks. +2 Kinetics, Biotech and Instrumentation.' },
  brine_rescue_lattice: { name:'Shelter Rescue Lattice', slot:'implant', summary:'+25 maximum health · emergency 20-point barrier once per combat', mods:{hpAdd:25}, desc:'Below 35% health after a surviving hit, projects a 20-point barrier for 8 seconds, once per combat. +25 maximum health. Does not revive or replace stronger barriers.' },
  survey_calibrator: { name: 'Brine Calibrator', slot: 'device', cls: 'surveyor', skills: { instrumentation: 3 }, summary: '+3 Instrumentation · +6 percentage points of Power', desc: 'Calibrated field receiver. Raises Instrumentation by 3 and unlocks Surveyor equipment.' },
  survey_induction: { name: 'Induction Lattice', slot: 'implant', cls: 'surveyor', req: { skills: { instrumentation: 13 } }, mods: { dmgMul: 1.12 }, summary: '+12% damage', desc: 'Insulated pulse-shaping lattice. Increases damage by 12%.' },
  glyph_faultline: { name: 'Glyph of the Faultline', slot: 'glyph', cls: 'surveyor', req: { attune: 'resonance' }, summary: 'Controlled Blast: 7m radius', desc: 'Expands the demolition radius from 5m to 7m.' },
  glyph_wideband: { name: 'Glyph of Wideband', slot: 'glyph', cls: 'surveyor', summary: 'Fault Scan: 14s analysis', desc: 'Keeps a target analysis active for 14 seconds instead of 9.' },
  ...GADGET_ITEMS,
  phase_damper: {
    name: 'Kestrel Phase Damper',
    slot: 'implant',
    req: { attune: 'resonance' },
    mods: { hpAdd: 30, dmgMul: 0.9 },
    desc: 'A stress-buffering neural laminate recovered from Kestrel Deep. +30 maximum health, -10% outgoing damage. Requires Resonance attunement.',
  },
  sinter_laminate: {rarity:'Common',
    name: 'Sinter Laminate',
    slot: 'device',
    skills: { kinetics: 1, biotech: 1 },
    mods: { hpAdd: 18 },
    desc: 'A mineral-biological composite obtained from predator plates or an isolated field collector. +1 Kinetics, +1 Biotech, +18 maximum health. Trades specialization for durability.',
  },
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
  wardstone_shard: {rarity:'Rare',
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
  adrenal_shunt: {rarity:'Uncommon',
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
    desc: 'Triage mends resonate: allies within 8m of the patient are also healed for 60%, or repair a damaged active Resonant Aegis instead (no extra duration).',
  },
  glyph_carapace: {
    summary: "Bond: 45% damage reduction · 6 melee retaliation · no regeneration",
    name: 'Glyph of the Carapace',
    slot: 'glyph',
    cls: 'symbiotech',
    desc: 'Bond no longer regenerates. Instead the host takes 45% less damage and attackers in melee are stung for 6 and carry a Carapace Imprint for 4.5s. Rending Echo can redirect through that imprint.',
  },
  glyph_resonant_aegis: {
    summary: "Discharge: −40% damage · shield for 60% of Charge spent (8s)",
    name: 'Glyph of Resonant Aegis',
    slot: 'glyph',
    cls: 'vanguard',
    req: { attune: 'resonance' },
    desc: 'Discharge deals 40% less damage, but shields you and allies within reach for 60% of the Charge spent (8s). Shared Pulse can repair a partially depleted field instead of splash healing.',
  },
  glyph_rending_echo: {
    summary: "Rending Arc: 70% splash damage within 4.5m",
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
    reward: { xp: 30, classItem: { symbiotech: 'sporeglass_focus', vanguard: 'servo_harness', surveyor: 'survey_calibrator', keeper:'keeper_prism' } },
  },
  {
    id: 'calibrate',
    title: 'Calibrate',
    text: 'Open your Character [C] and equip a Device. Devices raise skills.',
    goal: { equip: 'device' },
    reward: { classItem: { symbiotech: 'myelin_lattice', vanguard: 'kinetic_capacitor', surveyor: 'survey_induction', keeper:'keeper_resonator' } },
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
    reward: { xp: 60, classItem: { symbiotech: 'glyph_shared_pulse', vanguard: 'glyph_resonant_aegis', surveyor: 'glyph_faultline', keeper:'glyph_hinge' } },
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
    reward: { xp: 120, classItem: { symbiotech: 'glyph_carapace', vanguard: 'glyph_rending_echo', surveyor: 'glyph_wideband', keeper:'glyph_reversal' } },
  },
];

// Surveyors commission instruments rather than starting with a kill quota.
export function directiveFor(cls, step) {
  const base = DIRECTIVES[step];
  if (!base) return base;
  if (cls==='keeper') {
    if (step===0) return {...base,title:'Phase Calibration',text:'Land two Phase Needle strikes [1]. Hinge Field [2] creates protection; Reversal [3] spends it. Relay [4] projects barriers nearby.',goal:{ability:'phase_needle',count:2}};
    if (step===1) return {...base,title:'Tune the Prism',text:'Install your Hinge Projection Prism in the Device slot.'};
    if (step===2) return {...base,title:'Install the Resonator',text:'Install the Lattice Resonator (Instrumentation 13).'};
    return base;
  }
  if (cls !== 'surveyor') return base;
  if (step === 0) return { ...base, title: 'Instrument Commissioning', text: 'Analyze hostile targets with Fault Scan [1], then land two Core Bores [2]. Field Rig [3] restores cells; Controlled Blast [4] consumes the rig.', goal: { ability: 'core_bore', count: 2 } };
  if (step === 1) return { ...base, title: 'Calibrate the Receiver', text: 'Equip your Brine Calibrator in the Device slot to raise Instrumentation.' };
  if (step === 2) return { ...base, title: 'Induction Integration', text: 'Install the Induction Lattice. It requires Instrumentation 13.' };
  return base;
}

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
