// Local presentation of private authored transmissions. No remote speech
// service, microphone, uploaded recording, or game-authority changes.
export const RADIO_SOURCES=Object.freeze({
 kernel:{name:'KERNEL',channel:'Directive uplink',colour:'#91c9dc',portrait:'operator'},
 field:{name:'Field Archive',channel:'Brineworks / Sinter service channel',colour:'#e4b478',portrait:'technician'},
 kestrel:{name:'Kestrel duty researcher',channel:'Recovered log · Kestrel Deep',colour:'#b1b3d7',portrait:'researcher'},
});
const h=(tag,cls,value)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(value!==undefined)el.textContent=value;return el;};
// Fixed original portrait illustration, deliberately different from a model
// screenshot. Unidentified historical speakers are not assigned a canon name.
const portraits={
 operator:'<path d="M45 22 73 14 102 25 113 47 108 71 98 84 99 96 124 111 130 138H22l7-26 25-16 1-13-12-18-5-25z" fill="#3b505a"/><path d="M52 42 68 31 92 31 104 42 100 65 92 82 77 88 61 78 52 64z" fill="#a0b5b7"/><path d="M44 44h65v16H44z" fill="#1e3541" stroke="#91c9dc"/><path d="M63 50h31m-15 11v13m-13 4h25" stroke="#a4d9e5"/><path d="M47 36 36 45v25l12 8m58-42 13 10v19l-12 10" fill="#617782"/><path d="M53 95l24 14 24-14 19 15-12 28H40l-9-26z" fill="#263e4a"/>',
 technician:'<path d="M34 46 43 21 67 12 90 17 111 39 115 64 104 87 100 97 127 115 132 138H21l6-24 30-17-3-13-14-18z" fill="#615b4a"/><path d="M47 43 65 30 91 32 104 49 99 69 91 84 76 89 61 80 51 65z" fill="#b49b80"/><path d="M43 44 51 25 77 19 99 31 108 46 93 39 58 40z" fill="#394541"/><path d="M49 51h18m15 0h18M77 54l-3 13 7 1m-15 9 21-1" stroke="#4d554b" stroke-width="2"/><path d="M45 51 36 54v20l20 9m48-31 12 5v15l-13 7" fill="#566660"/><path d="M56 91 76 105 98 91l27 25 5 22H23l7-23z" fill="#817656"/><path d="m44 112 20 26m42-26-17 26" stroke="#d0ac70" stroke-width="5"/>',
 researcher:'<path d="M42 44 48 24 67 16 87 16 104 30 111 52 104 74 96 89v9l30 17 7 23H20l6-23 31-17V86L45 68z" fill="#5d626b"/><path d="M52 44 61 33 90 33 101 48 99 64 91 81 76 87 62 77 54 63z" fill="#b3a69b"/><path d="M48 42 50 26 71 19 92 22 106 39 95 38 86 29 68 33 57 45z" fill="#51565d"/><path d="M50 49h22v13H50zM81 49h22v13H81zM72 54h9" fill="#394952" stroke="#b1b3d7"/><path d="m76 61-2 11 7 1m-17 5 23 1" stroke="#6f665e"/><path d="M56 94 76 107 99 94l29 23 5 21H21l7-23z" fill="#5c6873"/><path d="M63 107 76 130 91 107" stroke="#b2bac6" stroke-width="4"/>'
};
export class RadioQueue{
 constructor(limit=4){this.limit=limit;this.pending=[];this.current=null;}
 push(source,message){
   if(!Object.hasOwn(RADIO_SOURCES,source)||typeof message!=='string'||!message.trim()||message.length>1200)return false;
   if(this.current?.source===source&&this.current.message===message||this.pending.some(p=>p.source===source&&p.message===message))return false;
   this.pending.push({source,message});if(this.pending.length>this.limit)this.pending.shift();return true;
 }
 next(){this.current=this.pending.shift()||null;return this.current;}
 clear(){this.current=null;this.pending=[];}
}
export class RadioPanel{
 constructor(root){
  this.queue=new RadioQueue();this.token=0;this.utterance=null;this.playing=false;this.open=false;
  try{this.enabled=localStorage.getItem('attunement.radioVoice')!=='0';}catch{this.enabled=true;}
  this.el=h('aside','radio-panel');this.el.hidden=true;this.el.setAttribute('aria-label','Radio transmission');
  this.el.setAttribute('role','region');root.append(this.el);
 }
 receive(source,message){if(!this.queue.push(source,message))return false;if(!this.open)this.next();else this.updateCount();return true;}
 updateCount(){if(this.count)this.count.textContent=this.queue.pending.length?this.queue.pending.length+' queued':'';}
 stop(){this.token++;if(this.utterance){try{globalThis.speechSynthesis?.cancel();}catch{}}this.utterance=null;this.playing=false;this.el.dataset.playing='false';}
 clear(){this.stop();this.queue.clear();this.open=false;this.el.hidden=true;}
 next(){this.stop();const event=this.queue.next();if(!event){this.open=false;this.el.hidden=true;return;}this.open=true;this.draw(event);if(this.enabled)this.play();}
 draw(event){
  const s=RADIO_SOURCES[event.source];this.el.hidden=false;this.el.replaceChildren();this.el.style.setProperty('--radio-accent',s.colour);this.el.dataset.source=event.source;
  const header=h('div','radio-head');header.append(h('strong',null,'INCOMING TRANSMISSION'));this.count=h('span','radio-count');header.append(this.count);
  const close=h('button',null,'×');close.type='button';close.setAttribute('aria-label','Dismiss transmission');close.addEventListener('click',()=>this.next());header.append(close);
  const grid=h('div','radio-grid'),portrait=h('div','radio-portrait');
  portrait.innerHTML='<svg viewBox="0 0 154 138" aria-hidden="true"><rect width="154" height="138" fill="#15242d"/><path d="M0 18H154M0 43H154M0 68H154M0 93H154M0 118H154" stroke="#35515c" opacity=".5"/>'+portraits[s.portrait]+'</svg>';
  const bars=h('div','radio-wave');bars.setAttribute('aria-hidden','true');for(let i=0;i<18;i++){const b=h('i');b.style.setProperty('--i',String(i));bars.append(b);}portrait.append(bars);
  const copy=h('div','radio-copy');copy.append(h('strong','radio-name',s.name),h('small','radio-channel',s.channel));const transcript=h('p','radio-transcript',event.message);transcript.setAttribute('aria-live','polite');copy.append(transcript);grid.append(portrait,copy);
  const footer=h('div','radio-footer');this.status=h('span','radio-status','Transcript ready');
  this.replay=h('button',null,'Play voice');this.replay.type='button';this.replay.addEventListener('click',()=>this.play());
  this.mute=h('button',null,this.enabled?'Mute auto voice':'Enable auto voice');this.mute.type='button';this.mute.addEventListener('click',()=>{this.enabled=!this.enabled;try{localStorage.setItem('attunement.radioVoice',this.enabled?'1':'0');}catch{}this.mute.textContent=this.enabled?'Mute auto voice':'Enable auto voice';if(!this.enabled){this.stop();this.status.textContent='Voice muted';}else this.play();});
  footer.append(this.status,this.replay,this.mute);this.el.append(header,grid,footer);this.updateCount();
 }
 play(){
  const event=this.queue.current;if(!event)return;this.stop();const token=this.token;
  const synth=globalThis.speechSynthesis,Voice=globalThis.SpeechSynthesisUtterance;
  // Local voices only: do not send dialogue to an OS/browser cloud provider.
  const voices=synth?.getVoices?.().filter(v=>v.localService&&/^en(?:-|$)/i.test(v.lang))||[];
  if(!Voice||!voices.length){this.status.textContent='Local voice unavailable · transcript';return;}
  try{
    const u=new Voice(event.message);u.voice=voices[event.source==='kestrel'?Math.min(1,voices.length-1):0];u.lang=u.voice.lang;u.rate=.94;u.pitch=event.source==='kernel'?.86:1;
    u.onstart=()=>{if(token!==this.token)return;this.playing=true;this.el.dataset.playing='true';this.status.textContent='Playing local voice';};
    const done=()=>{if(token!==this.token)return;this.utterance=null;this.playing=false;this.el.dataset.playing='false';};
    u.onend=()=>{done();if(token===this.token)this.status.textContent='Playback complete';};
    u.onerror=()=>{done();if(token===this.token)this.status.textContent='Voice unavailable · transcript';};
    this.utterance=u;this.status.textContent='Starting local voice';synth.speak(u);
  }catch{this.status.textContent='Voice unavailable · transcript';}
 }
}
