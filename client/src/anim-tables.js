// Which animation clip plays for what. Pure data (no imports) so the asset test
// can check, in plain Node, that every clip named here exists in the built
// bundles — see test/assets.test.js.

/** Humanoid base states and reactions. */
export const HUMANOID_BASE = {
  idle: 'Idle_Loop',
  walk: 'Walk_Loop',
  jog: 'Jog_Fwd_Loop',
  run: 'Sprint_Loop',
  air: 'Jump_Loop',
  death: 'Death01',
  hit: 'Hit_Chest',
  npcIdle: 'Idle_FoldArms_Loop',
};

// Ability / event id -> clip. `start` skips the wind-up so the visible impact
// lands close to the moment the server resolved the hit.
export const HUMANOID_ACTIONS = {
  phase_needle:{clip:'Spell_Simple_Shoot',timeScale:1.1},
  hinge_field:{clip:'Spell_Simple_Enter',fadeOut:.4},
  resonant_reversal:{clip:'Idle_Shield_Break',start:.1},
  lattice_relay:{clip:'Shield_OneShot',start:.1},
  fault_scan: { clip: 'Interact', fadeOut: 0.3 },
  core_bore: { clip: 'Spell_Simple_Shoot', timeScale: 1.2 },
  field_rig: { clip: 'Interact', fadeOut: 0.3 },
  controlled_blast: { clip: 'Shield_OneShot', start: 0.1 },
  auto: { clip: 'Punch_Jab', start: 0.2, timeScale: 1.3 },
  rending_arc: { clip: 'Punch_Cross', start: 0.18, timeScale: 1.15 },
  rending_echo: { clip: 'Punch_Cross', start: 0.18, timeScale: 1.15 },
  graviton_tether: { clip: 'Shield_OneShot', start: 0.1, timeScale: 1.1 },
  kinetic_ward: { clip: 'Sword_Block', start: 0.08, fadeOut: 0.3 },
  discharge: { clip: 'Idle_Shield_Break', start: 0.1, timeScale: 1.1 },
  aegis: { clip: 'Idle_Shield_Break', start: 0.1, timeScale: 1.1 },
  neural_lash: { clip: 'Spell_Simple_Shoot', timeScale: 1.1 },
  bolt: { clip: 'Spell_Simple_Shoot', timeScale: 1.2 },
  mending_graft: { clip: 'Spell_Simple_Enter', fadeOut: 0.45 },
  spore_snare: { clip: 'OverhandThrow', start: 0.35, timeScale: 1.3 },
  overgrowth_surge: { clip: 'Idle_Shield_Break', start: 0.1 },
  surge: { clip: 'Idle_Shield_Break', start: 0.1 },
  interact: { clip: 'Interact', fadeOut: 0.3 },
  attune: { clip: 'Interact', fadeOut: 0.3 },
};

/** Creature models: bundle piece, size and clips per entity type. */
export const CREATURES = {
  // Mire Skitter: a four-legged bog scavenger, half grown and half salvaged.
  skitter: {
    piece: 'skitter',
    scale: 0.74,
    height: 1.15,
    radius: 0.7,
    // Pale chitin, so it stands out against the violet growth it lives in.
    tint: 0xf0e2cc,
    emissive: 0x1c0a22,
    clips: { idle: 'Idle', walk: 'Walk', run: 'Run', attack: 'Attack', hit: 'Hit', death: 'TurnOff', cast: 'Charge' },
    runAbove: 3,
    walkRate: 1.6,
    runRate: 4.2,
    sacs: 0xff7ae6,
  },
  // Rogue Sentinel: a derelict tripod walker still running its patrol.
  sentinel: {
    piece: 'walker',
    scale: 0.82,
    height: 2.1,
    radius: 0.8,
    tint: 0xd8d2cc,
    emissive: 0x1a0705,
    clips: { idle: 'Idle', walk: 'Walk', run: 'Run', attack: 'AttackAuto', hit: 'Hit', death: 'TurnOff', cast: 'Attack' },
    runAbove: 3.2,
    walkRate: 1.8,
    runRate: 4.4,
    eye: 0xff5a4a,
  },
  // Vault Warden: the same machine lineage, far larger and rune-charged.
  warden: {
    piece: 'walker',
    scale: 1.62,
    height: 4.0,
    radius: 1.6,
    tint: 0xa79ad6,
    emissive: 0x160a2e,
    clips: { idle: 'Idle', walk: 'Walk', run: 'Run', attack: 'AttackAuto', hit: 'Hit', death: 'TurnOff', cast: 'Attack' },
    runAbove: 2.6,
    walkRate: 2.6,
    runRate: 5,
    eye: 0xb48cff,
    shards: true,
  },
};

/** Mender Symbiote (the `drone` piece). */
export const MENDER_CLIPS = { idle: 'Idle', mend: 'Charging', dormant: 'Look', attack: 'Attack', order: 'BackFlip' };
