// Account-scoped character selection. All decisions remain server-authoritative.
import {CLASSES} from '../../shared/content.js';
import {normalizeAppearance,RACES} from '../../shared/appearance.js';
import {createCreationPreview} from './creation-preview.js';

const el=(tag,cls,content)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(content!==undefined)node.textContent=String(content);return node;};
export class CharacterRosterView{
 constructor({root,assets,useGlb,motionPreference,onEnter,onCreate,onDelete,onSignOut}){
  this.root=root;this.characters=[];this.selected=null;
  this.list=root.querySelector('#roster-list');this.details=root.querySelector('#roster-details');
  this.enter=root.querySelector('#roster-enter');this.create=root.querySelector('#roster-create');
  this.deleteButton=root.querySelector('#roster-delete');this.deleteArea=root.querySelector('#roster-delete-confirm');
  this.deleteName=root.querySelector('#roster-delete-name');this.deleteSubmit=root.querySelector('#roster-delete-submit');
  this.selectionPreview=root.querySelector('#roster-preview');
  this.capacity=root.querySelector('#roster-capacity');
  this.preview=createCreationPreview({
   root:this.selectionPreview,assets,useGlb,motionPreference,variant:'selection',
   getMeta:()=>this.meta(),selectFrame:()=>{}
  });
  this.enter.addEventListener('click',()=>{if(this.selected)onEnter(this.selected.id);});
  this.create.addEventListener('click',()=>onCreate());
  this.deleteButton.addEventListener('click',()=>{if(!this.selected)return;this.deleteArea.hidden=!this.deleteArea.hidden;if(!this.deleteArea.hidden)this.deleteName.focus();else this.clearDelete();});
  this.deleteName.addEventListener('input',()=>{this.deleteSubmit.disabled=!this.selected||this.deleteName.value!==this.selected.name;});
  this.deleteSubmit.addEventListener('click',()=>{if(!this.selected||this.deleteName.value!==this.selected.name)return;this.deleteSubmit.disabled=true;onDelete(this.selected.id,this.selected.name);});
  root.querySelector('#roster-cancel-delete').addEventListener('click',()=>this.clearDelete());
  root.querySelector('#account-signout').addEventListener('click',onSignOut);
 }
 meta(){const c=this.selected;return {k:'p',c:c?.cls??'vanguard',a:c?.look??null,n:c?.name??'',ap:c?.appearance??null};}
 clearDelete(){this.deleteArea.hidden=true;this.deleteName.value='';this.deleteSubmit.disabled=true;}
 render(account){
  const previous=this.selected?.id;
  this.characters=Array.isArray(account.chars)?account.chars:[];
  this.selected=this.characters.find(c=>c.id===previous)||this.characters[0]||null;
  this.root.querySelector('#roster-title').textContent=account.handle+"'s characters";
  this.list.replaceChildren();
  for(const c of this.characters){
   const row=el('div','roster-row'),select=el('button','roster-select');
   select.type='button';select.dataset.characterId=String(c.id);
   select.setAttribute('aria-pressed',String(c.id===this.selected?.id));
   const title=el('strong',null,c.name),role=el('span','muted',`Level ${c.level} · ${CLASSES[c.cls]?.name??c.cls}`);
   select.append(title,role);
   select.addEventListener('click',()=>this.choose(c.id));
   const play=el('button','roster-direct-play','Play');play.type='button';play.setAttribute('aria-label','Enter world as '+c.name);play.addEventListener('click',()=>onEnterGuard(this,onEnter,c.id));
   row.append(select,play);this.list.append(row);
  }
  if(!this.characters.length)this.list.append(el('p','muted','No characters yet. Create one or import your previous guest.'));
  this.create.disabled=this.characters.length>=6;
  this.capacity.textContent=`Character slots · ${this.characters.length} / 6`;
  this.updateSelected();
 }
 choose(id){const next=this.characters.find(c=>c.id===id);if(!next)return;this.selected=next;this.clearDelete();this.updateSelected();for(const b of this.list.querySelectorAll('.roster-select'))b.setAttribute('aria-pressed',String(b.dataset.characterId===String(id)));}
 updateSelected(){
  const c=this.selected;
  this.enter.disabled=this.deleteButton.disabled=!c;
  this.selectionPreview.hidden=!c;
  this.details.replaceChildren();
  if(!c){this.details.append(el('p','muted','Select or create a character.'));this.clearDelete();return;}
  const ap=c.appearance?normalizeAppearance(c.appearance,c.look):null;
  const race=ap?.race?RACES[ap.race]?.name??ap.race:null;
  this.details.append(el('span','roster-level','Level '+c.level),el('h3','roster-character-name',c.name));
  for(const [label,val] of [['Calling',CLASSES[c.cls]?.name??c.cls],...(race?[['Origin',race]]:[])]) {
   const line=el('div','roster-fact'),k=el('span','muted',label),v=el('strong',null,val);line.append(k,v);this.details.append(line);
  }
  this.details.append(el('p','muted','Character appearance and progression are loaded from your account. Enter World to resume.'));
 }
 update(now,dt){return this.preview.update(now,dt);}
 release(){this.preview.release();}
}
function onEnterGuard(view,onEnter,id){if(view.characters.some(c=>c.id===id))onEnter(id);}
