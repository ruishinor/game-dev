import { OBJECTS, dist, inSanctum, SANCTUM_FABRICATOR } from './world.js';
// Optional story branch. No changes to the original directive chain.
export const SURVEY = {
  signal: {
    type: 'survey_signal',
    title: 'A Signal Below',
    field: 'The pressure receiver recorded a pulse after shutdown. It repeats at irregular intervals, too deliberate to be a pump fault. A note inside the housing reads: DO NOT ANSWER FROM THE SURFACE.',
    report: 'Venn studies the waveform. Something below the cut was active after the evacuation. We need a receiver that can listen without transmitting. Leave the sealed pumps alone.',
  },
  ledger: {
    type: 'survey_ledger',
    title: 'Names on the Ledger',
    field: 'The shift ledger records eleven workers evacuated, twelve supply allotments issued. The final entry lists a name crossed out by hand and a warning: no one leaves a dependent behind.',
    report: 'Venn recognizes the crossed-out name. The workers concealed someone from the company auditors. This was not an empty station when it closed. We will look for their shelter.',
  },
};
export const BRINE_REWARD_XP = Object.freeze({ investigation: 35, commissioning: 55 });
export const surveyState = value => ['signal', 'ledger', 'signal_done', 'ledger_done'].includes(value) ? value : null;
export function surveyHint(value) {
  const state = surveyState(value);
  if (!state) return 'Optional: Brineworks Cut (north-east). Investigate the Pressure Receiver or Shift Ledger.';
  if (state.endsWith('_done')) return SURVEY[state.slice(0, -5)].title + ' — reported to Venn.';
  return SURVEY[state].title + ' — return to Archivist Venn in the Sanctum.';
}

export const BRINE_TRIAL = Object.freeze({ ms: 30000, exclusion: Object.freeze({x:43,z:-35.5,r:2.5}), serviceMs:15000 });
export const brineStage = value => Number.isInteger(value) && value >= 0 && value <= 3 ? value : 0;
export const BRINE_ROUTES = {
  signal: { first:'brine_research', second:'brine_engineering', read:['survey_signal','survey_ledger'], reward:'brine_phase_filter', firstName:'A · Research (west)', secondName:'B · Engineering (east)', readNames:['Pressure Receiver','Shift Ledger'], setup:'Calibrate a passive filter, then isolate the pump feed. Verify the waveform against the shift log.' },
  ledger: { first:'brine_engineering', second:'brine_research', read:['survey_ledger','survey_signal'], reward:'brine_rescue_lattice', firstName:'B · Engineering (east)', secondName:'A · Research (west)', readNames:['Shift Ledger','Pressure Receiver'], setup:'Isolate the power feed, then extract the shelter record. Authenticate it against the pressure log.' },
};
export function brineHint(survey, stage, trial) {
  const state=surveyState(survey);
  if (!state?.endsWith('_done')) return surveyHint(survey);
  const route=BRINE_ROUTES[state.slice(0,-5)];
  const n=brineStage(stage);
  if (n===3) return 'Brineworks online. A: resources and research fabrication. B: field repairs and engineering fabrication. Approach either station to open Workshop [B]. Services share a 15s cooldown.';
  if (n===0) return route.setup+' Start at '+route.firstName+' [F].';
  if (n===1) return 'Preparation recorded. Visit '+route.secondName+' [F] to start a 30s deadline. Walk to both record terminals in the indicated order; finish immediately after the second reading. Do not cross the amber pressure zone.';
  if (!trial?.ms) return 'Test interrupted. Restart at '+route.secondName+' [F].';
  return 'LIVE TEST · '+Math.ceil(trial.ms/1000)+'s · '+route.readNames[trial.read]+' [F]. Avoid the marked pressure exclusion zone.';
}

export const FIELD_RECORDS = Object.freeze({
 survey_ledger:{title:'BRINEWORKS / SHIFT LEDGER 07',subtitle:'Recovery copy · local storage · partial',lines:[
 ['03:40','Crew count 11. Shelter draw: 12 ration allotments. Do not reconcile automatically.'],
 ['04:12','Pump 2 locked out. Pressure receiver still reports pulses with feed isolated.'],
 ['04:38','J. Neri — removed from company roster; dependent still unaccounted for.'],
 ['05:06','Draft: isolate at B, recover the shelter archive at A, then compare this ledger with the pressure receiver.'],
 ['05:13','Unfinished note: If an implant receives the same signal as the lattice, it can preserve a failing barrier. The worker must still be alive.'],
 ['05:21','No one leaves a dependent behind. Evacuate under cover.'],
 ]},
 survey_signal:{title:'BRINEWORKS / PASSIVE RECEIVER',subtitle:'Local record · transmitter isolated',lines:[
 ['03:57','Feed OFF. Baseline returns to zero.'],
 ['04:12','Unsolicited pulse. Interval 7.2 seconds; amplitude nonuniform.'],
 ['04:40','Second channel responds to changes in shelter load, not pump speed.'],
 ['05:03','Draft: set passive filter at A, isolate feed at B; compare receiver sample with shift ledger.'],
 ['WARNING','Do not transmit into the cut. Stay outside the marked pressure exclusion zone during verification.'],
 ]},
 brine_research:{title:'A / RESEARCH STATION',subtitle:'West service deck · sample and signal operations',lines:[['Function','Passive filtering, shelter archive recovery, resource service and research fabrication.'],['Commission','Follow your chosen investigation order; the second station starts the live test, not a waiting period.']]},
 brine_engineering:{title:'B / ENGINEERING STATION',subtitle:'East service deck · isolation and repair',lines:[['Function','Isolate the pump feed, recover structural records, perform field repair and engineering fabrication.'],['Commission','Prepare/arm as directed, then take ordered readings within 30 seconds. No waiting required.']]},
});
export function workshopSite(p){
 if(inSanctum(p)&&dist(p,SANCTUM_FABRICATOR)<=SANCTUM_FABRICATOR.range)return 'sanctum';
 if(brineStage(p.char?.brineStage)!==3 || !surveyState(p.char?.survey)?.endsWith('_done'))return null;
 for(const o of OBJECTS)if(o.type.startsWith('brine_')&&dist(p,o)<=4.2)return o.type;
 return null;
}
