// One equipment-bound, non-combat survey companion. All acquisition,
// commands, movement and marks are authoritative. No Mender code is replaced.
import { COMPANIONS, ENEMIES } from '../../shared/content.js';
import { STRIDER_LINK } from '../../shared/gadgets.js';
import { dist, inSanctum, hasLineOfSight, deepLineClear } from '../../shared/world.js';
import { groundSegmentClear, advanceGroundCompanion } from './ground-navigation.js';
const TYPE='survey_strider',def=COMPANIONS[TYPE],R=def.radius;
const SCAN_RANGE=8,SCAN_INTERVAL=8000,SCAN_MS=6000,OWNER_RANGE=22;
export function wantsSurveyStrider(p){
 return p.cls==='surveyor'&&p.char.equipped.device===STRIDER_LINK&&p.char.inventory.includes(STRIDER_LINK)&&p.char.attunements.includes('resonance')&&p.stats.skills.instrumentation>=13;
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
 game.companions=game.companions.filter(x=>x!==c);game.ents.delete(c.id);p.companion=null;
 game.markDirty(p);
}
export function syncSurveyStrider(game,p){
 if(p.cls!=='surveyor')return;
 if(!wantsSurveyStrider(p)){dismiss(game,p);return;}
 if(p.companion||p.dead)return;
 p.striderDeployAt=game.time+1000;
 const spot=pointNear(p,def.followDist,p.yaw+Math.PI);if(!spot)return;
 const mode=Object.hasOwn(def.modes,p.char.petMode)?p.char.petMode:'follow';
 const c={id:game.nextId++,kind:'companion',type:TYPE,name:p.char.petName&&p.char.petName!==COMPANIONS.mender.name?p.char.petName:def.name,owner:p.id,...spot,yaw:p.yaw,mode,host:0,act:'idle',actTarget:0,nextPulse:game.time+1000,nextRegen:0,metaVer:1,nav:{}};
 p.companion=c;p.char.petMode=mode;p.char.petName=c.name;
 game.companions.push(c);game.ents.set(c.id,c);game.markDirty(p);
}
export function redeploySurveyStrider(game,p){
 dismiss(game,p);p.char.petMode='follow';syncSurveyStrider(game,p);
}
export function tickSurveyStrider(game,c,dt){
 const p=game.players.get(c.owner);if(!p||p.companion!==c)return;
 if(p.dead){c.act='dormant';c.actTarget=0;c.nav={};return;}
 if(dist(c,p)>def.leash&&c.mode==='stay'){c.mode='follow';p.char.petMode='follow';game.markDirty(p);}
 if(dist(c,p)>32){c.act='stranded';c.actTarget=0;return;}
 if(c.mode==='stay'){c.act='idle';c.actTarget=0;return;}
 const advance=goal=>goal&&advanceGroundCompanion(c,c.nav,goal,{now:game.time,dt,speed:def.speed,radius:R});
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
 game.events.push({e:'cast',s:c.id,d:target.id,ab:'fault_scan'});
 game.message(p,'info',c.name+' analyzed '+target.name+'.');
}
