// Loadout rules: derived stats and equip validation. Shared so the client can
// explain requirements, but only the server's result is ever applied.

import { CLASSES, ITEMS, ARMOR_SETS, SLOTS, SKILL_NAMES, ATTUNEMENT_NAMES } from './content.js';
import { armorSetBonuses } from './armor-set-bonuses.js';

/** Effective skills for a class/level with a given equipped loadout. */
export function computeSkills(cls, level, equipped, options = {}) {
  const def = CLASSES[cls];
  const skills = { ...def.skills };
  skills[def.primary] += level - 1;
  const bonus = options.attributeBonus ?? 0;
  for (const key of Object.keys(SKILL_NAMES)) skills[key] += bonus;
  for (const slot of SLOTS) {
    const item = ITEMS[equipped[slot]];
    if (item && item.skills) {
      for (const k of Object.keys(item.skills)) skills[k] = (skills[k] || 0) + item.skills[k];
    }
  }
  return skills;
}

/**
 * Derive combat stats from persistent character state.
 * `char` needs {cls, level, equipped}.
 */
export function deriveStats(char, options = {}) {
  const def = CLASSES[char.cls];
  const hasSetPiece = SLOTS.some(slot => ITEMS[char.equipped[slot]]?.setId);
  const equipped = hasSetPiece ? resolveLoadout(char, char.equipped, options).equipped : char.equipped;
  const skills = computeSkills(char.cls, char.level, equipped, options);
  const mods = { healMul: 1, dmgMul: 1, hpMul: 1, hpAdd: 0, chargeMul: 1, dischargeRadius: 0, shieldMul: 1, barrierMul: 1, graftTicks: 0, relayRadius: 0, scanMs: 0, blastRadius: 0 };
  for (const slot of SLOTS) {
    const item = ITEMS[equipped[slot]];
    if (!item || !item.mods) continue;
    for (const k of Object.keys(item.mods)) {
      if (k.endsWith('Mul')) mods[k] *= item.mods[k];
      else mods[k] += item.mods[k];
    }
  }
  // Set effects are derived only from the owned, eligible loadout.
  for (const set of armorSetBonuses(char.cls, equipped, ITEMS, ARMOR_SETS)) {
    for (const { mods: bonus } of set.active) {
      for (const [key, value] of Object.entries(bonus)) {
        if (!Object.hasOwn(mods, key)) continue;
        if (key.endsWith('Mul')) mods[key] *= value;
        else mods[key] += value;
      }
    }
  }
  // The primary skill directly scales everything the class does.
  const power = 1 + (skills[def.primary] - 10) * 0.02;
  const maxHp = Math.round((def.baseHp + def.hpPerLevel * (char.level - 1) + mods.hpAdd) * mods.hpMul);
  return {
    skills,
    power,
    maxHp,
    healMul: mods.healMul,
    dmgMul: mods.dmgMul,
    chargeMul: mods.chargeMul,
    dischargeRadius: mods.dischargeRadius,
    shieldMul: mods.shieldMul,
    // class armour set effects (ARMOR_SETS)
    barrierMul: mods.barrierMul,
    graftTicks: mods.graftTicks,
    relayRadius: mods.relayRadius,
    scanMs: mods.scanMs,
    blastRadius: mods.blastRadius,
    glyph: equipped.glyph || null,
  };
}

function unmetRequirement(item, skills, attunements) {
  if (!item.req) return null;
  if (item.req.skills) {
    for (const k of Object.keys(item.req.skills)) {
      if ((skills[k] || 0) < item.req.skills[k]) {
        return `requires ${SKILL_NAMES[k]} ${item.req.skills[k]} (you have ${skills[k] || 0})`;
      }
    }
  }
  if (item.req.attune && !attunements.includes(item.req.attune)) {
    return `requires Attunement: ${ATTUNEMENT_NAMES[item.req.attune]}`;
  }
  return null;
}

// Admit each item from permanent skills and already qualified gear. Nothing
// in a closed dependency loop can contribute the first qualifying bonus.
export function resolveLoadout(char, equipped, options = {}) {
  const accepted = {};
  const pending = new Map();
  const rejected = new Map();
  for (const slot of SLOTS) {
    const id = equipped[slot];
    if (Object.hasOwn(equipped, slot)) accepted[slot] = null;
    if (!id) continue;
    const item = Object.hasOwn(ITEMS, id) ? ITEMS[id] : null;
    if (!item) rejected.set(slot, 'Unknown item.');
    else if (id==='survey_strider_link') rejected.set(slot,'Survey Strider deployment is learned, not equipped.');
    else if (item.slot !== slot) rejected.set(slot, `${item.name} does not fit that slot.`);
    else if (!char.inventory.includes(id)) rejected.set(slot, 'You do not own that item.');
    else if (item.cls && item.cls !== char.cls && options.classUnlocked !== true) rejected.set(slot, `${item.name} cannot be used by your class.`);
    else pending.set(slot, id);
  }

  let skills = computeSkills(char.cls, char.level, accepted, options);
  while (pending.size) {
    const previousSize = pending.size;
    for (const [slot, id] of pending) {
      if (unmetRequirement(ITEMS[id], skills, char.attunements)) continue;
      accepted[slot] = id;
      pending.delete(slot);
      skills = computeSkills(char.cls, char.level, accepted, options);
    }
    if (pending.size === previousSize) break;
  }
  for (const [slot, id] of pending) {
    const item = ITEMS[id];
    rejected.set(slot, `${item.name} ${unmetRequirement(item, skills, char.attunements)}.`);
  }
  return { equipped: accepted, rejected };
}

/** Check ownership, slots and permanent eligibility of a proposed loadout. */
export function validateLoadout(char, equipped, options = {}) {
  const { rejected } = resolveLoadout(char, equipped, options);
  for (const [slot, reason] of rejected) return { ok: false, reason, item: equipped[slot] };
  return { ok: true };
}

/** Result of equipping `itemId` into its slot. */
export function tryEquip(char, itemId, options = {}) {
  const item = Object.hasOwn(ITEMS, itemId) ? ITEMS[itemId] : null;
  if (!item) return { ok: false, reason: 'Unknown item.' };
  const equipped = { ...char.equipped, [item.slot]: itemId };
  const res = validateLoadout(char, equipped, options);
  return res.ok ? { ok: true, equipped } : res;
}

/** Return the selected item and any newly unsupported gear to carried inventory. */
export function tryUnequip(char, slot, options = {}) {
  if (!SLOTS.includes(slot)) return { ok: false, reason: 'Unknown slot.' };
  if (!char.equipped[slot]) return { ok: false, reason: 'Nothing is equipped there.' };
  const remaining = { ...char.equipped, [slot]: null };
  const { equipped, rejected } = resolveLoadout(char, remaining, options);
  return { ok: true, equipped, alsoRemoved: [...rejected.keys()].map(key => remaining[key]) };
}

/** Human-readable requirement lines for UI: [{text, met}]. */
export function describeRequirements(char, itemId, options = {}) {
  const item = ITEMS[itemId];
  const out = [];
  if (!item) return out;
  if (item.cls) out.push({ text: `Class: ${CLASSES[item.cls].name}${options.classUnlocked === true && item.cls !== char.cls ? ' (preview override)' : ''}`, met: item.cls === char.cls || options.classUnlocked === true });
  if (item.req) {
    const supporting = resolveLoadout(char, { ...char.equipped, [item.slot]: null }, options).equipped;
    const skills = computeSkills(char.cls, char.level, supporting, options);
    if (item.req.skills) {
      for (const k of Object.keys(item.req.skills)) {
        const base = CLASSES[char.cls].skills[k] + (CLASSES[char.cls].primary === k ? char.level - 1 : 0);
        const effective = skills[k] || 0;
        const preview = options.attributeBonus ?? 0;
        const bonus = effective - base - preview;
        const breakdown = `${base} base${preview ? ` + ${preview} preview` : ''}${bonus ? ` + ${bonus} equipment` : ''}${preview || bonus ? ` = ${effective}` : ''}`;
        out.push({
          text: `${SKILL_NAMES[k]} ${effective} / ${item.req.skills[k]}`,
          detail: `Qualifying skills: ${breakdown}. Minimum ${item.req.skills[k]} required.`,
          met: effective >= item.req.skills[k],
        });
      }
    }
    if (item.req.attune) {
      out.push({ text: `Attunement: ${ATTUNEMENT_NAMES[item.req.attune]}`, met: char.attunements.includes(item.req.attune) });
    }
  }
  return out;
}
