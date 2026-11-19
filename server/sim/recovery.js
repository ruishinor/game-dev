// Server authority for non-lethal collection. Per-character cooldown persists
// through disconnects/restarts; neither the client nor other players can set it.
import {dist,hasLineOfSight} from '../../shared/world.js';
import {MATERIAL_CAP,sanitizeMaterials} from '../../shared/crafting.js';
import {RECOVERY_MASTERY,recoverySamples,recoveryRank} from '../../shared/recovery.js';
const RECOVERY_DELAY=45000;
const deny=reason=>({ok:false,reason});
export function sanitizeRecoveryReadyAt(value,now=Date.now()){
 return Number.isSafeInteger(value)&&value>now?Math.min(value,now+RECOVERY_DELAY):0;
}
export function recoveryRemaining(char,now=Date.now()){
 return Math.max(0,sanitizeRecoveryReadyAt(char.recoveryReadyAt,now)-now);
}
export function recoverField(game,p,obj){
 if(!p||game.players.get(p.id)!==p||!obj||obj.type!=='sinter_recovery'||game.ents.get(obj.id)!==obj)return deny('No recovery site is available.');
 if(p.dead||game.time<p.combatUntil)return deny('Withdraw from combat before collecting a loose sample.');
 if(dist(p,obj)>5||!hasLineOfSight(p,obj))return deny('Approach the loose deposit along clear ground.');
 const now=game.wallNow(),remaining=recoveryRemaining(p.char,now);
 if(remaining>0)return deny('Allow the mineral bed to replenish before collecting again.');
 const materials=sanitizeMaterials(p.char.materials),count=materials.sinter_flake||0;
 if(count>=MATERIAL_CAP)return deny('Loose sinter flake storage is full.');
 const previous=recoverySamples(p.char.recoverySamples),next=Math.min(RECOVERY_MASTERY,previous+1);
 p.char.materials={...materials,sinter_flake:count+1};
 p.char.recoverySamples=next;p.char.recoveryReadyAt=now+RECOVERY_DELAY;
 game.markDirty(p);
 game.message(p,'gain','Recovered: Loose sinter flake.');
 if(recoveryRank(next)>recoveryRank(previous))game.message(p,'gain','Field Recovery rank 2: maintenance cassette reconditioning available at the Workshop.');
 game.emitWorldEvent({e:'fx',k:'field_recovery',s:p.id,o:obj.id});
 return {ok:true};
}
