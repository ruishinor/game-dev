// Player-visible level thresholds and duration preview. XP awards are server-owned.
export const CRAFTING_DISCIPLINES=Object.freeze(['Engineering','Research']);
export const DISCIPLINE_THRESHOLDS=Object.freeze([0,40,100,180,280,400,550,730,940,1180]);
const CAP=DISCIPLINE_THRESHOLDS.at(-1);
function validXp(xp){return Number.isSafeInteger(xp)&&xp>=0?Math.min(xp,CAP):0;}
export function sanitizeCraftingDisciplines(raw){
 return Object.fromEntries(CRAFTING_DISCIPLINES.map(name=>[name,validXp(raw?.[name])]));
}
export function disciplineProgress(raw,name){
 const xp=validXp(raw?.[name]);
 let level=1;
 while(level<DISCIPLINE_THRESHOLDS.length&&xp>=DISCIPLINE_THRESHOLDS[level])level++;
 const floor=DISCIPLINE_THRESHOLDS[level-1],next=DISCIPLINE_THRESHOLDS[level]??null;
 return {xp,level,progress:next===null?0:xp-floor,required:next===null?null:next-floor,speedBonus:(level-1)*2};
}
export function disciplineDuration(base,raw,name){
 return Math.max(50,Math.ceil(base*(1-disciplineProgress(raw,name).speedBonus/100)/50)*50);
}
