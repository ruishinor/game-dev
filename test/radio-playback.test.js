import test from 'node:test';
import assert from 'node:assert/strict';
import {radioAssetFor,normalizeVolume,envelopeAt,RecordedRadioPlayback} from '../client/src/radio-playback.js';
import {getRadioDialogue} from '../shared/dialogue.js';
const entry=getRadioDialogue('kestrel.log17');
const event={dialogueId:entry.id,source:entry.source,message:entry.transcript};
const asset={transcript:entry.transcript,sha256:'a'.repeat(64),envelope:[0,.7,1]};
const manifest={[entry.id]:asset};
test('recorded assets resolve only from matching authored events and reviewed manifest',()=>{
 assert.equal(radioAssetFor(event,{}),null);
 assert.deepEqual(radioAssetFor(event,manifest),{url:'/client/assets/voice/kestrel.log17.mp3?v='+'a'.repeat(16),envelope:[0,.7,1]});
 for(const e of [{...event,message:'other'},{...event,source:'field'},{...event,dialogueId:'../../outside'},{...event,dialogueId:'__proto__'}])assert.equal(radioAssetFor(e,manifest),null);
 assert.equal(radioAssetFor(event,{[entry.id]:{...asset,sha256:'https://example.org'}}),null);
 assert.equal(radioAssetFor(event,{[entry.id]:{...asset,transcript:'changed'}}),null);
 assert.equal(radioAssetFor(event,{[entry.id]:{...asset,envelope:[-1]}}).envelope,null);
 assert.equal(envelopeAt(asset.envelope,.05),.7);assert.equal(envelopeAt(asset.envelope,1),0);
 assert.equal(normalizeVolume(null),1);assert.equal(normalizeVolume('0'),0);assert.equal(normalizeVolume(2),1);assert.equal(normalizeVolume('invalid'),1);
});
function fixture(){
 const instances=[],states=[],timers=new Map();let sequence=0;
 const player=new RecordedRadioPlayback({createAudio:()=>{const a={pause(){this.paused=true;},removeAttribute(){this.src='';},load(){},play(){return this.promise??Promise.resolve();}};instances.push(a);return a;},
 schedule:(f)=>{const id=++sequence;timers.set(id,f);return id;},cancel:id=>timers.delete(id)});
 const start=()=>player.start({url:'/asset.mp3'},.8,s=>states.push(s));
 return {player,instances,states,timers,start};
}
test('playback owns one element, releases it and rejects stale events',()=>{
 const f=fixture();f.start();const a=f.instances[0];const stale=a.onended;a.onplaying();f.player.setVolume(.3);assert.equal(a.volume,.3);
 f.start();assert.equal(a.paused,true);assert.equal(a.src,'');stale();assert.equal(f.player.audio,f.instances[1]);
 f.instances[1].onplaying();f.instances[1].onended();assert.equal(f.player.audio,null);assert.equal(f.timers.size,0);
 assert.deepEqual(f.states,['loading','playing','loading','playing','ended']);
});
test('missing/decode error, autoplay denial and stalled media retain the transcript path',async()=>{
 const f=fixture();f.start();f.instances[0].onerror();assert.equal(f.states.at(-1),'error');assert.equal(f.player.audio,null);
 const denial=Object.assign(new Error('autoplay'),{name:'NotAllowedError'});
 const g=new RecordedRadioPlayback({createAudio:()=>({play:()=>Promise.reject(denial),pause(){},removeAttribute(){},load(){}})});
 const states=[];g.start({url:'/asset.mp3'},1,s=>states.push(s));await Promise.resolve();await Promise.resolve();assert.equal(states.at(-1),'blocked');assert.equal(g.audio,null);
 f.start();const timeout=[...f.timers.values()][0];timeout();assert.equal(f.states.at(-1),'error');assert.equal(f.player.audio,null);
 f.start();f.player.stop();assert.equal(f.player.audio,null);assert.equal(f.timers.size,0);
});
