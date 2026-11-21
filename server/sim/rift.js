// World-owned anomaly lifecycle. Only its current phase and warning are
// replicated. Timings, damage and transition validation stay server-side.
import { RIFT_LEVEL } from './enemy-levels.js';
import { RIFT_SITE,dist,hasLineOfSight } from '../../shared/world.js';
import { dealDamage } from './combat.js';
import {sanitizeRiftCalibration} from './rift-journal.js';
import {recordFieldReceipt} from './field-receipts.js';
const OPEN_MS=4000,ACTIVE_MS=22000,WARN_MS=2300,REST_MS=4600,STABLE_MS=15000,COOL_MS=28000;
const deny=reason=>({ok:false,reason});const ok={ok:true};
export function createRift(game){
 const core=game.objects.find(o=>o.type==='phase_scar'),indexer=game.objects.find(o=>o.type==='rift_indexer'),regulator=game.objects.find(o=>o.type==='rift_regulator');
 const entry=core,exit=game.objects.find(o=>o.type==='rift_return');
 return RIFT_SITE&&core&&indexer&&regulator?{core,indexer,regulator,entry,exit,phase:'dormant',until:0,pulseAt:0,nextWarn:0,pulses:0}:null;
}
function effect(game,k,r){const s=game.rift.core;game.emitWorldEvent({e:'fx',k,s:s.id,x:s.x,z:s.z,r});}
function setPhase(game,phase,until){
 const f=game.rift;f.phase=phase;f.until=until;f.pulseAt=0;f.nextWarn=0;
}
export function riftRow(game,obj){
 const f=game.rift;if(!f||![f.core,f.indexer,f.regulator].includes(obj))return {};
 return {rf:f.phase,rw:f.pulseAt?Math.max(0,Math.round(f.pulseAt-game.time)):0};
}
export function interactRift(game,p,obj,{grantSalvage}={}){
 const f=game.rift;if(!f||![f.core,f.indexer,f.regulator].includes(obj))return deny('The instrument is unavailable.');
 if(p.dead||dist(p,obj)>5||!hasLineOfSight(p,obj))return deny('Approach the instrument along clear ground.');
 if(obj===f.core){
  const state=sanitizeRiftCalibration(p.char.riftCalibration);
  if(state==='recorded'){
   if(!p.char.attunements.includes('resonance')||p.char.level<RIFT_LEVEL)return deny(`Calibration recovery requires level ${RIFT_LEVEL} and Resonance.`);
   if(f.phase==='opening'||f.phase==='unstable')return deny('Wait for a safe phase before recovering your sample.');
   if(game.time<p.combatUntil||p.autoOn)return deny('Disengage before recovering your sample.');
   // Synchronous grant and completion enter the same persisted record. If
   // the stack is full, or the grant is refused, retain the recorded stage.
   p.char.riftCalibration='completed';
   if(!grantSalvage?.(game,p,'resonance_fragment',1)){
    p.char.riftCalibration='recorded';return deny('Unable to recover sample. Clear room in your material storage.');
   }
   recordFieldReceipt(p.char,'calibration',true);game.markDirty(p);
   game.message(p,'gain','Phase Scar calibration complete. Resonance sample recovered.');return ok;
  }
  if(state==='completed')return game.travelRift(p,obj);
  game.message(p,'info','Phase Scar: '+f.phase+'. Stabilize the field at the regulator to record a calibration. Withdraw from marked ground.');return ok;
 }
 if(!p.char.attunements.includes('resonance'))return deny('Requires Resonance attunement.');
 if(!(p.char.level>=RIFT_LEVEL))return deny(`The field instruments require level ${RIFT_LEVEL}.`);
 if(obj===f.indexer){
  if(f.phase!=='dormant')return deny('The phase cycle is already running or cooling.');
  if(game.time<p.combatUntil)return deny('Disengage before energizing the indexer.');
  f.pulses=0;setPhase(game,'opening',game.time+OPEN_MS);
  if(!sanitizeRiftCalibration(p.char.riftCalibration)){
   p.char.riftCalibration='started';game.markDirty(p);
  }
  game.message(p,'info','Indexer energized. The field will open. After the first release, use the opposite regulator between pulses — avoid the marked ground.');
  effect(game,'rift_open',2.45);return ok;
 }
 if(f.phase!=='unstable')return deny('Wait for the field to open.');
 if(!f.pulses||f.pulseAt)return deny('The regulator accepts the counterphase only between releases.');
 // Stabilization is permitted during the anomaly's own combat linger, but
 // the player must physically reach the regulator and cannot cancel a warning.
 setPhase(game,'stabilized',game.time+STABLE_MS);effect(game,'rift_stabilize',RIFT_SITE.hazard);
 const state=sanitizeRiftCalibration(p.char.riftCalibration);
 if(state!=='recorded'&&state!=='completed'){
  p.char.riftCalibration='recorded';game.markDirty(p);
  game.message(p,'info','Calibration recorded. Recover your resonance sample from the core during a safe phase.');
 }
 game.message(p,'info','Counterphase held. The field is stable and will enter cooldown.');return ok;
}
export function tickRift(game){
 const f=game.rift;if(!f)return;const now=game.time,core=f.core;
 if(f.phase==='opening'&&now>=f.until){setPhase(game,'unstable',now+ACTIVE_MS);f.nextWarn=now;effect(game,'rift_open',RIFT_SITE.hazard);}
 if(f.phase==='unstable'){
  if(f.pulseAt&&now>=f.pulseAt){
   f.pulseAt=0;f.pulses++;f.nextWarn=now+REST_MS;
   effect(game,'rift_pulse',RIFT_SITE.hazard);
   for(const p of game.players.values())if(!p.dead&&dist(p,core)<=RIFT_SITE.hazard)dealDamage(game,core,p,24,'rift_pulse',{flat:true,origin:core});
  }
  if(!f.pulseAt&&now>=f.until){setPhase(game,'cooling',now+COOL_MS);effect(game,'rift_collapse',2.45);}
  else if(!f.pulseAt&&now>=f.nextWarn&&now+WARN_MS<=f.until){
   f.pulseAt=now+WARN_MS;
   game.emitWorldEvent({e:'tele',id:core.id,k:'rift_pulse',n:'Phase discharge',x:core.x,z:core.z,r:RIFT_SITE.hazard,ms:WARN_MS,g:1});
  }
 }else if(f.phase==='stabilized'&&now>=f.until){setPhase(game,'cooling',now+COOL_MS);effect(game,'rift_collapse',2.45);}
 else if(f.phase==='cooling'&&now>=f.until)setPhase(game,'dormant',0);
}
