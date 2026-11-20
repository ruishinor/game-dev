// Only explicitly repairable equipment participates. Existing equipment and
// class stats remain unchanged. Missing condition means fully maintained.
import {ITEMS} from './content.js';
import {WEAPON_SLOTS,activeWeapon,autoProfile,equippedWeapon} from './weapons.js';
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
// Only the active weapon contributes (see shared/weapons.js).
export function weaponBonus(char){
 const id=activeWeapon(char),n=conditionOf(char,id);
 if(n===null)return 0;
 return (ITEMS[id].autoBonus||0)*n/CONDITION_MAX;
}

// The weapon a maintenance kit should service: the active one if damaged,
// otherwise the other equipped weapon if damaged, else the active one.
export function maintenanceTarget(char){
 const ids=[activeWeapon(char),...WEAPON_SLOTS.map(slot=>equippedWeapon(char,slot))].filter(Boolean);
 return ids.find(id=>{const n=conditionOf(char,id);return n!==null&&n<CONDITION_MAX;})??ids[0]??null;
}

// Reach is a public presentation projection; authoritative combat applies it independently.
export function weaponReach(char){
 const auto=autoProfile(char);
 if(!auto)return 0;
 const id=activeWeapon(char),n=conditionOf(char,id);
 const bonus=n!==null&&auto.kind==='bolt'?(ITEMS[id].autoReachBonus||0)*n/CONDITION_MAX:0;
 return auto.range+bonus;
}
