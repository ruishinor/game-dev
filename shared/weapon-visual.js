import { activeWeapon, autoProfile } from './weapons.js';

// Public, allowlisted presentation only. Never expose private inventory,
// condition, stats or arbitrary asset paths. Melee attacks retain class art.
export function publicWeaponVisual(char) {
  return autoProfile(char)?.kind === 'bolt' && activeWeapon(char) === 'longpoint_emitter' ? 'longpoint' : null;
}
