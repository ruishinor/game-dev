// Public presentation and bounded stack representation. No acquisition
// probabilities, prices, or mutable authority belong in this module.
import { ITEMS } from './content.js';
import { classArmourGoods } from './class-armour.js';

const itemNames = Object.fromEntries(Object.entries(ITEMS).map(([id, it]) => [id, it.name]));
export const GOODS = Object.freeze({
  ...classArmourGoods(itemNames),
  blueprint_relay_arc_carbine:Object.freeze({name:'Blueprint: Relay Arc Carbine',category:'blueprint',rarity:'Rare',cap:1,desc:'Recovered fabrication knowledge from the completed Null Chamber recovery cache. It unlocks extended-frame weapon assembly at commissioned Brineworks; the blueprint is retained and never consumed.'}),
  blueprint_relay_vest:Object.freeze({name:'Blueprint: Reinforced Relay Vest',category:'blueprint',rarity:'Rare',cap:1,desc:'Retained engineering knowledge. Recover this blueprint to learn its recipe. It cannot be traded or consumed.'}),
  blueprint_resonant_vest:Object.freeze({name:'Blueprint: Resonance-Lined Vest',category:'blueprint',rarity:'Very rare',cap:1,desc:'Retained advanced engineering knowledge. Recover this blueprint to learn its recipe. It cannot be traded or consumed.'}),
  vault_memory_foil:Object.freeze({name:'Vault Memory Foil',category:'relic',rarity:'Rare',cap:1,desc:'An etched memory surface from an obsolete containment apparatus. Retain it as an archival specimen; it has no combat modifier or trade value.'}),
  vault_witness_seal:Object.freeze({name:'Lattice Witness Seal',category:'relic',rarity:'Very rare',cap:1,desc:'A finely laminated seal bearing a witness mark that survived a containment event. A personal archival distinction, not a power upgrade or currency.'}),
  spent_contact: Object.freeze({name:'Spent contact assembly',category:'junk',desc:'A heat-damaged electrical contact. Unfit for field fabrication; recoverable as scrap.'}),
  field_restorative: Object.freeze({name:'Field Restorative',category:'utility',desc:'Single-use resonant ampoule issued at the Expedition Outpost. Restores 30 percent of maximum health over 5 seconds, in or out of combat. 20 second recovery between doses.'}),
  field_maintenance_kit: Object.freeze({name:'Field Maintenance Kit',category:'utility',desc:'Single-use conductive repair cassette. Restores up to 25 percentage points of condition to your equipped weapon outside combat. No health recovery.'}),
  mire_husk: Object.freeze({name:'Torn mire husk',category:'junk',desc:'Discarded organic casing. No functional equipment or fabrication use.'}),
});
export const GOODS_CAP=99;
export function goodsCap(id){return Object.hasOwn(GOODS,id)?GOODS[id].cap??GOODS_CAP:0;}
export function sanitizeGoods(raw){
  const out={};
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return out;
  for(const id of Object.keys(GOODS)){
    if(Object.hasOwn(raw,id)&&Number.isSafeInteger(raw[id])&&raw[id]>0)out[id]=Math.min(goodsCap(id),raw[id]);
  }
  return out;
}
