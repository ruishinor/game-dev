// Weapon slots and the active-weapon selection. Shared so the client can
// explain availability and project reach; only the server's state is applied.
//
// Two weapon slots exist: `weapon` (main/melee, e.g. the Electrical Combat Rod)
// and `ranged` (pulse emitters). Both may be equipped at once. Exactly one is
// active: its bonus, reach, condition wear and attack kind are used. The
// selection is persisted as `char.activeWeapon` ('weapon' | 'ranged').
import { CLASSES, ITEMS } from './content.js';

export const WEAPON_SLOTS = Object.freeze(['weapon', 'ranged']);
export const isWeaponSlot = (slot) => slot === 'weapon' || slot === 'ranged';

// Switching is off the global cooldown but has its own recovery, and it can
// only ever delay (never advance) the next auto-attack.
export const WEAPON_SWITCH = Object.freeze({ cooldownMs: 1000, autoDelayMs: 750 });

/** The owned, correctly slotted item in `slot`, or null. */
export function equippedWeapon(char, slot) {
  if (!isWeaponSlot(slot)) return null;
  const id = char?.equipped?.[slot];
  return typeof id === 'string' && Object.hasOwn(ITEMS, id) && ITEMS[id].slot === slot &&
    Array.isArray(char.inventory) && char.inventory.includes(id) ? id : null;
}

/** Slot the character prefers when both are filled (melee classes start on their main weapon). */
export function selectedWeaponSlot(char) {
  if (char?.activeWeapon === 'ranged' || char?.activeWeapon === 'weapon') return char.activeWeapon;
  return CLASSES[char?.cls]?.auto?.kind === 'bolt' ? 'ranged' : 'weapon';
}

/**
 * The slot actually in use. An empty selection falls back to the other filled
 * slot, so an equipped weapon is never silently ignored; null means unarmed
 * (the class's own attack with no weapon bonus).
 */
export function activeWeaponSlot(char) {
  const selected = selectedWeaponSlot(char);
  if (equippedWeapon(char, selected)) return selected;
  const other = selected === 'ranged' ? 'weapon' : 'ranged';
  return equippedWeapon(char, other) ? other : null;
}

export function activeWeapon(char) {
  const slot = activeWeaponSlot(char);
  return slot ? equippedWeapon(char, slot) : null;
}

/** Auto-attack profile for the active weapon: {range, interval, dmg, kind}. */
export function autoProfile(char) {
  const def = CLASSES[char?.cls];
  if (!def) return null;
  if (activeWeaponSlot(char) === 'ranged' && def.auto.kind !== 'bolt' && def.rangedAuto) return def.rangedAuto;
  return def.auto;
}

/** True when both slots hold a weapon, so there is something to switch between. */
export function canSwitchWeapons(char) {
  return !!(equippedWeapon(char, 'weapon') && equippedWeapon(char, 'ranged'));
}

/** True while the Electrical Combat Rod is equipped and is the active weapon. */
export function electricalRodActive(char) {
  return char?.cls === 'vanguard' && activeWeapon(char) === 'electrical_combat_rod';
}

/** Persisted selection from untrusted save data. */
export function sanitizeActiveWeapon(raw) {
  return raw === 'ranged' || raw === 'weapon' ? raw : undefined;
}

/**
 * Legacy saves kept pulse emitters in the single `weapon` slot. Move such an
 * item to the ranged slot (unless that is already filled). Deterministic and
 * idempotent; returns a new equipped map.
 */
export function migrateWeaponSlots(equipped) {
  const out = { ...equipped };
  const id = out.weapon;
  if (typeof id === 'string' && Object.hasOwn(ITEMS, id) && ITEMS[id].slot === 'ranged') {
    if (!out.ranged) out.ranged = id;
    out.weapon = null;
  }
  return out;
}
