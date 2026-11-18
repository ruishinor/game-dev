// Display only: death/retreat take precedence over the neutral flag.
export function enemyTargetStatus(meta,row,dead=false){
 if(dead||row.f&1||row.h===0)return {tone:'hostile',label:'Defeated · remains'};
 if(row.f&2)return {tone:'hostile',label:'Retreating'};
 if(meta.neu&&!(row.f&8))return {tone:'neutral',label:'Neutral · retaliates if attacked'};
 return {tone:'hostile',label:meta.el?'Elite':'Hostile'};
}
