// Personal corpse loot. The server rolls once per eligible death/recipient.
// Client requests may only collect extant, server-authored entries.
import {ITEMS} from '../../shared/content.js';
import {MATERIALS,MATERIAL_CAP} from '../../shared/crafting.js';
import {itemDrops,SALVAGE} from './loot-tables.js';
import {dist,hasLineOfSight} from '../../shared/world.js';
import {CORPSE_MS} from './game.js';
import {grantItem,grantSalvage} from './progress.js';

const LOOT_RANGE=5, CREDIT_RANGE=70;
const fail=reason=>({ok:false,reason});
const active=(game,e)=>e?.kind==='enemy'&&e.state==='dead'&&game.time-e.deadAt<=CORPSE_MS;
export function distributeCorpseLoot(game,e,credited){
 if(!active(game,e)||e.lootByPlayer instanceof Map)return;
 e.lootGeneration=(e.lootGeneration||0)+1;e.lootByPlayer=new Map();
 for(const id of new Set(credited)){
  const p=game.players.get(id);if(!p||dist(p,e)>CREDIT_RANGE)continue;
  const entries=[],material=SALVAGE[e.type];
  // Keep the existing salvage yield and equipment probabilities.
  // A corpse without salvage and with no successful item roll is empty.
  if(Object.hasOwn(MATERIALS,material)&&(p.char.materials?.[material]||0)<MATERIAL_CAP)entries.push({id:material,kind:'material',quantity:1});
  for(const drop of itemDrops(e.type))if(Object.hasOwn(ITEMS,drop.item)&&!p.char.inventory.includes(drop.item)&&game.rng()<drop.chance)entries.push({id:drop.item,kind:'item',quantity:1});
  if(entries.length)e.lootByPlayer.set(id,entries);
 }
}
function available(game,p,e,generation,near=true){
 if(p.dead||!active(game,e)||e.lootGeneration!==generation)return null;
 if(near&&(dist(p,e)>LOOT_RANGE||!hasLineOfSight(p,e)))return null;
 const entries=e.lootByPlayer?.get(p.id);
 return entries?.length?entries:null;
}
export function clearLoot(p){p.lootTarget=null;}
export function tickLoot(game,p){
 if(p.lootTarget&&!available(game,p,game.ents.get(p.lootTarget.id),p.lootTarget.generation))clearLoot(p);
}
export function forgetLoot(game,p){
 clearLoot(p);for(const e of game.enemies)e.lootByPlayer?.delete(p.id);
}
export function lootState(game,p){
 const lootable=[];
 if(!p.dead)for(const e of game.enemies)if(available(game,p,e,e.lootGeneration,false))lootable.push({id:e.id,generation:e.lootGeneration});
 const t=p.lootTarget,e=t?game.ents.get(t.id):null,entries=t?available(game,p,e,t.generation):null;
 return {lootable,loot:entries?{id:e.id,generation:e.lootGeneration,name:e.name,entries:entries.map(x=>({...x}))}:null};
}
export function openLoot(game,p,id,generation,auto=false){
 const e=game.ents.get(id),entries=available(game,p,e,generation);
 if(!entries)return fail('No accessible loot on these remains.');
 p.lootTarget={id,generation};
 return auto?takeLoot(game,p,id,generation,null):{ok:true};
}
export function takeLoot(game,p,id,generation,item){
 const e=game.ents.get(id),entries=available(game,p,e,generation);
 if(!entries||p.lootTarget?.id!==id||p.lootTarget?.generation!==generation)return fail('Loot is no longer available.');
 const selected=item===null?[...entries]:entries.filter(x=>x.id===item);
 if(!selected.length)return fail('That loot has already been collected or is unavailable.');
 let taken=0;
 for(const entry of selected){
  const ok=entry.kind==='material'?grantSalvage(game,p,entry.id,entry.quantity):grantItem(game,p,entry.id);
  if(ok){entries.splice(entries.indexOf(entry),1);taken++;}
 }
 if(!entries.length){e.lootByPlayer.delete(p.id);clearLoot(p);}
 return taken?{ok:true}:fail('Cannot collect this loot: already owned or material storage full.');
}
