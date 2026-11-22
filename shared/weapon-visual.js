// Public, allowlisted weapon visual identity. The server decides the selected
// slot; no inventory list, condition, hidden odds or arbitrary asset paths leave.
import {activeWeaponSlot,autoProfile,equippedWeapon} from './weapons.js';

const RANGED=Object.freeze({field_emitter:'field',tuned_emitter:'tuned',relay_carbine:'relay-carbine',bastion_rifle:'bastion-rifle'});
const STOWED=Object.freeze({longpoint_emitter:'longpoint-stowed',relay_carbine:'relay-carbine-stowed',bastion_rifle:'bastion-rifle-stowed'});
export function publicWeaponVisual(char){
 const equipped=equippedWeapon(char,'ranged');
 if(!equipped)return null;
 if(activeWeaponSlot(char)==='ranged'&&autoProfile(char)?.kind==='bolt'){
   if(equipped==='longpoint_emitter')return 'longpoint';
   return Object.hasOwn(RANGED,equipped)?RANGED[equipped]:null;
 }
 // The original Longpoint remains visibly carried when melee is drawn.
 return Object.hasOwn(STOWED,equipped)?STOWED[equipped]:null;
}