// Personal cartography is local-only, scoped to the server-issued character UUID.
// No private map notes or marker metadata are sent to the multiplayer simulation.
export const MAX_SAVED_POINTS = 32;
export const MAX_NOTE_LENGTH = 180;
const ownerKey = id => typeof id==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)
  ? 'attunement.atlas.saved.v1.'+id.toLowerCase() : null;

export function sanitizeSavedPoint(p) {
  if(!p||typeof p!=='object'||Array.isArray(p))return null;
  const {id,x,z,region,label,note}=p;
  if(typeof id!=='string'||!/^[0-9a-f-]{8,64}$/i.test(id))return null;
  if(!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>100000||Math.abs(z)>100000)return null;
  if(typeof region!=='string'||!region.trim()||region.length>96)return null;
  const cleanLabel=typeof label==='string'?label.trim().slice(0,52):'';
  const cleanNote=typeof note==='string'?note.trim().slice(0,MAX_NOTE_LENGTH):'';
  return {id,x,z,region,label:cleanLabel||'Saved point',note:cleanNote};
}
export function loadSavedPoints(storage,owner) {
  const key=ownerKey(owner);
  if(!key||!storage)return [];
  try {
    const list=JSON.parse(storage.getItem(key)||'[]');
    if(!Array.isArray(list))return [];
    const unique=new Set();
    return list.slice(0,MAX_SAVED_POINTS).map(sanitizeSavedPoint)
      .filter(p=>p&&!unique.has(p.id)&&unique.add(p.id));
  } catch { return []; }
}
export function persistSavedPoints(storage,owner,points) {
  const key=ownerKey(owner);
  if(!key||!storage||!Array.isArray(points)||points.length>MAX_SAVED_POINTS)return false;
  const clean=points.map(sanitizeSavedPoint);
  if(clean.some(x=>!x))return false;
  try {storage.setItem(key,JSON.stringify(clean));return true;}catch{return false;}
}
