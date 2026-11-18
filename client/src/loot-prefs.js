// Local presentation preference; it never grants authority or collects at a distance.
export const AUTO_LOOT_KEY='attunement.autoLoot';
export function readAutoLoot(storage){
 try{return storage?.getItem(AUTO_LOOT_KEY)==='1';}catch{return false;}
}
export function writeAutoLoot(storage,enabled){
 try{storage?.setItem(AUTO_LOOT_KEY,enabled===true?'1':'0');}catch{}
 return enabled===true;
}
export function autoForInteraction(enabled,manual=false){return enabled===true&&manual!==true;}
