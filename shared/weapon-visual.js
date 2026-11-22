// Public, allowlisted weapon visual identity. The server decides the selected
// slot; no inventory list, condition, hidden odds or arbitrary asset paths leave.
import {activeWeaponSlot,autoProfile,equippedWeapon} from './weapons.js';

const RANGED=Object.freeze({field_emitter:'field',tuned_emitter:'tuned',patrol_arc_sidearm:'tuned'});
export function publicWeaponVisual(char){
 const equipped=equippedWeapon(char,'ranged');
 if(!equipped)return null;
 if(activeWeaponSlot(char)==='ranged'&&autoProfile(char)?.kind==='bolt'){
   if(equipped==='longpoint_emitter'||equipped==='relay_arc_carbine')return 'longpoint';
   return Object.hasOwn(RANGED,equipped)?RANGED[equipped]:null;
 }
 // The original Longpoint remains visibly carried when melee is drawn.
 return equipped==='longpoint_emitter'||equipped==='relay_arc_carbine'?'longpoint-stowed':null;
}