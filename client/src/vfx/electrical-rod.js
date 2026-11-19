// Ability-grade electrical weapon presentation. All timings and budgets are
// visual only; contact is supplied by an existing confirmed combat event.
import {playElectricalStrike} from './electrical-strike.js';
const C={ice:0xcaf7ff,cyan:0x61d7ff,blue:0x2675ef,deep:0x344bcc};
const clamp=x=>Math.max(0,Math.min(1,Number.isFinite(x)?x:0));
const finite=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
const clone=p=>p.clone?p.clone():{x:p.x,y:p.y,z:p.z};
export function createElectricalRodVfx(rod,vfx){
 let cooldown=0,contactCooldown=0,transformCooldown=0,energy=0,previous=rod.progress,closed=false,visible=true,sequence=null;
 const handles=new Set();
 const remember=h=>{if(!h)return;for(const old of handles)if(old.done||old.age>=old.life)handles.delete(old);
  // Retired or evicted handles may still be referenced. Keep a hard bound.
  if(handles.size>=32)handles.delete(handles.values().next().value);handles.add(h);};
 const enabled=()=>!closed&&visible&&vfx?.quality>0&&!vfx.reducedMotion;
 const rich=()=>enabled()&&!vfx.calmFlashes&&vfx.intensity!==.3;
 const full=()=>rich()&&vfx.quality>=2;
 const calm=()=>!enabled()||vfx.calmFlashes;
 const joined=()=>rod.progress>=.95;
 const at=(i,n)=>()=>!closed&&visible?rod.anchor(i,n):null;
 function arc(i,a,j,b,{width=.012,life=.16,alpha=.58,branches=0,jag=.18}={}){
  if(!enabled())return;
  remember(vfx.lightning?.({from:at(i,a),to:at(j,b),color:C.ice,color2:C.blue,width,life,alpha,branches:full()?branches:0,jag,rate:calm()?.12:.065}));
 }
 function sparks(p,count,scale=1){
  if(!enabled()||!finite(p))return;
  vfx.burst?.({at:p,count:calm()?Math.min(count,8):count,color:C.ice,color2:C.blue,cell:[2,13,8],shape:'sphere',radius:.07*scale,life:[.16,.43],size:[.023,.068*scale],sizeEnd:.012,speed:[.65,3.1*scale],stretch:2,gravity:-3,drag:2.2,alpha:.85});
 }
 function idleCrackle(){
  for(let i=0;i<2;i++)arc(i,'Collar',i,'Tip',{life:.55,width:calm()?.012:.028,alpha:calm()?.28:.85,jag:.23,branches:1});
 }
 function chargeSurge(){
  if(!enabled())return false;energy=Math.max(energy,.9);
  for(let i=0;i<2;i++)arc(i,'Collar',i,'Tip',{width:.035,life:.7,branches:2,alpha:.95});
  return true;
 }
 function transformDischarge(){
  if(!enabled())return;
  energy=Math.max(energy,.9);
  for(let i=0;i<2;i++)arc(i,'Collar',i,'Tip',{width:.034,life:.6,branches:2,alpha:.9});
  // Only bridge separated couplers; a coincident seam has no useful ribbon.
  if(full()&&rod.anchor(0,'Coupler').distanceTo(rod.anchor(1,'Coupler'))>.045)
   arc(0,'Coupler',1,'Coupler',{width:.016,life:.2,branches:1,jag:.24});
 }
 function strikeWake(){
  if(!enabled())return;
  const layered=rich(),long=joined();energy=1;
  for(let i=0;i<2;i++){
   arc(i,'Collar',i,'Tip',{width:layered?(long?.06:.045):.02,life:layered?.85:.35,alpha:layered?1:.4,branches:layered?(long?2:1):0,jag:.28});
   if(layered){
    arc(i,'Mid',i,'Emitter',{width:.028,life:.65,alpha:.85,branches:1,jag:.32});
    remember(vfx.trail?.({follow:at(i,'Tip'),length:.22,life:.65,fade:.35,width:long?.24:.16,color:C.ice,color2:C.blue,alpha:.9,style:0}));
   }
  }
  if(layered&&long)arc(0,'Mid',1,'Mid',{width:.045,life:.75,alpha:.95,branches:2,jag:.24});
 }
 function contactDischarge(p,{ground=null,blocked=false}={}){
  if(!enabled()||!finite(p)||contactCooldown>0)return false;
  contactCooldown=.28;strikeWake();
  // Presentation inspection only: counts accepted visual discharges, never damage.
  rod.group.userData.rodContactCount=(rod.group.userData.rodContactCount??0)+1;
  const layered=rich(),long=joined(),scale=long?1.6:1.25;
  if(layered){
   const tips=[rod.anchor(0,'Tip'),rod.anchor(1,'Tip')].filter(finite);
   const tip=tips.sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y,a.z-p.z)-Math.hypot(b.x-p.x,b.y-p.y,b.z-p.z))[0];
   sequence?.cancel();
   sequence=playElectricalStrike(vfx,{from:tip,target:p,ground,joined:long,blocked,active:rich,remember});
   if(sequence)rod.group.userData.rodStrikeSequences=(rod.group.userData.rodStrikeSequences??0)+1;
  }
  sparks(clone(p),layered?(long?64:36):16,scale);
  if(layered){
   vfx.burst?.({at:clone(p),count:long?15:9,color:C.cyan,color2:C.deep,cell:[0,1],life:[.35,.65],size:[.15,.36],sizeEnd:.05,speed:[.1,.8],alpha:.92});
   if(!blocked&&finite(ground))remember(vfx.shock?.({at:clone(ground),radius:long?1.15:.65,color:C.cyan,life:.65,width:.075,alpha:.78,filaments:true}));
   if(full())remember(vfx.flash?.({at:clone(p),color:C.cyan,intensity:long?15:9,distance:3.4,life:.25}));
  }
  return true;
 }
 function stop(){sequence?.cancel();sequence=null;for(const h of handles)h.done=true;handles.clear();energy=0;}
 return {
  charge:chargeSurge,impact:contactDischarge,
  update(dt,{energized=true,activity=0}={}){
   if(closed||!Number.isFinite(dt)||dt<0)return;
   const step=Math.min(dt,.1);
   cooldown=Math.max(0,cooldown-step);contactCooldown=Math.max(0,contactCooldown-step);transformCooldown=Math.max(0,transformCooldown-step);
   const moving=Math.abs(rod.progress-previous)>1e-5,locked=previous<.995&&rod.progress>=.995;
   previous=rod.progress;
   visible=!!energized&&rod.group.visible;
   if(!enabled()){stop();rod.setEnergy?.(energized?0.30:0,energized?0.30:0);return;}
   energy=Math.max(0,energy-step*.80);
   if(moving&&transformCooldown===0){transformCooldown=.29;transformDischarge();}
   if(locked&&moving&&full()){
    const seam=rod.anchor(0,'Coupler');sparks(seam,14,.8);
    remember(vfx.flash?.({at:seam,color:C.cyan,intensity:6,distance:2.3,life:.15}));
   }
   if(cooldown===0){cooldown=rich()?.58:1.12;idleCrackle();}
   const k=calm()?.28:rich()?1:.6, surge=Math.max(energy,clamp(activity)*.85)*k;
   const base=calm()?.23:.58;
   rod.setEnergy?.(clamp(base+surge),clamp(base+surge*(joined()?1:.78)));
  },
  dispose(){if(closed)return;closed=true;visible=false;stop();}
 };
}
