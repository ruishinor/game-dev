// One equipment-bound, non-combat survey companion. All acquisition,
// commands, movement and marks are authoritative. No Mender code is replaced.
import { CLASSES, COMPANIONS, ENEMIES } from '../../shared/content.js';
import { STRIDER_LINK } from '../../shared/gadgets.js';
import { dist, inSanctum, hasLineOfSight, deepLineClear } from '../../shared/world.js';
import {addBuff,getBuff} from './combat.js';
import { groundSegmentClear, advanceGroundCompanion } from './ground-navigation.js';
import {striderLootTarget,recoverStriderLoot} from './loot.js';
const TYPE='survey_strider',def=COMPANIONS[TYPE],R=def.radius;
const SCAN_RANGE=8,SCAN_INTERVAL=8000,SCAN_MS=6000,OWNER_RANGE=22;
export function migrateSurveyStrider(char){
 if(char.cls!=='surveyor')return false;
 const owned=char.striderLearned===true||char.inventory.includes(STRIDER_LINK);if(!owned)return false;
 if(char.striderLearned!==true){
  if(!char.activeCompanion)char.companionDismissed=char.companionDismissed===true||char.equipped.device!==STRIDER_LINK;
  char.striderLearned=true;
 }
 char.inventory=char.inventory.filter(id=>id!==STRIDER_LINK);
 if(char.equipped.device===STRIDER_LINK)char.equipped={...char.equipped,device:null};
 return true;
}
export function wantsSurveyStrider(p){return p.cls==='surveyor'&&p.char.striderLearned===true;}
export function striderSpawnPoint(p){
 return pointNear(p,def.followDist,p.yaw+Math.PI);
}
function pointNear(ent,gap,angle,origin=ent){
 for(const offset of [0,Math.PI/4,-Math.PI/4,Math.PI/2,-Math.PI/2,3*Math.PI/4,-3*Math.PI/4,Math.PI]){
  const a=angle+offset,q={x:ent.x+Math.sin(a)*gap,z:ent.z+Math.cos(a)*gap};
  if(groundSegmentClear(q,q,R)&&deepLineClear(origin,q))return q;
 }
 return null;
}
function dismiss(game,p){
 const c=p.companion;if(c?.type!==TYPE)return;
 if(p.surveyKit?.mark?.source===c.id)p.surveyKit.mark=null;
 p.char.petName=c.name;p.char.petMode=c.mode;
 game.companions=game.companions.filter(x=>x!==c);game.ents.delete(c.id);p.companion=p.spindleCompanion??null;
 game.markDirty(p);
}
export function syncSurveyStrider(game,p,spotOverride){
 if(p.cls!=='surveyor')return;
 if(!wantsSurveyStrider(p)){dismiss(game,p);return;}
 if((p.companion&&p.companion.type!=='spindle')||p.dead||p.char.companionDismissed)return;
 const spot=spotOverride??striderSpawnPoint(p);if(!spot)return;
 const mode=p.char.petMode!=='recover'&&Object.hasOwn(def.modes,p.char.petMode)?p.char.petMode:'follow';
 const c={id:game.nextId++,kind:'companion',type:TYPE,name:p.char.petName&&p.char.petName!==COMPANIONS.mender.name?p.char.petName:def.name,owner:p.id,...spot,yaw:p.yaw,mode,host:0,act:'idle',actTarget:0,nextPulse:game.time+1000,nextRegen:0,metaVer:1,nav:{}};
 p.companion=c;p.char.petMode=mode;p.char.petName=c.name;
 game.companions.push(c);game.ents.set(c.id,c);game.markDirty(p);
}
export function beginStriderRecovery(game,p,c){
 const e=striderLootTarget(game,p,c);
 if(!e)return {ok:false,reason:'No eligible personal remains within 18 metres while disengaged.'};
 c.recoverId=e.id;c.recoverGeneration=e.lootGeneration;c.recoverUntil=game.time+12000;
 c.mode='recover';c.act='recovering';c.actTarget=e.id;c.nav={};p.char.petMode='follow';
 game.message(p,'info',c.name+' recovering personal remains.');return {ok:true};
}
function finishRecovery(game,p,c,reason){
 c.mode='follow';c.act='idle';c.actTarget=0;c.recoverId=0;c.recoverGeneration=0;c.recoverUntil=0;c.nav={};p.char.petMode='follow';
 game.message(p,'info',reason);
}
export function tickSurveyStrider(game,c,dt){
 const p=game.players.get(c.owner);if(!p||p.companion!==c)return;
 if(p.dead){c.act='dormant';c.actTarget=0;c.nav={};return;}
 if(dist(c,p)>def.leash&&c.mode==='stay'){c.mode='follow';p.char.petMode='follow';game.markDirty(p);}
 if(dist(c,p)>32){c.act='stranded';c.actTarget=0;return;}
 if(c.mode==='stay'){c.act='idle';c.actTarget=0;return;}
 const advance=goal=>goal&&advanceGroundCompanion(c,c.nav,goal,{now:game.time,dt,speed:def.speed,radius:R});
 if(c.mode==='recover'){
  const e=game.ents.get(c.recoverId);
  if(!e||e.state!=='dead'||e.lootGeneration!==c.recoverGeneration||!e.lootByPlayer?.get(p.id)?.length||p.autoOn||p.combatUntil>game.time||dist(p,e)>18||game.time>=c.recoverUntil||!deepLineClear(p,e))return finishRecovery(game,p,c,'Recovery interrupted or no eligible remains.');
  c.act='recovering';c.actTarget=e.id;
  if(dist(c,e)<=3.2&&hasLineOfSight(c,e)){
    const res=recoverStriderLoot(game,p,c,e.id,c.recoverGeneration);
    return finishRecovery(game,p,c,res.ok?'Personal salvage recovered.':res.reason);
  }
  const goal=pointNear(e,2.6,Math.atan2(c.x-e.x,c.z-e.z),e);if(goal)advance(goal);return;
 }
 if(c.mode==='screen'){
  const goal=pointNear(p,def.followDist,p.yaw+Math.PI);if(goal&&dist(c,goal)>.55)advance(goal);
  c.act=game.time<(c.screenUntil??0)?'screening':'idle';c.actTarget=c.act==='screening'?p.id:0;
  const old=getBuff(p,'shield');
  if(!inSanctum(p)&&p.combatUntil>game.time&&p.hp<p.maxHp*.5&&dist(c,p)<=5&&hasLineOfSight(c,p)&&deepLineClear(c,p)&&(!old||old.until<=game.time||old.v<=0)&&game.time>=Math.max(c.nextPulse,p.striderScreenReadyAt??0)){
   p.striderScreenReadyAt=game.time+24000;c.screenUntil=game.time+6000;c.act='screening';c.actTarget=p.id;
   addBuff(p,{k:'shield',v:20,cap:20,until:c.screenUntil,src:c.id});game.emitWorldEvent({e:'shield',s:c.id,d:p.id,a:20});game.message(p,'info',c.name+' projected an emergency screen.');
  }return;
 }
 const target=game.ents.get(p.target);
 const canScan=c.mode==='assist'&&!inSanctum(p)&&target?.kind==='enemy'&&!['dead','evade'].includes(target.state)&&dist(p,target)<=OWNER_RANGE&&(!ENEMIES[target.type].neutral||target.threat.has(p.id));
 if(!canScan){
  c.act='idle';c.actTarget=0;
  const goal=pointNear(p,def.followDist,p.yaw+Math.PI);if(goal&&dist(c,goal)>.55)advance(goal);return;
 }
 c.act='surveying';c.actTarget=target.id;
 const gap=dist(c,target)-target.radius;
 if(gap>SCAN_RANGE||!hasLineOfSight(c,target)||!deepLineClear(c,target)){
  const goal=pointNear(target,target.radius+4,Math.atan2(c.x-target.x,c.z-target.z),target);if(goal)advance(goal);return;
 }
 c.yaw=Math.atan2(target.x-c.x,target.z-c.z);
 if(dist(c,p)>def.leash||!p.surveyKit||p.surveyKit.mark?.until>game.time||game.time<Math.max(c.nextPulse,p.striderReadyAt??0))return;
 p.striderReadyAt=game.time+SCAN_INTERVAL;
 p.surveyKit.mark={id:target.id,until:game.time+SCAN_MS,source:c.id};
 const before=p.res;p.res=Math.min(CLASSES[p.cls].resource.max,p.res+15);
 if(p.res>before)game.message(p,'info',c.name+' transferred '+(p.res-before)+' Power Cells.');
 game.emitWorldEvent({e:'cast',s:c.id,d:target.id,ab:'fault_scan'});
 game.message(p,'info',c.name+' analyzed '+target.name+'.');
}
