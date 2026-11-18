import { sanitizeMaterials } from '../../shared/crafting.js';
import { sanitizeGoods } from '../../shared/goods.js';

export function inventoryCounts(char) {
  return { ...sanitizeMaterials(char.materials), ...sanitizeGoods(char.goods),
    ...Object.fromEntries(char.inventory.map(id => [id, 1])) };
}

export function sanitizeUnseen(raw, char) {
  const counts = inventoryCounts(char);
  return Array.isArray(raw) ? [...new Set(raw.filter(id => typeof id === 'string' && Object.hasOwn(counts, id)))] : [];
}

export function trackAcquisitions(p) {
  const current = inventoryCounts(p.char);
  const previous = p.inventoryCounts;
  const unseen = new Set(p.char.unseenItems || []);
  let changed = false;
  for (const id of Object.keys(previous)) {
    if (!Object.hasOwn(current, id)) {
      unseen.delete(id);
      changed = true;
    }
  }
  for (const [id, count] of Object.entries(current)) {
    const before = Object.hasOwn(previous, id) ? previous[id] : 0;
    if (count > before) unseen.add(id);
    if (count !== before) changed = true;
  }
  if (changed) {
    p.inventoryCounts = current;
    p.inventoryRev++;
    p.char.unseenItems = [...unseen];
  }
}

export function markItemSeen(game, p, id, revision) {
  if (p.inventoryRev !== revision || !p.char.unseenItems?.includes(id)) return;
  p.char.unseenItems = p.char.unseenItems.filter(item => item !== id);
  p.sheetDirty = true;
  game.onCharChanged(p.char);
}
