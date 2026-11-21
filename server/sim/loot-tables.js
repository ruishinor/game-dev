// Server-only reward definitions. Equipment is never a guaranteed corpse award.
// Do not import this module from browser-served code.
const freezeDrops = drops => Object.freeze(drops.map(d => Object.freeze(d)));
export const ENEMY_ITEM_DROPS = Object.freeze({
  sinter_grazer: freezeDrops([]),
  quarantine_custodian: freezeDrops([]),
  faultstalker: freezeDrops([{ item: 'sinter_laminate', chance: 0.45 }]),
  skitter: freezeDrops([]),
  sentinel: freezeDrops([
    { item: 'adrenal_shunt', chance: 0.35 },
    { item: 'field_vector_array', chance: 0.30 },
    { item: 'conductive_membrane', chance: 0.40 },
  ]),
  turret_drone: freezeDrops([
    { item: 'field_vector_array', chance: 0.36 },
    { item: 'conductive_membrane', chance: 0.42 },
  ]),
  warden: freezeDrops([{ item: 'wardstone_shard', chance: 0.12 }]),
  // No item drops decided yet for the Severance squads (owner decision).
  severance_soldier: freezeDrops([]),
});
export const SALVAGE = Object.freeze({skitter:'mire_fibre',sentinel:'sentinel_alloy',turret_drone:'sentinel_alloy',warden:'resonance_fragment'});
// Generic playtest salvage; deliberately independent of equipment RNG.
export const TRADE_SALVAGE = Object.freeze({skitter:'mire_husk',sentinel:'spent_contact',turret_drone:'spent_contact'});
// Public playtest tuning: a small fixed salvage credit alongside trade goods.
// No extra random roll or change to the existing equipment distribution.
export const creditDrop=type=>type==='sentinel'||type==='turret_drone'?1:0;
export function itemDrops(type) {
  return Object.hasOwn(ENEMY_ITEM_DROPS,type) ? ENEMY_ITEM_DROPS[type] : [];
}

// One independent exclusive archival-relic roll per eligible Vault Warden
// recipient. Playtest probabilities are not part of browser presentation.
// Never draw from or advance the existing gear/simulation RNG sequence.
export function relicDrop(type,rng){
 if(type!=='warden')return null;
 const n=rng();if(!Number.isFinite(n)||n<0||n>=1)return null;
 return n<.005?'vault_witness_seal':n<.08?'vault_memory_foil':null;
}

// Independent blueprint rolls do not advance the equipment or relic RNG.
export function blueprintDrop(type,rng){
 if(type!=='sentinel'&&type!=='warden')return null;
 const n=rng();if(!Number.isFinite(n)||n<0||n>=1)return null;
 return type==='sentinel'?(n<.04?'blueprint_relay_vest':null):(n<.008?'blueprint_resonant_vest':null);
}

// Rare class armour blueprints (shared/class-armour.js). One independent roll
// per eligible recipient and corpse, only for the recipient's own class and
// only while that blueprint is unknown; never a finished piece. Sources that
// are not yet in the world (caches, archive, echo) have no entry here.
export const CLASS_ARMOUR_BLUEPRINT_CHANCE = 0.03;
export const CLASS_ARMOUR_DROPS = Object.freeze({
  warden: Object.freeze({ vanguard: 'chest', symbiotech: 'greaves', keeper: 'gloves' }),
  sentinel: Object.freeze({ vanguard: 'gloves', symbiotech: 'gloves' }),
  turret_drone: Object.freeze({ vanguard: 'greaves', surveyor: 'gloves' }),
  faultstalker: Object.freeze({ vanguard: 'boots', surveyor: 'chest' }),
  skitter: Object.freeze({ symbiotech: 'chest' }),
  quarantine_custodian: Object.freeze({ keeper: 'chest' }),
  sinter_grazer: Object.freeze({ surveyor: 'greaves' }),
});
export function classArmourBlueprintDrop(type, char, rng) {
  const slot = Object.hasOwn(CLASS_ARMOUR_DROPS, type) && typeof char?.cls === 'string' && Object.hasOwn(CLASS_ARMOUR_DROPS[type], char.cls) ? CLASS_ARMOUR_DROPS[type][char.cls] : null;
  if (!slot) return null;
  const id = `blueprint_${char.cls}_field_set_${slot}`;
  if ((char.goods?.[id] || 0) >= 1) return null;
  const n = rng();
  return Number.isFinite(n) && n >= 0 && n < CLASS_ARMOUR_BLUEPRINT_CHANCE ? id : null;
}
