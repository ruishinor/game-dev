// Only explicitly repairable equipment participates. Existing equipment and
// class stats remain unchanged. Missing condition means fully maintained.
import {ITEMS} from './content.js';
import {WEAPON_SLOTS,activeWeapon,activeWeaponSlot,profileFor,equippedWeapon} from './weapons.js';
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
// Auto-attack actually used: the active weapon's own profile (the same for
// every class), or the class's innate attack for the mode when that slot is
// empty. Condition scales a weapon's damage between full and the innate
// damage rate at the weapon's speed, so a worn weapon never falls below
// unarmed. Returns {kind, range, interval, dmg, weapon}.
export function effectiveAuto(char){
 const innate=profileFor(char?.cls,activeWeaponSlot(char));
 if(!innate)return null;
 const id=activeWeapon(char),w=id?ITEMS[id].auto:null;
 if(!w)return {...innate,weapon:null};
 const n=conditionOf(char,id)??CONDITION_MAX;
 const floor=innate.dmg/innate.interval*w.interval;
 return {kind:innate.kind,range:w.range,interval:w.interval,dmg:floor+(w.dmg-floor)*n/CONDITION_MAX,weapon:id};
}
/** Auto-attack damage per second before attributes and buffs. */
export function autoDps(char){
 const a=effectiveAuto(char);
 return a?a.dmg*1000/a.interval:0;
}

// The weapon a maintenance kit should service: the active one if damaged,
// otherwise the other equipped weapon if damaged, else the active one.
export function maintenanceTarget(char){
 const ids=[activeWeapon(char),...WEAPON_SLOTS.map(slot=>equippedWeapon(char,slot))].filter(Boolean);
 return ids.find(id=>{const n=conditionOf(char,id);return n!==null&&n<CONDITION_MAX;})??ids[0]??null;
}

// Reach is a public presentation projection; authoritative combat applies it independently.
export function weaponReach(char){
 return effectiveAuto(char)?.range??0;
}
