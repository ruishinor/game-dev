// The panel presents only the current scoped server quote. No pricing math
// or balance mutation is accepted as authority from the browser.
import {itemArt,itemTooltip} from './journal-ui.js';
const h=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
const button=(label,fn)=>{const el=h('button',null,label);el.type='button';el.addEventListener('click',fn);return el;};
export class VendorPanel{
 constructor(ui){
  this.ui=ui;this.state=null;this.suppressed=null;this.signature='';this.tab='buy';this.pending=null;
  this.el=h('section','panel vendor-window');this.el.hidden=true;this.el.setAttribute('role','dialog');this.el.setAttribute('aria-label','Vendor');
  this.el.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();e.preventDefault();this.dismiss();}else if(['Tab','Enter',' ','ArrowUp','ArrowDown'].includes(e.key))e.stopPropagation();});
  ui.root.append(this.el);
 }
 dismiss(send=true){
  if(this.el.contains(this.ui.tipFor))this.ui.tooltip.hidden=true;
  if(this.el.contains(document.activeElement))document.getElementById('view')?.focus({preventScroll:true});
  if(this.state){this.suppressed=this.state.ticket;if(send)this.ui.a.vendorClose();}
  this.state=null;this.pending=null;this.signature='';this.el.hidden=true;
 }
 reset(){this.dismiss(false);this.suppressed=null;}
 sync(state){
  if(!state){this.reset();return;}
  if(state.ticket===this.suppressed)return;
  if(!this.state){this.ui.hideJournalPanels();this.tab='buy';}
  const signature=JSON.stringify(state);
  if(signature===this.signature)return;
  this.state=state;this.signature=signature;this.pending=null;this.draw();
 }
 trade(op,id,qty){
  const s=this.state;if(!s||this.pending)return;
  this.pending=performance.now();this.ui.a.vendorTrade({ticket:s.ticket,rev:s.rev,op,id,qty});
  // Retry is safe at the server revision boundary; no indefinite disabled UI
  // when a valid request is refused or the connection drops.
  const ticket=s.ticket,rev=s.rev,pending=this.pending;
  setTimeout(()=>{if(this.state?.ticket===ticket&&this.state.rev===rev&&this.pending===pending){this.pending=null;this.draw();}},1500);
 }
 draw(){
  const s=this.state;if(!s)return;const focus=this.el.contains(document.activeElement)?document.activeElement?.dataset.focus:null;
  if(this.el.contains(this.ui.tipFor))this.ui.tooltip.hidden=true;
  this.el.hidden=false;this.el.replaceChildren();
  const close=button('×',()=>this.dismiss());close.className='close';close.setAttribute('aria-label','Close vendor');
  this.el.append(h('div','kicker','LATTICE SANCTUM · SUPPLY'),h('h2',null,s.name),close,h('div','vendor-balance',s.credits+' credits'));
  const tabs=h('div','vendor-tabs');
  for(const [id,name] of [['buy','Buy'],['sell','Sell junk'],['buyback','Buyback'],['repair','Repair']]){
   const b=button(name,()=>{this.tab=id;this.draw();});b.dataset.focus='tab-'+id;b.setAttribute('aria-pressed',String(this.tab===id));tabs.append(b);
  }
  this.el.append(tabs);
  const list=h('div','vendor-list');
  for(const row of s[this.tab]||[]){
   const item=h('div','vendor-row'),copy=h('div','vendor-copy');
   copy.append(h('strong',null,row.name),h('small','muted',this.tab==='buyback'?row.total+' credits · × '+row.quantity:this.tab==='repair'?row.condition+'% condition · '+row.price+' credits':row.price+' credits each'+(row.ql?' · QL '+row.ql:'')+(this.tab==='sell'?' · × '+row.quantity:'')));
   const artwork = itemArt(row.id);
   item.append(artwork,copy);
   copy.tabIndex=0;
   copy.dataset.focus=this.tab+'-info-'+row.id;
   this.ui.hover(copy,()=>itemTooltip(this.ui.sheet,row.id));
   this.ui.hover(artwork,()=>itemTooltip(this.ui.sheet,row.id));
   const controls=h('div','vendor-actions');
   const make=(label,id,qty,disabled)=>{const b=button(label,()=>this.trade(this.tab,id,qty));b.dataset.focus=this.tab+'-'+id+'-'+qty;b.disabled=!!this.pending||disabled;controls.append(b);};
   if(this.tab==='buy'){make('Buy 1',row.id,1,row.max<1);if(row.max>=5)make('Buy 5',row.id,5,false);}
   else if(this.tab==='sell'){make('Sell 1',row.id,1,false);if(row.quantity>1)make('Sell '+row.quantity,row.id,row.quantity,false);}
   else if(this.tab==='repair')make('Repair',row.id,1,row.max<1);
   else make('Buy back',row.receipt,row.quantity,row.max<row.quantity);
   item.append(controls);list.append(item);
  }
  if(!list.children.length)list.append(h('p','muted',this.tab==='sell'?'No carried junk to sell.':this.tab==='repair'?'No owned equipment needs repair.':'No items to buy back during this visit.'));
  this.el.append(list);
  if(this.tab==='sell'){const all=button('Sell all junk',()=>this.trade('sell_junk','',1));all.dataset.focus='sell-all';all.disabled=!s.sell.length||!!this.pending;this.el.append(all);}
  this.el.append(h('p','muted','Only trade salvage can be sold here. Buyback is available during this visit. Only equipment marked repairable is affected by condition.'));
  if(focus)[...this.el.querySelectorAll('[data-focus]')].find(b=>b.dataset.focus===focus)?.focus({preventScroll:true});
 }
}
