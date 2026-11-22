// Local HUD relevance only. Tracking preferences, progression and the
// full Journal are never modified or hidden by this presentation heuristic.
export function dungeonQuestContext(zone){
 if(typeof zone!=='string')return null;
 if(zone.startsWith('Phase Annex'))return 'annex';
 if(zone.startsWith('Silent Foundry'))return 'foundry';
 return null;
}
export function questIsLocalToDungeon(quest,context){
 if(!context)return true;
 if(!quest||typeof quest!=='object')return false;
 const id=String(quest.id||'').toLowerCase();
 const group=String(quest.group||'').toLowerCase();
 const title=String(quest.title||'').toLowerCase();
 const text=id+' '+group+' '+title;
 if(context==='annex')return /annex|phase.?scar|phase.?index|rift|null.?chamber|null.?breach/.test(text);
 if(context==='foundry')return /silent.?foundry|foundry|excavation|harmonic|fabrication|cultivation|depths/.test(text);
 return true;
}
