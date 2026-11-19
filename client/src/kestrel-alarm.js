// Presentation of the server-projected local alarm. No gameplay mutations.
import {DEEP} from '../../shared/world.js';
export function alarmPulse(active,time,calm){
 return active?(calm?.75:.72+.28*Math.sin(time*Math.PI*1.4)):0;
}
export function createKestrelAlarm(T,scene){
 const group=new T.Group();group.name='kestrel:alarm-fixtures';scene.add(group);
 const housing=new T.MeshStandardMaterial({color:0x343a3a,roughness:.65,metalness:.45});
 const lens=new T.MeshStandardMaterial({color:0x521714,emissive:0xff2211,emissiveIntensity:0,roughness:.42});
 const base=new T.CylinderGeometry(.21,.25,.16,12),shade=new T.CylinderGeometry(.16,.19,.26,12);
 for(const x of [-61.8,-52.2])for(const z of [DEEP.z-5.1,DEEP.z+5.1]){
  const fixture=new T.Group();fixture.position.set(x,DEEP.roofBottom-.34,z);
  const b=new T.Mesh(base,housing),l=new T.Mesh(shade,lens);l.position.y=-.20;fixture.add(b,l);group.add(fixture);
 }
 const worklight=scene.getObjectByName('kestrel:worklight');
 let audio=null,enabled=true,lastTone=-Infinity,nodes=new Set();
 try{enabled=localStorage.getItem('attunement.alarmAudio')!=='0';}catch{}
 function stopAudio(){
  for(const n of nodes){try{n.stop();}catch{}}
  nodes.clear();
 }
 const unlock=()=>{
  const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
  if(!Audio||!enabled)return;
  try{if(!audio)audio=new Audio();if(audio.state==='suspended')void audio.resume().catch(()=>{});}catch{}
 };
 window.addEventListener('pointerdown',unlock,{passive:true});
 window.addEventListener('keydown',unlock);
 function beep(){
  if(!enabled||!audio||audio.state!=='running')return;
  const now=audio.currentTime;
  for(let i=0;i<2;i++){
   const oscillator=audio.createOscillator(),gain=audio.createGain(),start=now+i*.39;
   oscillator.type='sine';oscillator.frequency.setValueAtTime(i===0?440:620,start);
   gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.045,start+.04);gain.gain.linearRampToValueAtTime(0,start+.28);
   oscillator.connect(gain);gain.connect(audio.destination);nodes.add(oscillator);
   oscillator.onended=()=>{nodes.delete(oscillator);oscillator.disconnect();gain.disconnect();};
   oscillator.start(start);oscillator.stop(start+.30);
  }
 }
 let was=false;
 return {
  get enabled(){return enabled;},
  setEnabled(value){enabled=!!value;try{localStorage.setItem('attunement.alarmAudio',enabled?'1':'0');}catch{}if(!enabled)stopAudio();else unlock();},
  update(active,time,calm){
   const pulse=alarmPulse(active,time,calm);
   lens.emissiveIntensity=pulse*2;
   lens.color.setHex(active?0xff3a28:0x521714);
   if(worklight){worklight.color.setHex(active?0xff3024:0xffddb2);worklight.intensity=active?33+pulse*62:75;}
   group.userData.active=!!active;
   if(active&&!document.hidden){if(!was||time-lastTone>=3.5){beep();lastTone=time;}}
   else if(was)stopAudio();
   was=!!active&&!document.hidden;
  }
 };
}
