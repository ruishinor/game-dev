// Navigate the public catalogue using ordinary player input. No game state or
// filter overrides: recipes hidden by eligibility/search must remain unreachable.
export async function revealRecipe(workshop,id){
  const list=workshop.locator('.workshop-recipes');
  await list.waitFor({state:'visible'});
  const target=list.locator('[data-recipe="'+id+'"]');
  if(await target.isVisible())return target;
  const previous=list.getByRole('button',{name:'Previous recipes',exact:true});
  const next=list.getByRole('button',{name:'Next recipes',exact:true});
  for(let i=0;i<100&&await previous.count()&&await previous.isEnabled();i++){
    await previous.click();
    if(await target.isVisible())return target;
  }
  for(let i=0;i<100&&await next.count()&&await next.isEnabled();i++){
    await next.click();
    if(await target.isVisible())return target;
  }
  throw Error('Recipe not available in the visible catalogue: '+id);
}
