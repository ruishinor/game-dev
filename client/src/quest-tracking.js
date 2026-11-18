// Local presentation preferences only. Stable groups follow sequential objectives.
export const TRACK_LIMIT=3;
export function trackKey(q){return q.id.startsWith('directive:')?'directive':q.id.startsWith('brine:')?'brine':q.id;}
export function trackingPrefs(raw){
 const keys=Array.isArray(raw?.keys)?[...new Set(raw.keys.filter(k=>typeof k==='string'&&/^[a-zA-Z0-9_:-]{1,80}$/.test(k)))].slice(0,TRACK_LIMIT):null;
 return {keys,collapsed:raw?.collapsed===true};
}
export function trackedEntries(entries,prefs){
 const seen=new Set(),eligible=[];
 for(const q of entries){const key=trackKey(q);if(q.status==='completed'||seen.has(key))continue;seen.add(key);eligible.push(q);}
 const keys=trackingPrefs(prefs).keys;
 return (keys===null?eligible:keys.flatMap(k=>eligible.filter(q=>trackKey(q)===k))).slice(0,TRACK_LIMIT);
}
export function toggleTracking(entries,prefs,q){
 const clean=trackingPrefs(prefs),current=trackedEntries(entries,clean).map(trackKey),key=trackKey(q);
 if(!entries.some(e=>e.id===q.id&&e.status!=='completed'))return clean;
 if(current.includes(key))return {...clean,keys:current.filter(k=>k!==key)};
 if(current.length>=TRACK_LIMIT)return clean;
 return {...clean,keys:[...current,key]};
}
