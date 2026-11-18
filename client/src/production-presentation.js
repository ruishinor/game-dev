// Derived presentation stages, not extra server-side transactions.
export const workStage=q=>q<.20?'Preparing components':q<.83?'Working':'Inspecting result';
export function productionEstimate(job,elapsed,previous=0){
 if(!job||!Number.isFinite(job.total)||job.total<=0||!Number.isFinite(job.ms))return null;
 const left=Math.max(0,job.ms-Math.max(0,Number.isFinite(elapsed)?elapsed:0));
 // Never claim completion until a new authoritative snapshot acknowledges it.
 const cycle=Math.min(.995,Math.max(0,previous,1-left/job.total));
 const overall=job.cycles>0?Math.min(.999,(job.complete+cycle)/job.cycles):0;
 const remaining=left+Math.max(0,job.cycles-job.complete-1)*job.total;
 return {cycle,overall,remaining,stage:workStage(cycle)};
}
