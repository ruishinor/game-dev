// Server-authoritative deliberate melee. The browser sends only an action
// name; target, timing, range, outcomes and counter windows are server-owned.
// It does not change the legacy auto-attack path, which remains an option.
import {activeWeaponSlot} from '../../shared/weapons.js';
import {effectiveAuto} from '../../shared/condition.js';
import {dist,hasLineOfSight,inSafeZone,sameTravelRegion} from '../../shared/world.js';

const LIGHT=Object.freeze({windup:220,recovery:690,reach:2.85});
const HEAVY=Object.freeze({windup:440,recovery:1230,reach:3.05});
const GUARD=Object.freeze({active:640,recovery:990,damageMul:.48,counterWindow:1150});
const COMBO_WINDOW=1650;
const deny=reason=>({ok:false,reason});
const state=p=>(p.meleeState??={next:0,pending:null,combo:0,lastHit:-Infinity,guardUntil:0,counterUntil:0});
const eligible=(p,t,reach)=>t?.kind==='enemy'&&t.state!=='dead'&&t.state!=='evade'&&sameTravelRegion(p,t)&&
 dist(p,t)-t.radius<=reach&&hasLineOfSight(p,t);
const facing=(p,t)=>{
 const dx=t.x-p.x,dz=t.z-p.z,length=Math.hypot(dx,dz);
 return length<.001||(Math.sin(p.yaw)*dx+Math.cos(p.yaw)*dz)/length>=-.12;
};

/** Accepted action starts; the contact phase is resolved later by tickMelee. */
export function requestMelee(game,p,action){
 if(!['light','heavy','guard'].includes(action))return deny('Unknown melee action.');
 if(p.dead||p.sitting||inSafeZone(p))return deny('Cannot fight in this state.');
 if(activeWeaponSlot(p.char)!=='weapon')return deny('Select your melee weapon first.');
 const s=state(p),now=game.time;
 if(s.pending||now<s.next||now<p.gcdUntil)return deny('Recover from the previous action first.');
 if(action==='guard'){
  s.guardUntil=now+GUARD.active;
  s.next=now+GUARD.recovery;
  p.nextAuto=Math.max(p.nextAuto,s.next);
  p.autoOn=false;
  game.emitWorldEvent({e:'melee_guard',s:p.id,ms:GUARD.active});
  return {ok:true};
 }
 const target=game.ents.get(p.target),profile=effectiveAuto(p.char);
 if(!profile||profile.kind!=='melee'||!eligible(p,target,(action==='heavy'?HEAVY:LIGHT).reach))
  return deny('Select a reachable hostile target.');
 if(!facing(p,target))return deny('Face your target.');
 const stage=action==='heavy'?0:(now-s.lastHit<=COMBO_WINDOW?s.combo%3:0);
 const counter=now<s.counterUntil;
 const spec=action==='heavy'?HEAVY:LIGHT;
 // Later combo strikes have longer committed motion; the client receives
 // only the resulting contact time, never authority over it.
 const windup=spec.windup+(action==='light'?stage*70:0);
 const recovery=spec.recovery+(action==='light'?stage*80:0);
 const style=counter?'counter':action==='heavy'?'heavy':String(stage+1);
 s.pending={targetId:target.id,kind:action,stage,style,counter,hitAt:now+windup};
 s.next=now+recovery;
 s.guardUntil=0;
 s.counterUntil=0;
 p.autoOn=false;
 p.nextAuto=Math.max(p.nextAuto,s.next);
 p.gcdUntil=Math.max(p.gcdUntil,now+(action==='heavy'?480:280));
 game.emitWorldEvent({e:'melee_start',s:p.id,d:target.id,style,ms:windup,mode:p.char.electricalRodMode==='dual'?'dual':'rod'});
 return {ok:true};
}

/** Resolve exactly once, at the weapon's contact phase. */
export function tickMelee(game,p,damage,gainCharge){
 const s=p.meleeState,pending=s?.pending;
 if(!pending||game.time<pending.hitAt)return;
 s.pending=null;
 if(p.dead||p.sitting||activeWeaponSlot(p.char)!=='weapon')return;
 const target=game.ents.get(pending.targetId);
 const spec=pending.kind==='heavy'?HEAVY:LIGHT;
 if(!eligible(p,target,spec.reach)||!facing(p,target)){
  s.combo=0;s.lastHit=-Infinity;
  game.emitWorldEvent({e:'melee_miss',s:p.id,d:pending.targetId,style:pending.style});
  return;
 }
 const profile=effectiveAuto(p.char);
 if(!profile||profile.kind!=='melee')return;
 const base=profile.dmg;
 const mult=pending.kind==='heavy'?1.7:[.87,1.0,1.19][pending.stage];
 const hit=damage(game,p,target,base*mult*(pending.counter?1.35:1),
  pending.kind==='heavy'?'melee_heavy':'melee_light',{kind:'melee',melee:true,variant:pending.style});
 if(hit>0){
  s.combo=pending.kind==='heavy'?0:(pending.stage+1)%3;
  s.lastHit=game.time;
  gainCharge?.(4*profile.interval/800);
 }else{s.combo=0;s.lastHit=-Infinity;}
}

/** Only correctly oriented, deliberate blocks reduce enemy melee; no ranged immunity. */
export function mitigateMelee(game,src,dst,damage,opts){
 if(!opts.melee||src?.kind!=='enemy'||dst?.kind!=='player')return damage;
 const s=dst.meleeState;
 if(!s||game.time>=s.guardUntil||!facing(dst,src))return damage;
 s.guardUntil=0;
 s.counterUntil=game.time+GUARD.counterWindow;
 game.emitWorldEvent({e:'melee_deflect',s:dst.id,d:src.id});
 return damage*GUARD.damageMul;
}
