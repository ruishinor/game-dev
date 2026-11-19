// Local presentation of private authored transmissions. No remote speech
// service, microphone, uploaded recording, or game-authority changes.
import { getRadioDialogue } from '../../shared/dialogue.js';
import { radioAssetFor, normalizeVolume, envelopeAt, RecordedRadioPlayback } from './radio-playback.js';
import { radioPrefs, radioPosition, relativeRadioPosition, RADIO_OPACITIES, VOICE_MODES } from './radio-prefs.js';
export const RADIO_SOURCES=Object.freeze({
 kernel:{name:'KERNEL',channel:'Directive uplink',colour:'#91c9dc',portrait:null},
 field:{name:'Field Archive',channel:'Brineworks / Sinter service channel',colour:'#e4b478',portrait:null},
 kestrel:{name:'Kestrel duty researcher',channel:'Recovered log · Kestrel Deep',colour:'#b1b3d7',portrait:null},
});
const h=(tag,cls,value)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(value!==undefined)el.textContent=value;return el;};
// Unknown speakers and machine uplinks use a communications glyph, never an invented face.
const COMMS='<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M11 39h26M24 20v19M17 39l7-19 7 19"/><circle cx="24" cy="16" r="2.5" fill="currentColor"/><path d="M17 9a10 10 0 0 0 0 14m14-14a10 10 0 0 1 0 14M11 4a17 17 0 0 0 0 24M37 4a17 17 0 0 1 0 24"/></svg>';
const button=(label,text,cb)=>{const b=h('button',null,text);b.type='button';b.title=label;b.setAttribute('aria-label',label);b.addEventListener('click',cb);return b;};
export class RadioQueue{
 constructor(limit=4){this.limit=limit;this.pending=[];this.current=null;}
 push(source,message,dialogueId){
   if(!Object.hasOwn(RADIO_SOURCES,source)||typeof message!=='string'||!message.trim()||message.length>1200)return false;
   if(this.current?.source===source&&this.current.message===message||this.pending.some(p=>p.source===source&&p.message===message))return false;
   const authored=getRadioDialogue(dialogueId);
   this.pending.push({source,message,...(authored?.source===source&&authored.transcript===message?{dialogueId:authored.id}:{})});if(this.pending.length>this.limit)this.pending.shift();return true;
 }
 next(){this.current=this.pending.shift()||null;return this.current;}
 clear(){this.current=null;this.pending=[];}
}
export class RadioPanel{
 constructor(root,{tracker=null,portrait=()=>null}={}){
  this.root=root;this.tracker=tracker;this.portrait=portrait;
  this.queue=new RadioQueue();this.token=0;this.playing=false;this.open=false;
  this.recorded=new RecordedRadioPlayback();this.volume=1;this.waveFrame=null;
  this.prefs=radioPrefs(null);try{let raw;try{raw=JSON.parse(localStorage.getItem('attunement.radioPrefs'));}catch{}this.prefs=radioPrefs(raw,localStorage.getItem('attunement.radioVoice'));this.volume=normalizeVolume(localStorage.getItem('attunement.radioVolume'));}catch{}
  this.el=h('aside','radio-panel');this.el.hidden=true;this.el.setAttribute('aria-label','Radio transmission');
  this.el.setAttribute('role','region');root.append(this.el);
  this.el.addEventListener('keydown',e=>{if(['Enter','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.code))e.stopPropagation();});
  window.addEventListener('resize',()=>this.place());
  if(globalThis.ResizeObserver){this.observer=new ResizeObserver(()=>this.place());this.observer.observe(this.el);if(tracker)this.observer.observe(tracker.parentElement);}
  this.applyPrefs();
 }
 savePrefs(){try{localStorage.setItem('attunement.radioPrefs',JSON.stringify(this.prefs));}catch{}}
 applyPrefs(){this.el.style.setProperty('--radio-alpha',String(this.prefs.opacity/100));this.el.dataset.locked=String(this.prefs.locked);if(this.modeSelect)this.modeSelect.value=this.prefs.mode;if(this.lockButton){this.lockButton.textContent=this.prefs.locked?'Unlock':'Lock';this.lockButton.setAttribute('aria-label',this.prefs.locked?'Unlock transmission position':'Lock transmission position');}if(this.opacityButton){this.opacityButton.textContent=this.prefs.opacity+'%';this.opacityButton.title='Transmission background opacity: '+this.prefs.opacity+'%';}if(this.replay){this.replay.disabled=this.prefs.mode==='off'||!radioAssetFor(this.queue.current);this.replay.title=this.prefs.mode==='off'?'Voice disabled':this.replay.disabled?'Recording unavailable':'Play voice';}if(this.quickMode)this.quickMode.textContent=this.prefs.mode==='off'?'Off':this.prefs.mode==='auto'?'Auto':'Manual';}
 setMode(mode){if(!VOICE_MODES.includes(mode))return;this.prefs.mode=mode;this.savePrefs();this.applyPrefs();if(mode!=='auto'){this.stop();if(this.status)this.status.textContent=mode==='off'?'Transcript only':'Manual playback';}}
 settings(){const section=h('section','radio-settings');const label=h('label',null,'Dialogue voice');this.modeSelect=h('select');this.modeSelect.setAttribute('aria-label','Dialogue voice');for(const [v,t] of [['auto','Automatic'],['manual','Manual replay only'],['off','No voice (transcript only)']]){const o=h('option',null,t);o.value=v;this.modeSelect.append(o);}this.modeSelect.addEventListener('change',()=>this.setMode(this.modeSelect.value));label.append(this.modeSelect);section.append(label,button('Reset transmission position','Reset transmission position',()=>this.resetPosition()));this.applyPrefs();return section;}
 resetPosition(){this.prefs.pos=null;this.savePrefs();this.place();}
 bounds(){const v=this.root.getBoundingClientRect(),c=this.el.getBoundingClientRect();return {view:{width:v.width,height:v.height},card:{width:c.width,height:c.height},root:v,rect:c};}
 place(){if(this.el.hidden||this.drag)return;const {view,card,root}=this.bounds(),t=this.tracker?.getBoundingClientRect();const p=radioPosition(view,card,t?{left:t.left-root.left,top:t.top-root.top,bottom:t.bottom-root.top}:null,this.prefs.pos);this.el.style.left=p.x+'px';this.el.style.top=p.y+'px';}
 bindDrag(header){header.addEventListener('pointerdown',e=>{if(this.prefs.locked||e.button!==0||e.target.closest('button'))return;const {rect,root}=this.bounds();this.drag={id:e.pointerId,dx:e.clientX-rect.left,dy:e.clientY-rect.top};header.setPointerCapture(e.pointerId);e.preventDefault();});header.addEventListener('pointermove',e=>{if(this.drag?.id!==e.pointerId)return;const {view,card,root}=this.bounds();const pos=relativeRadioPosition(e.clientX-root.left-this.drag.dx,e.clientY-root.top-this.drag.dy,view,card);this.prefs.pos=pos;const p=radioPosition(view,card,null,pos);this.el.style.left=p.x+'px';this.el.style.top=p.y+'px';});const end=e=>{if(this.drag?.id!==e.pointerId)return;this.drag=null;this.savePrefs();this.place();};header.addEventListener('pointerup',end);header.addEventListener('pointercancel',end);header.addEventListener('lostpointercapture',end);}
 receive(source,message,dialogueId){
  if(!this.queue.push(source,message,dialogueId))return false;
  // Explicit field interactions must not sit behind earlier directive chatter.
  // The interrupted message remains in the regular log; queued directives remain.
  if(this.open&&source!=='kernel'){const active=this.queue.pending.pop();this.queue.pending.unshift(active);this.next();}
  else if(!this.open)this.next();else this.updateCount();return true;
 }
 updateCount(){if(this.count)this.count.textContent=this.queue.pending.length?this.queue.pending.length+' queued':'';}
 stop(){this.token++;this.recorded.stop();this.stopWave();this.playing=false;this.el.dataset.playing='false';delete this.el.dataset.recorded;}
 stopWave(){if(this.waveFrame!==null){cancelAnimationFrame(this.waveFrame);this.waveFrame=null;}for(const bar of this.bars??[])bar.style.removeProperty('--level');}
 startWave(asset,token){
  this.stopWave();if(!asset.envelope||globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  const tick=()=>{if(token!==this.token||!this.playing||!this.recorded.audio){this.waveFrame=null;return;}
   const level=envelopeAt(asset.envelope,this.recorded.audio.currentTime);
   for(let i=0;i<this.bars.length;i++){const taper=1-Math.abs(i-(this.bars.length-1)/2)/this.bars.length;this.bars[i].style.setProperty('--level',String(.35+level*2*taper));}
   this.waveFrame=requestAnimationFrame(tick);};this.waveFrame=requestAnimationFrame(tick);
 }
 clear(){this.drag=null;this.stop();this.queue.clear();this.open=false;this.el.hidden=true;}
 next(){this.drag=null;this.stop();const event=this.queue.next();if(!event){this.open=false;this.el.hidden=true;return;}this.open=true;this.draw(event);if(this.prefs.mode==='auto'&&radioAssetFor(event))this.play();}
 draw(event){
  const s=RADIO_SOURCES[event.source];this.el.hidden=false;this.el.replaceChildren();this.el.style.setProperty('--radio-accent',s.colour);this.el.dataset.source=event.source;
  const header=h('div','radio-head');header.append(h('strong',null,'TRANSMISSION'));this.count=h('span','radio-count');header.append(this.count);this.bindDrag(header);
  const actions=h('div','radio-actions');this.replay=button('Play voice','▶',()=>this.play());
  const controls=h('div','radio-controls');controls.hidden=true;
  const gear=button('Transmission controls','⚙',()=>{controls.hidden=!controls.hidden;gear.setAttribute('aria-expanded',String(!controls.hidden));this.place();});gear.setAttribute('aria-expanded','false');
  const close=button('Dismiss transmission','×',()=>this.next());actions.append(this.replay,gear,close);header.append(actions);
  const grid=h('div','radio-grid'),portrait=h('div','radio-portrait');
  const art=s.portrait?this.portrait(s.portrait):null;if(art){const img=h('img');img.src=art;img.alt=s.name;portrait.append(img);}else{portrait.innerHTML=COMMS;portrait.setAttribute('aria-label','Radio communications');}
  const bars=h('div','radio-wave');bars.setAttribute('aria-hidden','true');for(let i=0;i<18;i++){const b=h('i');b.style.setProperty('--i',String(i));bars.append(b);}portrait.append(bars);this.bars=Array.from(bars.children);
  const copy=h('div','radio-copy');copy.append(h('strong','radio-name',s.name),h('small','radio-channel',s.channel));const transcript=h('button','radio-transcript',event.message);transcript.type='button';transcript.title='Click to expand or collapse transcript';transcript.setAttribute('aria-expanded','true');transcript.addEventListener('click',()=>{const expanded=transcript.getAttribute('aria-expanded')!=='true';transcript.setAttribute('aria-expanded',String(expanded));this.place();});copy.append(transcript);grid.append(portrait,copy);
  const footer=h('div','radio-footer');this.status=h('span','radio-status',this.prefs.mode==='off'?'Transcript only':!radioAssetFor(event)?'Recording unavailable':this.prefs.mode==='manual'?'Manual playback':'Ready');this.status.setAttribute('role','status');
  this.quickMode=button('Cycle dialogue voice mode','',()=>this.setMode(VOICE_MODES[(VOICE_MODES.indexOf(this.prefs.mode)+1)%VOICE_MODES.length]));
  this.lockButton=button('Lock transmission position','',()=>{this.prefs.locked=!this.prefs.locked;this.savePrefs();this.applyPrefs();});
  this.opacityButton=button('Cycle transmission background opacity','',()=>{this.prefs.opacity=RADIO_OPACITIES[(RADIO_OPACITIES.indexOf(this.prefs.opacity)+1)%RADIO_OPACITIES.length];this.savePrefs();this.applyPrefs();});
  const volume=h('input','radio-volume');volume.type='range';volume.min='0';volume.max='1';volume.step='.05';volume.value=String(this.volume);volume.setAttribute('aria-label','Dialogue volume');volume.title='Dialogue volume';
  const volText=h('span','radio-volume-value');const volumeRow=h('div','radio-volume-row');volumeRow.append(volume,volText);
  const showVolume=()=>{const pct=Math.round(this.volume*100)+'%';volume.style.setProperty('--radio-volume-pct',pct);volume.setAttribute('aria-valuetext',pct);volText.textContent=pct;};showVolume();
  volume.addEventListener('input',()=>{this.volume=normalizeVolume(volume.value);this.recorded.setVolume(this.volume);showVolume();try{localStorage.setItem('attunement.radioVolume',String(this.volume));}catch{}});
  const prefs=h('div','radio-pref-actions');prefs.append(this.quickMode,this.lockButton,this.opacityButton);controls.append(h('span','radio-caption','Voice · position · opacity'),prefs);
  footer.append(this.status,volumeRow);this.el.append(header,grid,footer,controls);this.applyPrefs();this.updateCount();this.place();
 }
 play(){
  const event=this.queue.current;if(!event||this.prefs.mode==='off')return;this.stop();const token=this.token;
  const asset=radioAssetFor(event);
  if(asset){this.el.dataset.recorded='true';this.recorded.start(asset,this.volume,state=>{
    if(token!==this.token)return;this.playing=state==='playing';this.el.dataset.playing=String(this.playing);
    this.status.textContent=({loading:'Acquiring recording',playing:'Playing recording',ended:'Playback complete',blocked:'Select Play voice to listen',error:'Recording unavailable · transcript'})[state];
    if(this.playing)this.startWave(asset,token);else this.stopWave();
  });return;}
  this.status.textContent='Recording unavailable · transcript';
 }
}
