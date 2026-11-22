// Session-only owner build preview. The simulation, not the client, supplies
// these options. The character record is never a source of preview permissions.
import { deriveStats, resolveLoadout } from '../shared/build.js';
import { SLOTS } from '../shared/content.js';

export const MAX_ATTRIBUTE_BONUS = 100;
const previewCharacters = new WeakSet();

export function buildPreviewOptions(p) {
  return { attributeBonus: p.gmAttributeBonus ?? 0, classUnlocked: p.gmClassUnlocked === true };
}

export function activeBuildPreview(p) {
  return (p.gmAttributeBonus ?? 0) !== 0 || p.gmClassUnlocked === true;
}

export function reconcileBuildPreview(p) {
  const options = buildPreviewOptions(p);
  const old = p.char.equipped;
  const { equipped } = resolveLoadout(p.char, old, options);
  const removed = SLOTS.filter(slot => old[slot] && old[slot] !== equipped[slot]).map(slot => old[slot]);
  // Preserve the normal optional slot shape.
  for (const slot of SLOTS) if (!['device','implant','glyph'].includes(slot) && !equipped[slot]) delete equipped[slot];
  p.char.equipped = equipped;
  if (activeBuildPreview(p)) previewCharacters.add(p.char);
  else previewCharacters.delete(p.char);
  return removed;
}

// Periodic saves and shutdown must never write preview-dependent gear or HP.
// Inventory ownership is unchanged; keep compatible equipment, not the flags.
export function persistentBuildRecord(char) {
  if (!previewCharacters.has(char)) return char;
  const { equipped } = resolveLoadout(char, char.equipped);
  for (const slot of SLOTS) if (!['device','implant','glyph'].includes(slot) && !equipped[slot]) delete equipped[slot];
  const record = { ...char, equipped };
  record.hp = Math.min(char.hp, deriveStats(record).maxHp);
  return record;
}
