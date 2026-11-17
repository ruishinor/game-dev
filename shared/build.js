// Loadout rules: derived stats and equip validation. Shared so the client can
// explain requirements, but only the server's result is ever applied.

import { CLASSES, ITEMS, SLOTS, SKILL_NAMES, ATTUNEMENT_NAMES } from './content.js';

/** Effective skills for a class/level with a given equipped loadout. */
export function computeSkills(cls, level, equipped) {
  const def = CLASSES[cls];
  const skills = { ...def.skills };
  skills[def.primary] += level - 1;
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
export function deriveStats(char) {
  const def = CLASSES[char.cls];
  const skills = computeSkills(char.cls, char.level, char.equipped);
  const mods = { healMul: 1, dmgMul: 1, hpMul: 1, hpAdd: 0, chargeMul: 1, dischargeRadius: 0 };
  for (const slot of SLOTS) {
    const item = ITEMS[char.equipped[slot]];
    if (!item || !item.mods) continue;
    for (const k of Object.keys(item.mods)) {
      if (k.endsWith('Mul')) mods[k] *= item.mods[k];
      else mods[k] += item.mods[k];
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
    glyph: char.equipped.glyph || null,
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

/**
 * Check a prospective loadout. Every equipped item must be owned, sit in its
 * own slot, match the class and have its requirements met by the skills the
 * *whole* loadout provides. Returns {ok} or {ok:false, reason}.
 */
export function validateLoadout(char, equipped) {
  for (const slot of SLOTS) {
    const id = equipped[slot];
    if (!id) continue;
    const item = ITEMS[id];
    if (!item) return { ok: false, reason: 'Unknown item.' };
    if (item.slot !== slot) return { ok: false, reason: `${item.name} does not fit that slot.` };
    if (!char.inventory.includes(id)) return { ok: false, reason: 'You do not own that item.' };
    if (item.cls && item.cls !== char.cls) return { ok: false, reason: `${item.name} cannot be used by your class.` };
  }
  const skills = computeSkills(char.cls, char.level, equipped);
  for (const slot of SLOTS) {
    const item = ITEMS[equipped[slot]];
    if (!item) continue;
    const unmet = unmetRequirement(item, skills, char.attunements);
    if (unmet) return { ok: false, reason: `${item.name} ${unmet}.`, item: equipped[slot] };
  }
  return { ok: true };
}

/** Result of equipping `itemId` into its slot. */
export function tryEquip(char, itemId) {
  const item = ITEMS[itemId];
  if (!item) return { ok: false, reason: 'Unknown item.' };
  const equipped = { ...char.equipped, [item.slot]: itemId };
  const res = validateLoadout(char, equipped);
  return res.ok ? { ok: true, equipped } : res;
}

/** Result of emptying `slot`. Fails if another equipped item depends on it. */
export function tryUnequip(char, slot) {
  if (!SLOTS.includes(slot)) return { ok: false, reason: 'Unknown slot.' };
  if (!char.equipped[slot]) return { ok: false, reason: 'Nothing is equipped there.' };
  const equipped = { ...char.equipped, [slot]: null };
  const res = validateLoadout(char, equipped);
  if (!res.ok) {
    return { ok: false, reason: `Cannot remove ${ITEMS[char.equipped[slot]].name}: ${res.reason}`, item: res.item };
  }
  return { ok: true, equipped };
}

/** Human-readable requirement lines for UI: [{text, met}]. */
export function describeRequirements(char, itemId) {
  const item = ITEMS[itemId];
  const out = [];
  if (!item) return out;
  if (item.cls) out.push({ text: `Class: ${CLASSES[item.cls].name}`, met: item.cls === char.cls });
  if (item.req) {
    const skills = computeSkills(char.cls, char.level, { ...char.equipped, [item.slot]: itemId });
    if (item.req.skills) {
      for (const k of Object.keys(item.req.skills)) {
        const base = CLASSES[char.cls].skills[k] + (CLASSES[char.cls].primary === k ? char.level - 1 : 0);
        const effective = skills[k] || 0;
        const bonus = effective - base;
        const breakdown = bonus ? `${base} base + ${bonus} equipment = ${effective}` : `${base} base`;
        out.push({
          text: `${SKILL_NAMES[k]} ${effective} / ${item.req.skills[k]}`,
          detail: `After equipping: ${breakdown}. Minimum ${item.req.skills[k]} required.`,
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
