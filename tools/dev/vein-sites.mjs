import { SEVERANCE_EXPANSE as E, SEVERANCE_CRYSTALS } from '../../shared/severance-gate.js';
import * as W from '../../shared/world.js';
import { SEVERANCE_PATROLS } from '../../server/sim/severance-patrols.js';
const cols = W.COLLIDERS ?? [];
const objs = W.OBJECTS;
const all = [...cols, ...objs].filter(c => Number.isFinite(c.x));
const g = W.groundHeight;
const segDist = (p, a, b) => { const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1))); return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz); };
const routeD = p => Math.min(...SEVERANCE_PATROLS.flatMap(r => r.route.map((q,i)=>segDist(p,q,r.route[(i+1)%r.route.length]))));
const out=[];
for (const [label,u0,v0] of [['flats-n',50,40],['flats-e',90,-10],['canyon-w',-70,-40],['lake-s',20,-60],['ridge-ne',70,90],['pass-s',-10,-110],['canyon-nw',-80,70]]) {
  let best=null;
  for (let du=-14;du<=14;du+=2) for (let dv=-14;dv<=14;dv+=2) {
    const p={x:E.x+u0+du,z:E.z+v0+dv};
    if (Math.abs(p.x-E.x)>E.hw-20||Math.abs(p.z-E.z)>E.hd-20) continue;
    const clear=Math.min(...all.map(c=>Math.hypot(p.x-c.x,p.z-c.z)-(c.r??Math.hypot(c.hw??0,c.hd??0))));
    const rd=routeD(p), out_=Math.hypot(p.x-E.outpost.x,p.z-E.outpost.z)-E.outpost.r;
    const slope=Math.max(...[[1,0],[0,1],[-1,0],[0,-1]].map(([a,b])=>Math.abs(g(p.x+a*1.5,p.z+b*1.5)-g(p.x,p.z))));
    if (clear<3.5||rd<6||out_<10||slope>0.6) continue;
    const score=clear-slope*5;
    if(!best||score>best.score)best={label,u:u0+du,v:v0+dv,clear:+clear.toFixed(1),route:+rd.toFixed(1),slope:+slope.toFixed(2),score};
  }
  out.push(best??{label,none:true});
}
console.log(JSON.stringify(out,null,0));
