// Verdigris Reach atlas terrain plate — original, cached map artwork.
// Draws solely from public shared terrain geometry and already-public zone
// descriptors. No private encounter/reward tables, borrowed map tiles or
// unexplored-area client payloads are referenced.
import {WORLD,ZONES,PROPS,DEEP,groundHeight} from '../../shared/world.js';

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
const rgb=h=>[(h>>16)&255,(h>>8)&255,h&255];
const mixRgb=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*clamp(t,0,1));
const spore=ZONES.sporefield,roadLength=Math.hypot(spore.x,spore.z);
const roadX=spore.x/roadLength,roadZ=spore.z/roadLength;
/** Maps scene.js's existing groundColor biome palette into a static plate.
 * Hillshade/contours come exclusively from shared groundHeight. */
export function atlasTerrainColor(x,z){
  const n=.5+.25*Math.sin(x*.19+1.7)*Math.cos(z*.23)+
    .25*Math.sin(x*.07-z*.11)+(hash(Math.round(x*3),Math.round(z*3))-.5)*.12;
  let color=mixRgb(rgb(0x24443a),rgb(0x3d6e55),n*.8);
  const zone=(site,r,a,b)=>{
    const w=smooth(1-(Math.hypot(x-site.x,z-site.z)-r*.55)/(r*.6));
    if(w>0)color=mixRgb(color,mixRgb(rgb(a),rgb(b),n),w);
  };
  zone(ZONES.sporefield,24,0x3b303d,0x665063);
  const along=x*roadX+z*roadZ,offset=Math.abs(x*roadZ-z*roadX);
  const path=smooth((along-12)/4)*smooth((46-along)/7)*smooth((2.8-offset)/1.9);
  color=mixRgb(color,mixRgb(rgb(0x847567),rgb(0x514748),n),path*.8);
  zone(ZONES.relay,20,0x4a443f,0x625646);
  zone(ZONES.vault,19,0x34334f,0x4a4870);
  zone(ZONES.obelisk,9,0x223f5c,0x2f5a78);
  zone(ZONES.sanctum,15,0x4d6670,0x5f7c86);
  zone(ZONES.survey,20,0x645043,0x9b7962);
  zone(ZONES.sinter,19,0x827769,0xbab09a);
  zone(ZONES.deep,19,0x484b48,0x78796e);
  const edge=smooth((Math.hypot(x,z)-(WORLD.radius-12))/9);
  color=mixRgb(color,mixRgb(rgb(0x2c2b36),rgb(0x45434f),n),edge);
  const h=groundHeight(x,z),dx=groundHeight(x+.65,z)-groundHeight(x-.65,z);
  const dz=groundHeight(x,z+.65)-groundHeight(x,z-.65);
  const light=clamp(-dx*16-dz*20,-38,38);
  const contour=Math.abs(h/1.8-Math.round(h/1.8));
  const line=contour<.026?-(.026-contour)*170:0;
  const grain=(noise(x*2.8,z*2.8)-.5)*9+(noise(x*7.1+7,z*7.1-13)-.5)*3;
  return [...color.map(c=>Math.round(clamp(c+light+line+grain,12,246))),255];
}
let cached;
export function reachAtlasTerrain(){
  if(cached)return cached;
  const n=768,c=document.createElement('canvas');
  c.width=c.height=n;
  const ctx=c.getContext('2d');
  const pixels=ctx.createImageData(n,n),r=WORLD.radius;
  for(let py=0;py<n;py++)for(let px=0;px<n;px++){
    const x=((px+.5)/n*2-1)*r,z=((py+.5)/n*2-1)*r;
    const rgba=atlasTerrainColor(x,z),at=(py*n+px)*4;
    for(let i=0;i<4;i++)pixels.data[at+i]=rgba[i];
  }
  ctx.putImageData(pixels,0,0);
  // Overlay confirmed static props: this never adds invented geography.
  const sc=n/(2*r),toX=x=>(x+r)*sc,toY=z=>(z+r)*sc;
  const architecture=new Set(['beacon','pylon','gatepost','relaytower','wall',
    'dish','survey_pump','survey_tower','survey_workstation','survey_engineering',
    'deep_wall','sinter_colony','sanctum_fabricator','arrival_pillar',
    'arrival_wall','arrival_terminal','monolith']);
  for(const p of PROPS){
    if(Math.hypot(p.x,p.z)>r+2)continue;
    const x=toX(p.x),y=toY(p.z),rad=Math.max(1.4,(p.r??.7)*sc);
    ctx.save();ctx.translate(x,y);if(p.rot)ctx.rotate(p.rot);
    if(p.type==='sporetree'||p.type==='conduit'||p.type==='pod'){
      const spores=p.type==='sporetree',radius=rad*(spores?2.8:2);
      const canopy=ctx.createRadialGradient(-radius*.25,-radius*.2,0,0,0,radius);
      canopy.addColorStop(0,spores?'#846e84':'#698b68');
      canopy.addColorStop(.65,spores?'#554456':'#345846');
      canopy.addColorStop(1,spores?'#372b3a00':'#274b3900');
      ctx.fillStyle=canopy;ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.fill();
    }else if(p.type==='rock'||p.type==='sinter_ridge'||p.type==='crystal'){
      const sides=p.type==='crystal'?5:7,radius=Math.max(rad,(p.hw??0)*sc);
      ctx.beginPath();
      for(let m=0;m<sides;m++){
        const angle=m*2*Math.PI/sides,rr=radius*(.85+.1*hash(m,p.seed??7));
        const xx=Math.cos(angle)*rr,yy=Math.sin(angle)*rr;
        if(m===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy);
      }
      ctx.closePath();
      ctx.fillStyle=p.type==='crystal'?'#667b87':p.type==='sinter_ridge'?'#918276':'#4c504e';
      ctx.strokeStyle='#202b30';ctx.lineWidth=1;ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.moveTo(-radius*.5,-radius*.25);ctx.lineTo(0,-radius*.5);
      ctx.lineTo(radius*.4,-radius*.1);ctx.strokeStyle='#d6cbb078';ctx.stroke();
    }else if(architecture.has(p.type)){
      const hw=Math.max(.55,p.hw??p.r??.6)*sc,hd=Math.max(.55,p.hd??p.r??.6)*sc;
      ctx.fillStyle='#28383cbd';ctx.strokeStyle='#b8bdb9d9';ctx.lineWidth=.9;
      if(p.hw!==undefined||p.hd!==undefined){
        ctx.fillRect(-hw,-hd,hw*2,hd*2);ctx.strokeRect(-hw,-hd,hw*2,hd*2);
      }else{
        ctx.beginPath();ctx.arc(0,0,Math.max(1.4,hw),0,Math.PI*2);ctx.fill();ctx.stroke();
      }
    }
    ctx.restore();
  }
  // The enclosed Kestrel Deep roof footprint comes from authoritative DEEP.
  const roofX=toX(DEEP.x),roofY=toY(DEEP.z);
  ctx.fillStyle='#505955aa';ctx.strokeStyle='#a3aba8';
  ctx.fillRect(roofX-DEEP.hw*sc,roofY-DEEP.hd*sc,2*DEEP.hw*sc,2*DEEP.hd*sc);
  ctx.strokeRect(roofX-DEEP.hw*sc,roofY-DEEP.hd*sc,2*DEEP.hw*sc,2*DEEP.hd*sc);
  cached=c;
  return c;
}


// Ground-truth elevation contours, sampled only from the same public
// groundHeight used by the walkable Reach surface. No invented ridgelines,
// waterways or hidden encounters. Kept separate from the material plate so
// map detail remains legible above the scene photograph.
export function reachContourSegments(step=2.5,interval=1){
  const radius=WORLD.radius;
  const cells=Math.ceil(2*radius/step),delta=2*radius/cells;
  const heights=new Float64Array((cells+1)*(cells+1));
  const at=(i,j)=>heights[j*(cells+1)+i];
  for(let j=0;j<=cells;j++)for(let i=0;i<=cells;i++){
    heights[j*(cells+1)+i]=groundHeight(-radius+i*delta,-radius+j*delta);
  }
  const segments=[];
  for(let j=0;j<cells;j++)for(let i=0;i<cells;i++){
    const x=-radius+i*delta,z=-radius+j*delta;
    const corners=[
      {x,z,h:at(i,j)},{x:x+delta,z,h:at(i+1,j)},
      {x:x+delta,z:z+delta,h:at(i+1,j+1)},{x,z:z+delta,h:at(i,j+1)}
    ];
    const minimum=Math.min(...corners.map(p=>p.h));
    const maximum=Math.max(...corners.map(p=>p.h));
    for(let k=Math.ceil(minimum/interval);k*interval<maximum;k++){
      const level=k*interval,points=[];
      for(let edge=0;edge<4;edge++){
        const a=corners[edge],b=corners[(edge+1)%4];
        if((a.h<=level&&b.h>level)||(b.h<=level&&a.h>level)){
          const t=(level-a.h)/(b.h-a.h);
          points.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});
        }
      }
      for(let m=0;m+1<points.length;m+=2){
        const a=points[m],b=points[m+1];
        if(Math.hypot((a.x+b.x)/2,(a.z+b.z)/2)>radius+1)continue;
        segments.push({x1:a.x,z1:a.z,x2:b.x,z2:b.z,level});
      }
    }
  }
  return segments;
}
let contours;
export function reachAtlasContours(){
  if(contours)return contours;
  const n=768,r=WORLD.radius,canvas=document.createElement('canvas');
  canvas.width=canvas.height=n;
  const ctx=canvas.getContext('2d'),scale=n/(2*r);
  const segments=reachContourSegments();
  for(const major of [false,true]){
    ctx.beginPath();
    for(const s of segments){
      if((Math.abs(s.level%3)<1e-8)!==major)continue;
      ctx.moveTo((s.x1+r)*scale,(s.z1+r)*scale);
      ctx.lineTo((s.x2+r)*scale,(s.z2+r)*scale);
    }
    ctx.lineWidth=major?1.25:.72;
    ctx.strokeStyle=major?'rgba(22,38,37,.51)':'rgba(20,38,35,.28)';
    ctx.stroke();
  }
  contours=canvas;
  return contours;
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
