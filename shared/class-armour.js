// Rare class armour collection: blueprint and fabrication metadata for the 16
// pieces of the four class sets (ARMOR_SETS in content.js). Public
// presentation only — the named blueprint source is shown in the Codex and
// the Workshop; drop probabilities live server-side (server/sim/loot-tables.js).
// Existing materials only; skill 13 in the class's primary discipline skill.
import { ARMOR_SET_SLOTS } from './armor-set-bonuses.js';

const ROWS = {
  vanguard: { discipline: 'Engineering', skill: 'kinetics', inputs: {
    chest: { sentinel_alloy: 4, mire_fibre: 2, kinetic_coupler: 1, resonance_fragment: 1 },
    gloves: { sentinel_alloy: 2, mire_fibre: 1, kinetic_coupler: 1 },
    greaves: { sentinel_alloy: 3, mire_fibre: 2, kinetic_coupler: 1 },
    boots: { sentinel_alloy: 2, mire_fibre: 2, kinetic_coupler: 1 } },
    sources: { chest: 'Vault Warden', gloves: 'Rogue Sentinel', greaves: 'Turret Drone', boots: 'Faultstalker' } },
  symbiotech: { discipline: 'Research', skill: 'biotech', inputs: {
    chest: { mire_fibre: 4, culture_matrix: 1, sentinel_alloy: 2, resonance_fragment: 1 },
    gloves: { mire_fibre: 2, culture_matrix: 1, sentinel_alloy: 1 },
    greaves: { mire_fibre: 3, culture_matrix: 1, sentinel_alloy: 2 },
    boots: { mire_fibre: 2, culture_matrix: 1, sentinel_alloy: 1 } },
    sources: { chest: 'Mire Skitter', gloves: 'Rogue Sentinel', greaves: 'Vault Warden', boots: 'Brineworks Research Cache' } },
  keeper: { discipline: 'Engineering', skill: 'instrumentation', inputs: {
    chest: { sentinel_alloy: 4, mire_fibre: 2, resonance_fragment: 1 },
    gloves: { sentinel_alloy: 3, mire_fibre: 2 },
    greaves: { sentinel_alloy: 3, mire_fibre: 3 },
    boots: { sentinel_alloy: 2, mire_fibre: 2 } },
    sources: { chest: 'Quarantine Custodian', gloves: 'Vault Warden', greaves: 'Resonance Echo', boots: 'Phase Scar Archive' } },
  surveyor: { discipline: 'Engineering', skill: 'instrumentation', inputs: {
    chest: { sentinel_alloy: 4, mire_fibre: 3, resonance_fragment: 1 },
    gloves: { sentinel_alloy: 2, mire_fibre: 3 },
    greaves: { sentinel_alloy: 3, mire_fibre: 2 },
    boots: { sentinel_alloy: 2, mire_fibre: 3 } },
    sources: { chest: 'Faultstalker', gloves: 'Turret Drone', greaves: 'Sinter Grazer', boots: 'Brineworks Engineering Cache' } },
};

// Named archive sources use existing interactable sites, not random corpse
// rolls. Each is a one-time, class-specific grant of retained knowledge.
// Exact eligibility is validated by the authoritative server.
export const CLASS_ARMOUR_ARCHIVES = Object.freeze({
  'Brineworks Research Cache': Object.freeze({cls:'symbiotech', slot:'boots', objectType:'brine_research', level:8, hint:'A · Research Station after Brineworks commissioning'}),
  'Resonance Echo': Object.freeze({cls:'keeper', slot:'greaves', objectType:'obelisk', level:8, hint:'The Listening Stone after Resonance attunement'}),
  'Phase Scar Archive': Object.freeze({cls:'keeper', slot:'boots', objectType:'rift_regulator', level:8, hint:'Counterphase Regulator after Phase Scar calibration'}),
  'Brineworks Engineering Cache': Object.freeze({cls:'surveyor', slot:'boots', objectType:'brine_engineering', level:8, hint:'B · Engineering Station after Brineworks commissioning'}),
});
// All sixteen blueprint sources now have a gameplay acquisition route.
export const PENDING_SOURCES = Object.freeze([]);

export const classArmourItem = (cls, slot) => `${cls}_field_set_${slot}`;
export const classArmourBlueprint = (cls, slot) => `blueprint_${cls}_field_set_${slot}`;

/** names: item id -> display name (passed in to keep this module data-only). */
export function classArmourGoods(names) {
  const out = {};
  for (const [cls, row] of Object.entries(ROWS)) for (const slot of ARMOR_SET_SLOTS) {
    const source = row.sources[slot];
    const pending = PENDING_SOURCES.includes(source);
    const archive = CLASS_ARMOUR_ARCHIVES[source];
    out[classArmourBlueprint(cls, slot)] = Object.freeze({
      name: 'Blueprint: ' + names[classArmourItem(cls, slot)], category: 'blueprint', rarity: 'Rare', cap: 1,
      cls, item: classArmourItem(cls, slot), source, pending,
      desc: `Retained ${row.discipline.toLowerCase()} knowledge for a class armour piece. Recovered from: ${source}${archive ? ' (' + archive.hint + ')' : ''}${pending ? ' (not yet in the field)' : ''}. It cannot be traded or consumed.`,
    });
  }
  return out;
}

export function classArmourRecipes(names) {
  const out = {};
  for (const [cls, row] of Object.entries(ROWS)) for (const slot of ARMOR_SET_SLOTS) {
    const item = classArmourItem(cls, slot);
    out['fabricate_' + item] = Object.freeze({
      name: 'Fabricate ' + names[item], discipline: row.discipline, cls, blueprint: classArmourBlueprint(cls, slot),
      requires: { [row.skill]: 13 }, inputs: { ...row.inputs[slot] }, output: { item },
    });
  }
  return out;
}

export const CLASS_ARMOUR_SOURCES = Object.freeze(Object.fromEntries(Object.entries(ROWS).map(([cls, r]) => [cls, Object.freeze({ ...r.sources })])));
