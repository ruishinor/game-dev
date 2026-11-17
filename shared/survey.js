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
