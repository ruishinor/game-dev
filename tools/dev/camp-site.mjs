import { SEVERANCE_EXPANSE as E, SEVERANCE_VEINS } from '../../shared/severance-gate.js';
import * as W from '../../shared/world.js';
import { SEVERANCE_PATROLS } from '../../server/sim/severance-patrols.js';
const all = [...(W.COLLIDERS??[]), ...W.OBJECTS].filter(c => Number.isFinite(c.x));
const g = W.groundHeight;
const segDist = (p, a, b) => { const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1))); return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz); };
const routeD = p => Math.min(...SEVERANCE_PATROLS.flatMap(r => r.route.map((q,i)=>segDist(p,q,r.route[(i+1)%r.route.length]))));
const res=[];
for (let u=-120;u<=120;u+=4) for (let v=-150;v<=150;v+=4) {
  const p={x:E.x+u,z:E.z+v};
  if (Math.abs(u)>E.hw-26||Math.abs(v)>E.hd-26) continue;
  if (Math.hypot(u, v-125) < 45) continue; // gate approach
  if (Math.hypot(p.x-E.outpost.x,p.z-E.outpost.z) < E.outpost.r+35) continue;
  if (Math.hypot(p.x-E.arrival.x,p.z-E.arrival.z) < 45) continue;
  const clear=Math.min(...all.map(c=>Math.hypot(p.x-c.x,p.z-c.z)-(c.r??Math.hypot(c.hw??0,c.hd??0))));
  if (clear<13) continue;
  const rd=routeD(p); if (rd<16) continue;
  if (Math.min(...SEVERANCE_VEINS.map(w=>Math.hypot(w.x-p.x,w.z-p.z)))<20) continue;
  let hmin=1e9,hmax=-1e9; for(let a=0;a<12;a++)for(const r of [0,5,10]){const h=g(p.x+Math.cos(a)*r,p.z+Math.sin(a)*r);hmin=Math.min(hmin,h);hmax=Math.max(hmax,h);}
  if (hmax-hmin>1.6) continue;
  res.push({u,v,clear:+clear.toFixed(1),route:+rd.toFixed(1),relief:+(hmax-hmin).toFixed(2)});
}
res.sort((a,b)=>(b.clear-b.relief*4)-(a.clear-a.relief*4));
console.log(res.length, JSON.stringify(res.slice(0,8)));
