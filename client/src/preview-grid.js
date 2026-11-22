// Browser-local bounds before any WebGL renderer/allocation. Preserve ordinary
// contact sheets, but constrain unusual query inputs and total pixel count.
const DEFAULT='look:vanguard_plate,look:aegis_keeper,look:conductor,look:brine_surveyor,look:archivist,mender,skitter,sentinel,warden';
export const MAX_PREVIEW_ITEMS=128;
export const MAX_PREVIEW_EDGE=8192;
export const MAX_PREVIEW_PIXELS=16*1024*1024;
function number(q,key,fallback,min,max){
 if(!q.has(key)||!q.get(key).trim())return fallback;
 const v=Number(q.get(key));
 return Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback;
}
export function previewGrid(q){
 const items=(q.get('items')||DEFAULT).split(',').map(s=>s.trim()).filter(Boolean).slice(0,MAX_PREVIEW_ITEMS);
 if(!items.length)items.push(...DEFAULT.split(','));
 const cols=Math.floor(number(q,'cols',Math.min(4,items.length),1,Math.min(8,items.length)));
 const rows=Math.ceil(items.length/cols);
 const limit=Math.min(1024,Math.floor(MAX_PREVIEW_EDGE/Math.max(cols,rows)),Math.floor(Math.sqrt(MAX_PREVIEW_PIXELS/(cols*rows))));
 const cell=Math.floor(number(q,'cell',Math.min(320,limit),64,Math.max(64,limit)));
 const W=cols*cell,H=rows*cell;
 const yaw=number(q,'yaw',.55,-Math.PI*2,Math.PI*2),pitch=number(q,'pitch',.22,-Math.PI/2+.01,Math.PI/2-.01);
 return {items,cols,rows,cell,W,H,yaw,pitch};
}
