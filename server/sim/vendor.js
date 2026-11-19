// Server-owned, visit-scoped trading. All quote tables are server-only.
// Public playtest prices are provisional; inventory and wallet mutate together.
import {randomUUID} from 'node:crypto';
import {dist,hasLineOfSight,inSanctum} from '../../shared/world.js';
import {MATERIALS,MATERIAL_CAP,sanitizeMaterials} from '../../shared/crafting.js';
import {GOODS,GOODS_CAP,sanitizeGoods} from '../../shared/goods.js';
import {sanitizeCredits,walletAfter} from './wallet.js';
import {ITEMS} from '../../shared/content.js';
import {sanitizeCondition,conditionOf} from '../../shared/condition.js';
import {repairPrice} from './condition.js';
const BUY=Object.freeze({mire_fibre:8,sentinel_alloy:12});
const BUY_EQUIPMENT=Object.freeze({field_emitter:12,electrical_combat_rod:24,social_service_coat:8,social_relay_coat:12});
const BUY_UTILITIES=Object.freeze({field_maintenance_kit:12});
const SELL=Object.freeze({mire_husk:2,spent_contact:3});
const RANGE=5,BUYBACK_LIMIT=8;
const fail=reason=>({ok:false,reason});
const permitted=(game,p,o)=>!!p&&!p.dead&&game.time>=p.combatUntil&&o?.kind==='object'&&o.type==='quartermaster'&&inSanctum(p)&&dist(p,o)<=RANGE&&hasLineOfSight(p,o);
const current=(game,p)=>p.vendor&&permitted(game,p,game.ents.get(p.vendor.id))?p.vendor:null;
export function closeVendor(p){p.vendor=null;}
export function openVendor(game,p,id){
 const o=game.ents.get(id);
 if(!permitted(game,p,o))return fail('Approach the quartermaster outside combat.');
 if(current(game,p)?.id===id)return {ok:true};
 p.lootTarget=null;
 p.vendor={id,ticket:randomUUID(),rev:0,buyback:[]};
 return {ok:true};
}
export function tickVendor(game,p){if(p.vendor&&!current(game,p))closeVendor(p);}
export function vendorState(game,p){
 const session=current(game,p);if(!session)return null;
 const goods=sanitizeGoods(p.char.goods),materials=sanitizeMaterials(p.char.materials);
 const credits=sanitizeCredits(p.char.credits);
 return {id:session.id,name:game.ents.get(session.id).name,ticket:session.ticket,rev:session.rev,credits,
  buy:[...Object.entries(BUY).map(([id,price])=>({id,name:MATERIALS[id].name,price,max:Math.min(MATERIAL_CAP-(materials[id]||0),Math.floor(credits/price))})),...Object.entries(BUY_UTILITIES).map(([id,price])=>({id,name:GOODS[id].name,price,max:Math.min(GOODS_CAP-(goods[id]||0),Math.floor(credits/price))})),...Object.entries(BUY_EQUIPMENT).map(([id,price])=>({id,name:ITEMS[id].name,price,ql:ITEMS[id].ql,...(ITEMS[id].slot==='social_torso'?{cosmetic:true}:{}),max:!p.char.inventory.includes(id)&&credits>=price&&(!ITEMS[id].cls||ITEMS[id].cls===p.cls)?1:0}))],
  repair:p.char.inventory.flatMap(id=>{const price=repairPrice(p.char,id);return price===null?[]:[{id,name:ITEMS[id].name,price,condition:conditionOf(p.char,id),max:credits>=price?1:0}];}),
  sell:Object.entries(SELL).filter(([id])=>goods[id]>0).map(([id,price])=>({id,name:GOODS[id].name,price,quantity:goods[id]})),
  buyback:session.buyback.map(r=>({...r,name:GOODS[r.id].name,max:credits>=r.total&&(goods[r.id]||0)+r.quantity<=GOODS_CAP?r.quantity:0})),
 };
}
export function tradeVendor(game,p,msg){
 const session=current(game,p);
 if(!session||msg?.ticket!==session.ticket||msg.rev!==session.rev)return fail('Trade quote expired. Reopen or refresh the vendor.');
 if(!Number.isSafeInteger(msg.qty)||msg.qty<1||msg.qty>99||typeof msg.id!=='string')return fail('Invalid trade quantity or item.');
 const goods=sanitizeGoods(p.char.goods),materials=sanitizeMaterials(p.char.materials);
 const credits=sanitizeCredits(p.char.credits);
 const inventory=[...p.char.inventory],condition=sanitizeCondition(p.char.condition,inventory);
 let delta=0,receipts=[...session.buyback],label='',newItem=null;
 const record=(id,quantity)=>{
  const total=SELL[id]*quantity;
  receipts.push({receipt:session.rev+':'+id,id,quantity,total});
  delta+=total;
  goods[id]-=quantity;if(!goods[id])delete goods[id];
 };
 if(msg.op==='buy'){
  if(Object.hasOwn(BUY_EQUIPMENT,msg.id)){
   if(msg.qty!==1||inventory.includes(msg.id))return fail(ITEMS[msg.id].slot==='social_torso'?'A unique coat can be purchased only once while owned.':'A unique weapon can be purchased only once while owned.');
   if(ITEMS[msg.id].cls&&ITEMS[msg.id].cls!==p.cls)return fail('This weapon is restricted to another class.');
   delta=-BUY_EQUIPMENT[msg.id];inventory.push(msg.id);newItem=msg.id;label='Purchased '+ITEMS[msg.id].name+'.';
  }else if(Object.hasOwn(BUY_UTILITIES,msg.id)){
   if((goods[msg.id]||0)+msg.qty>GOODS_CAP)return fail('Utility storage full.');
   delta=-BUY_UTILITIES[msg.id]*msg.qty;goods[msg.id]=(goods[msg.id]||0)+msg.qty;
   label='Purchased '+GOODS[msg.id].name+' × '+msg.qty+'.';
  }else{
   if(!Object.hasOwn(BUY,msg.id))return fail('Item is not sold here.');
   if((materials[msg.id]||0)+msg.qty>MATERIAL_CAP)return fail('Material storage full.');
   delta=-BUY[msg.id]*msg.qty;materials[msg.id]=(materials[msg.id]||0)+msg.qty;
   label='Purchased '+MATERIALS[msg.id].name+' × '+msg.qty+'.';
  }
 }else if(msg.op==='repair'){
  const price=repairPrice(p.char,msg.id);
  if(msg.qty!==1||price===null)return fail('This item does not need repair or is not owned.');
  delta=-price;delete condition[msg.id];label='Repaired '+ITEMS[msg.id].name+'.';
 }else if(msg.op==='sell'){
  if(!Object.hasOwn(SELL,msg.id)||(goods[msg.id]||0)<msg.qty)return fail('You do not own that trade salvage.');
  record(msg.id,msg.qty);label='Sold '+GOODS[msg.id].name+' × '+msg.qty+'.';
 }else if(msg.op==='sell_junk'){
  if(msg.id!==''||msg.qty!==1)return fail('Invalid bulk sale.');
  for(const id of Object.keys(SELL))if(goods[id])record(id,goods[id]);
  if(!delta)return fail('No trade salvage to sell.');
  label='Sold carried junk.';
 }else if(msg.op==='buyback'){
  const receipt=receipts.find(r=>r.receipt===msg.id);
  if(!receipt||receipt.quantity!==msg.qty)return fail('That buyback offer is unavailable.');
  if((goods[receipt.id]||0)+receipt.quantity>GOODS_CAP)return fail('Trade storage full.');
  delta=-receipt.total;goods[receipt.id]=(goods[receipt.id]||0)+receipt.quantity;
  receipts=receipts.filter(r=>r!==receipt);label='Bought back '+GOODS[receipt.id].name+' × '+receipt.quantity+'.';
 }else return fail('Unsupported vendor operation.');
 const balance=walletAfter(credits,delta);
 if(balance===null)return fail(delta<0?'Insufficient credits.':'Credit wallet full.');
 // Only commit after all checks. A replay with the same quote revision fails.
 p.char.goods=goods;p.char.materials=materials;p.char.credits=balance;p.char.inventory=inventory;p.char.condition=condition;
 session.buyback=receipts.slice(-BUYBACK_LIMIT);session.rev++;
 if(newItem)p.outbox.push({e:'loot',item:newItem});
 game.markDirty(p);game.message(p,'gain',label+' Balance: '+balance+' credits.');
 return {ok:true};
}
