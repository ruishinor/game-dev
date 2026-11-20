// Original Attunement cartographic texture for the Reach minimap.
// Based solely on public shared terrain heightfield (no unpublished markers,
// encounter tables or borrowed game minimap textures).
import { WORLD, groundHeight } from '../../shared/world.js';

let cached;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const noise=(x,z)=> {
  const t=Math.sin(x*11.183+z*37.73)*43758.5453;
  return t-Math.floor(t);
};

/** Cached world-space relief tile. Drawn once, not on every animation frame. */
export function reachMinimapArt(){
  if(cached)return cached;
  const n=256,r=WORLD.radius,c=document.createElement('canvas');
  c.width=c.height=n;
  const g=c.getContext('2d',{willReadFrequently:false});
  const pixels=g.createImageData(n,n);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const wx=((x+.5)/n*2-1)*r,wz=((y+.5)/n*2-1)*r;
    if(Math.hypot(wx,wz)>r)continue;
    const h=groundHeight(wx,wz);
    const ridge=(groundHeight(wx-1.25,wz-1.25)-h)*12;
    const broad=Math.sin(wx*.113)*Math.cos(wz*.091)*5;
    const grain=(noise(x,y)-.5)*13;
    const warm=clamp((h+1.5)/9,0,1);
    const low=clamp((-h-2)/9,0,1);
    const base=[61+warm*38-low*9,67+warm*29+low*4,69+warm*19+low*15];
    const light=clamp(ridge+broad+grain,-23,25);
    const idx=(y*n+x)*4;
    pixels.data[idx]=clamp(base[0]+light,15,160);
    pixels.data[idx+1]=clamp(base[1]+light,17,160);
    pixels.data[idx+2]=clamp(base[2]+light,19,165);
    pixels.data[idx+3]=255;
  }
  g.putImageData(pixels,0,0);
  cached=c;
  return c;
}
