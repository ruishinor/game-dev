// Only presentation capabilities are exposed here. The server validates act.
import { ITEMS } from '../../shared/content.js';

// Use existing public recipes. This selects a lesson, not crafting eligibility.
export function starterFabrication(sheet) {
  const carried=Array.isArray(sheet?.inventory)?sheet.inventory:[];
  const owned=[...carried,sheet?.equipped?.weapon];
  return owned.some(id=>typeof id==='string'&&Object.hasOwn(ITEMS,id)&&ITEMS[id].slot==='weapon')
    ? 'field_maintenance_kit' : 'field_emitter';
}
const profiles = Object.freeze({
  archivist: Object.freeze({
    role: 'Archivist · Lattice Sanctum',
    intro: 'Archivist of the Lattice Sanctum. Speak to Venn for guidance.',
    services: Object.freeze(['talk','codex','workshop'])
  })
});
export function npcProfile(ent) {
  const type=ent?.meta?.c;
  return ent?.meta?.k==='o'&&Object.hasOwn(profiles,type)?profiles[type]:null;
}
export function npcAccess(ent,self,you,range=5) {
  if(!npcProfile(ent)||!self||!ent.row||!you||![ent.row.x,ent.row.z,you.x,you.z,range].every(Number.isFinite)||range<0)return 'NPC is unavailable.';
  if(self.dead)return 'You are defeated.';
  if(Math.hypot(ent.row.x-you.x,ent.row.z-you.z)>range)return 'Move closer.';
  return null;
}
