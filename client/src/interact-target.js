// Interaction intent is derived from one latest server snapshot, not delayed
// presentation transforms. The server still validates range and ownership.
export function nearestInteractable(entities,selfId,you,range=5){
 const self=entities.get(selfId);
 if(!self||self.dead||!Number.isFinite(you?.x)||!Number.isFinite(you?.z)||!Number.isFinite(range)||range<0)return null;
 const eligible=new Set((you.lootable??[]).map(x=>x.id));
 let best=null,bestD=range;
 for(const ent of entities.values()){
  const row=ent.row,kind=ent.meta?.k;
  if(!row||!Number.isFinite(row.x)||!Number.isFinite(row.z))continue;
  if(kind!=='o'&&!(kind==='e'&&ent.dead&&eligible.has(ent.id)))continue;
  const d=Math.hypot(row.x-you.x,row.z-you.z);
  if(d<bestD||(d===bestD&&(!best||ent.id<best.id))){best=ent;bestD=d;}
 }
 return best;
}
