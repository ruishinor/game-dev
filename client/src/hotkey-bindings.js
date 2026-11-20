// Presentation-only mapping of action-bar shortcuts; server validates each action.
export const PRIMARY_SLOTS=9;
export const COMPANION_SLOTS=5;
export const DEFAULT_BINDINGS=Object.freeze(Object.fromEntries([
 ...Array.from({length:PRIMARY_SLOTS},(_,i)=>['ability:'+(i+1),'Digit'+(i+1)]),
 ...Array.from({length:COMPANION_SLOTS},(_,i)=>['companion:'+(i+1),'Shift+Digit'+(i+1)])
]));
const CODES=/^(?:Digit[0-9]|Key[A-Z]|Numpad[0-9]|F(?:[1-9]|1[0-2])|Minus|Equal|BracketLeft|BracketRight|Semicolon|Quote|Comma|Period|Slash|Backslash|Backquote)$/;
const MOVEMENT=new Set(['KeyW','KeyS','KeyA','KeyD','KeyQ','KeyE','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
const RESERVED=new Set(['KeyR','KeyC','KeyB','KeyI','KeyJ','KeyL','KeyP','KeyO','KeyM','KeyH','KeyV','KeyF','Tab','Enter','Escape','F1','F2','NumLock','Shift+KeyF','Shift+KeyM']);
export function keyChord(e){
 if(e.metaKey||['Shift','Control','Alt','Meta'].includes(e.key))return null;
 const code=e.code;
 if(!CODES.test(code))return null;
 return [e.ctrlKey?'Ctrl':null,e.altKey?'Alt':null,e.shiftKey?'Shift':null,code].filter(Boolean).join('+');
}
export function labelChord(chord){
 if(!chord)return 'Unbound';
 return chord.replace(/Digit/g,'').replace(/Numpad/g,'Num ').replace(/Key/g,'').replace(/Shift/g,'⇧').replace(/Ctrl/g,'Ctrl').replace(/Alt/g,'Alt');
}
export function bindingPermitted(chord){
 if(chord===null)return true;
 if(typeof chord!=='string'||chord.length>48)return false;
 const tokens=chord.split('+'),code=tokens.at(-1),mods=tokens.slice(0,-1);
 if(!CODES.test(code)||new Set(mods).size!==mods.length||mods.some(x=>!['Ctrl','Alt','Shift'].includes(x)))return false;
 if(mods.join('+')!==['Ctrl','Alt','Shift'].filter(x=>mods.includes(x)).join('+'))return false;
 if(MOVEMENT.has(code)||RESERVED.has(chord))return false;
 // Browser and OS navigation commands should never be captured.
 if(mods.includes('Ctrl')&&['KeyR','KeyW','KeyT','KeyL','KeyN','KeyP','KeyS','KeyF'].includes(code))return false;
 if(mods.includes('Alt')&&['F4','ArrowLeft','ArrowRight'].includes(code))return false;
 return true;
}
export class ActionBindings{
 constructor(storage=null){
  this.storage=storage;this.map={...DEFAULT_BINDINGS};
  try{
   const saved=JSON.parse(this.storage?.getItem('attunement.keybindings.v1')||'null');
   if(saved&&typeof saved==='object'&&!Array.isArray(saved)){
    const next={...this.map};
    for(const [key,val] of Object.entries(saved)){
     if(!Object.hasOwn(DEFAULT_BINDINGS,key)||!bindingPermitted(val))continue;
     next[key]=val;
    }
    const bound=Object.values(next).filter(Boolean);
    if(new Set(bound).size===bound.length)this.map=next;
   }
  }catch{}
 }
 get(action){return Object.hasOwn(this.map,action)?this.map[action]:null;}
 label(action){return labelChord(this.get(action));}
 resolve(e){const chord=keyChord(e);return chord?Object.keys(this.map).find(action=>this.map[action]===chord)||null:null;}
 set(action,chord){
  if(!Object.hasOwn(DEFAULT_BINDINGS,action))return {ok:false,reason:'Unknown hotkey action'};
  if(!bindingPermitted(chord))return {ok:false,reason:'This shortcut is reserved for movement, the interface or the browser'};
  const conflict=Object.keys(this.map).find(key=>key!==action&&chord!==null&&this.map[key]===chord);
  if(conflict)return {ok:false,reason:'Already assigned to '+conflict,conflict};
  this.map[action]=chord;this.persist();return {ok:true};
 }
 reset(){this.map={...DEFAULT_BINDINGS};this.persist();}
 persist(){try{this.storage?.setItem('attunement.keybindings.v1',JSON.stringify(this.map));}catch{}}
}
