// Local, per-character action-bar assignment. The server still validates every
// ability activation; no new learned abilities or protocol fields are created.
export const HOTBAR_SIZE=9;
export const COMPANION_ACTION='@companion';
const idValid=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{8,128}$/.test(id);
const key=id=>'attunement.hotbar.v1.'+id;
const indexValid=i=>Number.isInteger(i)&&i>=0&&i<HOTBAR_SIZE;
const learned=ids=>Array.isArray(ids)?[...new Set(ids.filter(id=>typeof id==='string'))]:[];
export function companionIndex(abilities){const count=learned(abilities).length;return count<HOTBAR_SIZE?count:-1;}
export function defaultHotbar(abilities){
  const ids=learned(abilities),arr=Array(HOTBAR_SIZE).fill(null);
  for(let i=0;i<Math.min(ids.length,HOTBAR_SIZE);i++)arr[i]=ids[i];
  const pinned=companionIndex(abilities);if(pinned!==-1)arr[pinned]=COMPANION_ACTION;
  return arr;
}
export function normalizeHotbar(abilities,stored){
  const fallback=defaultHotbar(abilities);
  if(!Array.isArray(stored)||stored.length!==HOTBAR_SIZE)return fallback;
  const ids=new Set(learned(abilities)),used=new Set(),fixed=companionIndex(abilities);
  const normalized=stored.map((value,i)=>{
    if(i===fixed)return COMPANION_ACTION;
    if(typeof value!=='string'||!ids.has(value)||used.has(value))return null;
    used.add(value);return value;
  });
  return normalized;
}
export function editHotbar(abilities,layout,change){
  const ids=learned(abilities),allowed=new Set(ids),fixed=companionIndex(abilities);
  const existing=normalizeHotbar(ids,layout);
  const next=[...existing];
  const editable=i=>indexValid(i)&&i!==fixed;
  const failure=()=>({ok:false,layout:existing});
  if(change?.type==='move'){
    if(!editable(change.from)||!editable(change.to)||
       !allowed.has(next[change.from]))return failure();
    [next[change.from],next[change.to]]=[next[change.to],next[change.from]];
  }else if(change?.type==='remove'){
    if(!editable(change.from)||!allowed.has(next[change.from]))return failure();
    next[change.from]=null;
  }else if(change?.type==='assign'){
    if(!editable(change.to)||!allowed.has(change.id))return failure();
    const from=next.indexOf(change.id);
    if(from>=0){
      [next[from],next[change.to]]=[next[change.to],next[from]];
    }else{
      const occupying=next[change.to];
      if(occupying!==null){
        const free=next.findIndex((v,i)=>editable(i)&&v===null);
        if(free===-1)return failure();
        next[free]=occupying;
      }
      next[change.to]=change.id;
    }
  }else return failure();
  return {ok:true,layout:next};
}
export function loadHotbar(storage,owner,abilities){
  if(!idValid(owner))return defaultHotbar(abilities);
  try{return normalizeHotbar(abilities,JSON.parse(storage?.getItem(key(owner))??'null'));}
  catch{return defaultHotbar(abilities);}
}
export function storeHotbar(storage,owner,abilities,layout){
  if(!idValid(owner)||!storage)return false;
  try{
    storage.setItem(key(owner),JSON.stringify(normalizeHotbar(abilities,layout)));
    return true;
  }catch{return false;}
}
