// Pure presentation/authority-compatible calculation. No acquisition tables.
// Callers must supply an already validated, owned loadout. Server remains authoritative.
export const ARMOR_SET_SLOTS = Object.freeze(['chest', 'gloves', 'greaves', 'boots']);

/** Return cumulative unlocked thresholds per set, counting distinct anatomical slots. */
export function armorSetBonuses(cls, equipped, items, sets) {
  const counts = new Map();
  const seen = new Set();
  for (const slot of ARMOR_SET_SLOTS) {
    const id = equipped?.[slot];
    if (typeof id !== 'string' || seen.has(id) || !Object.hasOwn(items, id)) continue;
    const item = items[id];
    if (item.slot !== slot || item.cls !== cls || typeof item.setId !== 'string' ||
        !Object.hasOwn(sets, item.setId) || sets[item.setId].cls !== cls) continue;
    seen.add(id);
    counts.set(item.setId, (counts.get(item.setId) || 0) + 1);
  }
  return [...counts].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([setId, count]) => ({
      setId, count,
      active: [2, 3, 4].filter(n => count >= n && Object.hasOwn(sets[setId].bonuses, n))
        .map(n => ({ threshold: n, mods: { ...sets[setId].bonuses[n] } })),
    }));
}
