import { ITEMS } from './content.js';

// Chest items that have a finished, body-fitted 3D model (tools/asset-pipeline
// route "body-fitted-armour", docs/art/ARMOUR-3D.md). Presentation only.
export const ARMOUR_VISUALS = Object.freeze(['field_chest', 'reinforced_chest', 'resonant_chest']);

// Public, allowlisted presentation only: the id of the worn chest piece when
// it is equipped *and* owned, otherwise null. Never exposes inventory,
// condition, stats or arbitrary asset paths; the server derives it from its
// own authoritative loadout (a client cannot set it).
export function publicArmourVisual(char) {
  const id = char?.equipped?.chest;
  return typeof id === 'string' && ARMOUR_VISUALS.includes(id) && ITEMS[id]?.slot === 'chest'
    && Array.isArray(char.inventory) && char.inventory.includes(id) ? id : null;
}
