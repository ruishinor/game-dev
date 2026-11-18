import {ITEMS} from '../../shared/content.js';
import {MATERIALS} from '../../shared/crafting.js';
import {GOODS} from '../../shared/goods.js';
import {itemArt} from './journal-ui.js';
import {readAutoLoot,writeAutoLoot,autoForInteraction} from './loot-prefs.js';
const h=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const button=(label,text,fn)=>{const e=h('button',null,text);e.type='button';e.setAttribute('aria-label',label);e.addEventListener('click',fn);return e;};
const key=s=>s?s.id+':'+s.generation:null;
const creditDefinition={name:'Credits',desc:'Recovered currency. Added directly to your personal wallet when collected.'};

export class LootPanel{
 constructor(ui){
  this.ui=ui;this.available=new Map();this.snapshot=null;this.suppressed=null;this.signature='';
  this.storage=null;try{this.storage=localStorage;}catch{}
  this.auto=readAutoLoot(this.storage);
  this.el=h('section','panel loot-window');this.el.hidden=true;this.el.setAttribute('role','dialog');this.el.setAttribute('aria-label','Corpse loot');
  this.el.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();e.preventDefault();this.dismiss();}else if(['Enter',' ','Tab','ArrowUp','ArrowDown'].includes(e.key))e.stopPropagation();});
  ui.root.append(this.el);
 }
 settings(){
  const label=h('label','loot-option'),box=h('input');box.type='checkbox';box.checked=!!this.auto;box.setAttribute('aria-label','Auto-loot corpses');
  box.addEventListener('change',()=>{this.auto=writeAutoLoot(this.storage,box.checked);});
  label.append(box,document.createTextNode(' Auto-loot when interacting with remains'));
  const section=h('div','loot-preferences');
  section.append(label,h('p','muted','Hold Shift while pressing F to inspect remains manually, even with auto-loot enabled. Uncollectable items stay on the corpse.'));
  return section;
 }
 canLoot(id){return this.available.has(id);}
 takeAll(){
  const s=this.snapshot;
  if(this.el.hidden||!s||key(s)===this.suppressed)return false;
  this.ui.a.lootTake(s.id,s.generation,null);
  return true;
 }
 open(id,manual=false){
  const generation=this.available.get(id);if(generation===undefined)return;
  this.suppressed=null;this.ui.a.lootOpen(id,generation,autoForInteraction(this.auto,manual));
 }
 dismiss(send=true){
  if(this.ui.tipFor&&this.el.contains(this.ui.tipFor))this.ui.tooltip.hidden=true;
  if(this.el.contains(document.activeElement))document.getElementById('view')?.focus({preventScroll:true});
  if(this.snapshot)this.suppressed=key(this.snapshot);
  if(send&&this.snapshot)this.ui.a.lootClose();
  this.el.hidden=true;this.signature='';
 }
 reset(){this.dismiss(false);this.available.clear();this.snapshot=null;this.suppressed=null;}
 sync(available,snapshot){
  this.available=new Map((available||[]).map(x=>[x.id,x.generation]));
  this.snapshot=snapshot||null;
  if(!snapshot){this.dismiss(false);this.suppressed=null;return;}
  if(key(snapshot)===this.suppressed)return;
  const sig=JSON.stringify(snapshot);if(sig===this.signature&&!this.el.hidden)return;
  this.signature=sig;this.draw(snapshot);
 }
 draw(s){
  const ui=this.ui;
  if(ui.tipFor&&this.el.contains(ui.tipFor))ui.tooltip.hidden=true;
  const previous=this.el.contains(document.activeElement)?document.activeElement:null;
  const priorId=previous?.dataset.lootId;
  const priorLabel=previous?.getAttribute('aria-label');
  this.el.hidden=false;this.el.replaceChildren();
  const head=h('div','loot-title'),close=button('Close loot','×',()=>this.dismiss());close.className='close';
  head.append(h('div','kicker','RECOVERABLE LOOT'),h('h2',null,s.name),close);
  const list=h('div','loot-list');
  for(const entry of s.entries){
   const def=entry.kind==='material'?MATERIALS[entry.id]:entry.kind==='goods'?GOODS[entry.id]:entry.kind==='item'?ITEMS[entry.id]:entry.kind==='credits'&&entry.id==='credits'?creditDefinition:null;if(!def)continue;
   const btn=button('Loot '+def.name,'',()=>this.ui.a.lootTake(s.id,s.generation,entry.id));
   btn.className='loot-entry';btn.dataset.lootId=entry.id;if(def.rarity)btn.dataset.rarity=def.rarity;
   const picture=h('span','loot-slot');picture.append(entry.kind==='credits'?h('span','item-art','Cr'):itemArt(entry.id));if(entry.quantity>1)picture.append(h('span','stack-quantity',String(entry.quantity)));
   const copy=h('span','loot-copy');copy.append(h('strong',null,def.name),h('small',null,entry.kind==='material'?'Material · × '+entry.quantity:entry.kind==='goods'?(def.category==='blueprint'?def.rarity+' blueprint':def.rarity?def.rarity+' relic':def.category==='utility'?'Utility':'Junk')+' · × '+entry.quantity:entry.kind==='credits'?'Currency · '+entry.quantity:(def.rarity?def.rarity+' equipment':'Equipment')));
   btn.append(picture,copy);ui.hover(btn,()=>[h('div','tip-title',def.name),h('div','tip-body',def.desc||def.summary||'Recoverable item')]);list.append(btn);
  }
  const footer=h('div','loot-footer'),takeAll=button('Take all loot','Take all',()=>this.takeAll());
  takeAll.setAttribute('aria-keyshortcuts','F');takeAll.title='Take all [F]';
  footer.append(takeAll,button('Leave remaining loot','Leave',()=>this.dismiss()));
  this.el.append(head,list,footer);
  if(previous){
    const controls=[...this.el.querySelectorAll('button')];
    const focus=controls.find(b=>priorId&&b.dataset.lootId===priorId)||controls.find(b=>!priorId&&b.getAttribute('aria-label')===priorLabel)||list.querySelector('button')||close;
    focus.focus({preventScroll:true});
  }
 }
}
