import { CLASSES } from './content.js';

// Public, allowlisted presentation only. Never expose private inventory,
// condition, stats or arbitrary asset paths. Melee attacks retain class art.
export function publicWeaponVisual(char) {
  return CLASSES[char?.cls]?.auto?.kind === 'bolt' && char.equipped?.weapon === 'longpoint_emitter' && Array.isArray(char.inventory) && char.inventory.includes('longpoint_emitter') ? 'longpoint' : null;
}
