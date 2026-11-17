// Build planning never changes equipped state. Workshop commits only a
// recipe ID; the authoritative server revalidates skill, materials and location.
import { ITEMS, SLOTS, SLOT_NAMES, SKILL_NAMES, ATTUNEMENT_NAMES } from '../../shared/content.js';
import { deriveStats, validateLoadout } from '../../shared/build.js';
import { MATERIALS, RECIPES, previewRecipe, canFabricateAt } from '../../shared/crafting.js';
const h=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
const row=(label,value,met)=>{const el=h('div','workshop-row');el.append(h('span',null,label),h('span',met===undefined?'':met?'met':'unmet',value));return el;};
const btn=(label,action,cls='')=>{const b=h('button',cls,label);b.type='button';b.addEventListener('click',action);return b;};
const recipeOutput=r=>r.output.item?ITEMS[r.output.item]:MATERIALS[r.output.material];

function planner(ui,body){
  const s=ui.sheet;
  const setup=ui.plannedLoadout??={...s.equipped};
  const left=h('section','workshop-section');
  left.append(h('h3',null,'Proposed loadout'),h('p','muted','Compare equipment combinations without changing your live character.'));
  for(const slot of SLOTS){
    const label=h('label','planner-slot',SLOT_NAMES[slot]);
    const select=h('select');
    select.dataset.slot=slot;
    const empty=h('option',null,'Empty');empty.value='';select.append(empty);
    for(const [id,item] of Object.entries(ITEMS)){
      if(item.slot!==slot||(item.cls&&item.cls!==s.cls))continue;
      const option=h('option',null,item.name+(s.inventory.includes(id)?'':' · not owned'));
      option.value=id;select.append(option);
    }
    select.value=setup[slot]||'';
    select.addEventListener('change',()=>{setup[slot]=select.value||null;renderWorkshop(ui);});
    label.append(select);left.append(label);
    if(setup[slot])left.append(h('p','planner-effect',ITEMS[setup[slot]]?.summary||ITEMS[setup[slot]]?.desc||''));
  }
  left.append(btn('Reset to equipped',()=>{ui.plannedLoadout={...s.equipped};renderWorkshop(ui);}));
  const hypothetical={...s,inventory:[...new Set([...s.inventory,...Object.values(setup).filter(Boolean)])],equipped:setup};
  const res=validateLoadout(hypothetical,setup),owned=validateLoadout(s,setup),stats=deriveStats(hypothetical);
  const right=h('section','workshop-section');
  right.append(h('h3',null,'Projected statistics'));
  const score=h('div','workshop-comparison');
  const headings=h('div','comparison-head');headings.append(h('span',null,'Statistic'),h('span',null,'Current'),h('span',null,'Planned'));score.append(headings);
  const pct=n=>Math.round((n-1)*100)+'%';
  const compare=(name,a,b,format=String)=>{
    const line=h('div','comparison-line');line.append(h('span',null,name),h('span',null,format(a)),h('span',a===b?'':'changed',format(b)));score.append(line);
  };
  for(const k of Object.keys(SKILL_NAMES))compare(SKILL_NAMES[k],s.stats.skills[k],stats.skills[k]);
  compare('Maximum health',s.stats.maxHp,stats.maxHp);
  compare('Power modifier',s.stats.power,stats.power,pct);
  compare('Damage modifier',s.stats.dmgMul,stats.dmgMul,pct);
  compare('Healing modifier',s.stats.healMul,stats.healMul,pct);
  compare('Charge generation',s.stats.chargeMul,stats.chargeMul,pct);
  compare('Extra Discharge radius',s.stats.dischargeRadius,stats.dischargeRadius,n=>n+'m');
  right.append(score);
  right.append(h('p',res.ok?(owned.ok?'met':'muted'):'why',!res.ok?'Requirements not met: '+res.reason:!owned.ok?'The proposed build is mechanically compatible, but one or more items are not owned.':'Requirements met with current ownership.'));
  if(!res.ok)right.append(h('p','muted','Statistics above are hypothetical; the build cannot be equipped as shown.'));
  right.append(h('p','muted','No changes applied. Equip or remove items in Character [C] after checking dependencies.'));
  body.append(left,right);
}
function fabrication(ui,body){
  const s=ui.sheet;
  const entries=Object.entries(RECIPES);
  const id=Object.hasOwn(RECIPES,ui.recipeId)?ui.recipeId:entries[0][0];
  ui.recipeId=id;
  const recipe=RECIPES[id],output=recipeOutput(recipe);
  const list=h('nav','workshop-recipes');
  list.setAttribute('aria-label','Fabrication recipes');
  for(const [key,r] of entries){
    const b=btn(r.name,()=>{ui.recipeId=key;renderWorkshop(ui);},'recipe-entry'+(key===id?' active':''));
    b.dataset.recipe=key;b.append(h('small',null,r.discipline));list.append(b);
  }
  const detail=h('section','workshop-section recipe-detail');
  detail.append(h('div','kicker',recipe.discipline),h('h2',null,recipe.name));
  const parts=h('div','recipe-parts');
  const source=h('div','recipe-part');
  source.append(h('div','kicker','Source components'));
  for(const [key,count] of Object.entries(recipe.inputs)){
    const quantity=s.materials?.[key]||0;
    source.append(row(MATERIALS[key].name,quantity+' / '+count,quantity>=count));
  }
  if(!Object.keys(recipe.inputs).length)source.append(h('p','muted','No additional material required.'));
  const target=h('div','recipe-part');
  target.append(h('div','kicker','Target'));
  if(recipe.target){
    const has=s.inventory.includes(recipe.target),installed=Object.values(s.equipped).includes(recipe.target);
    target.append(h('div','iname',ITEMS[recipe.target].name),h('p',has&&!installed?'met':'why',installed?'Installed — remove first':has?'Carried · consumed':'Not owned'));
  }else target.append(h('p','muted','New assembly'));
  parts.append(source,target);
  const result=h('div','recipe-result');
  result.append(h('div','kicker','Result'),h('div','iname',output.name+(recipe.output.count?' × '+recipe.output.count:'')),h('p',null,output.summary||output.desc));
  detail.append(parts,result,h('h3',null,'Requirements'));
  for(const [key,min] of Object.entries(recipe.requires||{}))detail.append(row(SKILL_NAMES[key],(s.stats.skills[key]||0)+' / '+min,(s.stats.skills[key]||0)>=min));
  if(recipe.attune)detail.append(row('Attunement: '+ATTUNEMENT_NAMES[recipe.attune],s.attunements.includes(recipe.attune)?'Met':'Missing',s.attunements.includes(recipe.attune)));
  const site=ui.workshopSite??(ui.atSanctum?'sanctum':null),siteOk=canFabricateAt(recipe,site);
  const names={sanctum:'Lattice Sanctum',brine_research:'A · Research Station',brine_engineering:'B · Engineering Station'};
  detail.append(row('Fabrication site',site?names[site]:'Outside workshop',siteOk));
  const preview=previewRecipe(s,id);
  const reason=ui.buildLock?'Unavailable during combat or defeat.':!siteOk?'Approach '+(recipe.site?names[recipe.site]:'the Sanctum or commissioned '+recipe.discipline+' station')+'.':!preview.ok?preview.reason:'';
  if(reason)detail.append(h('p','why',reason));
  const execute=btn(recipe.kind==='restore'?'Restore':recipe.kind==='upgrade'?'Fabricate variant':'Fabricate',()=>ui.a.craft(id),'primary');
  execute.disabled=!!reason;execute.dataset.craft=id;
  detail.append(execute);
  body.append(list,detail);
}
export function renderWorkshop(ui){
  if(!ui.sheet)return;
  const root=ui.workshopBody;root.replaceChildren();
  const tabs=h('div','workshop-tabs');
  for(const [id,name] of [['planner','Build Planner'],['fabrication','Workshop']]){
    const b=btn(name,()=>{ui.workshopTab=id;renderWorkshop(ui);},ui.workshopTab===id?'active':'');
    b.dataset.tab=id;b.setAttribute('aria-pressed',String(ui.workshopTab===id));tabs.append(b);
  }
  root.append(tabs);
  const content=h('div','workshop-layout'+(ui.workshopTab==='fabrication'?' fabrication':''));
  if(ui.workshopTab==='fabrication')fabrication(ui,content);else planner(ui,content);
  root.append(content);
}
