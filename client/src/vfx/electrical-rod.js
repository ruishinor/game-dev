// Ability-grade electrical weapon presentation. All timings and budgets are
// visual only; contact is supplied by an existing confirmed combat event.
//
// Two tiers work together:
//  - the weapon-local corona (rod-corona.js) is always on while the rod is in
//    hand and costs no shared pool; `rod.pulse()` escalates it;
//  - this controller adds bounded shared-engine layers for the phases that
//    should read as ability-grade: transform, draw, charge, strike, impact and
//    the residual crackle after them. Joined configuration is the most intense.
// Every engine layer is gated by quality, comfort (calm flashes / minimal
// intensity) and reduced motion, and rate-limited per weapon.
import {playElectricalStrike} from './electrical-strike.js';
import {CELL} from './textures.js';
const C={ice:0xcaf7ff,cyan:0x61d7ff,blue:0x2675ef,deep:0x344bcc,violet:0x7254e8};
const clamp=x=>Math.max(0,Math.min(1,Number.isFinite(x)?x:0));
const finite=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
const clone=p=>p.clone?p.clone():{x:p.x,y:p.y,z:p.z};
// Upper bounds per weapon so several visible wielders cannot flood the shared engine.
export const ROD_VFX=Object.freeze({
 idleCadence:.9,combatCadence:.6,contactCooldown:.2,transformCooldown:.29,drawCooldown:.5,
 sparks:{joined:96,dual:56,calm:8},spokes:{joined:3,dual:2},residual:{joined:1.2,dual:.8,step:.18},
});
export function createElectricalRodVfx(rod,vfx){
 let cooldown=0,contactCooldown=0,transformCooldown=0,drawCooldown=0,energy=0,previous=rod.progress,closed=false,visible=true,sequence=null;
 let combat=false,residual=0,residualClock=0,flicker=1;
 const handles=new Set(),idleLayers=new Set();
 const remember=h=>{if(!h)return;for(const old of handles)if(old.done||old.age>=old.life)handles.delete(old);
  // Retired or evicted handles may still be referenced. Keep a hard bound.
  if(handles.size>=32)handles.delete(handles.values().next().value);handles.add(h);};
 const enabled=()=>!closed&&visible&&vfx?.quality>0&&!vfx.reducedMotion;
 const rich=()=>enabled()&&!vfx.calmFlashes&&vfx.intensity!==.3;
 const full=()=>rich()&&vfx.quality>=2;
 const calm=()=>!enabled()||vfx.calmFlashes;
 const joined=()=>rod.progress>=.95;
 const at=(i,n)=>()=>!closed&&visible?rod.anchor(i,n):null;
 const pulse=k=>{if(!calm())rod.pulse?.(k);};
 function arc(i,a,j,b,{width=.012,life=.16,alpha=.58,branches=0,jag=.18}={}){
  if(!enabled())return;
  remember(vfx.lightning?.({from:at(i,a),to:at(j,b),color:C.ice,color2:C.blue,width,life,alpha,branches:full()?branches:0,jag,rate:calm()?.12:.055}));
 }
 function sparks(p,count,scale=1){
  if(!enabled()||!finite(p))return;
  vfx.burst?.({at:p,count:calm()?Math.min(count,ROD_VFX.sparks.calm):count,color:C.ice,color2:C.blue,cell:[2,13,8],shape:'sphere',radius:.07*scale,life:[.2,.55],size:[.024,.072*scale],sizeEnd:.012,speed:[.8,3.6*scale],stretch:2.2,gravity:-3,drag:2.1,alpha:.9});
 }
 // Brief light pulse: a real (pooled) flash light at the high tier; at the
 // standard tier, where the engine keeps no lights, a bright flare plus the
 // weapon's own emissive surge stands in for it.
 function lightPulse(p,{intensity=10,distance=3.4,life=.25,size=.8}={}){
  if(!rich()||!finite(p))return;
  if(full())remember(vfx.flash?.({at:clone(p),color:C.cyan,intensity,distance,life}));
  else vfx.burst?.({at:clone(p),count:1,exact:true,cell:CELL.flare,color:C.ice,color2:C.cyan,size,sizeEnd:size*.2,life:life*1.2,speed:0,alpha:.85});
 }
 // Radial discharge: short spokes thrown outward from a point (no damage, no area).
 function radial(p,n,length){
  if(!rich()||!finite(p)||n<=0)return;
  const o=clone(p),turn=Math.random()*Math.PI*2;
  for(let k=0;k<n;k++){
   const a=turn+k*Math.PI*2/n,lift=(Math.random()-.35)*.5;
   const x=o.x+Math.cos(a)*length,y=o.y+lift*length,z=o.z+Math.sin(a)*length;
   const end=o.clone?o.clone().set(x,y,z):{x,y,z};
   remember(vfx.lightning?.({from:()=>o,to:()=>end,color:C.ice,color2:C.violet,width:.032,life:.28,alpha:.92,branches:0,jag:.3,rate:.05}));
  }
 }
 function clearIdle(){for(const h of idleLayers)h.done=true;idleLayers.clear();}
 function idleCrackle(){
  // Sparse shared-engine arcs over the always-on local corona. Branches only in combat.
  for(let i=0;i<2;i++)arc(i,'Collar',i,'Tip',{life:.5,width:calm()?.012:combat?.028:.02,alpha:calm()?.28:.88,jag:.24,branches:combat?1:0});
  if(!rich()||typeof vfx.beam!=='function')return;
  // Use the same noisy soft-core shader as class abilities. The field is
  // anchored to actual emitter geometry, not a rotating hard-edged coil.
  // At most two current and two fading channels per equipped weapon.
  for(const h of idleLayers)if(h.done||h.age>=h.life)idleLayers.delete(h);
  if(idleLayers.size>2){for(const h of idleLayers){h.done=true;idleLayers.delete(h);if(idleLayers.size<=2)break;}}
  for(let i=0;i<2;i++){
   const channel=vfx.beam({from:at(i,'Collar'),to:at(i,'Tip'),color:C.blue,width:(full()?.25:.22)*(combat?1.12:1),jitter:.05,taper:.35,flow:combat?5:3.8,life:ROD_VFX.idleCadence+.25,hold:true,alpha:combat?.88:.8});
   if(channel){if(channel.mesh)channel.mesh.name='rod-idle:plasma-'+i;idleLayers.add(channel);remember(channel);}
   const tip=rod.anchor(i,'Emitter');
   if(finite(tip)){
    vfx.burst?.({at:tip,count:full()?8:6,cell:[CELL.glow,CELL.streak,CELL.ember],shape:'sphere',radius:.085,color:C.ice,color2:C.blue,size:[.055,.19],sizeEnd:.014,life:[.25,.55],speed:[.3,1.2],drag:2.6,turb:.44,turbScale:3.1,alpha:.78});
    vfx.burst?.({at:tip,count:1,cell:CELL.flare,color:C.ice,color2:C.cyan,size:full()?.26:.21,sizeEnd:.06,life:.26,speed:0,alpha:.66});
   }
  }
 }
 function emitters(count){for(let i=0;i<2;i++){const t=rod.anchor(i,'Emitter');if(finite(t))sparks(t,count,.8);}}
 function chargeSurge(){
  if(!enabled())return false;energy=Math.max(energy,.95);pulse(1);
  for(let i=0;i<2;i++)arc(i,'Collar',i,'Tip',{width:.04,life:.75,branches:2,alpha:.98});
  emitters(10);
  lightPulse(rod.anchor(0,'Emitter'),{intensity:joined()?9:6,distance:2.8,life:.22,size:joined()?.75:.55});
  residual=Math.max(residual,.6);
  return true;
 }
 function draw(){
  if(!enabled()||drawCooldown>0)return false;
  drawCooldown=ROD_VFX.drawCooldown;energy=Math.max(energy,.9);pulse(1);
  for(let i=0;i<2;i++)arc(i,'Collar',i,'Tip',{width:.036,life:.55,branches:1,alpha:.95});
  emitters(8);
  lightPulse(rod.anchor(0,'Mid'),{intensity:7,distance:2.6,life:.2,size:.6});
  residual=Math.max(residual,.5);
  return true;
 }
 function transformDischarge(){
  if(!enabled())return;
  energy=Math.max(energy,.9);pulse(.8);
  for(let i=0;i<2;i++)arc(i,'Collar',i,'Tip',{width:.036,life:.62,branches:2,alpha:.94});
  // Only bridge separated couplers; a coincident seam has no useful ribbon.
  if(rich()&&rod.anchor(0,'Coupler').distanceTo(rod.anchor(1,'Coupler'))>.045){
   arc(0,'Coupler',1,'Coupler',{width:.02,life:.26,branches:1,jag:.26});
   for(let i=0;i<2;i++)sparks(rod.anchor(i,'Coupler'),6,.7);
  }
 }
 function strikeWake(){
  if(!enabled())return;
  const layered=rich(),long=joined();energy=1;pulse(1);
  for(let i=0;i<2;i++){
   arc(i,'Collar',i,'Tip',{width:layered?(long?.06:.048):.022,life:layered?.7:.35,alpha:layered?1:.45,branches:layered?(long?2:1):0,jag:.3});
   if(layered)remember(vfx.trail?.({follow:at(i,'Tip'),length:.26,life:.5,fade:.3,width:long?.28:.18,color:C.ice,color2:C.blue,alpha:.95,style:0}));
  }
  // Joined only: a full-length discharge across the seam.
  if(layered&&long)arc(0,'Mid',1,'Mid',{width:.05,life:.6,alpha:.98,branches:1,jag:.24});
 }
 function contactDischarge(p,{ground=null,blocked=false}={}){
  if(!enabled()||!finite(p)||contactCooldown>0)return false;
  contactCooldown=ROD_VFX.contactCooldown;strikeWake();
  // Presentation inspection only: counts accepted visual discharges, never damage.
  rod.group.userData.rodContactCount=(rod.group.userData.rodContactCount??0)+1;
  const layered=rich(),long=joined(),scale=long?1.7:1.3;
  if(layered){
   const tips=[rod.anchor(0,'Tip'),rod.anchor(1,'Tip')].filter(finite);
   const tip=tips.sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y,a.z-p.z)-Math.hypot(b.x-p.x,b.y-p.y,b.z-p.z))[0];
   sequence?.cancel();
   sequence=playElectricalStrike(vfx,{from:tip,target:p,ground,joined:long,blocked,active:rich,remember});
   if(sequence)rod.group.userData.rodStrikeSequences=(rod.group.userData.rodStrikeSequences??0)+1;
  }
  sparks(clone(p),layered?(long?ROD_VFX.sparks.joined:ROD_VFX.sparks.dual):16,scale);
  if(layered){
   vfx.burst?.({at:clone(p),count:long?20:12,color:C.cyan,color2:C.deep,cell:[0,1],life:[.4,.8],size:[.16,.4],sizeEnd:.05,speed:[.1,.9],alpha:.94});
   if(!blocked&&finite(ground))remember(vfx.shock?.({at:clone(ground),radius:long?1.5:.85,color:C.cyan,life:.8,width:.085,alpha:.84,filaments:true}));
   radial(p,long?ROD_VFX.spokes.joined:ROD_VFX.spokes.dual,long?.95:.6);
   lightPulse(p,{intensity:long?22:14,distance:4.5,life:.3,size:long?1.3:.95});
   residual=Math.max(residual,long?ROD_VFX.residual.joined:ROD_VFX.residual.dual);
  }
  return true;
 }
 // After a discharge the weapon keeps crackling briefly: one small arc at a time.
 function residualCrackle(step){
  if(residual<=0)return;
  residual=Math.max(0,residual-step);residualClock-=step;
  if(residualClock>0||!rich())return;
  residualClock=ROD_VFX.residual.step;
  const i=Math.random()<.5?0:1;
  arc(i,'Mid',i,'Emitter',{width:.018,life:.22,alpha:.8,branches:0,jag:.34});
  const tip=rod.anchor(i,'Emitter');if(finite(tip))sparks(tip,3,.6);
 }
 function stop(){clearIdle();sequence?.cancel();sequence=null;for(const h of handles)h.done=true;handles.clear();energy=0;residual=0;}
 return {
  charge:chargeSurge,impact:contactDischarge,draw,
  update(dt,{energized=true,activity=0,combat:inCombat=false}={}){
   if(closed||!Number.isFinite(dt)||dt<0)return;
   const step=Math.min(dt,.1);
   combat=!!inCombat;
   cooldown=Math.max(0,cooldown-step);contactCooldown=Math.max(0,contactCooldown-step);transformCooldown=Math.max(0,transformCooldown-step);drawCooldown=Math.max(0,drawCooldown-step);
   const moving=Math.abs(rod.progress-previous)>1e-5,locked=previous<.995&&rod.progress>=.995,unlocked=previous>.005&&rod.progress<=.005;
   previous=rod.progress;
   visible=!!energized&&rod.group.visible;
   if(!enabled()){stop();rod.setEnergy?.(energized?0.30:0,energized?0.30:0);return;}
   if(!rich())clearIdle();
   energy=Math.max(0,energy-step*.8);
   if(moving&&transformCooldown===0){transformCooldown=ROD_VFX.transformCooldown;transformDischarge();}
   if(locked&&moving&&rich()){
    // Join complete: the most intense transform beat.
    const seam=rod.anchor(0,'Coupler');sparks(seam,22,1);pulse(1);
    radial(seam,2,.45);
    lightPulse(seam,{intensity:10,distance:2.6,life:.18,size:.7});
    residual=Math.max(residual,.7);
   }
   if(unlocked&&moving&&rich()){for(let i=0;i<2;i++)sparks(rod.anchor(i,'Coupler'),8,.7);pulse(.7);residual=Math.max(residual,.4);}
   if(!moving)residualCrackle(step);
   if(cooldown===0){cooldown=rich()?(combat?ROD_VFX.combatCadence:ROD_VFX.idleCadence):1.12;idleCrackle();}
   // Emissive floor: visible at rest, higher in combat, with a light flicker.
   if(!calm()&&Math.random()<step*14)flicker=.9+Math.random()*.16;
   const k=calm()?.28:rich()?1:.6, surge=Math.max(energy,clamp(activity)*.9)*k;
   const base=calm()?.23:(combat?.74:.64)*(calm()?1:flicker);
   rod.setEnergy?.(clamp(base+surge),clamp(base+surge*(joined()?1:.8)));
  },
  dispose(){if(closed)return;closed=true;visible=false;stop();}
 };
}
