// Public presentation and bounded stack representation. No acquisition
// probabilities, prices, or mutable authority belong in this module.
export const GOODS = Object.freeze({
  spent_contact: Object.freeze({name:'Spent contact assembly',category:'junk',desc:'A heat-damaged electrical contact. Unfit for field fabrication; recoverable as scrap.'}),
  field_maintenance_kit: Object.freeze({name:'Field Maintenance Kit',category:'utility',desc:'Single-use conductive repair cassette. Restores up to 25 percentage points of condition to your equipped weapon outside combat. No health recovery.'}),
  mire_husk: Object.freeze({name:'Torn mire husk',category:'junk',desc:'Discarded organic casing. No functional equipment or fabrication use.'}),
});
export const GOODS_CAP=99;
export function sanitizeGoods(raw){
  const out={};
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return out;
  for(const id of Object.keys(GOODS)){
    if(Object.hasOwn(raw,id)&&Number.isSafeInteger(raw[id])&&raw[id]>0)out[id]=Math.min(GOODS_CAP,raw[id]);
  }
  return out;
}
