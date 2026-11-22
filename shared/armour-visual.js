import { ITEMS } from './content.js';

// Armour items that have a finished, body-fitted 3D model (tools/asset-pipeline
// route "body-fitted-armour", docs/art/ARMOUR-3D.md), and the pipeline asset
// that carries each one. Presentation only.
export const ARMOUR_ASSETS = Object.freeze({
  field_chest: 'armour_chest',
  reinforced_chest: 'armour_chest',
  resonant_chest: 'armour_chest',
  // Cinderlock Regalia, the Kinetic Vanguard set (SYS-01 ids; live once the
  // class sets ship)
  vanguard_field_set_chest: 'armour_vanguard_set',
  vanguard_field_set_gloves: 'armour_vanguard_set',
  vanguard_field_set_greaves: 'armour_vanguard_set',
  vanguard_field_set_boots: 'armour_vanguard_set',
  // Vesperglass Array (Aegis Keeper), Strataweave Fieldkit (Brine Surveyor)
  // and Mycelial Accord (Symbiotech Conductor)
  ...Object.fromEntries(['keeper', 'surveyor', 'symbiotech'].flatMap((fam) =>
    ['chest', 'gloves', 'greaves', 'boots'].map((slot) => [`${fam}_field_set_${slot}`, `armour_${fam}_set`]))),
});
export const ARMOUR_VISUALS = Object.freeze(Object.keys(ARMOUR_ASSETS));
/** The full Cinderlock set, as the Severance squads wear it (presentation only). */
export const CINDERLOCK_FULL = Object.freeze({ chest: 'vanguard_field_set_chest', gloves: 'vanguard_field_set_gloves', greaves: 'vanguard_field_set_greaves', boots: 'vanguard_field_set_boots' });
export const ARMOUR_SLOTS = Object.freeze(['chest', 'gloves', 'greaves', 'boots']);

// Public, allowlisted presentation only: for each armour slot, the id of the
// piece that is equipped *and* owned and has a 3D model, otherwise nothing.
// Returns null when nothing is worn. Never exposes inventory, condition,
// stats or arbitrary asset paths; the server derives it from its own
// authoritative loadout (a client cannot set it).
export function publicArmourVisual(char) {
  const out = {};
  for (const slot of ARMOUR_SLOTS) {
    const id = char?.equipped?.[slot];
    if (typeof id === 'string' && Object.hasOwn(ARMOUR_ASSETS, id) && ITEMS[id]?.slot === slot
      && Array.isArray(char.inventory) && char.inventory.includes(id)) out[slot] = id;
  }
  return Object.keys(out).length ? out : null;
}

// Stable comparison for metadata invalidation.
export function sameArmourVisual(a, b) {
  return ARMOUR_SLOTS.every((s) => (a?.[s] || null) === (b?.[s] || null));
}
