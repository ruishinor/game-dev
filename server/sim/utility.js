// Server-only execution. Clients submit authenticated intent.
import {sanitizeGoods} from '../../shared/goods.js';
import {conditionOf,sanitizeCondition,CONDITION_MAX} from '../../shared/condition.js';
import {ITEMS} from '../../shared/content.js';
const fail=reason=>({ok:false,reason});
export function useUtility(game,p,item,weapon,rev){
 if(item!=='field_maintenance_kit'||!Number.isSafeInteger(rev)||rev!==p.utilityRev)return fail('Utility request expired or unavailable.');
 if(p.dead||game.time<p.combatUntil)return fail('Maintenance is unavailable during combat or defeat.');
 if(typeof weapon!=='string'||weapon!==p.char.equipped?.weapon)return fail('Equip the weapon you intend to maintain.');
 const current=conditionOf(p.char,weapon),goods=sanitizeGoods(p.char.goods);
 if(current===null||current===CONDITION_MAX||!goods[item])return fail('Carry a maintenance kit and equip a damaged repairable weapon.');
 const next=Math.min(CONDITION_MAX,current+25),condition=sanitizeCondition(p.char.condition,p.char.inventory);
 if(next===CONDITION_MAX)delete condition[weapon];else condition[weapon]=next;
 if(--goods[item]===0)delete goods[item];
 p.char.goods=goods;p.char.condition=condition;p.utilityRev++;
 game.markDirty(p);game.message(p,'gain',ITEMS[weapon].name+' restored to '+next+'% condition.');
 game.emitWorldEvent({e:'fx',k:'field_maintenance',s:p.id});
 return {ok:true};
}
