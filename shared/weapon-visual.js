import { CLASSES } from './content.js';

// Public, allowlisted cosmetic identity only. No inventory or weapon mechanics
// beyond the visual token leave the authoritative server.
const RANGED=Object.freeze({field_emitter:'field',tuned_emitter:'tuned',dense_pulse_core:'dense'});
export function publicWeaponVisual(char){
 const id=char?.equipped?.weapon;
 if(CLASSES[char?.cls]?.auto?.kind!=='bolt'||!Array.isArray(char.inventory)||!char.inventory.includes(id))return null;
 return id==='longpoint_emitter'?'longpoint':Object.hasOwn(RANGED,id)?RANGED[id]:null;
}
