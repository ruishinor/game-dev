import test from 'node:test';
import assert from 'node:assert/strict';
import {ActionBindings,keyChord,bindingPermitted,labelChord} from '../client/src/hotkey-bindings.js';
const storage=()=>{const d=new Map();return {getItem:k=>d.get(k)||null,setItem:(k,v)=>d.set(k,v)};};
test('defaults preserve existing number and companion shortcuts',()=>{
 const b=new ActionBindings(storage());
 assert.equal(b.get('ability:1'),'Digit1');
 assert.equal(b.get('companion:5'),'Shift+Digit5');
 assert.equal(b.resolve({code:'Digit3',key:'3',shiftKey:true,ctrlKey:false,altKey:false,metaKey:false}),'companion:3');
 assert.equal(b.resolve({code:'Digit3',key:'3',shiftKey:false,ctrlKey:false,altKey:false,metaKey:false}),'ability:3');
});
test('independent Spindle bindings preserve existing choices and require explicit assignment',()=>{
 const store=storage(),b=new ActionBindings(store);
 assert.equal(b.get('spindle:2'),null);
 assert.equal(b.set('companion:2','Ctrl+Digit2').ok,true);
 assert.equal(b.set('spindle:2','Ctrl+Digit2').ok,false);
 assert.equal(b.set('spindle:2','Shift+Digit6').ok,true);
 const restored=new ActionBindings(store);
 assert.equal(restored.get('companion:2'),'Ctrl+Digit2');
 assert.equal(restored.resolve({code:'Digit6',key:'6',shiftKey:true}),'spindle:2');
});
test('reserved movement and interface shortcuts cannot shadow input',()=>{
 for(const value of ['KeyW','Shift+KeyW','KeyR','KeyM','Shift+KeyM','Shift+KeyF','Ctrl+KeyR','Alt+F4'])assert.equal(bindingPermitted(value),false,value);
 assert.equal(keyChord({key:'Shift',code:'ShiftLeft',shiftKey:true}),null);
 assert.equal(labelChord('Shift+Digit5'),'⇧+5');
});
test('remapping, collision rejection, reset and persistence',()=>{
 const store=storage(),b=new ActionBindings(store);
 assert.equal(b.set('ability:1','Digit2').ok,false);
 assert.equal(b.set('ability:2',null).ok,true);
 assert.equal(b.set('ability:1','Digit2').ok,true);
 assert.equal(b.set('companion:1','Ctrl+Digit1').ok,true);
 const restored=new ActionBindings(store);
 assert.equal(restored.resolve({code:'Digit2',key:'2',shiftKey:false,ctrlKey:false,altKey:false,metaKey:false}),'ability:1');
 assert.equal(restored.get('ability:2'),null);
 assert.equal(restored.get('companion:1'),'Ctrl+Digit1');
 restored.reset();
 assert.equal(new ActionBindings(store).get('ability:1'),'Digit1');
});
test('malformed or duplicated saved mapping falls back safely',()=>{
 const store=storage();
 store.setItem('attunement.keybindings.v1',JSON.stringify({'ability:1':'Digit2','ability:2':'Digit2'}));
 assert.equal(new ActionBindings(store).get('ability:1'),'Digit1');
 store.setItem('attunement.keybindings.v1','bad-json');
 assert.equal(new ActionBindings(store).get('ability:1'),'Digit1');
});
test('weapon actions default to free keys, resolve, remap with named conflicts and reset alone',()=>{
 const store=storage(),b=new ActionBindings(store);
 assert.equal(b.get('weapon:switch'),'KeyZ');assert.equal(b.get('weapon:config'),'KeyG');assert.equal(b.get('emote:sit'),'KeyX');
 const defaults=Object.values(new ActionBindings(storage()).map).filter(Boolean);
 assert.equal(new Set(defaults).size,defaults.length,'every default is unique');
 for(const chord of defaults)assert.ok(bindingPermitted(chord),chord);
 assert.equal(b.resolve({code:'KeyZ',key:'z',shiftKey:false,ctrlKey:false,altKey:false,metaKey:false}),'weapon:switch');
 assert.equal(b.resolve({code:'KeyX',key:'x',shiftKey:false,ctrlKey:false,altKey:false,metaKey:false}),'emote:sit');
 assert.equal(b.resolve({code:'KeyZ',key:'Z',shiftKey:true,ctrlKey:false,altKey:false,metaKey:false}),null);
 assert.match(b.set('ability:1','KeyZ').reason,/Switch weapon/);assert.match(b.set('ability:1','KeyX').reason,/Sit \/ stand/);
 assert.equal(bindingPermitted('Slash'),false,'chat command key stays reserved');
 assert.ok(b.set('weapon:switch','KeyN').ok);assert.ok(b.set('ability:2','KeyT').ok);
 assert.equal(new ActionBindings(store).get('weapon:switch'),'KeyN');
 b.reset(['weapon:switch','weapon:config']);
 assert.equal(b.get('weapon:switch'),'KeyZ');assert.equal(b.get('ability:2'),'KeyT','partial reset keeps other remaps');
 b.set('weapon:config',null);b.set('ability:3','KeyG');
 b.reset(['weapon:config']);
 const bound=Object.values(b.map).filter(Boolean);assert.equal(new Set(bound).size,bound.length,'partial reset never duplicates a key');
});
