// Persisted, server-owned calibration progress. Project only discovered
// objectives. No client-supplied progress or hidden probabilities.
export function sanitizeRiftCalibration(value){
  return ['started','recorded','completed'].includes(value)?value:null;
}
export function riftQuestEntries(char){
  const state=sanitizeRiftCalibration(char?.riftCalibration);
  if(!state)return [];
  const text={
    started:'Complete a counterphase calibration at the regulator after a discharge. Stay clear of marked ground.',
    recorded:'Calibration recorded. Approach the Phase Scar core when the field is safe and you have disengaged to recover your sample. If the field reopens, wait for it to close.',
    completed:'Recovered the material sample from a successfully calibrated Phase Scar.'
  }[state];
  return [{id:'field:rift_calibration',title:'Phase Scar calibration',group:'Field research',
    status:state==='completed'?'completed':'active',text,
    progress:state==='started'?'0 / 2 stages':state==='recorded'?'1 / 2 stages':'2 / 2 stages',
    rewards:['1 × Resonance fragment']}];
}
