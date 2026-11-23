import test from 'node:test';
import assert from 'node:assert/strict';
import {AUDIO_PRESETS, CombatAudio, combatCue, soundDistanceGain} from '../client/src/combat-audio.js';

const s=(er=1)=>({meta:{k:'p'},row:{er},pos:{x:0,z:0}});
const dmg=(rest={})=>({e:'dmg',k:'melee',ab:'auto',a:4,...rest});
test('audio is derived from authoritative contact and separate server windup, never a guessed hit',()=>{
 assert.equal(combatCue({e:'melee_start',style:'1'},s()),'rod-swing');
 assert.equal(combatCue({e:'melee_miss',style:'1'},s()),null);
 assert.equal(combatCue(dmg(),s()),'rod-impact');
 assert.equal(combatCue(dmg({a:0,sh:5}),s()),'rod-block');
 assert.equal(combatCue(dmg({a:0,sh:0}),s()),null);
 assert.equal(combatCue(dmg({k:'bolt',ab:'auto',wv:'longpoint'}),s(3)),'longpoint');
 assert.equal(combatCue(dmg({k:'bolt',ab:'auto',wv:'field'}),s(3)),'field');
 assert.equal(combatCue(dmg({k:'bolt',ab:'auto',wv:'tuned'}),s(3)),'tuned');
 assert.equal(combatCue(dmg({k:'bolt',ab:'core_bore',wv:'longpoint'}),s(3)),null);
 assert.equal(combatCue(dmg({k:'melee',ab:'rending_echo'}),s()),null);
 assert.equal(combatCue(dmg({k:'melee'}),{...s(),meta:{k:'e'}}),null);
 assert.equal(combatCue({e:'melee_start',style:'__proto__'},s()),null);
 for(const p of Object.values(AUDIO_PRESETS))assert.ok(p.duration<=.3&&p.peak<=.07&&p.start>p.end&&p.noise<.05);
});
test('distance limiting, disabled preference, and gesture gating are fail-closed',()=>{
 assert.equal(soundDistanceGain({x:0,z:0},{x:0,z:0}),1);
 assert.equal(soundDistanceGain({x:0,z:0},{x:40,z:0}),0);
 assert.equal(soundDistanceGain({x:NaN,z:0},{x:0,z:0}),0);
 const backing=new Map([['attunement.combatAudio','0']]);
 const storage={getItem:k=>backing.get(k),setItem:(k,v)=>backing.set(k,v)};
 let started=0;
 const sfx=new CombatAudio({storage,createContext:()=>{started++;return {state:'suspended',resume:()=>Promise.resolve()};}});
 assert.equal(sfx.unlock(),false,'disabled audio never touches Web Audio');
 assert.equal(started,0);
 assert.equal(sfx.playEvent(dmg(),s(),s()),false);
 sfx.setEnabled(true);assert.equal(started,1);
 assert.equal(sfx.play('rod-impact',{x:0,z:0},{x:0,z:0}),false,'suspended context cannot play');
 sfx.setEnabled(false);assert.equal(backing.get('attunement.combatAudio'),'0');
});
test('voice cap and cooldown are enforced without browser globals',()=>{
 const made=[];
 function node(){
  const n={disconnect(){},connect(){return n;},start(){},stop(){},type:'',onended:null,frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},buffer:null};
  made.push(n);return n;
 }
 const ctx={state:'running',currentTime:1,sampleRate:48000,destination:{},createOscillator:node,createGain:node,createBufferSource:node,createBiquadFilter:node,createBuffer:(_channels,count)=>({getChannelData:()=>new Float32Array(count)})};
 const a=new CombatAudio({createContext:()=>ctx,storage:{getItem:()=>null,setItem(){}}});
 a.unlock();const self={x:0,z:0};
 assert.equal(a.play('rod-impact',self,self),true);
 assert.equal(a.play('rod-impact',self,self),false,'same-frame duplicates are suppressed');
 ctx.currentTime+=.2;assert.equal(a.play('longpoint',self,self),true);
 assert.equal(a.voices.size,2);
 a.stop();assert.equal(a.voices.size,0);
 assert.equal(a.play('bogus',self,self),false);
});
