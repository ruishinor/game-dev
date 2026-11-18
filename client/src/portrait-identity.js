// The static paperdoll must use the same cosmetic identity as the live model.
// No gameplay state, client authority or new network fields are introduced.
export const PORTRAIT_CACHE_LIMIT=32;

export function characterPortraitMeta(sheet){
 return {k:'p',c:sheet.cls,a:sheet.look,n:sheet.name,ap:sheet.appearance};
}
export function portraitCacheKey(meta,style,glb){
 const humanoid=meta.k==='p'||meta.c==='archivist'||meta.c==='quartermaster';
 return JSON.stringify([meta.k,meta.c,meta.a??null,humanoid?meta.n??null:null,
  humanoid?meta.ap??null:null,style,!!glb]);
}
export function createPortraitCache(limit=PORTRAIT_CACHE_LIMIT){
 const entries=new Map();
 return {
  get(key){
   if(!entries.has(key))return undefined;
   const value=entries.get(key);entries.delete(key);entries.set(key,value);return value;
  },
  set(key,value){
   entries.delete(key);entries.set(key,value);
   while(entries.size>limit)entries.delete(entries.keys().next().value);
  }
 };
}
