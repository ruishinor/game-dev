import {questLog} from './quest-log.js';
import {dungeonQuestContext,questIsLocalToDungeon} from './quest-context.js';
import {trackingPrefs,trackedEntries,toggleTracking,trackKey,TRACK_LIMIT} from './quest-tracking.js';
const h=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e;};
export class QuestTracker{
 constructor(ui){this.ui=ui;this.entries=[];this.prefs=trackingPrefs();this.storageKey=null;this.zone='';this.el=h('section','quest-tracker-group');
  const head=h('div','quest-tracker-header'),open=h('button',null,'Quests [L]');open.type='button';open.addEventListener('click',()=>ui.toggleQuestJournal(true));
  this.collapse=h('button','quest-collapse');this.collapse.type='button';this.collapse.addEventListener('click',()=>{this.prefs={...this.prefs,collapsed:!this.prefs.collapsed};this.save();this.draw();});
  head.append(open,this.collapse);this.cards=h('div','quest-tracker-cards');this.other=h('div','quest-tracker-other');this.empty=h('div','muted','No tracked quests.');this.cards.append(ui.tracker,ui.surveyTracker,this.other,this.empty);this.el.append(head,this.cards,ui.brineWorkshop);this.draw();
 }
 useCharacter(id){this.storageKey=typeof id==='string'&&id.length<=128?'attunement.questTracking.v1.'+id:null;let saved=null;try{if(this.storageKey)saved=JSON.parse(localStorage.getItem(this.storageKey));}catch{}this.prefs=trackingPrefs(saved);this.entries=[];this.signature='';this.draw();}
 reset(){this.zone='';this.useCharacter(null);}
 setZone(name){const z=typeof name==='string'?name:'';if(z===this.zone)return;this.zone=z;this.draw();}
 save(){try{if(this.storageKey)localStorage.setItem(this.storageKey,JSON.stringify(this.prefs));}catch{}}
 sync(sheet,trial){const entries=questLog(sheet,trial),sig=JSON.stringify(entries);if(sig===this.signature)return;this.signature=sig;this.entries=entries;this.draw();}
 selected(){return trackedEntries(this.entries,this.prefs);}
 has(q){return this.selected().some(x=>x.id===q.id);}
 canAdd(){return this.selected().length<TRACK_LIMIT;}
 toggle(q){this.prefs=toggleTracking(this.entries,this.prefs,q);this.save();this.draw();}
 draw(){const selected=this.selected(),d=selected.find(q=>trackKey(q)==='directive'),s=selected.find(q=>trackKey(q)==='brine');
  const dungeon=dungeonQuestContext(this.zone);this.el.dataset.dungeon=dungeon?'true':'false';
  this.el.title=dungeon?'Only local quest details are expanded here; all tracked objectives remain available through Quests [L].':'';
  this.cards.hidden=this.prefs.collapsed;this.collapse.textContent=this.prefs.collapsed?'+':'−';this.collapse.setAttribute('aria-label',this.prefs.collapsed?'Expand quest tracker':'Minimize quest tracker');this.collapse.setAttribute('aria-expanded',String(!this.prefs.collapsed));
  this.ui.tracker.hidden=!d;this.ui.surveyTracker.hidden=!s;this.ui.tracker.dataset.trackedId=d?.id||'';this.ui.surveyTracker.dataset.trackedId=s?.id||'';
  this.ui.tracker.dataset.contextual=String(questIsLocalToDungeon(d,dungeon));
  this.ui.surveyTracker.dataset.contextual=String(questIsLocalToDungeon(s,dungeon));
  this.other.replaceChildren();for(const q of selected.filter(q=>!['brine','directive'].includes(trackKey(q)))){const card=h('div','tracker');card.dataset.trackedId=q.id;card.dataset.contextual=String(questIsLocalToDungeon(q,dungeon));card.append(h('div','kicker',q.group),h('div','title',q.title),h('div','text',q.text));if(q.progress)card.append(h('div','progress',q.progress));this.other.append(card);}
  this.other.hidden=!this.other.childElementCount;this.empty.hidden=selected.length!==0;
 }
}
