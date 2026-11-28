import { randomInt } from 'node:crypto';
import { ITEMS } from '../../shared/content.js';
import { MATERIALS, MATERIAL_CAP, sanitizeMaterials } from '../../shared/crafting.js';
import { GOODS, sanitizeGoods } from '../../shared/goods.js';
import { sanitizeCondition } from '../../shared/condition.js';
import { canSalvageEquipment } from '../../shared/item-actions.js';

// A successful breakdown yields at most one input unit. Equipment which is
// unique or required by a quest never enters this recovery table.
const RECOVERY = {
  field_emitter: { material: 'sentinel_alloy', chance: 24 },
  tuned_emitter: { material: 'sentinel_alloy', chance: 32 },
  dense_pulse_core: { material: 'sentinel_alloy', chance: 35 },
  longpoint_emitter: { material: 'mire_fibre', chance: 35 },
  resonance_buffer: { material: 'mire_fibre', chance: 30 },
};
const fail = reason => ({ ok: false, reason });

export function disposeItem(game, p, { action, item, rev }, roll = () => randomInt(100)) {
  if (p.dead || p.combatUntil > game.time) return fail('Manage inventory outside combat while alive.');
  if (rev !== p.inventoryRev) return fail('Inventory changed. Review the item and try again.');
  if (action !== 'salvage' && action !== 'destroy') return fail('Unknown inventory action.');
  const char = p.char;
  // Copy before committing the item removal and any recovery together.
  const materials = sanitizeMaterials(char.materials);
  const goods = sanitizeGoods(char.goods);
  const isEquipment = canSalvageEquipment(item) && char.inventory.includes(item) &&
    !Object.values(char.equipped).includes(item);
  const isJunk = Object.hasOwn(GOODS, item) && GOODS[item].category === 'junk' && Object.hasOwn(goods, item);
  if (!isEquipment && !isJunk) return fail('This item cannot be discarded.');
  if (action === 'salvage' && !isEquipment) return fail('This item cannot be salvaged.');
  let recovered = null;
  if (action === 'salvage') {
    const { material, chance } = RECOVERY[item];
    const count = materials[material] || 0;
    if (count >= MATERIAL_CAP) return fail('Make room for the recovered material first.');
    if (roll() < chance) {
      recovered = material;
      materials[material] = count + 1;
    }
  }
  if (isEquipment) {
    char.inventory = char.inventory.filter(id => id !== item);
    char.condition = sanitizeCondition(char.condition, char.inventory);
  } else if (--goods[item] === 0) delete goods[item];
  char.materials = materials;
  char.goods = goods;
  if(isEquipment)game.economy?.observe('items_consumed',p,1,item);
  else game.economy?.observe('goods_spent',p,1,item);
  if(recovered)game.economy?.observe('materials_granted',p,1,recovered);
  game.markDirty(p);
  const name = isEquipment ? ITEMS[item].name : GOODS[item].name;
  if (action === 'destroy') game.message(p, 'info', `${name} destroyed.`);
  else if (recovered) game.message(p, 'gain', `${name} salvaged. Recovered ${MATERIALS[recovered].name} × 1.`);
  else game.message(p, 'warn', `${name} consumed. No material recovered.`);
  return { ok: true };
}
