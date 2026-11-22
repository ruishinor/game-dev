// Personal corpse loot. The server rolls once per eligible death/recipient.
// Client requests may only collect extant, server-authored entries.
import {ITEMS} from '../../shared/content.js';
import {MATERIALS,MATERIAL_CAP} from '../../shared/crafting.js';
import {itemDrops,SALVAGE,TRADE_SALVAGE,relicDrop,creditDrop,blueprintDrop,classArmourBlueprintDrop,isEliteEnemy,eliteUncommonDrop,ELITE_RESOURCE} from './loot-tables.js';
import {sanitizeCredits,walletAfter} from './wallet.js';
import {GOODS,goodsCap} from '../../shared/goods.js';
import {grantGoods} from './goods.js';
import {dist,hasLineOfSight,deepLineClear,sameTravelRegion} from '../../shared/world.js';
import {CORPSE_MS} from './game.js';
import {grantItem,grantSalvage} from './progress.js';

// These explicitly classified enemies cannot grant equipment items. Their
// existing material, goods and credit paths remain independent.
// Lumenfen's new fauna have no bespoke equipment table. Keep the original
// elite *material* grants; defer new equipment rewards to an authorized table review.
export const NO_ITEM_REWARD_TYPES=Object.freeze(['severance_soldier', 'fen_lantern', 'fen_stalker']);
const LOOT_RANGE=5, CREDIT_RANGE=70;
const fail=reason=>({ok:false,reason});
const active=(game,e)=>e?.kind==='enemy'&&e.state==='dead'&&game.time-e.deadAt<=CORPSE_MS;
export function distributeCorpseLoot(game,e,credited){
 if(!active(game,e)||e.lootByPlayer instanceof Map)return;
 e.lootGeneration=(e.lootGeneration||0)+1;e.lootByPlayer=new Map();
 const allowItems=!NO_ITEM_REWARD_TYPES.includes(e.type);
 for(const id of new Set(credited)){
  const p=game.players.get(id);if(!p||!sameTravelRegion(p,e)||dist(p,e)>CREDIT_RANGE)continue;
  const entries=[],material=SALVAGE[e.type],goods=TRADE_SALVAGE[e.type];
  // Preserve starter material recovery; equipment and blueprints roll independently.
  // A corpse without salvage or another successful reward remains empty.
  if(Object.hasOwn(MATERIALS,material)&&(p.char.materials?.[material]||0)<MATERIAL_CAP)entries.push({id:material,kind:'material',quantity:1});
  for(const drop of allowItems?itemDrops(e.type):[])if(Object.hasOwn(ITEMS,drop.item)&&!p.char.inventory.includes(drop.item)&&game.rng()<drop.chance)entries.push({id:drop.item,kind:'item',quantity:1});
  if(Object.hasOwn(GOODS,goods)&&(p.char.goods?.[goods]||0)<goodsCap(goods))entries.push({id:goods,kind:'goods',quantity:1});
  const credits=creditDrop(e.type);
  if(credits>0&&walletAfter(sanitizeCredits(p.char.credits),credits)!==null)entries.push({id:'credits',kind:'credits',quantity:credits});
  const relic=relicDrop(e.type,game.relicRng);
  if(relic&&(p.char.goods?.[relic]||0)<goodsCap(relic))entries.push({id:relic,kind:'goods',quantity:1});
  const print=blueprintDrop(e.type,game.blueprintRng);
  if(print&&(p.char.goods?.[print]||0)<goodsCap(print))entries.push({id:print,kind:'goods',quantity:1});
  if(isEliteEnemy(e)){
   const r=ELITE_RESOURCE,have=p.char.materials?.[r.id]||0,same=entries.find(x=>x.kind==='material'&&x.id===r.id);
   const q=Math.min(r.quantity,MATERIAL_CAP-have-(same?.quantity||0));
   if(q>0){if(same)same.quantity+=q;else entries.push({id:r.id,kind:'material',quantity:q});}
   // Owner decision (2026-11-21): the Severance squads, sergeants included, drop no items.
   const uncommon=allowItems?eliteUncommonDrop(e,p.char,game.eliteRng):null;
   if(uncommon&&Object.hasOwn(ITEMS,uncommon)&&!entries.some(x=>x.id===uncommon))entries.push({id:uncommon,kind:'item',quantity:1});
  }
  const armourPrint=classArmourBlueprintDrop(e.type,p.char,game.classArmourRng);
  if(armourPrint&&Object.hasOwn(GOODS,armourPrint)&&(p.char.goods?.[armourPrint]||0)<goodsCap(armourPrint))entries.push({id:armourPrint,kind:'goods',quantity:1});
  if(entries.length)e.lootByPlayer.set(id,entries);
 }
}
function available(game,p,e,generation,near=true){
 if(p.dead||!active(game,e)||!sameTravelRegion(p,e)||e.lootGeneration!==generation)return null;
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
 p.vendor=null;
 p.lootTarget={id,generation};
 return auto?takeLoot(game,p,id,generation,null):{ok:true};
}
// Only a server-created personal corpse entry can reach this grant path.
function collectCredits(game,p,quantity){
 if(!Number.isSafeInteger(quantity)||quantity<1)return false;
 const balance=walletAfter(sanitizeCredits(p.char.credits),quantity);
 if(balance===null)return false;
 p.char.credits=balance;game.markDirty(p);
 game.message(p,'gain','Recovered '+quantity+' credit'+(quantity===1?'':'s')+'.');
 return true;
}
function collectEntries(game,p,e,entries,item){
 const selected=item===null?[...entries]:entries.filter(x=>x.id===item);
 if(!selected.length)return fail('That loot has already been collected or is unavailable.');
 let taken=0;
 for(const entry of selected){
  const ok=entry.kind==='material'?grantSalvage(game,p,entry.id,entry.quantity):entry.kind==='goods'?grantGoods(game,p,entry.id,entry.quantity):entry.kind==='item'?grantItem(game,p,entry.id):entry.kind==='credits'?collectCredits(game,p,entry.quantity):false;
  if(ok){entries.splice(entries.indexOf(entry),1);taken++;}
 }
 if(!entries.length){e.lootByPlayer.delete(p.id);if(p.lootTarget?.id===e.id)clearLoot(p);}
 return taken?{ok:true}:fail('Cannot collect this loot: already owned, storage full or wallet full.');
}
export function takeLoot(game,p,id,generation,item){
 const e=game.ents.get(id),entries=available(game,p,e,generation);
 if(!entries||p.lootTarget?.id!==id||p.lootTarget?.generation!==generation)return fail('Loot is no longer available.');
 return collectEntries(game,p,e,entries,item);
}
// Internal companion requests are not wire commands. Only already rolled
// personal entries are eligible, with the same capacity and removal rules.
export function striderLootTarget(game,p,c){
 if(p.companion!==c||c.type!=='survey_strider'||p.dead||p.autoOn||p.combatUntil>game.time)return null;
 return game.enemies.filter(e=>available(game,p,e,e.lootGeneration,false)&&dist(p,e)<=18&&dist(p,c)<=28&&deepLineClear(p,e)).sort((a,b)=>dist(c,a)-dist(c,b)||a.id-b.id)[0]??null;
}
export function recoverStriderLoot(game,p,c,id,generation){
 const e=game.ents.get(id);
 if(p.companion!==c||c.type!=='survey_strider'||c.mode!=='recover'||p.dead||p.autoOn||p.combatUntil>game.time||!e||dist(p,e)>18||dist(p,c)>28||dist(c,e)>3.2||!hasLineOfSight(c,e)||!deepLineClear(p,e))return fail('Recovery interrupted or out of range.');
 const entries=available(game,p,e,generation,false);
 return entries?collectEntries(game,p,e,entries,null):fail('No remaining personal loot.');
}
