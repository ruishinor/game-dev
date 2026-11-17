// Artistic decisions only. Does not affect technical validation or gameplay.
export const REVIEW_KEY='attunement.art-review.v1';
export const DECISIONS=['unreviewed','accepted','modify','not-accepted'];
export const LABELS={'unreviewed':'Unreviewed','accepted':'Accepted','modify':'Modify','not-accepted':'Not accepted'};
export function createReviewStore(items,storage){
 const revisions=new Map(items.map(({id,revision})=>[id,revision]));
 let records=new Map(),persistent=true;
 function read(){
  try{
   const raw=storage.getItem(REVIEW_KEY);if(!raw)return;
   const data=JSON.parse(raw);if(data.version!==1||!Array.isArray(data.records))throw Error('invalid review data');
   for(const r of data.records)if(r&&revisions.has(r.id)&&r.revision===revisions.get(r.id)&&DECISIONS.includes(r.status)&&typeof r.note==='string'&&r.note.length<=4000)records.set(r.id,{status:r.status,note:r.note});
  }catch{persistent=false;}
 }
 read();
 function get(id){if(!revisions.has(id))throw Error('unknown art review item');return records.get(id)||{status:'unreviewed',note:''};}
 function exportData(){return {version:1,kind:'attunement-art-review',records:items.map(({id,revision})=>({id,revision,...get(id)}))};}
 function set(id,status,note){
  get(id);if(!DECISIONS.includes(status)||typeof note!=='string'||note.length>4000)throw Error('invalid art review');
  records.set(id,{status,note});
  try{storage.setItem(REVIEW_KEY,JSON.stringify(exportData()));persistent=true;}catch{persistent=false;}
 }
 function counts(){const out=Object.fromEntries(DECISIONS.map(x=>[x,0]));for(const {id} of items)out[get(id).status]++;return out;}
 return {get,set,counts,exportData,get persistent(){return persistent;}};
}
