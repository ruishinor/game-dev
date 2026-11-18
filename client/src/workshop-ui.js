// Build planning never changes equipped state. Workshop commits only a
// recipe ID; the authoritative server revalidates skill, materials and location.
import { ITEMS, SLOTS, SLOT_NAMES, SKILL_NAMES, ATTUNEMENT_NAMES } from '../../shared/content.js';
import { weaponBonus, weaponReach } from '../../shared/condition.js';
import { itemArt } from './journal-ui.js';
import { deriveStats, validateLoadout } from '../../shared/build.js';
import { MATERIALS, RECIPES, previewRecipe, canFabricateAt } from '../../shared/crafting.js';
const h=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
const row=(label,value,met)=>{const el=h('div','workshop-row');el.append(h('span',null,label),h('span',met===undefined?'':met?'met':'unmet',value));return el;};
const btn=(label,action,cls='')=>{const b=h('button',cls,label);b.type='button';b.addEventListener('click',action);return b;};
const recipeOutput=r=>r.output.item?ITEMS[r.output.item]:MATERIALS[r.output.material];
const visual=(id,name,sub,met)=>{
  const card=h('div','fabrication-visual');card.append(itemArt(id));
  const copy=h('div','fabrication-copy');copy.append(h('strong',null,name));
  if(sub)copy.append(h('small',met===undefined?'muted':met?'met':'unmet',sub));
  card.append(copy);return card;
};
const LESSONS=[
  ['Plan before you commit','Choose a device, implant or glyph in Build Planner. Compare Current and Planned statistics. Unowned items can be previewed; the planner never equips or spends anything.','planner'],
  ['Recover components','Open Workshop. Select a recipe and inspect its source components. The icon, owned count and source tell you what to recover. Mire Skitters provide fibre; Rogue Sentinels provide alloy; the Vault Warden provides resonance fragments.','fabrication'],
  ['Meet requirements','Check skills, attunement and location. Equip skill-boosting equipment in Character [C] if needed. The Sanctum supports general fabrication; commissioned Brineworks A handles Research and B Engineering. Some recipes require a specific site.','fabrication'],
  ['Fabricate and install','Target equipment must be carried, not installed. Fabrication spends materials; upgrades replace their target, and permanent fusion consumes both target items. Check the result, then fabricate and install it in Character [C].','fabrication'],
];
function tutorial(ui){
  const panel=h('section','workshop-tutorial');
  const head=h('div','tutorial-head');head.append(h('strong',null,'Field manual · Build & Fabrication'));
  const toggle=btn(ui.workshopTutorialOpen?'Hide tutorial':'Open tutorial',()=>{ui.workshopTutorialOpen=!ui.workshopTutorialOpen;renderWorkshop(ui);});
  toggle.setAttribute('aria-expanded',String(!!ui.workshopTutorialOpen));head.append(toggle);panel.append(head);
  if(!ui.workshopTutorialOpen)return panel;
  const n=Math.max(0,Math.min(LESSONS.length-1,ui.workshopLesson||0)),[title,copy,tab]=LESSONS[n];
  panel.append(h('div','kicker','Lesson '+(n+1)+' / '+LESSONS.length),h('h3',null,title),h('p',null,copy));
  const actions=h('div','tutorial-actions');
  const back=btn('Previous',()=>{ui.workshopLesson=n-1;renderWorkshop(ui);});back.disabled=n===0;
  const view=btn(tab==='planner'?'Show Planner':'Show Workshop',()=>{ui.workshopTab=tab;renderWorkshop(ui);});
  const next=btn(n===LESSONS.length-1?'Finish tutorial':'Next',()=>{if(n===LESSONS.length-1){ui.workshopTutorialOpen=false;ui.workshopTutorialSeen=true;try{localStorage.setItem('attunement.workshopTutorial','1');}catch{}}else{ui.workshopLesson=n+1;ui.workshopTab=LESSONS[n+1][2];}renderWorkshop(ui);},'primary');
  actions.append(back,view,next);panel.append(actions);return panel;
}

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
    if(setup[slot]&&ITEMS[setup[slot]])left.append(visual(setup[slot],ITEMS[setup[slot]].name,ITEMS[setup[slot]].summary||ITEMS[setup[slot]].desc));
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
  compare('Aegis capacity',s.stats.shieldMul,stats.shieldMul,pct);
  compare('Weapon auto-attack bonus',weaponBonus(s),weaponBonus(hypothetical),n=>n.toFixed(1));
  compare('Auto-attack reach',weaponReach(s),weaponReach(hypothetical),n=>Number(n.toFixed(2))+'m');
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
    b.dataset.recipe=key;const copy=h('div','recipe-entry-copy');copy.append(h('strong',null,r.name),h('small',null,r.discipline));b.replaceChildren(itemArt(r.output.item||r.output.material),copy);list.append(b);
  }
  const detail=h('section','workshop-section recipe-detail');
  detail.append(h('div','kicker',recipe.discipline),h('h2',null,recipe.name));
  const parts=h('div','recipe-parts');
  const source=h('div','recipe-part');
  source.append(h('div','kicker','Source components'));
  for(const [key,count] of Object.entries(recipe.inputs)){
    const quantity=s.materials?.[key]||0;
    source.append(visual(key,MATERIALS[key].name,quantity+' / '+count+' · '+MATERIALS[key].source,quantity>=count));
  }
  if(!Object.keys(recipe.inputs).length)source.append(h('p','muted','No additional material required.'));
  const target=h('div','recipe-part');
  const targets=recipe.targets??(recipe.target?[recipe.target]:[]);
  target.append(h('div','kicker',recipe.kind==='fusion'?'Consumed equipment':'Target'));
  for(const item of targets){
    const has=s.inventory.includes(item),installed=Object.values(s.equipped).includes(item);
    target.append(visual(item,ITEMS[item].name,installed?'Installed — remove first':has?'Carried · consumed':'Not owned',has&&!installed));
  }
  if(!targets.length)target.append(h('p','muted','New assembly'));
  parts.append(source,target);
  const result=h('div','recipe-result');
  result.append(h('div','kicker','Result'),visual(recipe.output.item||recipe.output.material,output.name+(recipe.output.count?' × '+recipe.output.count:''),output.summary||output.desc));
  detail.append(parts,result,h('h3',null,'Requirements'));
  for(const [key,min] of Object.entries(recipe.requires||{}))detail.append(row(SKILL_NAMES[key],(s.stats.skills[key]||0)+' / '+min,(s.stats.skills[key]||0)>=min));
  if(recipe.attune)detail.append(row('Attunement: '+ATTUNEMENT_NAMES[recipe.attune],s.attunements.includes(recipe.attune)?'Met':'Missing',s.attunements.includes(recipe.attune)));
  const site=ui.workshopSite??(ui.atSanctum?'sanctum':null),siteOk=canFabricateAt(recipe,site);
  const names={sanctum:'Lattice Sanctum',brine_research:'A · Research Station',brine_engineering:'B · Engineering Station'};
  detail.append(row('Fabrication site',site?names[site]:'Outside workshop',siteOk));
  const preview=previewRecipe(s,id);
  const reason=ui.buildLock?'Unavailable during combat or defeat.':!siteOk?'Approach '+(recipe.site?names[recipe.site]:'the Sanctum or commissioned '+recipe.discipline+' station')+'.':!preview.ok?preview.reason:'';
  if(reason)detail.append(h('p','why',reason));
  const execute=btn(recipe.kind==='restore'?'Restore':recipe.kind==='upgrade'?'Fabricate variant':recipe.kind==='fusion'?'Fuse permanently':'Fabricate',()=>ui.a.craft(id),'primary');
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
  if(ui.workshopTutorialOpen===undefined){try{ui.workshopTutorialSeen=localStorage.getItem('attunement.workshopTutorial')==='1';}catch{}ui.workshopTutorialOpen=!ui.workshopTutorialSeen;}
  root.append(tabs,tutorial(ui));
  const content=h('div','workshop-layout'+(ui.workshopTab==='fabrication'?' fabrication':''));
  if(ui.workshopTab==='fabrication')fabrication(ui,content);else planner(ui,content);
  root.append(content);
}
