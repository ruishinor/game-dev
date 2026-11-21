// Cinematic roster control. Character ownership and mutations remain server-owned.
// Visual metadata is an allowlisted projection of the actual persisted character.
import {CLASSES} from '../../shared/content.js';
import {normalizeAppearance,RACES} from '../../shared/appearance.js';
import {createCreationPreview} from './creation-preview.js';

const el=(tag,cls,content)=>{
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(content!==undefined)node.textContent=String(content);
 return node;
};
const ICONS={
 vanguard:'M12 2 20 6 19 16 12 22 5 16 4 6Z M8 9 12 6 16 9 M12 6V18',
 symbiotech:'M12 3V21 M3 12H21 M12 12 5 5 M12 12 19 5 M12 12 5 19 M12 12 19 19',
 keeper:'M12 2 21 7V17L12 22 3 17V7Z M12 5V19 M6 12H18',
 surveyor:'M12 2V7 M12 17V22 M2 12H7 M17 12H22 M12 7A5 5 0 1 1 12 17A5 5 0 0 1 12 7Z'
};
function insignia(cls){
 const span=el('span','roster-insignia roster-insignia--'+(Object.hasOwn(ICONS,cls)?cls:'other'));
 span.setAttribute('aria-hidden','true');
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');
 svg.setAttribute('stroke-width','1.25');svg.setAttribute('stroke-linejoin','round');
 const path=document.createElementNS('http://www.w3.org/2000/svg','path');
 path.setAttribute('d',ICONS[cls]??'M12 2 22 12 12 22 2 12Z');
 svg.append(path);span.append(svg);return span;
}
function factualRow(label,value){
 const row=el('div','roster-fact');
 row.append(el('span','roster-fact-label',label),el('strong',null,value));
 return row;
}
export class CharacterRosterView{
 constructor({root,assets,useGlb,motionPreference,onEnter,onCreate,onDelete}){
  this.root=root;this.characters=[];this.selected=null;this.onEnter=onEnter;this.onCreate=onCreate;this.maxSlots=0;
  this.busy=false;this.action=null;
  this.list=root.querySelector('#roster-list');this.details=root.querySelector('#roster-details');
  this.enter=root.querySelector('#roster-enter');this.create=root.querySelector('#roster-create');
  this.deleteButton=root.querySelector('#roster-delete');this.deleteArea=root.querySelector('#roster-delete-confirm');
  this.deleteName=root.querySelector('#roster-delete-name');this.deleteSubmit=root.querySelector('#roster-delete-submit');
  this.selectionPreview=root.querySelector('#roster-preview');
  this.transition=root.querySelector('#roster-world-transition');
  this.capacity=root.querySelector('#roster-capacity');
  this.preview=createCreationPreview({
   root:this.selectionPreview,assets,useGlb,motionPreference,variant:'selection',
   getMeta:()=>this.meta(),selectFrame:()=>{}
  });
  // Keep inspection out of the actor/character-details canvas entirely.
  // The preview controller has already captured these elements by reference.
  // Camera controls remain in the separate inspection view, never the roster.
  this.inspectToggle=this.selectionPreview.querySelector('[data-preview-inspect]');
  this.inspectControls=this.selectionPreview.querySelector('.roster-preview-controls');
  this.capacity.after(this.inspectToggle);
  this.inspectScreen=el('section','roster-inspection-screen');
  this.inspectScreen.id='roster-inspection-screen';
  this.inspectScreen.setAttribute('aria-label','Full-screen character inspection');
  this.inspectScreen.hidden=true;
  const header=el('div','roster-inspection-header');
  this.inspectHeading=el('h2',null,'Inspect character');
  const close=el('button','roster-inspection-close','Return to character selection');
  close.type='button';
  close.addEventListener('click',()=>this.closeInspection(true));
  document.addEventListener('keydown',event=>{
   if(event.key==='Escape'&&!this.inspectScreen.hidden){
    event.preventDefault();event.stopImmediatePropagation();
    this.closeInspection(true);
   }
  },true);
  header.append(this.inspectHeading,close);
  this.inspectScreen.append(header,this.inspectControls);
  this.root.append(this.inspectScreen);
  // The preview's original Inspect toggle still manages the actual controls.
  // Transfer those controls into an entirely separate view, not a roster popup.
  this.inspectToggle.addEventListener('click',()=>this.openInspection());
  this.enter.addEventListener('click',()=>this.enterSelected());
  this.create.addEventListener('click',()=>this.beginCreation());
  this.deleteButton.addEventListener('click',()=>{
   if(!this.selected||this.busy)return;
   this.deleteArea.hidden=!this.deleteArea.hidden;
   if(!this.deleteArea.hidden)this.deleteName.focus();else this.clearDelete();
  });
  this.deleteName.addEventListener('input',()=>this.syncDelete());
  this.deleteSubmit.addEventListener('click',()=>{
   if(this.busy||!this.selected||this.deleteName.value!==this.selected.name)return;
   const {id,name}=this.selected;
   this.setBusy(true,'delete');onDelete(id,name);
  });
  root.querySelector('#roster-cancel-delete').addEventListener('click',()=>this.clearDelete());
 }
 meta(){
  const c=this.selected;
  return c?{k:'p',c:c.cls,a:c.look,n:c.name,ap:c.appearance,
   wv:c.wv??null,av:c.av??null,sv:c.sv??null,er:c.er??null}:null;
 }
 setBusy(busy,action=null){
  this.busy=busy;this.action=busy?action:null;
  this.transition.hidden=!(busy&&action==='enter');
  this.enter.textContent=busy&&action==='enter'?'Entering World…':'Enter World';
  this.enter.disabled=busy||!this.selected;
  this.create.disabled=busy||this.characters.length>=this.maxSlots;
  this.deleteButton.disabled=busy||!this.selected;
  this.syncDelete();
  for(const button of this.list.querySelectorAll('button'))button.disabled=busy;
  this.root.setAttribute('aria-busy',String(busy));
 }
 beginCreation(){
  if(this.busy||this.characters.length>=this.maxSlots)return;
  this.closeInspection();
  this.onCreate();
 }
 openInspection(){
  if(!this.selected||this.busy)return;
  this.inspectHeading.textContent='Inspect '+this.selected.name;
  this.inspectControls.hidden=false;
  this.inspectScreen.hidden=false;
  document.body.classList.add('character-inspection-mode');
  this.inspectScreen.querySelector('.roster-inspection-close')?.focus({preventScroll:true});
 }
 closeInspection(restoreFocus=false){
  const wasOpen=!this.inspectScreen.hidden;
  document.body.classList.remove('character-inspection-mode');
  this.inspectScreen.hidden=true;
  this.preview.closeInspector();
  this.inspectControls.hidden=true;
  if(restoreFocus&&wasOpen&&!this.inspectToggle.hidden)
   this.inspectToggle.focus({preventScroll:true});
 }
 enterSelected(){
  if(!this.selected||this.busy)return;
  this.setBusy(true,'enter');
  this.onEnter(this.selected.id);
 }
 syncDelete(){
  this.deleteSubmit.disabled=this.busy||!this.selected||this.deleteName.value!==this.selected.name;
 }
 clearDelete(){
  this.deleteArea.hidden=true;this.deleteName.value='';this.syncDelete();
 }
 render(account){
  const previouslySelected=this.selected?.id;
  this.characters=Array.isArray(account.chars)?account.chars:[];
  this.maxSlots=Number.isSafeInteger(account.maxSlots)&&account.maxSlots>=this.characters.length?account.maxSlots:this.characters.length;
  this.selected=this.characters.find(c=>c.id===previouslySelected)||this.characters[0]||null;
  this.root.querySelector('#roster-title').textContent='Character Selection';
  this.root.querySelector('#roster-account').textContent=account.handle;
  this.list.replaceChildren();
  for(const c of this.characters){
   const select=el('button','roster-select');
   select.type='button';select.dataset.characterId=String(c.id);
   const description=el('span','roster-entry-copy');
   description.append(el('small',null,`LEVEL ${c.level} · ${CLASSES[c.cls]?.name??c.cls}`),el('strong',null,c.name));
   select.append(insignia(c.cls),description);
   select.addEventListener('click',()=>this.choose(c.id));
   this.list.append(select);
  }
  if(this.characters.length<this.maxSlots){
   const vacant=el('button','roster-slot-vacant',this.characters.length?'＋ New character':'＋ Create your first character');
   vacant.type='button';
   vacant.addEventListener('click',event=>{
    event.preventDefault();
    event.stopPropagation();
    this.beginCreation();
   });
   this.list.append(vacant);
  }
  this.root.classList.toggle('roster-empty',!this.selected);
  this.capacity.textContent=`${this.characters.length} / ${this.maxSlots} CHARACTER SLOTS`;
  this.setBusy(false);this.preview.resetView();this.updateSelected();
 }
 choose(id){
  if(this.busy)return;
  const c=this.characters.find(entry=>entry.id===id);
  if(!c||c.id===this.selected?.id)return;
  this.selected=c;this.preview.resetView();this.clearDelete();this.updateSelected();
 }
 updateSelected(){
  const c=this.selected;
  this.closeInspection();
  if(this.inspectToggle)this.inspectToggle.hidden=!c;
  for(const button of this.list.querySelectorAll('.roster-select')){
   button.setAttribute('aria-pressed',String(button.dataset.characterId===String(c?.id)));
  }
  this.enter.hidden=!c;
  this.deleteButton.hidden=!c;
  this.root.classList.toggle('roster-empty',!c);
  this.enter.disabled=this.deleteButton.disabled=this.busy||!c;
  this.details.replaceChildren();
  if(!c){
   this.selectionPreview.dataset.characterId='';
   this.details.append(el('p','roster-empty-message','No character selected. Create a character to begin.'));
   this.clearDelete();return;
  }
  this.selectionPreview.dataset.characterId=c.id;
  const ap=c.appearance?normalizeAppearance(c.appearance,c.look):null;
  const race=ap?.race?(RACES[ap.race]?.name??ap.race):'Not recorded';
  this.details.append(el('span','roster-level','LEVEL '+c.level),el('h3','roster-character-name',c.name));
  this.details.append(
   factualRow('Class',CLASSES[c.cls]?.name??c.cls),
   factualRow('Race',race),
   factualRow('Location',c.location??'Unknown'),
   factualRow('Credits',Number.isSafeInteger(c.credits)?new Intl.NumberFormat('en').format(c.credits):'Unknown'),
   factualRow('Experience',Number.isSafeInteger(c.xp)?new Intl.NumberFormat('en').format(c.xp):'Unknown')
  );
  this.clearDelete();
 }
 update(now,dt){return this.preview.update(now,dt);}
 release(){this.closeInspection();this.preview.release();this.setBusy(false);}
}
