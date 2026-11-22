// Only explicitly repairable equipment participates. Existing equipment and
// class stats remain unchanged. Missing condition means fully maintained.
import {ITEMS,CLASSES} from './content.js';
export const CONDITION_MAX=100;
export function conditionOf(char,id){
 if(typeof id!=='string'||!Object.hasOwn(ITEMS,id)||ITEMS[id].repairable!==true||!char?.inventory?.includes(id))return null;
 const n=char.condition&&Object.hasOwn(char.condition,id)?char.condition[id]:CONDITION_MAX;
 return Number.isSafeInteger(n)&&n>=0&&n<=CONDITION_MAX?n:CONDITION_MAX;
}
export function sanitizeCondition(raw,inventory){
 const out={};if(!Array.isArray(inventory)||!raw||typeof raw!=='object'||Array.isArray(raw))return out;
 for(const id of inventory){const n=conditionOf({inventory,condition:raw},id);if(n!==null&&n<CONDITION_MAX)out[id]=n;}
 return out;
}
export function weaponBonus(char){
 const id=char?.equipped?.weapon,n=conditionOf(char,id);
 if(n===null||ITEMS[id].slot!=='weapon')return 0;
 return ITEMS[id].autoBonus*n/CONDITION_MAX;
}

// Recover universal rod melee without importing the historical dual-slot system.
// Keep the existing rod cadence, melee reach and condition-scaled bonus for all classes.
export function weaponAutoProfile(char){
 const id=char?.equipped?.weapon;
 if(id==='electrical_combat_rod'&&char.inventory?.includes(id)&&CLASSES[char.cls])return CLASSES.vanguard.auto;
 return CLASSES[char?.cls]?.auto;
}

// Reach is a public presentation projection; authoritative combat applies it independently.
export function weaponReach(char){
 const auto=weaponAutoProfile(char);
 if(!auto)return 0;
 const id=char?.equipped?.weapon,n=conditionOf(char,id);
 const bonus=n!==null&&ITEMS[id].slot==='weapon'&&auto.kind==='bolt'?(ITEMS[id].autoReachBonus||0)*n/CONDITION_MAX:0;
 return auto.range+bonus;
}
