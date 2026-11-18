// Server-owned historical receipts. Neither these records nor their private
// projection are used to grant rewards or determine quest eligibility.
import {BRINE_REWARD_XP,BRINE_ROUTES,surveyState,brineStage} from '../../shared/survey.js';
import {ITEMS} from '../../shared/content.js';
import {MATERIALS} from '../../shared/crafting.js';

export const TRACE_REWARD_XP=55;
export const traceMaterial=s=>s.startsWith('strata_')?'culture_matrix':'kinetic_coupler';
const validXp=(v,max)=>Number.isSafeInteger(v)&&v>=0&&v<=max;

export function sanitizeFieldReceipts(raw,char){
 const out={};
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return out;
 const survey=surveyState(char.survey),reported=survey?.endsWith('_done');
 const investigation=raw.investigation,commissioning=raw.commissioning,traces=raw.traces;
 if(reported&&validXp(investigation?.xp,BRINE_REWARD_XP.investigation))
  out.investigation={xp:investigation.xp};
 if(reported&&brineStage(char.brineStage)===3&&validXp(commissioning?.xp,BRINE_REWARD_XP.commissioning)){
  const expected=BRINE_ROUTES[survey.slice(0,-5)].reward;
  if(commissioning.item===null||commissioning.item===expected)
   out.commissioning={xp:commissioning.xp,item:commissioning.item};
 }
 if(['strata_done','recorder_done'].includes(char.traceState)&&validXp(traces?.xp,TRACE_REWARD_XP)&&traces.material===traceMaterial(char.traceState))
  out.traces={xp:traces.xp,material:traces.material};
 if(char.riftCalibration==='completed'&&raw.calibration===true)out.calibration=true;
 return out;
}
export function recordFieldReceipt(char,key,value){
 char.fieldReceipts=sanitizeFieldReceipts({...char.fieldReceipts,[key]:value},char);
}
export function fieldReceiptProjection(char){
 const r=sanitizeFieldReceipts(char.fieldReceipts,char),rows=[];
 if(r.investigation)rows.push({id:'brine:investigation',received:[r.investigation.xp+' XP credited','Access to Brineworks commissioning']});
 if(r.commissioning)rows.push({id:'brine:commissioning',received:[r.commissioning.xp+' XP credited',r.commissioning.item?ITEMS[r.commissioning.item].name:'No additional item granted','Access to Brineworks services and eligible fabrication']});
 if(r.traces)rows.push({id:'field:residual_traces',received:[r.traces.xp+' XP credited','1 × '+MATERIALS[r.traces.material].name]});
 if(r.calibration)rows.push({id:'field:rift_calibration',received:['1 × '+MATERIALS.resonance_fragment.name]});
 return rows;
}
