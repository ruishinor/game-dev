// Verdigris Reach atlas terrain plate — original, cached map artwork.
// Draws solely from public shared terrain geometry and already-public zone
// descriptors. No private encounter/reward tables, borrowed map tiles or
// unexplored-area client payloads are referenced.
import {WORLD,ZONES,COLLIDERS,groundHeight} from '../../shared/world.js';

const clamp=(n,a=0,b=255)=>Math.max(a,Math.min(b,n));
const smooth=t=>{const c=clamp(t,0,1);return c*c*(3-2*c);};
function hash(x,z){
  let n=Math.imul(x|0,374761393)+Math.imul(z|0,668265263);
  n=Math.imul(n^(n>>>13),1274126177);
  return ((n^(n>>>16))>>>0)/4294967295;
}
function noise(x,z){
  const ix=Math.floor(x),iz=Math.floor(z),fx=smooth(x-ix),fz=smooth(z-iz);
  const a=hash(ix,iz),b=hash(ix+1,iz),c=hash(ix,iz+1),d=hash(ix+1,iz+1);
  return (a*(1-fx)+b*fx)*(1-fz)+(c*(1-fx)+d*fx)*fz;
}

/** Exposed for deterministic unit verification; a palette is not an elevation API. */
export function atlasTerrainColor(x,z){
  const r=WORLD.radius,h=groundHeight(x,z);
  const dx=groundHeight(x+.9,z)-groundHeight(x-.9,z);
  const dz=groundHeight(x,z+.9)-groundHeight(x,z-.9);
  const slope=Math.hypot(dx,dz);
  const light=clamp(12-dx*10-dz*13,-34,34);
  // Layered, non-repeating-looking stone grain. True terrain comes from the
  // public heightfield; this detail is cosmetic, not new locations or roads.
  const grain=(noise(x*2.9,z*2.9)-.5)*10+
    (noise(x*7.2+9,z*7.2-11)-.5)*4+
    (noise(x*.53,z*.53)-.5)*8;
  const canopy=(noise(x*.23+70,z*.23+37)-.5)*8;
  let rgb=h<-2?[55,69,78]:h>2.6?[99,108,112]:[73,88,94];
  const places=[
    ['sporefield',[73,93,86],29],
    ['sinter',[97,100,99],20],
    ['relay',[85,96,102],21],
    ['vault',[86,93,110],22],
    ['survey',[91,101,104],21],
    ['deep',[69,84,96],21],
    ['obelisk',[89,104,112],12],
  ];
  for(const [id,target,radius] of places){
    const site=ZONES[id],d=Math.hypot(x-site.x,z-site.z);
    const mix=smooth((radius+8-d)/15)*.68;
    if(mix>0)rgb=rgb.map((v,i)=>v*(1-mix)+target[i]*mix);
  }
  const high=smooth((h-1.8)/4);
  const shade=light+grain+canopy-(slope>1?slope*4:0);
  // The atlas is a rectangular surveyed plate. Never add a circular
  // alpha/falloff boundary: it produced the giant green oval the owner rejected.
  const contour=Math.abs(h/1.6-Math.round(h/1.6));
  const line=contour<.04?-(.04-contour)*80:0;
  const result=rgb.map((base,i)=>{
    const relief=i===0?high*7:i===2?high*5:high*2;
    return Math.round(clamp(base+shade+relief+line,22,190));
  });
  return [...result,255];
}
let cached;
export function reachAtlasTerrain(){
  if(cached)return cached;
  const n=640,c=document.createElement('canvas');
  c.width=c.height=n;
  const ctx=c.getContext('2d');
  const pixels=ctx.createImageData(n,n),r=WORLD.radius;
  for(let py=0;py<n;py++)for(let px=0;px<n;px++){
    const x=((px+.5)/n*2-1)*r,z=((py+.5)/n*2-1)*r;
    const rgba=atlasTerrainColor(x,z),at=(py*n+px)*4;
    for(let i=0;i<4;i++)pixels.data[at+i]=rgba[i];
  }
  ctx.putImageData(pixels,0,0);
  // Actual public world geometry is etched into the terrain plate with low
  // contrast. Only structures/canopies, not every collision shape; avoids
  // the square-debug-overlay look of the rejected world map.
  const scale=n/(2*r),toX=x=>(x+r)*scale,toY=z=>(z+r)*scale;
  const structures=new Set(['beacon','pylon','gatepost','relaytower','wall',
    'dish','survey_pump','survey_tower','survey_workstation',
    'survey_engineering','deep_wall','sinter_colony']);
  for(const o of COLLIDERS){
    if(Math.hypot(o.x,o.z)>r)continue;
    const x=toX(o.x),y=toY(o.z);
    if(o.type==='sporetree'){
      ctx.beginPath();ctx.arc(x,y,Math.max(1.3,(o.r??1)*scale*1.8),0,Math.PI*2);
      ctx.fillStyle='rgba(30,62,49,.23)';ctx.fill();
      continue;
    }
    if(!structures.has(o.type))continue;
    const hw=Math.max(.55,o.hw??o.r??.6)*scale;
    const hd=Math.max(.55,o.hd??o.r??.6)*scale;
    ctx.fillStyle='rgba(28,45,49,.37)';
    ctx.strokeStyle='rgba(151,179,183,.40)';
    ctx.lineWidth=.85;
    if(o.hw!==undefined||o.hd!==undefined){
      ctx.fillRect(x-hw,y-hd,hw*2,hd*2);
      ctx.strokeRect(x-hw,y-hd,hw*2,hd*2);
    }else{
      ctx.beginPath();ctx.arc(x,y,Math.max(1.6,hw),0,Math.PI*2);
      ctx.fill();ctx.stroke();
    }
  }
  cached=c;
  return c;
}

/** No enemy location or density information is eligible for world-map display. */
export function atlasEntityCategory(meta,member=false){
  if(meta?.k==='p')return member?'party':'players';
  if(meta?.k==='o')return 'objects';
  return null;
}
/** Presentation-only marker clustering. Caller keeps original entity entries
 * and search results; no server visibility or discovery rules are changed. */
export function clusterMapMarkers(markers,radius=20){
  if(!Array.isArray(markers))return [];
  const groups=[];
  for(const marker of markers){
    if(!['objects','places','party','players'].includes(marker?.category)||!Number.isFinite(marker?.x)||!Number.isFinite(marker?.y))continue;
    const existing=groups.find(group=>group.category===marker.category&&Math.hypot(group.x-marker.x,group.y-marker.y)<=radius);
    if(existing){
      existing.count++;
      existing.x+=(marker.x-existing.x)/existing.count;
      existing.y+=(marker.y-existing.y)/existing.count;
    }else groups.push({x:marker.x,y:marker.y,category:marker.category,color:marker.color,count:1});
  }
  return groups;
}
