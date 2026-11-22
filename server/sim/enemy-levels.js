// Server-only enemy level scaling and kill experience. Clients see an enemy's
// level number and elite flag in snapshots; the multipliers, region bands and
// XP rules here are never shipped.
//
// Scaling counts only levels above an enemy type's own base level, so every
// enemy spawned at its type's level (the Reach, Sporefield, Phase Annex) keeps
// its established health, damage and XP exactly. Levels 1-5 are unchanged.
import { ENEMIES, MAX_LEVEL } from '../../shared/content.js';

/** Approved regional bands: entry requirement and content level range. */
export const REGION_LEVELS = Object.freeze({
  severance_expanse: Object.freeze({ entry: 5, min: 5, max: 12 }),
  lumenfen: Object.freeze({ entry: 7, min: 7, max: 11 }),
  silent_foundry: Object.freeze({ entry: 8, min: 8, max: 11 }),
  // behind the Foundry's Null Breach; also requires the Foundry Overseer defeated
  null_annex: Object.freeze({ entry: 12, min: 13, max: 15 }),
});

/** Character level required for the Phase Scar: calibration, recovery and travel. */
export const RIFT_LEVEL = 5;

/** Standard per-instance elite: heavier, harder-hitting, richer reward. */
export const ELITE = Object.freeze({ hp: 2.4, dmg: 1.35 });
const ELITE_XP = 2.5;
const HP_PER_LEVEL = 0.12, DMG_PER_LEVEL = 0.07;
// Per-kill XP grows with level: base XP is authored at the type's own level.
const xpWeight = (level) => 10 + 8 * level;

const above = (e) => {
  const def = ENEMIES[e.type];
  const level = Number.isInteger(e.level) ? e.level : def.level;
  return Math.max(0, Math.min(MAX_LEVEL, level) - def.level);
};
export const levelHpMul = (e) => 1 + HP_PER_LEVEL * above(e);
export const levelDmgMul = (e) => 1 + DMG_PER_LEVEL * above(e);

/**
 * XP for one credited kill. Enemies far below the player's level award less,
 * so levels 6-15 come from level-appropriate regions rather than farming the
 * Reach. The penalty starts at five levels below, which no level 1-5 player
 * reaches against Reach enemies (level 1-4), so their awards are unchanged.
 */
export function killXp(e, playerLevel) {
  const def = ENEMIES[e.type];
  if (!def || !(def.xp > 0)) return 0;
  const level = def.level + above(e);
  let xp = def.xp * xpWeight(level) / xpWeight(def.level);
  if (e.elite && !def.elite) xp *= ELITE_XP;
  const gap = (Number.isInteger(playerLevel) ? playerLevel : 1) - level;
  if (gap > 4) xp *= Math.max(0.1, 1 - 0.25 * (gap - 4));
  return Math.max(1, Math.round(xp));
}

/** Character-level requirement message for a regional entry, or null when allowed. */
export function regionEntryDenial(region, char) {
  const band = REGION_LEVELS[region];
  if (!band || (Number.isInteger(char?.level) && char.level >= band.entry)) return null;
  const name = { silent_foundry: 'The Silent Foundry', null_annex: 'The Null Breach', lumenfen: 'Lumenfen' }[region] ?? 'The Severance Expanse';
  return `${name} requires character level ${band.entry}.`;
}
