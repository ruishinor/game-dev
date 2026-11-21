// Private wear and service balance rules. No base class stat or FX changes.
import {conditionOf,sanitizeCondition,CONDITION_MAX} from '../../shared/condition.js';
import {activeWeapon} from '../../shared/weapons.js';
const DEFEAT_WEAR=10;
export function wearEquippedWeapon(game,p){
 // Only the weapon in use at defeat wears; a stowed weapon is untouched.
 const c=p.char,id=activeWeapon(c),n=conditionOf(c,id);
 if(n===null||n===0)return false;
 const next=sanitizeCondition(c.condition,c.inventory);next[id]=Math.max(0,n-DEFEAT_WEAR);c.condition=next;
 game.markDirty(p);game.message(p,'info','Weapon condition reduced to '+next[id]+'%. Base attacks remain available.');
 return true;
}
export function repairPrice(char,id){
 const n=conditionOf(char,id);
 return n===null||n===CONDITION_MAX?null:Math.ceil((CONDITION_MAX-n)/5);
}
