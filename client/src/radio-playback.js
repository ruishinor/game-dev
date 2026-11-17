import { getRadioDialogue } from '../../shared/dialogue.js';
import { APPROVED_RADIO_ASSETS } from './radio-assets.js';

// Resolve only a known, exact authored event and a reviewed manifest entry.
// Never interpret network input as a URL, and never probe absent recordings.
export function radioAssetFor(event,manifest=APPROVED_RADIO_ASSETS){
 const entry=getRadioDialogue(event?.dialogueId);
 if(!entry||entry.source!==event.source||entry.transcript!==event.message||!Object.hasOwn(manifest,entry.id))return null;
 const asset=manifest[entry.id];
 if(!asset||asset.transcript!==entry.transcript||!/^[a-f0-9]{64}$/.test(asset.sha256??''))return null;
 const envelope=asset.envelope;
 return {url:'/client/assets/voice/'+entry.id+'.mp3?v='+asset.sha256.slice(0,16),
   envelope:Array.isArray(envelope)&&envelope.length<=6000&&envelope.every(v=>Number.isFinite(v)&&v>=0&&v<=1)?envelope:null};
}
export function normalizeVolume(value,fallback=1){
 if(value===null||value===''||typeof value==='boolean')return fallback;
 const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(1,n)):fallback;
}
export function envelopeAt(envelope,seconds){
 if(!envelope||!Number.isFinite(seconds)||seconds<0)return 0;
 return envelope[Math.floor(seconds*20)]??0;
}

// One owner. Detach event handlers and release the media element on cancellation,
// replay, error, completion and world reset. Late promises/events are ignored.
export class RecordedRadioPlayback{
 constructor({createAudio=()=>new Audio(),schedule=(f,ms)=>setTimeout(f,ms),cancel=clearTimeout,clockSchedule=(f,ms)=>setTimeout(f,ms),clockCancel=clearTimeout}={}){
   this.createAudio=createAudio;this.schedule=schedule;this.cancel=cancel;this.clockSchedule=clockSchedule;this.clockCancel=clockCancel;this.audio=null;this.timer=null;this.clockTimer=null;
 }
 stop(){
   if(this.timer!==null){this.cancel(this.timer);this.timer=null;}
   if(this.clockTimer!==null){this.clockCancel(this.clockTimer);this.clockTimer=null;}
   const a=this.audio;this.audio=null;
   if(!a)return;
   a.onplaying=a.onwaiting=a.onended=a.onerror=a.ontimeupdate=null;
   try{a.pause();a.removeAttribute('src');a.load();}catch{}
 }
 setVolume(v){if(this.audio)this.audio.volume=normalizeVolume(v);}
 start(asset,volume,onState){
   this.stop();
   let a;
   try{a=this.createAudio();}catch{onState('error');return;}
   this.audio=a;
   const current=()=>this.audio===a;
   const clearTimer=()=>{if(this.timer!==null){this.cancel(this.timer);this.timer=null;}};
   const finish=state=>{if(!current())return;this.stop();onState(state);};
   const wait=()=>{if(!current())return;clearTimer();this.timer=this.schedule(()=>finish('error'),15000);};
   let state='loading', lastTime=0;
   const playing=()=>{if(!current())return;clearTimer();if(state!=='playing'){state='playing';onState(state);}};
   a.onplaying=playing;
   a.onwaiting=()=>{if(!current()||a.ended)return;if(state!=='loading'){state='loading';onState(state);}wait();};
   // Recover from media event ordering differences and use actual advancing audio time.
   const syncClock=()=>{if(!current())return;if(a.error){finish('error');return;}
     const time=a.currentTime;
     if(a.ended||(lastTime>0&&Number.isFinite(a.duration)&&time>=a.duration-.01&&a.paused)){finish('ended');return;}
     if(Number.isFinite(time)&&time>lastTime+.001&&!a.paused)playing();if(Number.isFinite(time))lastTime=time;
   };
   a.ontimeupdate=syncClock;
   // Observe the actual media clock even if a browser delays media events.
   // Only one timer exists per active element; stopping releases it immediately.
   const monitor=()=>{this.clockTimer=null;if(!current())return;syncClock();if(current())this.clockTimer=this.clockSchedule(monitor,100);};
   a.onended=()=>finish('ended');
   a.onerror=()=>finish('error');
   try{
     a.preload='auto';a.volume=normalizeVolume(volume);a.src=asset.url;
     onState('loading');wait();
     if(typeof a.addEventListener==='function')this.clockTimer=this.clockSchedule(monitor,100);
     Promise.resolve(a.play()).then(()=>{if(current()&&!a.paused&&!a.ended)playing();},e=>finish(e?.name==='NotAllowedError'?'blocked':'error'));
   }catch(e){finish(e?.name==='NotAllowedError'?'blocked':'error');}
 }
}
