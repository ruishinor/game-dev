// Advisory presentation over existing public recipes; never authorize crafting.
import { MATERIALS, RECIPES, missingRecipeKnowledge } from '../../shared/crafting.js';
import { CLASSES } from '../../shared/content.js';

export function materialUses(sheet,id){
  if(!sheet||!Object.hasOwn(CLASSES,sheet.cls)||!Object.hasOwn(MATERIALS,id))return [];
  return Object.entries(RECIPES)
    .filter(([,r])=>Object.hasOwn(r.inputs,id)&&(!r.cls||r.cls===sheet.cls)&&(!r.attackKind||r.attackKind===CLASSES[sheet.cls].auto.kind)&&!missingRecipeKnowledge(sheet,r))
    .map(([recipeId,r])=>({id:recipeId,name:r.name,quantity:r.inputs[id]}));
}
