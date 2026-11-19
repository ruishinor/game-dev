// The shared combat-engine timeline, not a second renderer. Snapshot only
// visual endpoints of an accepted server damage event. No damage, AoE, stun,
// reach, targets or timing are calculated here.
import {point} from './engine.js';
import {CELL} from './textures.js';

const C={core:0xe0faff,cyan:0x42cbff,blue:0x2779f5,violet:0x7254e8};
const stages=[
 {at:0,emit(c){
  if(!c.active())return;
  const {v,from,target,joined,yaw,center}=c;
  // One compact directional sweep, separate from the persistent local corona.
  c.track(v.lightning({from,to:target,color:C.core,color2:C.blue,width:joined?.10:.071,life:.34,alpha:1,jag:.14,rate:.07,branches:1}),'contact-channel');
  c.track(v.arc({at:center,yaw,radius:joined?1.6:1.15,sweep:joined?2.4:1.65,tilt:joined?.36:-.32,life:.46,trail:.73,color:C.cyan,alpha:.88}),'primary-sweep');
  v.burst({at:target,count:1,exact:true,cell:CELL.flare,color:C.core,color2:C.cyan,size:joined?.95:.72,sizeEnd:.17,life:.22,speed:0,alpha:.78});
 }},
 {at:.10,emit(c){
  if(!c.active())return;
  const {v,target,ground,joined,blocked}=c;
  // Local target relief, not an additional area attack.
  if(!blocked&&ground){
   const end=[ground[0]+.18,ground[1]+.08,ground[2]-.12];
   c.track(v.lightning({from:target,to:end,color:C.cyan,color2:C.violet,width:.048,life:.34,alpha:.72,jag:.22,branches:0}),'ground-channel');
  }
  v.burst({at:target,shape:'sphere',radius:.10,count:joined?22:14,cell:CELL.streak,color:C.core,color2:C.blue,size:[.045,.11],sizeEnd:.015,life:[.26,.55],speed:[2.6,5.4],gravity:3.4,drag:2.1,alpha:.84});
 }},
 {at:.25,emit(c){
  if(!c.active())return;
  const {v,target,joined}=c;
  // A late ion wake retains direction and a short, readable decay.
  v.burst({at:target,count:joined?11:7,cell:CELL.ember,color:C.cyan,color2:C.violet,size:[.06,.14],sizeEnd:.02,life:[.4,.72],dir:[0,1,0],spread:1.3,speed:[.5,1.6],drag:1.8,turb:.55,turbScale:2.1,alpha:.64});
 }},
];

export function playElectricalStrike(v,{from,target,ground=null,joined=false,blocked=false,active=()=>true,remember=()=>{}}){
 const a=point(from),b=point(target),g=point(ground);
 if(!a||!b||!v||v.quality<=0||v.reducedMotion||v.calmFlashes||v.intensity<=.3||typeof v.play!=='function'||!active())return null;
 const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],distance=Math.hypot(dx,dy,dz);
 if(distance<.06||distance>4.5)return null;
 const center=[a[0]+dx*.16,a[1]+dy*.16,a[2]+dz*.16];
 const track=(h,name)=>{if(h?.mesh&&name!=='contact-channel'&&name!=='ground-channel')h.mesh.name='rod-strike:'+name;if(h)remember(h);};
 return v.play(stages,{v,from:a,target:b,ground:g,joined,blocked,yaw:Math.atan2(dx,dz),center,active:()=>active()&&!v.calmFlashes&&!v.reducedMotion&&v.quality>0&&v.intensity>.3,track});
}
