// Bounded server-side wildlife encounters. No player threat, loot, XP,
// progression or persistent state is owned by this module.
import {dist,ZONES,resolveCollisions,sinterSiteAt,hasLineOfSight} from '../../shared/world.js';
const center=ZONES.sinter;
const local=e=>dist(e,center)<center.r-.8;
const free=e=>e&&e.state==='idle'&&e.threat.size===0&&local(e);
const rooted=e=>e.buffs.some(b=>b.k==='root');
const turn=(e,t)=>{if(dist(e,t)>.001)e.yaw=Math.atan2(t.x-e.x,t.z-e.z);};
function move(e,t,speed,dt){
 if(rooted(e))return;
 const d=dist(e,t);if(d<.001)return;
 const step=Math.min(d,speed*dt);
 const p=resolveCollisions({x:e.x+(t.x-e.x)/d*step,z:e.z+(t.z-e.z)/d*step},e.radius);
 if(local(p)){turn(e,p);e.x=p.x;e.z=p.z;}
}
function away(a,b,len){
 const d=dist(a,b),x=d>.001?(a.x-b.x)/d:Math.sin(a.yaw||0),z=d>.001?(a.z-b.z)/d:Math.cos(a.yaw||0);
 return {x:a.x+x*len,z:a.z+z*len};
}
export function resetWildlife(e,time){
 e.wildPrey=0;e.wildPhase=null;e.wildPhaseUntil=0;e.wildEnds=0;
 e.huntReadyAt=time+12000;e.wildWound=0;e.wildHealAt=0;
}
export function cancelWildHunt(game,e){
 if(!e.wildPhase)return;
 e.wildPrey=0;e.wildPhase=null;e.wildPhaseUntil=0;e.wildEnds=0;
 e.huntReadyAt=game.time+22000;
}
function phase(game,e,mode,ms){
 e.wildPhase=mode;e.wildPhaseUntil=game.time+ms;e.ecologyMode=mode;
}
function withdraw(game,e,prey){
 e.wildPrey=0;e.wildEscape=away(e,prey,4.2);
 phase(game,e,'withdraw',2100);e.wildEnds=game.time+2100;
}
export function tickWildPredator(game,e,dt){
 if(e.type!=='faultstalker')return false;
 if(!free(e)){cancelWildHunt(game,e);return false;}
 if(e.wildPhase==='withdraw'){
  if(game.time>=e.wildEnds){cancelWildHunt(game,e);return false;}
  e.ecologyMode='withdraw';move(e,e.wildEscape,3.1,dt);return true;
 }
 let prey=game.enemies.find(o=>o.id===e.wildPrey);
 if(!e.wildPhase){
  if(game.time<e.huntReadyAt)return false;
  const priority=o=>o.form==='juvenile'?0:o.form==='adult'?1:2;
  prey=game.enemies.filter(o=>o.form&&free(o)&&o.hp>o.maxHp*.6&&dist(e,o)<=6)
   .sort((a,b)=>priority(a)-priority(b)||dist(e,a)-dist(e,b)||a.id-b.id)[0];
  if(!prey)return false;
  e.wildPrey=prey.id;e.wildEnds=game.time+7600;phase(game,e,'crouch',850);
 }
 if(!free(prey)||dist(e,prey)>9||game.time>=e.wildEnds){cancelWildHunt(game,e);return false;}
 e.ecologyMode=e.wildPhase;turn(e,prey);
 const d=dist(e,prey);
 // The guard must be between prey and predator and actually nearby.
 const guard=game.enemies.find(o=>{
  if(o.form!=='shieldback'||o===prey||!free(o)||dist(o,prey)>=3.3||dist(o,e)>=2.5||d<.001)return false;
  const dx=(prey.x-e.x)/d,dz=(prey.z-e.z)/d;
  const ox=o.x-e.x,oz=o.z-e.z,along=ox*dx+oz*dz;
  return along>0&&along<d&&Math.abs(ox*dz-oz*dx)<1.2;
 });
 if(guard&&(e.wildPhase==='circle'||e.wildPhase==='lunge')){
  guard.ecologyMode='brace';game.emitWorldEvent({e:'fx',k:'sinter_repel',s:guard.id,d:e.id});withdraw(game,e,prey);return true;
 }
 if(e.wildPhase==='crouch'){
  if(game.time>=e.wildPhaseUntil)phase(game,e,'circle',1050);
  return true;
 }
 if(e.wildPhase==='circle'){
  const dx=(prey.x-e.x)/(d||1),dz=(prey.z-e.z)/(d||1);
  move(e,{x:prey.x-dx*2.5-dz*2,z:prey.z-dz*2.5+dx*2},2,dt);turn(e,prey);
  if(game.time>=e.wildPhaseUntil){phase(game,e,'lunge',1850);game.emitWorldEvent({e:'fx',k:'sinter_pounce',s:e.id,d:prey.id});}
  return true;
 }
 if(e.wildPhase==='lunge'){
  if(game.time>=e.wildPhaseUntil){withdraw(game,e,prey);return true;}
  move(e,prey,6.1,dt);turn(e,prey);
  if(dist(e,prey)<=e.radius+prey.radius+.26&&!rooted(e)&&hasLineOfSight(e,prey)){
   // Nonlethal actual grazer HP damage; no player kill/credit path.
   const amount=Math.min(18,Math.max(0,prey.hp-Math.ceil(prey.maxHp*.35)));
   if(amount>0){
    prey.hp-=amount;prey.wildWound+=amount;prey.wildHealAt=game.time+6000;prey.scarred=true;
    game.emitWorldEvent({e:'dmg',s:e.id,d:prey.id,a:amount,ab:'wild_bite',k:'melee'});
   }
   withdraw(game,e,prey);
  }
  return true;
 }
 cancelWildHunt(game,e);return false;
}
export function tickWildHerd(game,e,dt){
 if(!e.form||!free(e))return false;
 if(e.wildWound>0&&game.time>=e.wildHealAt){
  const n=Math.min(e.wildWound,Math.max(0,e.maxHp-e.hp),dt*(sinterSiteAt(e)==='nursery'?6:4));e.hp+=n;e.wildWound-=n;
  // Normalize only numerical residue on completion; do not heal unrelated damage.
  if(e.wildWound<=1e-8||e.maxHp-e.hp<=1e-8){
   e.wildWound=0;
   if(e.maxHp-e.hp<=1e-8)e.hp=e.maxHp;
  }
 }
 const predator=game.enemies.find(o=>o.type==='faultstalker'&&free(o)&&o.wildPrey&&o.wildPhase!=='withdraw');
 const prey=predator&&game.enemies.find(o=>o.id===predator.wildPrey);
 if(!predator||!free(prey)||dist(e,prey)>6.5)return false;
 if(e===prey){
  if(e.form==='shieldback'){e.ecologyMode='brace';turn(e,predator);}
  else{e.ecologyMode='scatter';move(e,away(e,predator,3),e.form==='juvenile'?3:2.5,dt);}
  return true;
 }
 const d=dist(prey,predator);if(d<.001)return false;
 const dx=(predator.x-prey.x)/d,dz=(predator.z-prey.z)/d;
 const tx=prey.x+dx*(e.form==='shieldback'?1.65:-.9)-dz*(e.form==='shieldback'?0:1.65);
 const tz=prey.z+dz*(e.form==='shieldback'?1.65:-.9)+dx*(e.form==='shieldback'?0:1.65);
 e.ecologyMode=e.form==='shieldback'?'brace':'regroup';
 if(dist(e,{x:tx,z:tz})>.45)move(e,{x:tx,z:tz},e.form==='shieldback'?2.7:2.5,dt);
 turn(e,predator);
 return true;
}
