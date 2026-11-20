// Weapon slots and the active weapon mode. Shared so the client can explain
// availability and project reach; only the server's state is applied.
//
// Every class has two attack modes: melee (`weapon` slot) and ranged
// (`ranged` slot). A class's own attack is its primary mode; the other mode
// is a provisional off-mode profile (CLASSES[cls].meleeAuto / rangedAuto).
// A weapon in the slot of the active mode adds its bonus, reach, condition
// wear and visuals; the other slot's weapon is carried stowed. The selection
// is persisted as `char.activeWeapon` ('weapon' | 'ranged').
import { CLASSES, ITEMS } from './content.js';

export const WEAPON_SLOTS = Object.freeze(['weapon', 'ranged']);
export const isWeaponSlot = (slot) => slot === 'weapon' || slot === 'ranged';

// Switching is off the global cooldown but has its own short recovery, and it
// can only ever delay (never advance) the next auto-attack.
export const WEAPON_SWITCH = Object.freeze({ cooldownMs: 500, autoDelayMs: 400 });

/** The owned, correctly slotted item in `slot`, or null. */
export function equippedWeapon(char, slot) {
  if (!isWeaponSlot(slot)) return null;
  const id = char?.equipped?.[slot];
  return typeof id === 'string' && Object.hasOwn(ITEMS, id) && ITEMS[id].slot === slot &&
    Array.isArray(char.inventory) && char.inventory.includes(id) ? id : null;
}

/** The class's primary mode: the slot matching its own attack kind. */
export function primaryWeaponSlot(cls) {
  return CLASSES[cls]?.auto?.kind === 'bolt' ? 'ranged' : 'weapon';
}

/**
 * The mode in use. An explicit selection always wins (an empty slot means the
 * class's innate attack for that mode). Without one, an equipped weapon is
 * never ignored: a single equipped weapon decides the mode (this also covers
 * legacy saves for every class); otherwise the class's primary mode.
 */
export function activeWeaponSlot(char) {
  if (char?.activeWeapon === 'ranged' || char?.activeWeapon === 'weapon') return char.activeWeapon;
  const main = equippedWeapon(char, 'weapon'), ranged = equippedWeapon(char, 'ranged');
  if (main && !ranged) return 'weapon';
  if (ranged && !main) return 'ranged';
  return primaryWeaponSlot(char?.cls);
}

/** The weapon item in use, or null for the innate attack of the active mode. */
export function activeWeapon(char) {
  return equippedWeapon(char, activeWeaponSlot(char));
}

/** Auto-attack profile of a class in a mode: {range, interval, dmg, kind}. */
export function profileFor(cls, slot) {
  const def = CLASSES[cls];
  if (!def) return null;
  const want = slot === 'ranged' ? 'bolt' : 'melee';
  if (def.auto.kind === want) return def.auto;
  return (want === 'bolt' ? def.rangedAuto : def.meleeAuto) ?? def.auto;
}

/** Auto-attack profile for the active mode. */
export function autoProfile(char) {
  return profileFor(char?.cls, activeWeaponSlot(char));
}

/** Every class can switch between its melee and ranged modes. */
export function canSwitchWeapons(char) {
  return !!CLASSES[char?.cls];
}

/** True while the Electrical Combat Rod is equipped and in the active mode. */
export function electricalRodActive(char) {
  return activeWeapon(char) === 'electrical_combat_rod';
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
