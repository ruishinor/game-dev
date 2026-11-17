// Presentation only: local cut/contact bursts and ground-level predator impacts.
import {add,scale,unit,vec3,positive,timing,validateFrame} from './common.js';
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function faunaImpactSampler({center=[0,0,0],direction=[0,0,1],radius=.48,duration=.48,reducedMotion=false,variant='contact'}={}){
 if(!['contact','shear','wild'].includes(variant))throw Error('unknown fauna effect');
 const c=vec3(center),n=unit(direction);positive(radius,6);positive(duration,3);
 const u=unit(cross(Math.abs(n[1])>.95?[1,0,0]:[0,1,0],n)),v=cross(n,u);
 const ground=variant==='shear',colour=ground?0xc7a278:variant==='wild'?0xb28e59:0xe0b47d;
 const basis=(x,y,z=0)=>add(add(add(c,scale(u,x)),scale(v,y)),scale(n,z));
 return t=>{
  const q=timing(t,duration,reducedMotion);if(!q)return [];
  const {p,fade}=q,k=reducedMotion?.56:p,out=[];
  const ring=(id,r,opacity,arc)=>out.push({id,type:'ring',at:c,normal:n,radius:r,tube:.018,arc,color:colour,opacity:opacity*fade});
  ring('contact',radius*(.28+.65*k),.66,ground?Math.PI*2:Math.PI*1.35);
  if(!reducedMotion){
   const count=ground?6:4;
   for(let i=0;i<count;i++){
    const a=i*Math.PI*2/count+.24,rad=radius*(.22+.76*k),len=radius*.14;
    const aa=basis(Math.cos(a)*rad,Math.sin(a)*rad,radius*.1*k);
    const bb=basis(Math.cos(a)*(rad+len),Math.sin(a)*(rad+len),radius*.16*k);
    out.push({id:'chip'+i,type:'beam',a:aa,b:bb,radius:.012,color:colour,opacity:.57*fade});
   }
  }
  return validateFrame(out);
 };
}
