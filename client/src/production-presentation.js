// Presentation only. Server snapshots still determine cycle counts, results,
// cancellation and XP. Interpolate briefly, never show unconfirmed completion.
export const workStage=q=>q<.20?'Preparing components':q<.83?'Working':'Inspecting result';
export function productionEstimate(job,elapsed=0,previous=0){
  if(!job||!Number.isFinite(job.total)||job.total<=0||!Number.isFinite(job.ms)||
    !Number.isSafeInteger(job.complete)||!Number.isSafeInteger(job.cycles)||
    job.complete<0||job.complete>=job.cycles)return null;
  const bound=v=>Math.max(0,Math.min(.995,v));
  const dt=Number.isFinite(elapsed)?Math.max(0,Math.min(250,elapsed)):0;
  const last=Number.isFinite(previous)?bound(previous):0;
  const cycle=Math.max(last,bound((job.total-job.ms+dt)/job.total));
  return {cycle,overall:job.complete+cycle,stage:workStage(cycle)};
}
export function createProductionClock(){
  let last=null,receivedAt=0,previous=0;
  const reset=()=>{last=null;receivedAt=0;previous=0;};
  return {
    reset,
    sample(job,now){
      if(!job){reset();return null;}
      if(!Number.isFinite(now))now=receivedAt;
      if(last!==job){
        if(!last||last.id!==job.id||last.complete!==job.complete||
          last.total!==job.total||last.cycles!==job.cycles||last.quantity!==job.quantity||
          job.ms>last.ms+1)previous=0;
        last=job;receivedAt=now;
      }
      const estimate=productionEstimate(job,now-receivedAt,previous);
      if(estimate)previous=estimate.cycle;
      return estimate;
    }
  };
}
