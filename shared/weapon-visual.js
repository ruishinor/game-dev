// Public weapon appearance: only an allowlisted visual key leaves the server.
// 'longpoint' = rifle in hand (ranged mode active); 'longpoint-stowed' = rifle
// carried on the back while the melee mode is active. No inventory, condition
// or selection state is disclosed beyond what the character visibly carries.
import { activeWeapon, autoProfile, equippedWeapon } from './weapons.js';

export function publicWeaponVisual(char) {
  if (activeWeapon(char) === 'longpoint_emitter' && autoProfile(char)?.kind === 'bolt') return 'longpoint';
  if (equippedWeapon(char, 'ranged') === 'longpoint_emitter') return 'longpoint-stowed';
  return null;
}
