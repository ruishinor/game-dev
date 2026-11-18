// Server-only definitions and transitions. The browser receives a discovered
// quest projection, not the future branches, reward mapping or eligibility rules.
import {surveyState,brineStage} from '../../shared/survey.js';
import {dist,hasLineOfSight} from '../../shared/world.js';
import {MATERIALS,MATERIAL_CAP,sanitizeMaterials} from '../../shared/crafting.js';
const states=new Set(['briefed','strata_first','recorder_first','strata_ready','recorder_ready','strata_done','recorder_done']);
export function sanitizeTraceState(raw){return typeof raw==='string'&&states.has(raw)?raw:null;}
const eligible=c=>c.level>=3&&c.attunements.includes('resonance')&&surveyState(c.survey)?.endsWith('_done')&&brineStage(c.brineStage)===3;
const TITLE='Residual Traces';
const TRACE_REWARD_XP=55;
const traceMaterial=s=>s.startsWith('strata_')?'culture_matrix':'kinetic_coupler';
const lines={
 briefed:'Inspect either the Strata Interferometer in Sinter Flats or the recorder at Kestrel Deep. Choose which evidence leads the investigation.',
 strata_first:'The strata reading retained the disturbance, but not its timing. Compare it with the Kestrel Phase Recorder.',
 recorder_first:'The recorder identifies a repeating disturbance, but cannot account for the living material. Compare it at the Strata Interferometer using a recovered laminate or the appropriate sampling technique.',
 strata_ready:'Both readings align: the living material retained a displaced waveform. Return to Archivist Venn with the strata-first interpretation.',
 recorder_ready:'Both readings align: the machinery repeated the disturbance before the strata absorbed it. Return to Archivist Venn with the recorder-first interpretation.',
 strata_done:'Reported the strata-first interpretation to Archivist Venn. The living material was the key evidence.',
 recorder_done:'Reported the recorder-first interpretation to Archivist Venn. The instrument timing was the key evidence.'
};
export function fieldQuestProjection(char){
 const s=sanitizeTraceState(char.traceState);if(!s)return {};
 const done=s.endsWith('_done'),readings=s==='briefed'?0:s.endsWith('_first')?1:2;
 const rewards=[TRACE_REWARD_XP+' XP',readings===2?'1 × '+MATERIALS[traceMaterial(s)].name:'Research allotment (revealed after both readings)'];
 return {fieldQuests:[{id:'field:residual_traces',title:TITLE,group:'Field research',status:done?'completed':'active',text:lines[s],progress:readings+' / 2 readings',rewards}]};
}
const speak=(p,obj,m)=>p.outbox.push({e:'say',id:obj.id,n:obj.name,m});
function set(game,p,state){p.char.traceState=state;game.markDirty(p);}
export function traceTalk(game,p,obj,{grantSalvage,grantXp}){
 if(obj?.type!=='archivist'||game.ents.get(obj.id)!==obj||p.dead||dist(p,obj)>5||!eligible(p.char))return false;
 const s=sanitizeTraceState(p.char.traceState);
 if(s?.endsWith('_done'))return false;
 if(game.time<p.combatUntil){speak(p,obj,'We can compare the findings when you have disengaged.');return true;}
 if(!s){set(game,p,'briefed');speak(p,obj,'Brineworks gave us only one side of the disturbance. '+lines.briefed);return true;}
 if(!s.endsWith('_ready')){speak(p,obj,lines[s]);return true;}
 const strata=s==='strata_ready',material=traceMaterial(s);
 if((sanitizeMaterials(p.char.materials)[material]||0)>=MATERIAL_CAP){speak(p,obj,'Your material storage is full. Clear space before accepting the research allotment.');return true;}
 // State is committed before XP/loot callbacks to prevent replay; storage
 // preflight guarantees this single synchronous allotment under normal state.
 p.char.traceState=strata?'strata_done':'recorder_done';
 if(!grantSalvage(game,p,material,1)){p.char.traceState=s;speak(p,obj,'The research allotment could not be issued.');return true;}
 grantXp(game,p,TRACE_REWARD_XP);game.markDirty(p);
 speak(p,obj,strata?'The living material has retained a history of the waveform. Take this culture matrix for your next research assembly.':'The timing records explain how the disturbance propagated. Take this kinetic coupler for your next engineering assembly.');
 return true;
}
export function traceRead(game,p,obj,kind,transmit){
 if(p.dead||game.time<p.combatUntil||!eligible(p.char)||game.ents.get(obj?.id)!==obj||dist(p,obj)>5||!hasLineOfSight(p,obj))return false;
 if(kind==='strata'&&(obj.type!=='sinter_sampler'||!p.char.inventory.includes('sinter_laminate')))return false;
 if(kind==='recorder'&&obj.type!=='deep_console')return false;
 if(kind!=='strata'&&kind!=='recorder')return false;
 const old=sanitizeTraceState(p.char.traceState);let next=null;
 if(old==='briefed')next=kind+'_first';
 else if(old==='strata_first'&&kind==='recorder')next='strata_ready';
 else if(old==='recorder_first'&&kind==='strata')next='recorder_ready';
 if(!next)return false;
 set(game,p,next);transmit(game,p,'field','info',lines[next]);return true;
}
