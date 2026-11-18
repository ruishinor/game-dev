// Presentation-only validation of server-authored directive receipts.
// Never use receipt history as eligibility or grant authority.
import {CLASSES,DIRECTIVES,ITEMS,directiveFor} from './content.js';

export function sanitizeDirectiveReceipts(raw,cls,step){
 if(!Array.isArray(raw)||typeof cls!=='string'||!Object.hasOwn(CLASSES,cls)||!Number.isInteger(step)||step<0||step>DIRECTIVES.length)return [];
 const known=new Map(DIRECTIVES.slice(0,step).map((d,i)=>[d.id,directiveFor(cls,i).reward]));
 const seen=new Set(),out=[];
 for(const row of raw.slice(0,DIRECTIVES.length)){
  if(!row||typeof row.id!=='string'||seen.has(row.id)||!known.has(row.id))continue;
  const reward=known.get(row.id);
  if(!Number.isSafeInteger(row.xp)||row.xp<0||row.xp>(reward.xp||0))continue;
  if(row.item!==null&&(typeof row.item!=='string'||row.item!==reward.classItem?.[cls]||!Object.hasOwn(ITEMS,row.item)))continue;
  seen.add(row.id);out.push({id:row.id,xp:row.xp,item:row.item});
 }
 return out;
}
