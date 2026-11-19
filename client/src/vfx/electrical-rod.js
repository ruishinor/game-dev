// Ability-grade electrical weapon presentation. All timings and budgets are
// visual only; contact is supplied by an existing confirmed combat event.
const C={ice:0xcaf7ff,cyan:0x61d7ff,blue:0x2675ef,deep:0x344bcc};
const clamp=x=>Math.max(0,Math.min(1,Number.isFinite(x)?x:0));
const finite=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
const clone=p=>p.clone?p.clone():{x:p.x,y:p.y,z:p.z};
export function createElectricalRodVfx(rod,vfx){
 let cooldown=0,contactCooldown=0,transformCooldown=0,energy=0,previous=rod.progress,closed=false,visible=true;
 const handles=new Set();
 const remember=h=>{if(!h)return;for(const old of handles)if(old.done||old.age>=old.life)handles.delete(old);
  // Retired or evicted handles may still be referenced. Keep a hard bound.
  if(handles.size>=32)handles.delete(handles.values().next().value);handles.add(h);};
 const enabled=()=>!closed&&visible&&vfx?.quality>0&&!vfx.reducedMotion;
 const rich=()=>enabled()&&vfx.quality>=2&&!vfx.calmFlashes&&vfx.intensity!==.3;
 const calm=()=>!enabled()||vfx.calmFlashes;
 const joined=()=>rod.progress>=.95;
 const at=(i,n)=>()=>!closed&&visible?rod.anchor(i,n):null;
 function arc(i,a,j,b,{width=.012,life=.16,alpha=.58,branches=0,jag=.18}={}){
  if(!enabled())return;
  remember(vfx.lightning?.({from:at(i,a),to:at(j,b),color:C.ice,color2:C.blue,width,life,alpha,branches:rich()?branches:0,jag,rate:calm()?.12:.065}));
 }
 function sparks(p,count,scale=1){
  if(!enabled()||!finite(p))return;
  vfx.burst?.({at:p,count:calm()?Math.min(count,8):count,color:C.ice,color2:C.blue,cell:[2,13,8],shape:'sphere',radius:.07*scale,life:[.16,.43],size:[.023,.068*scale],sizeEnd:.012,speed:[.65,3.1*scale],stretch:2,gravity:-3,drag:2.2,alpha:.85});
 }
 function idleCrackle(){
  for(let i=0;i<2;i++)arc(i,'Channel',i,'Tip',{life:.15,width:.007,alpha:calm()?.17:.29,jag:.12});
 }
 function chargeSurge(){
  if(!enabled())return false;energy=Math.max(energy,.63);
  for(let i=0;i<2;i++)arc(i,'Collar',i,'Tip',{width:.013,life:.24,branches:1,alpha:.7});
  return true;
 }
 function transformDischarge(){
  if(!enabled())return;
  energy=Math.max(energy,.7);
  for(let i=0;i<2;i++)arc(i,'Collar',i,'Tip',{width:.013,life:.22,branches:1});
  // Only bridge separated couplers; a coincident seam has no useful ribbon.
  if(rich()&&rod.anchor(0,'Coupler').distanceTo(rod.anchor(1,'Coupler'))>.045)
   arc(0,'Coupler',1,'Coupler',{width:.016,life:.2,branches:1,jag:.24});
 }
 function strikeWake(){
  if(!enabled())return;
  const full=rich(),long=joined();energy=1;
  for(let i=0;i<2;i++){
   arc(i,'Collar',i,'Tip',{width:long?.025:.019,life:.30,alpha:.85,branches:full?(long?2:1):0,jag:.20});
   if(full){
    arc(i,'Mid',i,'Emitter',{width:.012,life:.20,alpha:.62,branches:1,jag:.28});
    remember(vfx.trail?.({follow:at(i,'Tip'),length:.145,life:.26,fade:.16,width:long?.085:.055,color:C.ice,color2:C.blue,alpha:.72,style:0}));
   }
  }
  if(full&&long)arc(0,'Mid',1,'Mid',{width:.019,life:.28,alpha:.67,branches:2,jag:.13});
 }
 function contactDischarge(p,{ground=null,blocked=false}={}){
  if(!enabled()||!finite(p)||contactCooldown>0)return false;
  contactCooldown=.28;strikeWake();
  const full=rich(),long=joined(),scale=long?1.2:1;
  sparks(clone(p),full?(long?64:36):16,scale);
  if(full){
   vfx.burst?.({at:clone(p),count:long?11:7,color:C.cyan,color2:C.deep,cell:[0,1],life:[.16,.28],size:[.10,.22],sizeEnd:.04,speed:[.1,.8],alpha:.66});
   if(!blocked&&finite(ground))remember(vfx.shock?.({at:clone(ground),radius:long?1.15:.65,color:C.cyan,life:.38,width:.045,alpha:.48,filaments:true}));
   remember(vfx.flash?.({at:clone(p),color:C.cyan,intensity:long?12:7,distance:3.4,life:.18}));
  }
  return true;
 }
 function stop(){for(const h of handles)h.done=true;handles.clear();energy=0;}
 return {
  charge:chargeSurge,impact:contactDischarge,
  update(dt,{energized=true,activity=0}={}){
   if(closed||!Number.isFinite(dt)||dt<0)return;
   const step=Math.min(dt,.1);
   cooldown=Math.max(0,cooldown-step);contactCooldown=Math.max(0,contactCooldown-step);transformCooldown=Math.max(0,transformCooldown-step);
   const moving=Math.abs(rod.progress-previous)>1e-5,locked=previous<.995&&rod.progress>=.995;
   previous=rod.progress;
   visible=!!energized&&rod.group.visible;
   if(!enabled()){stop();rod.setEnergy?.(energized?0.18:0,energized?0.18:0);return;}
   energy=Math.max(0,energy-step*1.65);
   if(moving&&transformCooldown===0){transformCooldown=.29;transformDischarge();}
   if(locked&&moving&&rich()){
    const seam=rod.anchor(0,'Coupler');sparks(seam,14,.8);
    remember(vfx.flash?.({at:seam,color:C.cyan,intensity:6,distance:2.3,life:.15}));
   }
   if(cooldown===0){cooldown=rich()?.83:1.12;idleCrackle();}
   const k=calm()?.28:rich()?1:.6, surge=Math.max(energy,clamp(activity)*.55)*k;
   rod.setEnergy?.(clamp(.16+surge),clamp(.16+surge*(joined()?1:.78)));
  },
  dispose(){if(closed)return;closed=true;visible=false;stop();}
 };
}
