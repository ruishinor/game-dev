// The character sheet, inventory and Codex share a small visual language.
// All displayed items, slots and requirements come from authoritative data.
import { ITEMS, SLOT_NAMES, LOOKS } from '../../shared/content.js';
import { describeRequirements, tryEquip, tryUnequip } from '../../shared/build.js';
import { GROUPS, ENTRIES } from './journal.js';

function h(tag, cls, text) {
  const e=document.createElement(tag);
  if(cls)e.className=cls;
  if(text!==undefined)e.textContent=text;
  return e;
}
const art={
  sporeglass_focus:'<path d="M12 2 20 9 15 21 5 14zM12 2v14l8-7M5 14l7 2 3 5"/>',
  servo_harness:'<path d="M4 5h5v8h6V5h5v14h-5v-3H9v3H4z"/><path d="M9 9h6"/>',
  wardstone_shard:'<path d="m12 2 8 6-3 12-10 2-4-9zM12 2l-1 14 6 4M3 13l8 3 9-8"/>',
  myelin_lattice:'<path d="M4 4 20 20M4 20 20 4M4 12h16M12 4v16"/><circle cx="12" cy="12" r="5"/>',
  kinetic_capacitor:'<rect x="6" y="4" width="12" height="17" rx="3"/><path d="M9 4V2m6 2V2m-4 6-3 5h6l-2 5"/>',
  adrenal_shunt:'<path d="M4 19 20 5M5 10l9 9m-8-4 5 5m1-13 5 5m-1-8 4 4M3 21l3-3"/>',
  glyph_shared_pulse:'<circle cx="12" cy="12" r="9"/><path d="M12 6v12M6 12h12M3 3l3 3m12 12 3 3"/>',
  glyph_carapace:'<path d="M12 2 20 6v7c0 4-4 7-8 9-4-2-8-5-8-9V6zM12 5v14M6 8l6 3 6-3"/>',
  glyph_resonant_aegis:'<path d="m12 3 9 5v8l-9 5-9-5V8zM12 7v10M7 12h10"/>',
  glyph_rending_echo:'<path d="M3 18C8 9 13 5 21 5M7 21C12 12 16 9 22 9M2 11c3-5 7-7 12-8"/>',
  location:'<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="3"/>',
  glyph:'<path d="M12 2 22 12 12 22 2 12zM12 6l5 6-5 6-5-6z"/>',
  device:'<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9h6v6H9zM2 9h3m14 0h3M2 15h3m14 0h3"/>',
  implant:'<path d="M12 3 19 7v10l-7 4-7-4V7zM12 7v10M8 12h8"/>',
};
function itemArt(id) {
  const slot=ITEMS[id]?.slot || '';
  const e=h('span','item-art '+slot);
  // All paths are static literals above, never player or server-provided HTML.
  e.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(art[id]||art[slot]||art.glyph)+'</svg>';
  return e;
}
function requirements(s,id) {
  return describeRequirements(s,id).map(r=>{
    const line=h('div','req '+(r.met?'met':'unmet'),(r.met?'✓ ':'✗ ')+r.text);
    if(r.detail){ line.title=r.detail; line.setAttribute('aria-label',r.text+'. '+r.detail); }
    return line;
  });
}
function equipmentCard(ui,id,equipped,onSelect,showDescription=false) {
  const s=ui.sheet,item=ITEMS[id];
  const card=h('div','card compact-item'+(equipped?' slotcard':''));
  const label=h('div','compact-item-label');
  label.append(itemArt(id),h('div','iname',item.name));
  card.append(h('div','kicker',SLOT_NAMES[item.slot]),label);
  card.append(h('div',showDescription?'idesc':'item-summary',showDescription?item.desc:(item.summary||item.desc)));
  if(!equipped)card.append(...requirements(s,id));
  const res=equipped?tryUnequip(s,item.slot):tryEquip(s,id);
  const btn=h('button',res.ok&&!equipped?'primary':'',equipped?'Remove':s.equipped[item.slot]?'Swap in':'Equip');
  btn.disabled=!res.ok||!!ui.buildLock;
  btn.addEventListener('click',e=>{
    e.stopPropagation();
    onSelect?.(id);
    if(equipped)ui.a.unequip(item.slot);else ui.a.equip(id);
  });
  card.append(btn);
  if(!res.ok)card.append(h('div','why',res.reason));
  if(onSelect)card.addEventListener('click',()=>onSelect(id));
  ui.hover(label,()=>[h('div','tip-title',item.name),h('div','tip-body',item.desc)]);
  return card;
}

// Categories organize actual equipment, not additional gameplay slots.
// Glyphs and devices are gear; implants have a dedicated tab.
const LOADOUT_TABS = [
  {id:'gear',name:'Gear',slots:['device','glyph']},
  {id:'implants',name:'Implants',slots:['implant']},
  {id:'weapons',name:'Weapons',slots:[]},
  {id:'social',name:'Social clothing',slots:[]},
];
export function renderLoadout(ui,body,stats) {
  const s=ui.sheet;
  const tab=LOADOUT_TABS.find(t=>t.id===ui.loadoutTab)||LOADOUT_TABS[0];
  const doll=h('section','paperdoll');
  const tabs=h('div','doll-tabs');
  tabs.setAttribute('role','group');
  tabs.setAttribute('aria-label','Equipment category');
  for(const t of LOADOUT_TABS){
    const btn=h('button',t.id===tab.id?'active':'',t.name);
    btn.type='button';
    btn.dataset.tab=t.id;
    btn.setAttribute('aria-pressed',String(t.id===tab.id));
    btn.addEventListener('click',()=>{
      if(ui.loadoutTab===t.id)return;
      ui.loadoutTab=t.id;
      ui.loadoutSelection=null;
      ui.renderBuild();
    });
    tabs.append(btn);
  }
  doll.append(tabs);
  const portrait=h('div','doll-portrait');
  const data=ui.a.portrait({k:'p',c:s.cls,a:s.look});
  if(data){const img=h('img','doll-image');img.src=data;img.alt='Current character appearance';portrait.append(img);}
  else portrait.append(h('div','doll-fallback','Appearance preview unavailable'));
  const column=h('section','pcol loadout-column');
  const list=h('div','loadout-list');
  const detail=h('div','loadout-detail');
  let emptySlot=null;
  const select=(id,slot=null)=>{
    ui.loadoutSelection=id;
    emptySlot=slot;
    detail.replaceChildren();
    const item=ITEMS[id];
    if(item)detail.append(h('div','kicker',SLOT_NAMES[item.slot]),h('div','iname',item.name),h('p','idesc',item.desc));
    else detail.append(h('div','muted',emptySlot?'No '+SLOT_NAMES[emptySlot]+' installed.':'Select a slot or item.'));
  };
  const slots=h('div','doll-slots');
  for(const slot of tab.slots){
    const id=s.equipped[slot];
    const btn=h('button','doll-slot'+(id?' installed':''));
    btn.append(id?itemArt(id):h('span','empty-slot-symbol','+'),h('span','slot-caption',SLOT_NAMES[slot]));
    btn.title=id?ITEMS[id].name:'Empty '+SLOT_NAMES[slot]+' slot';
    btn.addEventListener('click',()=>select(id||null,id?null:slot));
    slots.append(btn);
  }
  doll.append(portrait);
  if(tab.slots.length)doll.append(slots);
  if(tab.slots.length){
    column.append(h('h3',null,'Loadout'),list,h('h3',null,'Details'),detail);
    for(const slot of tab.slots){
      const id=s.equipped[slot];
      if(id)list.append(equipmentCard(ui,id,true,select));
      else {const card=h('div','card slotcard empty');card.append(h('div','kicker',SLOT_NAMES[slot]),h('div','muted','Not installed'));list.append(card);}
    }
    const spare=s.inventory.filter(id=>ITEMS[id]&&tab.slots.includes(ITEMS[id].slot)&&s.equipped[ITEMS[id].slot]!==id);
    if(spare.length){list.append(h('h3',null,'Available equipment'));for(const id of spare)list.append(equipmentCard(ui,id,false,select));}
    if(!s.inventory.includes(ui.loadoutSelection)||!tab.slots.includes(ITEMS[ui.loadoutSelection]?.slot))
      ui.loadoutSelection=tab.slots.map(slot=>s.equipped[slot]).find(Boolean)||spare[0]||null;
    select(ui.loadoutSelection);
  }else if(tab.id==='social'){
    const look=(LOOKS[s.cls]||[]).find(l=>l.id===s.look);
    column.append(h('h3',null,'Current appearance'));
    const card=h('div','card');
    card.append(h('div','iname',look?.name||'Class appearance'),h('p','idesc',look?.blurb||'Current class look.'),h('div','muted','Social clothing is not yet equippable.'));
    column.append(card);
  }else{
    column.append(h('h3',null,'Weapons'),h('div','card empty','Weapon equipment is not yet available. There are no weapon slots in the current game.'));
  }
  body.append(stats,doll,column);
}

export function renderInventory(ui) {
  const s=ui.sheet;
  if(!s)return;
  const root=ui.inventoryBody;
  if(ui.tipFor&&root.contains(ui.tipFor))ui.tooltip.hidden=true;
  root.replaceChildren();
  const tabs=h('div','inventory-tabs');
  for(const [id,name] of [['all','All'],['device','Gear'],['implant','Implants'],['glyph','Glyphs'],['weapon','Weapons'],['quest','Quest items']]){
    const btn=h('button',ui.inventoryFilter===id?'active':'',name);
    btn.setAttribute('aria-pressed',String(ui.inventoryFilter===id));
    btn.addEventListener('click',()=>{ui.inventoryFilter=id;ui.inventorySelection=null;renderInventory(ui);});
    tabs.append(btn);
  }
  const carried=s.inventory.filter(id=>ITEMS[id]&&s.equipped[ITEMS[id].slot]!==id);
  const items=carried.filter(id=>ui.inventoryFilter==='all'||ITEMS[id].slot===ui.inventoryFilter);
  if(!items.includes(ui.inventorySelection))ui.inventorySelection=items[0]||null;
  const grid=h('div','inventory-grid');
  for(const id of items){
    const item=ITEMS[id];
    const btn=h('button','item-cell'+(ui.inventorySelection===id?' active':''));
    btn.append(itemArt(id));
    btn.title=item.name;btn.setAttribute('aria-label',item.name);
    btn.addEventListener('click',()=>{ui.inventorySelection=id;renderInventory(ui);});
    ui.hover(btn,()=>[h('div','tip-title',item.name),h('div','tip-body',item.desc)]);
    grid.append(btn);
  }
  // Empty cells reproduce the grid, not a storage-capacity mechanic.
  for(let i=items.length;i<24;i++){const empty=h('div','item-cell vacant');empty.setAttribute('aria-hidden','true');grid.append(empty);}
  root.append(tabs,h('div','inventory-count',items.length+' shown · '+carried.length+' carried'),grid);
  if(!items.length)root.append(h('p','muted',ui.inventoryFilter==='weapon'||ui.inventoryFilter==='quest'?'No items of this type exist in the current slice.':'No items in this category.'));
  if(ui.inventorySelection){
    const id=ui.inventorySelection;
    const card=equipmentCard(ui,id,false,null,true);
    card.classList.add('inventory-detail');
    root.append(card);
  }
  if(ui.buildLock)root.append(h('div','why','Equipment changes are locked during combat or defeat.'));
}

export function renderCodex(ui,abilityIcons) {
  const out=ui.codexContent;
  out.replaceChildren();
  const nav=h('nav','codex-nav');
  const query=(ui.codexQuery||'').trim().toLowerCase();
  const terms=query.split(/\s+/).filter(Boolean);
  const matches=ENTRIES.filter(entry=>terms.every(term=>[entry.name,entry.group,entry.type,entry.desc,...entry.facts].join(' ').toLowerCase().includes(term)));
  if(query){
    nav.append(h('div','codex-results-count',matches.length+' result'+(matches.length===1?'':'s')));
    for(const entry of matches){
      const link=h('button','codex-entry'+(ui.codexSelection===entry.id?' active':''));
      link.append(h('span',null,entry.name),h('small',null,entry.group));
      link.addEventListener('click',()=>{ui.codexGroup=entry.group;ui.codexSelection=entry.id;renderCodex(ui,abilityIcons);});
      nav.append(link);
    }
  }else for(const group of GROUPS){
    const btn=h('button','codex-category'+(ui.codexGroup===group?' active':''),group);
    btn.setAttribute('aria-expanded',String(ui.codexGroup===group));
    btn.addEventListener('click',()=>{ui.codexGroup=group;ui.codexSelection=ENTRIES.find(e=>e.group===group)?.id||null;renderCodex(ui,abilityIcons);});
    nav.append(btn);
    if(ui.codexGroup===group){
      const entries=h('div','codex-entries');
      for(const entry of ENTRIES.filter(e=>e.group===group)){
        const link=h('button','codex-entry'+(ui.codexSelection===entry.id?' active':''),entry.name);
        link.addEventListener('click',()=>{ui.codexSelection=entry.id;renderCodex(ui,abilityIcons);});
        entries.append(link);
      }
      if(!entries.childElementCount)entries.append(h('div','muted','No entries yet'));
      nav.append(entries);
    }
  }
  const entry=(query?matches:ENTRIES).find(e=>e.id===ui.codexSelection&&e.group===ui.codexGroup);
  const copy=h('section','codex-copy'),imagePane=h('section','codex-image-pane');
  if(entry){
    copy.append(h('div','kicker',entry.type),h('h2',null,entry.name),h('p',null,entry.desc));
    const facts=h('div','codex-facts');
    for(const fact of entry.facts)facts.append(h('div','codex-fact',fact));
    copy.append(facts);
    const picture=h('div','codex-image');
    let pictured=false;
    if(entry.meta){
      const data=ui.a.portrait(entry.meta);
      if(data){const img=h('img');img.src=data;img.alt=entry.name+' in-game model';picture.append(img);pictured=true;}
    }
    if(!pictured){
      if(entry.item)picture.append(itemArt(entry.item));
      else if(entry.ability&&abilityIcons[entry.ability]){
        const icon=h('span','codex-symbol');icon.innerHTML=abilityIcons[entry.ability];picture.append(icon);
      }else picture.append(itemArt(entry.zone?'location':'glyph'));
    }
    imagePane.append(picture,h('div','codex-caption',pictured?'Current in-game model':'Reference schematic'),h('div','kicker',entry.group));
  } else {
    if(query)copy.append(h('h2',null,matches.length?'Select an entry':'No matching entries'),h('p','muted',matches.length?'Choose a search result to read its entry.':'Try a different name, ability, item or keyword.'));
    else copy.append(h('div','kicker',ui.codexGroup),h('h2',null,'No entries recorded'),h('p','muted','This category is reserved for future content.'));
  }
  out.append(nav,copy,imagePane);
}
