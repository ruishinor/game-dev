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
export const surveyState = value => ['signal', 'ledger', 'signal_done', 'ledger_done'].includes(value) ? value : null;
export function surveyHint(value) {
  const state = surveyState(value);
  if (!state) return 'Optional: Brineworks Cut (north-east). Investigate the Pressure Receiver or Shift Ledger.';
  if (state.endsWith('_done')) return SURVEY[state.slice(0, -5)].title + ' — reported to Venn.';
  return SURVEY[state].title + ' — return to Archivist Venn in the Sanctum.';
}

export const BRINE_TRIAL = Object.freeze({ ms: 45000, exclusion: Object.freeze({x:43,z:-35.5,r:2.5}), serviceMs:45000 });
export const brineStage = value => Number.isInteger(value) && value >= 0 && value <= 3 ? value : 0;
export const BRINE_ROUTES = {
  signal: { first:'brine_research', second:'brine_engineering', read:['survey_signal','survey_ledger'], reward:'brine_phase_filter', firstName:'Research Station', secondName:'Engineering Station', readNames:['Pressure Receiver','Shift Ledger'], setup:'Calibrate a passive filter, then isolate the pump feed. Verify the waveform against the shift log.' },
  ledger: { first:'brine_engineering', second:'brine_research', read:['survey_ledger','survey_signal'], reward:'brine_rescue_lattice', firstName:'Engineering Station', secondName:'Research Station', readNames:['Shift Ledger','Pressure Receiver'], setup:'Isolate the power feed, then extract the shelter record. Authenticate it against the pressure log.' },
};
export function brineHint(survey, stage, trial) {
  const state=surveyState(survey);
  if (!state?.endsWith('_done')) return surveyHint(survey);
  const route=BRINE_ROUTES[state.slice(0,-5)];
  const n=brineStage(stage);
  if (n===3) return 'Brineworks commissioned. Research replenishes resources; Engineering repairs health. Outside combat, shared 45s service cooldown.';
  if (n===0) return route.setup+' Start at '+route.firstName+' [F].';
  if (n===1) return 'Preparation recorded. Visit '+route.secondName+' [F] to start a 45s field test.';
  if (!trial?.ms) return 'Test ready. Re-arm at '+route.secondName+' [F].';
  return 'LIVE TEST · '+Math.ceil(trial.ms/1000)+'s · '+route.readNames[trial.read]+' [F]. Avoid the marked pressure exclusion zone.';
}
