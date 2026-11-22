// One shared site plan for GLB fungal colonies and their restrained spore air.
// Reuses existing approved nature-kit pieces; no new gameplay/collider or
// speculative source-archive promotion.
import { mulberry32 } from '../../shared/world.js';

export const SPOREFIELD_COLONIES=Object.freeze([
  Object.freeze([-28.5,23,2.3,0]),Object.freeze([-33.5,15,3.2,1]),
  Object.freeze([-36,29,3.2,0]),Object.freeze([-39,17,3.0,1]),
  Object.freeze([-46.5,21,3.8,0]),Object.freeze([-44.5,34,3.5,1]),
  Object.freeze([-49.5,29,3.6,0]),Object.freeze([-53.5,20,3.0,1]),
]);

export function planSporeMotes(count, groundHeight, seed=1337) {
  if(!Number.isInteger(count)||count<0||count>160)throw Error('spore budget out of range');
  if(typeof groundHeight!=='function')throw Error('ground height required');
  const rnd=mulberry32(seed),points=[];
  for(let i=0;i<count;i++) {
    const [cx,cz,radius,wet]=SPOREFIELD_COLONIES[i%SPOREFIELD_COLONIES.length];
    const a=rnd()*Math.PI*2;
    const r=radius*(wet?1.65:1.45)*Math.sqrt(rnd());
    const x=cx+Math.cos(a)*r,z=cz+Math.sin(a)*r;
    const y=groundHeight(x,z)+(wet?.35:.65)+rnd()*(wet?2.2:3.6);
    points.push(x,y,z);
  }
  return points;
}
