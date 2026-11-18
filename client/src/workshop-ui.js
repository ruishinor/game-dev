// Build planning never changes equipped state. Workshop commits only a
// recipe ID; the authoritative server revalidates skill, materials and location.
import { ITEMS, CLASSES, SLOTS, SLOT_NAMES, SKILL_NAMES, ATTUNEMENT_NAMES } from '../../shared/content.js';
import { weaponBonus, weaponReach } from '../../shared/condition.js';
import { itemArt, itemTooltip } from './journal-ui.js';
import { deriveStats, validateLoadout } from '../../shared/build.js';
import { MATERIALS, RECIPES, previewRecipe, canFabricateAt, productionQuantities, productionTime, previewProduction, productionRisk } from '../../shared/crafting.js';
import { GOODS } from '../../shared/goods.js';
const h=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
const row=(label,value,met)=>{const el=h('div','workshop-row');el.append(h('span',null,label),h('span',met===undefined?'':met?'met':'unmet',value));return el;};
const btn=(label,action,cls='')=>{const b=h('button',cls,label);b.type='button';b.addEventListener('click',action);return b;};
const outputId=r=>r.output.item||r.output.material||r.output.goods;
const recipeOutput=r=>r.output.item?ITEMS[r.output.item]:r.output.goods?GOODS[r.output.goods]:MATERIALS[r.output.material];
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
  const quantities = productionQuantities(recipe);
  const quantity = quantities.includes(ui.productionQuantity) ? ui.productionQuantity : quantities[0];
  const cycles = quantity / (recipe.output.count || 1);
  const list=h('nav','workshop-recipes');
  list.setAttribute('aria-label','Fabrication recipes');
  const search = h('input', 'recipe-search');
  search.type = 'search';
  search.placeholder = 'Find a recipe or item';
  search.setAttribute('aria-label', 'Find a recipe or item');
  const discipline = h('select');
  discipline.setAttribute('aria-label', 'Production discipline');
  for (const label of ['All disciplines', ...new Set(entries.map(([, r]) => r.discipline))]) {
    const option = h('option', null, label);
    option.value = label;
    discipline.append(option);
  }
  const filter = ui.recipeFilter ??= { query: '', discipline: 'All disciplines', materials: false, prioritize: false };
  search.value = filter.query;
  discipline.value = filter.discipline;
  const controls = h('div', 'recipe-filters');
  controls.append(search, discipline);
  for (const [key, label] of [['materials', 'Materials on hand'], ['prioritize', 'Craftable first']]) {
    const wrapper = h('label'), input = h('input');
    input.type = 'checkbox';
    input.checked = filter[key];
    input.addEventListener('change', () => { filter[key] = input.checked; applyFilters(); });
    wrapper.append(input, document.createTextNode(label));
    controls.append(wrapper);
  }
  const site = ui.workshopSite ?? (ui.atSanctum ? 'sanctum' : null);
  const buttons = [];
  for(const [key,r] of entries){
    const b=btn(r.name,()=>{ui.recipeId=key;ui.productionQuantity=null;renderWorkshop(ui);},'recipe-entry'+(key===id?' active':''));
    b.dataset.recipe=key;
    const craftable = !ui.buildLock && canFabricateAt(r, site) && previewRecipe(s, key).ok;
    const hasMaterials = Object.entries(r.inputs).every(([input, required]) => (s.materials?.[input] || 0) >= required);
    b.classList.toggle('recipe-unavailable', !craftable);
    const copy=h('div','recipe-entry-copy');
    copy.append(h('strong',null,r.name),h('small',null,r.discipline));
    b.replaceChildren(itemArt(outputId(r)),copy);
    buttons.push({ b, craftable, hasMaterials, discipline: r.discipline, text: `${r.name} ${recipeOutput(r).name}`.toLowerCase() });
  }
  function applyFilters() {
    const query = filter.query.trim().toLowerCase();
    const shown = buttons.filter(row => row.text.includes(query)
      && (discipline.selectedIndex === 0 || row.discipline === filter.discipline)
      && (!filter.materials || row.hasMaterials));
    if (filter.prioritize) shown.sort((a, b) => Number(b.craftable) - Number(a.craftable));
    list.replaceChildren(...shown.map(row => row.b));
    if (!shown.length) list.append(h('p', 'muted', 'No recipes match these filters.'));
  }
  search.addEventListener('input', () => { filter.query = search.value; applyFilters(); });
  search.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    ui.toggleWorkshop(false);
    ui.a.focusView();
  });
  discipline.addEventListener('change', () => { filter.discipline = discipline.value; applyFilters(); });
  applyFilters();
  const detail=h('section','workshop-section recipe-detail');
  detail.append(h('div','kicker',recipe.discipline),h('h2',null,recipe.name));
  if (quantities.length > 1) {
    const label = h('label', 'production-quantity', 'Quantity');
    const select = h('select');
    for (const option of quantities) {
      const choice = h('option', null, String(option));
      select.append(choice);
    }
    select.value = String(quantity);
    select.addEventListener('change', () => {
      ui.productionQuantity = Number(select.value);
      renderWorkshop(ui);
      ui.workshopBody.querySelector('.production-quantity select')?.focus({ preventScroll: true });
    });
    label.append(select);
    detail.append(label);
  }
  detail.append(h('p', 'muted', `${quantity} produced · ${Math.round(cycles * productionTime(recipe) / 100) / 10}s`));
  const parts=h('div','recipe-parts');
  const source=h('div','recipe-part');
  source.append(h('div','kicker','Source components'));
  for(const [key,count] of Object.entries(recipe.inputs)){
    const quantity=s.materials?.[key]||0;
    const required = count * cycles;
    const component=visual(key,MATERIALS[key].name,quantity+' / '+required+' · '+MATERIALS[key].source,quantity>=required);
    component.tabIndex=0;
    ui.hover(component,()=>itemTooltip(s,key,{owned:quantity,required}));
    source.append(component);
  }
  if(!Object.keys(recipe.inputs).length)source.append(h('p','muted','No additional material required.'));
  const target=h('div','recipe-part');
  const targets=recipe.targets??(recipe.target?[recipe.target]:[]);
  target.append(h('div','kicker',recipe.kind==='fusion'?'Consumed equipment':'Target'));
  for(const item of targets){
    const has=s.inventory.includes(item),installed=Object.values(s.equipped).includes(item);
    const component=visual(item,ITEMS[item].name,installed?'Installed — remove first':has?'Carried · consumed':'Not owned',has&&!installed);
    component.tabIndex=0;
    ui.hover(component,()=>itemTooltip(s,item,{owned:Number(has),required:1}));
    target.append(component);
  }
  if(!targets.length)target.append(h('p','muted','New assembly'));
  parts.append(source,target);
  const result=h('div','recipe-result');
  result.append(h('div','kicker','Result'),visual(outputId(recipe),output.name+(quantity > 1?' × '+quantity:''),output.summary||output.desc));
  detail.append(parts,result,h('h3',null,'Requirements'));
  if(recipe.cls)detail.append(row('Profession',CLASSES[recipe.cls].name,s.cls===recipe.cls));
  if(recipe.kind==='fusion')detail.append(h('p','why','Permanent fusion: all listed equipment and materials are consumed. This cannot be reversed.'));
  const risk = productionRisk(id);
  if (risk) detail.append(h('p', 'why', `A failed rebuild keeps the emitter and consumes 1 ${MATERIALS[risk].name}.`));
  for(const [key,min] of Object.entries(recipe.requires||{}))detail.append(row(SKILL_NAMES[key],(s.stats.skills[key]||0)+' / '+min,(s.stats.skills[key]||0)>=min));
  if(recipe.attune)detail.append(row('Attunement: '+ATTUNEMENT_NAMES[recipe.attune],s.attunements.includes(recipe.attune)?'Met':'Missing',s.attunements.includes(recipe.attune)));
  const siteOk=canFabricateAt(recipe,site);
  const names={sanctum:'Lattice Sanctum',brine_research:'A · Research Station',brine_engineering:'B · Engineering Station'};
  detail.append(row('Fabrication site',site?names[site]:'Outside workshop',siteOk));
  const preview=previewProduction(s,id,quantity);
  const reason=ui.buildLock?'Unavailable during combat or defeat.':!siteOk?'Approach '+(recipe.site?names[recipe.site]:'the Sanctum or commissioned '+recipe.discipline+' station')+'.':!preview.ok?preview.reason:'';
  if(reason)detail.append(h('p','why',reason));
  const execute=btn(recipe.kind==='restore'?'Restore':recipe.kind==='upgrade'?'Fabricate variant':recipe.kind==='fusion'?'Fuse permanently':'Fabricate',()=>ui.a.craft(id,quantity,s.inventoryRev),'primary');
  execute.disabled=!!reason;execute.dataset.craft=id;
  detail.append(execute);
  const catalogue = h('div', 'recipe-catalogue');
  catalogue.append(controls,list);
  body.append(catalogue,detail);
}

export function updateProduction(ui) {
  const job = ui.production;
  const body = ui.workshopBody;
  if (!job || !body.querySelector('.workshop-cycle-progress')) return;
  const cycle = body.querySelector('.workshop-cycle-progress');
  cycle.max = job.total;
  cycle.value = job.total - job.ms;
  const batch = body.querySelector('.workshop-batch-progress');
  if (batch) {
    batch.max = job.cycles;
    batch.value = job.complete + cycle.value / cycle.max;
  }
  const units = RECIPES[job.id].output.count || 1;
  const text = `${job.complete * units} / ${job.quantity} produced`;
  const status = body.querySelector('.workshop-production-status');
  if (status.textContent !== text) status.textContent = text;
}

export function renderWorkshop(ui){
  if(!ui.sheet)return;
  const root=ui.workshopBody;
  const searchFocused = root.querySelector('.recipe-search') === document.activeElement;
  if (root.contains(ui.tipFor)) ui.tooltip.hidden = true;
  root.replaceChildren();
  ui.workshopPanel.classList.toggle('producing', !!ui.production);
  if (ui.production && Object.hasOwn(RECIPES, ui.production.id)) {
    const recipe = RECIPES[ui.production.id];
    const status = h('p', 'workshop-production-status');
    status.setAttribute('role', 'status');
    const cycle = h('progress', 'workshop-cycle-progress');
    cycle.setAttribute('aria-label', 'Current production cycle');
    root.append(h('h3', null, recipeOutput(recipe).name), status, cycle);
    if (ui.production.cycles > 1) {
      const batch = h('progress', 'workshop-batch-progress');
      batch.setAttribute('aria-label', 'Overall production progress');
      root.append(batch);
    }
    root.append(btn('Cancel production', () => ui.a.cancelProduction()));
    updateProduction(ui);
    return;
  }
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
  if (searchFocused) root.querySelector('.recipe-search')?.focus({ preventScroll: true });
}
