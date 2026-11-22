// The shared combat-engine timeline, not a second renderer. Snapshot only
// visual endpoints of an accepted server damage event. No damage, AoE, stun,
// reach, targets or timing are calculated here.
import {point} from './engine.js';
import {CELL} from './textures.js';

const BASE={core:0xe0faff,cyan:0x42cbff,blue:0x2779f5,violet:0x7254e8};
// Quick onset (contact and sweep on the same frame as the confirmed hit),
// then a longer-lived residual crackle that decays around the target.
const stages=[
 {at:0,emit(c){
  const C=c.C;
  if(!c.active())return;
  const {v,from,target,joined,yaw,center}=c;
  // One compact directional sweep, separate from the persistent local corona.
  c.track(v.lightning({from,to:target,color:C.core,color2:C.blue,width:joined?.11:.078,life:.38,alpha:1,jag:.14,rate:.06,branches:1}),'contact-channel');
  c.track(v.arc({at:center,yaw,radius:joined?1.75:1.2,sweep:joined?2.5:1.7,tilt:joined?.36:-.32,life:.36,trail:.7,color:C.cyan,alpha:.92}),'primary-sweep');
  v.burst({at:target,count:1,exact:true,cell:CELL.flare,color:C.core,color2:C.cyan,size:joined?1.15:.8,sizeEnd:.18,life:.26,speed:0,alpha:.85});
 }},
 {at:.06,emit(c){
  const C=c.C;
  if(!c.active())return;
  const {v,target,ground,joined,blocked}=c;
  // Local target relief, not an additional area attack.
  if(!blocked&&ground){
   const end=[ground[0]+.18,ground[1]+.08,ground[2]-.12];
   c.track(v.lightning({from:target,to:end,color:C.cyan,color2:C.violet,width:.05,life:.4,alpha:.78,jag:.22,branches:0}),'ground-channel');
  }
  v.burst({at:target,shape:'sphere',radius:.1,count:joined?30:18,cell:CELL.streak,color:C.core,color2:C.blue,size:[.045,.12],sizeEnd:.015,life:[.3,.6],speed:[3,6.2],gravity:3.4,drag:2.1,alpha:.88});
 }},
 {at:.14,emit(c){
  const C=c.C;
  if(!c.active())return;
  const {v,target,joined}=c;
  // A late ion wake retains direction and a short, readable decay.
  v.burst({at:target,count:joined?14:9,cell:CELL.ember,color:C.cyan,color2:C.violet,size:[.06,.15],sizeEnd:.02,life:[.5,.9],dir:[0,1,0],spread:1.3,speed:[.5,1.7],drag:1.8,turb:.55,turbScale:2.1,alpha:.7});
 }},
 {at:.32,emit(c){
  const C=c.C;
  if(!c.active())return;
  // Residual crackle: short arcs hopping over the struck surface.
  const {v,target,joined}=c;
  for(let i=0;i<(joined?2:1);i++)c.track(v.lightning({from:target,to:jitter(target,.42),color:C.core,color2:C.cyan,width:.026,life:.22,alpha:.85,jag:.3,rate:.05,branches:0}),'residual');
  v.burst({at:target,shape:'sphere',radius:.16,count:joined?8:5,cell:CELL.streak,color:C.core,color2:C.blue,size:[.03,.07],sizeEnd:.01,life:[.18,.34],speed:[1,2.4],drag:2.5,alpha:.8});
 }},
 {at:.58,emit(c){
  const C=c.C;
  if(!c.active()||!c.joined)return;
  const {v,target}=c;
  c.track(v.lightning({from:target,to:jitter(target,.35),color:C.cyan,color2:C.violet,width:.02,life:.2,alpha:.7,jag:.3,rate:.05,branches:0}),'residual');
 }},
];
const jitter=(p,r)=>[p[0]+(Math.random()-.5)*r*2,p[1]+(Math.random()-.2)*r,p[2]+(Math.random()-.5)*r*2];

export function playElectricalStrike(v,{from,target,ground=null,joined=false,blocked=false,active=()=>true,remember=()=>{},palette=null}){
 // Class colourway: the stage recipes read colours from the context.
 const C=palette?{core:palette.strikeCore,cyan:palette.strikeCyan,blue:palette.strikeBlue,violet:palette.violet}:BASE;
 const a=point(from),b=point(target),g=point(ground);
 if(!a||!b||!v||v.quality<=0||v.reducedMotion||v.calmFlashes||v.intensity<=.3||typeof v.play!=='function'||!active())return null;
 const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],distance=Math.hypot(dx,dy,dz);
 if(distance<.06||distance>4.5)return null;
 const center=[a[0]+dx*.16,a[1]+dy*.16,a[2]+dz*.16];
 const track=(h,name)=>{if(h?.mesh&&!['contact-channel','ground-channel','residual'].includes(name))h.mesh.name='rod-strike:'+name;if(h)remember(h);};
 return v.play(stages,{v,C,from:a,target:b,ground:g,joined,blocked,yaw:Math.atan2(dx,dz),center,active:()=>active()&&!v.calmFlashes&&!v.reducedMotion&&v.quality>0&&v.intensity>.3,track});
}
