// The character sheet, inventory and Codex share a small visual language.
// All displayed items, slots and requirements come from authoritative data.
import { ITEMS, SLOT_NAMES, LOOKS } from '../../shared/content.js';
import { describeRequirements, tryEquip, tryUnequip } from '../../shared/build.js';
import { GROUPS, ENTRIES } from './journal.js';
import { MATERIALS } from '../../shared/crafting.js';

function h(tag, cls, text) {
  const e=document.createElement(tag);
  if(cls)e.className=cls;
  if(text!==undefined)e.textContent=text;
  return e;
}
const art={
  aegis_rectifier:'<path d="m12 2 8 4v6l-8 10-8-10V6zM4 6l8 6 8-6M12 12v10"/><circle cx="12" cy="8" r="2"/>',
  brine_rescue_lattice:'<path d="M4 5h16v14H4zM12 6v12M6 12h12M4 5l4 4m12-4-4 4M4 19l4-4m12 4-4-4"/>',
  keeper_resonator:'<path d="M5 4h14v16H5zM7 12l3-5 4 10 3-5"/>',
  glyph_hinge:'<path d="M4 20V7l8-4 8 4v13M4 20l8-4 8 4M12 3v13"/>',

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
function bindItem(ui,el,id) {
  el.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();ui.openItemContext(id,e.clientX,e.clientY,el);});
  el.addEventListener('keydown',e=>{
    if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){
      e.preventDefault();e.stopPropagation();const r=el.getBoundingClientRect();
      ui.openItemContext(id,r.left,r.bottom,el);
    }
  });
  el.draggable=true;
  el.addEventListener('dragstart',e=>{
    if(ui.buildLock||!ui.sheet?.inventory.includes(id)){e.preventDefault();return;}
    ui.dragItem=id; e.dataTransfer.effectAllowed='move';
    e.dataTransfer.setData('application/x-attunement-item',id);
  });
  el.addEventListener('dragend',()=>{ui.dragItem=null;});
}
function itemDrop(ui,el,accept,apply){
  el.ondragover=e=>{
    if(ui.dragItem&&accept(ui.dragItem)){e.preventDefault();e.dataTransfer.dropEffect='move';}
  };
  el.ondrop=e=>{
    const id=ui.dragItem;
    if(!id||e.dataTransfer.getData('application/x-attunement-item')!==id||!accept(id))return;
    e.preventDefault();e.stopPropagation();ui.dragItem=null;apply(id);
  };
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
  card.tabIndex=0;
  bindItem(ui,card,id);
  ui.hover(label,()=>[h('div','tip-title',item.name),h('div','tip-body',item.desc)]);
  return card;
}

// The planned slot layout is UI-only. Only the three existing server
// slots may ever produce an equip/unequip request.
const present = (key, label, col, row, slot = null) => ({key,label,col,row,slot});
const LOADOUT_TABS = [
  {id:'character',name:'Character',slots:[]},
  {id:'gear',name:'Gear',slots:[
    present('back','Back',1,1),present('head','Head',2,1),present('neck','Neck',3,1),
    present('arms','Arms',1,2),present('chest','Chest',2,2),present('hands','Hands',3,2),
    present('waist','Waist',1,3),present('legs','Legs',2,3),present('feet','Feet',3,3),
    present('device','Device',1,4,'device'),present('utility','Utility',2,4),present('glyph','Glyph',3,4,'glyph'),
  ]},
  {id:'implants',name:'Implants',slots:[
    present('eyes','Eyes',1,1),present('brain','Brain',2,1),present('ear','Ear',3,1),
    present('left-arm','Left arm',1,2),present('torso','Torso',2,2),present('right-arm','Right arm',3,2),
    present('left-hand','Left hand',1,3),present('implant','Implant',2,3,'implant'),present('right-hand','Right hand',3,3),
    present('left-leg','Left leg',1,4),present('spine','Spine',2,4),present('right-leg','Right leg',3,4),
  ]},
  {id:'glyphs',name:'Glyphs',slots:[present('glyph','Glyph',2,2,'glyph')]},
  {id:'weapons',name:'Weapons',slots:[
    present('right-hand','Right hand',1,1),present('left-hand','Left hand',3,1),
    present('ranged','Ranged',2,2),present('utility-1','Utility 1',1,3),present('utility-2','Utility 2',3,3),
  ]},
  {id:'social',name:'Social clothing',slots:[
    present('back','Back',1,1),present('head','Head',2,1),present('face','Face',3,1),
    present('arms','Arms',1,2),present('torso','Torso',2,2),present('hands','Hands',3,2),
    present('waist','Waist',1,3),present('legs','Legs',2,3),present('feet','Feet',3,3),
  ]},
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
    const slotFor={gear:'device',implants:'implant',glyphs:'glyph'}[t.id];
    const unseen=[...(ui.unseenItems||[])].filter(id=>ITEMS[id]?.slot===slotFor);
    if(unseen.length){btn.classList.add('new-equipment');btn.title=unseen.length+' new item(s)';btn.setAttribute('aria-label',t.name+' · '+unseen.length+' new item(s)');}
    btn.setAttribute('aria-pressed',String(t.id===tab.id));
    btn.addEventListener('click',()=>{
      if(unseen.length){for(const id of unseen)ui.unseenItems.delete(id);ui.buildBtn.classList.toggle('new',ui.unseenItems.size>0);ui.inventoryBtn.classList.toggle('new',ui.unseenItems.size>0);}
      if(ui.loadoutTab===t.id&&!unseen.length)return;
      ui.loadoutTab=t.id;
      ui.loadoutSelection=ui.loadoutSlot=null;
      ui.renderBuild();
    });
    tabs.append(btn);
  }
  doll.append(tabs);
  const column=h('section','pcol loadout-column');
  const list=h('div','loadout-list');
  const detail=h('div','loadout-detail');
  const buttons=new Map();
  const actualSlots=tab.id==='character'?['device','implant','glyph']:tab.slots.map(t=>t.slot).filter(Boolean);
  const allowed=id=>!!ITEMS[id]&&s.inventory.includes(id)&&actualSlots.includes(ITEMS[id].slot);
  const renderDetail=()=>{
    detail.replaceChildren();
    const slot=tab.slots.find(t=>t.key===ui.loadoutSlot);
    const id=allowed(ui.loadoutSelection)?ui.loadoutSelection:slot?.slot?s.equipped[slot.slot]:null;
    const item=ITEMS[id];
    if(item)detail.append(h('div','kicker',SLOT_NAMES[item.slot]),h('div','iname',item.name),h('p','idesc',item.desc));
    else if(slot&&!slot.slot)detail.append(h('div','kicker','Reserved slot'),h('div','iname',slot.label),h('p','idesc','Not yet available. This slot is reserved for a future equipment system.'));
    else if(slot)detail.append(h('div','kicker','Empty slot'),h('div','iname',slot.label),h('p','idesc','No item installed. Choose compatible equipment from the loadout list.'));
    else detail.append(h('div','muted',tab.id==='character'?'Choose an installed item.':'Select a slot or item.'));
    for(const [key,btn] of buttons){
      const selected=key===ui.loadoutSlot;
      btn.classList.toggle('selected',selected);
      btn.setAttribute('aria-pressed',String(selected));
    }
  };
  const selectItem=id=>{
    ui.loadoutSelection=id;
    ui.loadoutSlot=tab.slots.find(t=>t.slot===ITEMS[id]?.slot)?.key||null;
    renderDetail();
  };
  if(tab.id==='character'){
    const look=(LOOKS[s.cls]||[]).find(l=>l.id===s.look);
    const portrait=h('div','doll-portrait');
    const data=ui.a.portrait({k:'p',c:s.cls,a:s.look});
    if(data){const img=h('img','doll-image');img.src=data;img.alt='Current character appearance';portrait.append(img);}
    else portrait.append(h('div','doll-fallback','Appearance preview unavailable'));
    doll.append(portrait,h('div','appearance-caption',look?.name||'Current appearance'));
  }else{
    const grid=h('div','equipment-slot-grid');
    grid.setAttribute('aria-label',tab.name+' equipment slots');
    // Front orthographic render from the actual class/look model.
    const sketch=h('div','equipment-sketch');
    sketch.setAttribute('aria-hidden','true');
    const blueprint=ui.a.portrait({k:'p',c:s.cls,a:s.look},'sketch');
    if(blueprint){const img=h('img');img.src=blueprint;img.alt='';sketch.append(img);}
    grid.append(sketch);
    const rows=Math.max(...tab.slots.map(t=>t.row));
    grid.style.setProperty('--slot-rows',rows);
    for(const slot of tab.slots){
      const id=slot.slot?s.equipped[slot.slot]:null;
      const state=!slot.slot?'reserved':id?'installed':'empty';
      const btn=h('button','doll-slot '+state);
      btn.type='button';
      btn.dataset.slot=slot.key;
      btn.dataset.state=state;
      btn.style.gridColumn=String(slot.col);
      btn.style.gridRow=String(slot.row);
      const status=state==='reserved'?'Reserved':state==='empty'?'Empty':ITEMS[id].name;
      btn.setAttribute('aria-label',slot.label+': '+status);
      btn.title=slot.label+' · '+status;
      btn.append(id?itemArt(id):h('span','slot-state-icon',state==='reserved'?'—':'+'),h('span','slot-caption',slot.label));
      btn.addEventListener('click',()=>{
        ui.loadoutSlot=slot.key;
        ui.loadoutSelection=null;
        renderDetail();
      });
      if(id)bindItem(ui,btn,id);
      if(slot.slot)itemDrop(ui,btn,itemId=>!ui.buildLock&&ITEMS[itemId]?.slot===slot.slot&&ui.sheet.inventory.includes(itemId)&&ui.sheet.equipped[slot.slot]!==itemId,itemId=>ui.itemAction(itemId,'equip'));
      buttons.set(slot.key,btn);
      grid.append(btn);
    }
    const legend=h('div','slot-legend');
    legend.append(h('span','legend-installed','Installed'),h('span','legend-empty','Empty'),h('span','legend-reserved','Reserved'));
    doll.append(grid,legend);
  }
  column.append(h('h3',null,'Loadout'),list,h('h3',null,'Details'),detail);
  if(actualSlots.length){
    for(const slot of actualSlots){
      const id=s.equipped[slot];
      if(id)list.append(equipmentCard(ui,id,true,selectItem));
      else {const card=h('div','card slotcard empty');card.append(h('div','kicker',SLOT_NAMES[slot]),h('div','muted','Not installed'));list.append(card);}
    }
    const spare=s.inventory.filter(id=>ITEMS[id]&&actualSlots.includes(ITEMS[id].slot)&&s.equipped[ITEMS[id].slot]!==id);
    if(tab.id!=='character'&&spare.length){list.append(h('h3',null,'Available equipment'));for(const id of spare)list.append(equipmentCard(ui,id,false,selectItem));}
    if(!tab.slots.some(t=>t.key===ui.loadoutSlot))ui.loadoutSlot=null;
    if(!allowed(ui.loadoutSelection))ui.loadoutSelection=null;
    if(!ui.loadoutSlot&&!ui.loadoutSelection){
      const first=actualSlots.find(slot=>s.equipped[slot]);
      if(first)ui.loadoutSelection=s.equipped[first];
      if(tab.id!=='character')ui.loadoutSlot=tab.slots.find(t=>t.slot===(first||actualSlots[0]))?.key||null;
    }
  }else{
    ui.loadoutSelection=null;
    if(!tab.slots.some(t=>t.key===ui.loadoutSlot))ui.loadoutSlot=tab.slots[0]?.key||null;
    list.append(h('div','card empty',tab.id==='social'?'Social clothing is not yet equippable.':'Weapon equipment is not yet available.'));
    if(tab.id==='social'){
      const look=(LOOKS[s.cls]||[]).find(l=>l.id===s.look);
      const card=h('div','card');
      card.append(h('div','kicker','Current appearance'),h('div','iname',look?.name||'Class appearance'),h('p','idesc',look?.blurb||'Current class look.'));
      list.append(card);
    }
  }
  body.append(stats,doll,column);
  renderDetail();
}

export function renderInventory(ui) {
  const s=ui.sheet;
  if(!s)return;
  const root=ui.inventoryBody;
  if(ui.tipFor&&root.contains(ui.tipFor))ui.tooltip.hidden=true;
  root.replaceChildren();
  itemDrop(ui,ui.inventoryPanel,id=>!ui.buildLock&&!!ITEMS[id]&&ui.sheet.equipped[ITEMS[id].slot]===id,id=>ui.itemAction(id,'remove'));
  const tabs=h('div','inventory-tabs');
  for(const [id,name] of [['all','All'],['device','Gear'],['implant','Implants'],['glyph','Glyphs'],['weapon','Weapons'],['materials','Materials'],['quest','Quest items']]){
    const btn=h('button',ui.inventoryFilter===id?'active':'',name);
    btn.setAttribute('aria-pressed',String(ui.inventoryFilter===id));
    const unseen=[...(ui.unseenItems||[])].filter(item=>ITEMS[item]?.slot===id);
    if(unseen.length){btn.classList.add('new-equipment');btn.title=unseen.length+' new item(s)';}
    btn.addEventListener('click',()=>{ui.inventoryFilter=id;ui.inventorySelection=null;renderInventory(ui);});
    tabs.append(btn);
  }
  if(ui.inventoryFilter==='materials'){
    root.append(tabs);
    const list=h('div','materials-list');
    for(const [id,material] of Object.entries(MATERIALS)){
      const quantity=s.materials?.[id]||0;
      if(!quantity)continue;
      const button=h('button','material-row');
      button.append(h('span',null,material.name),h('strong',null,'× '+quantity));
      button.addEventListener('click',()=>ui.toggleCodex(true,id));
      list.append(button);
    }
    if(!list.children.length)list.append(h('p','muted','No salvage or components carried. Defeat enemies to recover materials.'));
    root.append(list);return;
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
    bindItem(ui,btn,id);
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
