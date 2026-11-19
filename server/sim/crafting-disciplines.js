import {CRAFTING_DISCIPLINES,sanitizeCraftingDisciplines,disciplineProgress} from '../../shared/crafting-disciplines.js';
// Only called after a committed crafting transaction. One award per
// production cycle, not per output unit; reversible free restorations award none.
export function creditDiscipline(game,p,recipe){
 if(!CRAFTING_DISCIPLINES.includes(recipe.discipline)||recipe.kind==='restore')return 0;
 const inputUnits=Object.values(recipe.inputs||{}).reduce((a,b)=>a+b,0);
 if(!Number.isSafeInteger(inputUnits)||inputUnits<1)return 0;
 const name=recipe.discipline,old=sanitizeCraftingDisciplines(p.char.craftingDisciplines);
 const amount=8+Math.min(14,inputUnits)*3+(recipe.kind==='fusion'?12:recipe.kind==='upgrade'?6:0);
 const before=disciplineProgress(old,name);
 const next=sanitizeCraftingDisciplines({...old,[name]:old[name]+amount});
 const after=disciplineProgress(next,name),earned=after.xp-before.xp;
 p.char.craftingDisciplines=next;
 if(earned>0)game.message(p,'gain',name+' +'+earned+' XP'+(after.level>before.level?' · Level '+after.level+' reached!':'')+'.');
 return earned;
}
