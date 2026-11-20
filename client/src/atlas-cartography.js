// Verdigris Reach atlas terrain plate — original, cached map artwork.
// Draws solely from public shared terrain geometry and already-public zone
// descriptors. No private encounter/reward tables, borrowed map tiles or
// unexplored-area client payloads are referenced.
import {WORLD,ZONES,groundHeight} from '../../shared/world.js';

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
  const grain=(noise(x*2.9,z*2.9)-.5)*23+
    (noise(x*7.2+9,z*7.2-11)-.5)*12+
    (noise(x*.53,z*.53)-.5)*17;
  const canopy=(noise(x*.23+70,z*.23+37)-.5)*24;
  let rgb=h<-2?[50,72,77]:h>2.6?[105,111,109]:[78,94,87];
  const places=[
    ['sporefield',[61,91,75],29],
    ['sinter',[94,88,84],20],
    ['relay',[91,95,91],21],
    ['vault',[84,91,102],22],
    ['survey',[96,91,83],21],
    ['deep',[71,83,90],21],
    ['obelisk',[91,99,99],12],
  ];
  for(const [id,target,radius] of places){
    const site=ZONES[id],d=Math.hypot(x-site.x,z-site.z);
    const mix=smooth((radius+8-d)/15)*.68;
    if(mix>0)rgb=rgb.map((v,i)=>v*(1-mix)+target[i]*mix);
  }
  const high=smooth((h-1.8)/4);
  const shade=light+grain+canopy-(slope>1?slope*4:0);
  const beyond=smooth((Math.hypot(x,z)-r+10)/22);
  const contour=Math.abs(h/1.6-Math.round(h/1.6));
  const line=contour<.045?-(.045-contour)*95:0;
  const result=rgb.map((base,i)=>{
    const relief=i===0?high*7:i===2?high*5:high*2;
    return Math.round(clamp((base+shade+relief+line)*(1-beyond*.56)+beyond*34,19,215));
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
  cached=c;
  return c;
}
