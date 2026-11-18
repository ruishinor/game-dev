// Server-only reward definitions. Existing calibrated rolls are preserved.
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
  warden: freezeDrops([{ item: 'wardstone_shard', chance: 1 }]),
});
export const SALVAGE = Object.freeze({skitter:'mire_fibre',sentinel:'sentinel_alloy',warden:'resonance_fragment'});
// Generic playtest salvage; deliberately independent of equipment RNG.
export const TRADE_SALVAGE = Object.freeze({skitter:'mire_husk',sentinel:'spent_contact'});
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
