import {ITEMS} from '../../shared/content.js';
import {MATERIALS} from '../../shared/crafting.js';
import {itemArt} from './journal-ui.js';
const h=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const button=(label,text,fn)=>{const e=h('button',null,text);e.type='button';e.setAttribute('aria-label',label);e.addEventListener('click',fn);return e;};
const key=s=>s?s.id+':'+s.generation:null;

export class LootPanel{
 constructor(ui){
  this.ui=ui;this.available=new Map();this.snapshot=null;this.suppressed=null;this.signature='';
  try{this.auto=localStorage.getItem('attunement.autoLoot')==='1';}catch{this.auto=false;}
  this.el=h('section','panel loot-window');this.el.hidden=true;this.el.setAttribute('role','dialog');this.el.setAttribute('aria-label','Corpse loot');
  this.el.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();e.preventDefault();this.dismiss();}else if(['Enter',' ','Tab','ArrowUp','ArrowDown'].includes(e.key))e.stopPropagation();});
  ui.root.append(this.el);
 }
 settings(){
  const label=h('label','loot-option'),box=h('input');box.type='checkbox';box.checked=!!this.auto;box.setAttribute('aria-label','Auto-loot corpses');
  box.addEventListener('change',()=>{this.auto=box.checked;try{localStorage.setItem('attunement.autoLoot',this.auto?'1':'0');}catch{}});
  label.append(box,document.createTextNode(' Auto-loot when interacting with remains'));return label;
 }
 canLoot(id){return this.available.has(id);}
 open(id){
  const generation=this.available.get(id);if(generation===undefined)return;
  this.suppressed=null;this.ui.a.lootOpen(id,generation,!!this.auto);
 }
 dismiss(send=true){
  if(this.ui.tipFor&&this.el.contains(this.ui.tipFor))this.ui.tooltip.hidden=true;
  if(this.el.contains(document.activeElement))document.activeElement.blur();
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
  this.el.hidden=false;this.el.replaceChildren();
  const head=h('div','loot-title'),close=button('Close loot','×',()=>this.dismiss());close.className='close';
  head.append(h('div','kicker','RECOVERABLE LOOT'),h('h2',null,s.name),close);
  const list=h('div','loot-list');
  for(const entry of s.entries){
   const def=entry.kind==='material'?MATERIALS[entry.id]:ITEMS[entry.id];if(!def)continue;
   const btn=button('Loot '+def.name,'',()=>this.ui.a.lootTake(s.id,s.generation,entry.id));
   btn.className='loot-entry';btn.dataset.lootId=entry.id;
   const picture=h('span','loot-slot');picture.append(itemArt(entry.id));if(entry.quantity>1)picture.append(h('span','stack-quantity',String(entry.quantity)));
   const copy=h('span','loot-copy');copy.append(h('strong',null,def.name),h('small',null,entry.kind==='material'?'Material · × '+entry.quantity:'Equipment'));
   btn.append(picture,copy);ui.hover(btn,()=>[h('div','tip-title',def.name),h('div','tip-body',def.desc||def.summary||'Recoverable item')]);list.append(btn);
  }
  const footer=h('div','loot-footer');footer.append(button('Take all loot','Take all',()=>this.ui.a.lootTake(s.id,s.generation,null)),button('Leave remaining loot','Leave',()=>this.dismiss()));
  this.el.append(head,list,footer);
 }
}
