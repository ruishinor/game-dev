import {questLog} from './quest-log.js';
import {MAX_LEVEL} from '../../shared/content.js';
const h=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
const button=(label,fn)=>{const el=h('button',null,label);el.type='button';el.addEventListener('click',fn);return el;};
const labels={active:'Active',completed:'Completed',available:'Available'};
export class QuestJournal{
 constructor(ui){
  this.ui=ui;this.entries=[];this.signature='';this.filter='all';this.selected=null;
  this.el=h('section','panel quest-journal');this.el.hidden=true;this.el.setAttribute('role','dialog');this.el.setAttribute('aria-label','Quest Journal');
  this.el.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();e.preventDefault();this.dismiss();}else if(['Tab','Enter',' ','ArrowUp','ArrowDown'].includes(e.key))e.stopPropagation();});
  this.content=h('div','managed-window-content');this.el.append(this.content);ui.root.append(this.el);
 }
 dismiss(){
  if(this.el.contains(document.activeElement))document.getElementById('view')?.focus({preventScroll:true});
  this.el.hidden=true;
 }
 reset(){this.dismiss();this.entries=[];this.signature='';this.selected=null;this.filter='all';}
 show(sheet,trial=null){if(!sheet)return;this.el.hidden=false;this.sync(sheet,trial,true);}
 sync(sheet,trial=null,force=false){
  // Cap guidance depends on level even when the quest projection is unchanged.
  const entries=questLog(sheet,trial),sig=JSON.stringify([entries,sheet?.level>=MAX_LEVEL]);
  if(!force&&sig===this.signature)return;
  this.entries=entries;this.signature=sig;
  if(!this.el.hidden)this.draw();
 }
 drawRewards(details,q){
  const rewards=h('section','quest-rewards');
  rewards.append(h('h4',null,q.status==='completed'?'Listed quest rewards':'Quest rewards'));
  if(q.rewards?.length){
   const list=h('ul');for(const reward of q.rewards)list.append(h('li',null,reward));rewards.append(list);
  }else rewards.append(h('p','muted','Reward details not recorded.'));
  if(q.status==='completed'){
   if(q.received?.length){
    rewards.append(h('h4',null,'Received at completion'));
    const received=h('ul');for(const reward of q.received)received.append(h('li',null,reward));rewards.append(received);
   }else rewards.append(h('p','muted','Listed rewards, not a historical record of grants.'));
  }
  else if(this.ui.sheet?.level>=MAX_LEVEL&&q.rewards?.some(r=>/^\d+ XP$/.test(r)))rewards.append(h('p','muted','XP is not awarded at the current level cap.'));
  details.append(rewards);
 }
 draw(){
  const focused=this.el.contains(document.activeElement)?document.activeElement?.dataset.focus:null;
  this.content.replaceChildren();
  const close=button('×',()=>this.dismiss());close.className='close';close.setAttribute('aria-label','Close Quest Journal');
  this.content.append(h('div','kicker','ATTUNEMENT'),h('h2',null,'Quest Journal'),close);
  const filters=h('div','quest-filters');
  for(const [id,title] of [['all','All'],['active','Active'],['available','Available'],['completed','Completed']]){
   const b=button(title,()=>{this.filter=id;this.draw();});b.dataset.focus='filter-'+id;b.setAttribute('aria-pressed',String(this.filter===id));filters.append(b);
  }
  this.content.append(filters);
  const visible=this.entries.filter(e=>this.filter==='all'||e.status===this.filter);
  if(!visible.some(e=>e.id===this.selected))this.selected=(visible.find(e=>e.status==='active')||visible[0])?.id||null;
  const layout=h('div','quest-journal-layout'),nav=h('nav','quest-journal-nav');
  nav.setAttribute('aria-label','Quests');
  for(const q of visible){
   const b=button('',()=>{this.selected=q.id;this.draw();});b.dataset.focus='quest-'+q.id;b.dataset.quest=q.id;b.dataset.status=q.status;
   b.setAttribute('aria-pressed',String(q.id===this.selected));
   b.append(h('strong',null,q.title),h('small','muted',q.group+' · '+labels[q.status]));nav.append(b);
  }
  if(!visible.length)nav.append(h('p','muted','No quests in this category.'));
  const details=h('section','quest-journal-detail'),q=visible.find(q=>q.id===this.selected);
  if(q){details.append(h('div','kicker',q.group+' · '+labels[q.status]),h('h3',null,q.title),h('p',null,q.text));if(q.progress)details.append(h('div','quest-progress',q.progress));this.drawRewards(details,q);if(q.status!=='completed'){const tracker=this.ui.questTracker,tracked=tracker.has(q),b=button(tracked?'Untrack quest':'Track quest',()=>{tracker.toggle(q);this.draw();});b.dataset.focus='tracking';b.setAttribute('aria-pressed',String(tracked));b.disabled=!tracked&&!tracker.canAdd();details.append(b,h('p','muted',tracker.selected().length+' / 3 quests tracked'));}}
  else details.append(h('p','muted','Select a quest to view its objectives.'));
  layout.append(nav,details);this.content.append(layout);
  if(focused)[...this.el.querySelectorAll('button')].find(b=>b.dataset.focus===focused)?.focus({preventScroll:true});
 }
}
