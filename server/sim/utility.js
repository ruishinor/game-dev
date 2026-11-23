// Server-only execution. Clients submit authenticated intent.
import {sanitizeGoods} from '../../shared/goods.js';
import {WEAPON_SLOTS,equippedWeapon} from '../../shared/weapons.js';
import {conditionOf,sanitizeCondition,CONDITION_MAX} from '../../shared/condition.js';
import {ITEMS} from '../../shared/content.js';
const fail=reason=>({ok:false,reason});
export const RESTORATIVE=Object.freeze({fraction:0.3,ticks:5,recoveryMs:20000});
function useRestorative(game,p){
 if(p.dead)return fail('You cannot use that while defeated.');
 const goods=sanitizeGoods(p.char.goods);
 if(!goods.field_restorative)return fail('Carry a Field Restorative.');
 if(game.time<(p.restorativeReadyAt||0))return fail('The last dose is still settling.');
 if(--goods.field_restorative===0)delete goods.field_restorative;
 p.char.goods=goods;p.utilityRev++;p.restorativeReadyAt=game.time+RESTORATIVE.recoveryMs;
 game.economy?.observe('goods_spent',p,1,'field_restorative');
 const per=Math.ceil(p.maxHp*RESTORATIVE.fraction/RESTORATIVE.ticks);
 const i=p.buffs.findIndex(b=>b.k==='restorative'),buff={k:'restorative',until:game.time+RESTORATIVE.ticks*1000+50,next:game.time+1000,per,src:p.id};
 if(i>=0)p.buffs[i]=buff;else p.buffs.push(buff);
 game.markDirty(p);
 game.emitWorldEvent({e:'fx',k:'field_restorative',s:p.id});
 return {ok:true};
}
export function useUtility(game,p,item,weapon,rev){
 if(item==='field_restorative'&&Number.isSafeInteger(rev)&&rev===p.utilityRev)return useRestorative(game,p);
 if(item!=='field_maintenance_kit'||!Number.isSafeInteger(rev)||rev!==p.utilityRev)return fail('Utility request expired or unavailable.');
 if(p.dead||game.time<p.combatUntil)return fail('Maintenance is unavailable during combat or defeat.');
 if(typeof weapon!=='string'||!WEAPON_SLOTS.some(slot=>equippedWeapon(p.char,slot)===weapon))return fail('Equip the weapon you intend to maintain.');
 const current=conditionOf(p.char,weapon),goods=sanitizeGoods(p.char.goods);
 if(current===null||current===CONDITION_MAX||!goods[item])return fail('Carry a maintenance kit and equip a damaged repairable weapon.');
 const next=Math.min(CONDITION_MAX,current+25),condition=sanitizeCondition(p.char.condition,p.char.inventory);
 if(next===CONDITION_MAX)delete condition[weapon];else condition[weapon]=next;
 if(--goods[item]===0)delete goods[item];
 p.char.goods=goods;p.char.condition=condition;p.utilityRev++;
 game.economy?.observe('goods_spent',p,1,'field_maintenance_kit');
 game.markDirty(p);game.message(p,'gain',ITEMS[weapon].name+' restored to '+next+'% condition.');
 game.emitWorldEvent({e:'fx',k:'field_maintenance',s:p.id});
 return {ok:true};
}
