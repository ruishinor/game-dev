// Server-only, bounded planar navigation for future ground companions.
// The current airborne Mender never calls this module. No new live entity,
// movement override, teleport, baked navmesh or client authority is introduced.
import { WORLD, COLLIDERS, OBJECTS, RIFT_ANNEX, SEVERANCE_POCKET, SILENT_FOUNDRY } from '../../shared/world.js';

const OBSTACLES=Object.freeze([...COLLIDERS,...OBJECTS.filter(o=>!o.embedded)].map(o=>Object.freeze(o.r!==undefined?{x:o.x,z:o.z,r:o.r}:{x:o.x,z:o.z,hw:o.hw,hd:o.hd})));
const LIMIT=WORLD.radius-6, PAD=.035, CELL=.8, MAX_DISTANCE=32, MAX_NODES=1400, REPLAN_MS=900;
const valid=p=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
const radiusOk=r=>Number.isFinite(r)&&r>=.15&&r<=1.5;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const copy=p=>({x:p.x,z:p.z});
// Walkable regions: the Reach basin and the disconnected areas reached by travel
// (Phase Annex, Severance Expanse). Each is bounded the way movement clamps it.
const inRect=(p,r,x,z,hw,hd)=>Math.abs(p.x-x)<=hw-r-PAD&&Math.abs(p.z-z)<=hd-r-PAD;
const P=SEVERANCE_POCKET,A=RIFT_ANNEX,SF=SILENT_FOUNDRY;
const inWorld=(p,r)=>valid(p)&&(Math.hypot(p.x,p.z)<=LIMIT-r-PAD||inRect(p,r,P.x,P.z,P.hw-P.rim,P.hd-P.rim)||inRect(p,r,A.x,A.z,A.hw,A.hd)||inRect(p,r,SF.x,SF.z,SF.hw,SF.hd));
function nearObstacles(a,b,r,obstacles){
 const pad=r+PAD;
 return obstacles.filter(o=>{
   const hw=o.r??o.hw,hd=o.r??o.hd;
   return o.x+hw+pad>=Math.min(a.x,b.x)&&o.x-hw-pad<=Math.max(a.x,b.x)&&o.z+hd+pad>=Math.min(a.z,b.z)&&o.z-hd-pad<=Math.max(a.z,b.z);
 });
}
function clear(a,b,r,obstacles){
 if(!inWorld(a,r)||!inWorld(b,r))return false;
 const dx=b.x-a.x,dz=b.z-a.z,len=dx*dx+dz*dz,pad=r+PAD;
 for(const o of nearObstacles(a,b,r,obstacles)){
   if(o.r!==undefined){
     const t=len>1e-12?Math.max(0,Math.min(1,((o.x-a.x)*dx+(o.z-a.z)*dz)/len)):0;
     if((a.x+dx*t-o.x)**2+(a.z+dz*t-o.z)**2<=(o.r+pad)**2)return false;
   }else{
     // Conservative square expansion at corners, unlike permissive point LOS.
     let lo=0,hi=1;
     for(const [s,v,c,h] of [[a.x,dx,o.x,o.hw+pad],[a.z,dz,o.z,o.hd+pad]]){
       if(Math.abs(v)<1e-10){if(s<c-h||s>c+h){lo=1;hi=0;break;}}
       else {const t0=(c-h-s)/v,t1=(c+h-s)/v;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));if(lo>hi)break;}
     }
     if(lo<=hi)return false;
   }
 }
 return true;
}
export function groundSegmentClear(a,b,radius,obstacles=OBSTACLES){
 return radiusOk(radius)&&clear(a,b,radius,obstacles);
}
const NEIGHBORS=[[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[-1,-1],[1,-1]];
// Deterministic local A*. Returns null rather than tunnelling/teleporting.
// A straight path is handled without allocation of a search grid.
export function findGroundRoute(start,goal,radius,obstacles=OBSTACLES){
 if(!radiusOk(radius)||!inWorld(start,radius)||!inWorld(goal,radius)||distance(start,goal)>MAX_DISTANCE)return null;
 if(!clear(start,start,radius,obstacles)||!clear(goal,goal,radius,obstacles))return null;
 if(clear(start,goal,radius,obstacles))return [copy(goal)];
 const bounds={x0:Math.min(start.x,goal.x)-9,x1:Math.max(start.x,goal.x)+9,z0:Math.min(start.z,goal.z)-9,z1:Math.max(start.z,goal.z)+9};
 const local=nearObstacles({x:bounds.x0,z:bounds.z0},{x:bounds.x1,z:bounds.z1},radius,obstacles);
 const key=(x,z)=>x+','+z;
 const nodes=new Map(),closed=new Set(),open=[];
 const first={x:start.x,z:start.z,ix:0,iz:0,g:0,f:distance(start,goal),parent:null,key:key(0,0)};
 nodes.set(first.key,first);open.push(first);
 let expanded=0;
 while(open.length&&expanded<MAX_NODES){
   let best=0;for(let j=1;j<open.length;j++)if(open[j].f<open[best].f-1e-9||(Math.abs(open[j].f-open[best].f)<1e-9&&open[j].g>open[best].g))best=j;
   const current=open.splice(best,1)[0];
   if(closed.has(current.key)||nodes.get(current.key)!==current)continue;
   closed.add(current.key);expanded++;
   if(distance(current,goal)<=CELL*1.8&&clear(current,goal,radius,local)){
     const path=[copy(goal)];let n=current;while(n.parent){path.push(copy(n));n=n.parent;}path.reverse();
     // String-pull only along the same swept-footprint test.
     const smooth=[];let from=start,i=0;
     while(i<path.length){let next=path.length-1;while(next>i&&!clear(from,path[next],radius,local))next--;if(!clear(from,path[next],radius,local))return null;smooth.push(path[next]);from=path[next];i=next+1;}
     return smooth;
   }
   for(const [dx,dz] of NEIGHBORS){
     const ix=current.ix+dx,iz=current.iz+dz,k=key(ix,iz);
     if(closed.has(k))continue;
     const p={x:start.x+ix*CELL,z:start.z+iz*CELL};
     if(p.x<bounds.x0||p.x>bounds.x1||p.z<bounds.z0||p.z>bounds.z1||!clear(current,p,radius,local))continue;
     const g=current.g+CELL*Math.hypot(dx,dz),prev=nodes.get(k);
     if(prev&&g>=prev.g-1e-9)continue;
     const next={...p,ix,iz,g,f:g+distance(p,goal),parent:current,key:k};nodes.set(k,next);open.push(next);
   }
 }
 return null;
}

// The caller owns lifecycle, leash, motion state and authoritative goal.
// Holds position if no route is available; a failed search is rate limited.
export function advanceGroundCompanion(actor,nav,target,{now,dt,speed,radius},obstacles=OBSTACLES){
 if(!valid(actor)||!valid(target)||!radiusOk(radius)||!Number.isFinite(now)||!Number.isFinite(dt)||dt<=0||dt>.25||!Number.isFinite(speed)||speed<=0||speed>15)return 0;
 if(distance(actor,target)>MAX_DISTANCE){nav.route=[];nav.goal=null;return 0;}
 if(clear(actor,target,radius,obstacles)){nav.route=[copy(target)];nav.goal=copy(target);}
 else if(!nav.goal||distance(nav.goal,target)>1.2||!nav.route?.length){
   if(now<(nav.nextPlan??0))return 0;
   nav.nextPlan=now+REPLAN_MS;nav.goal=copy(target);nav.route=findGroundRoute(actor,target,radius,obstacles)??[];
 }
 while(nav.route?.length&&distance(actor,nav.route[0])<.04)nav.route.shift();
 const next=nav.route?.[0];if(!next)return 0;
 const d=distance(actor,next),step=Math.min(d,speed*dt);
 const p={x:actor.x+(next.x-actor.x)*step/d,z:actor.z+(next.z-actor.z)*step/d};
 if(!clear(actor,p,radius,obstacles)){nav.route=[];nav.goal=null;return 0;}
 actor.yaw=Math.atan2(p.x-actor.x,p.z-actor.z);actor.x=p.x;actor.z=p.z;return step;
}
