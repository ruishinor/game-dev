import { clamp,add,scale,vec3,positive,unit,timing,validateFrame } from './common.js';
const AMBER=0xf2ab5f, BLUE=0x7bcadf, VIOLET=0xb498e8, UP=[0,1,0];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function kineticSampler({variant='charge',center=[0,0,0],direction=[0,0,1],radius=1,duration=1.4,charge=.65,reducedMotion=false}={}){
 if(!['charge','impact','resonance','survey'].includes(variant)||!Number.isFinite(charge)||charge<0||charge>1)throw Error('invalid kinetic options');
 const c=vec3(center),n=unit(direction);positive(radius,12);positive(duration,120);
 const u=unit(cross(Math.abs(n[1])>.95?[1,0,0]:UP,n)),v=cross(n,u);
 const basis=(x,y,z=0)=>add(add(add(c,scale(u,x)),scale(v,y)),scale(n,z));
 return t=>{
  const q=timing(t,duration,reducedMotion);if(!q)return [];const {p,fade}=q,f=[];
  const emit=(id,type,props,color,opacity)=>f.push({id,type,...props,color,opacity:clamp(opacity)*fade});
  const ring=(id,at,r,normal,color,alpha,arc=Math.PI*2)=>emit(id,'ring',{at,radius:r,normal,arc,tube:.012},color,alpha);
  if(variant==='charge'){
   const r=radius*(.55+.4*charge);ring('inner',c,r,n,AMBER,.57);ring('outer',c,r*1.2,n,AMBER,.27);
   // A moving indicator, not flicker or a damage calculation.
   if(!reducedMotion)for(let i=0;i<3;i++){const a=i*Math.PI*2/3+t*(1+charge);emit('packet'+i,'point',{at:basis(Math.cos(a)*r,Math.sin(a)*r),radius:.035+charge*.03},AMBER,.8);}
  }else if(variant==='impact'){
   const r=radius*(reducedMotion?.85:.15+.85*p);
   ring('shock',c,r,n,AMBER,.8*(1-p));ring('inner',c,r*.63,n,BLUE,.4*(1-p));
   if(!reducedMotion)for(let i=0;i<6;i++){const a=i*Math.PI/3,rad=radius*(.30+p*.72);const aa=basis(Math.cos(a)*rad,Math.sin(a)*rad,.06*p),bb=basis(Math.cos(a)*(rad+.12),Math.sin(a)*(rad+.12),.1*p);emit('fragment'+i,'beam',{a:aa,b:bb,radius:.012},AMBER,.66*(1-p));}
  }else if(variant==='resonance'){
   const count=reducedMotion?1:3;
   for(let i=0;i<count;i++){const phase=reducedMotion?.65:clamp(p*1.6-i*.22);ring('pulse'+i,c,radius*(.12+.88*phase),UP,VIOLET,.42*(1-phase)+.08);}
   if(!reducedMotion)ring('section',c,radius*(.3+.65*p),n,VIOLET,.25,Math.PI);
  }else{
   const base=add(c,scale(n,radius)),r=radius*.4;
   ring('surveyFoot',base,r,n,BLUE,.54);
   const count=reducedMotion?3:6;
   for(let i=0;i<count;i++){const a=i*Math.PI*2/count,edge=basis(Math.cos(a)*r,Math.sin(a)*r,radius);emit('ray'+i,'beam',{a:c,b:edge,radius:.009},BLUE,.28);}
   if(!reducedMotion){const z=radius*(.18+.75*p);ring('slice',basis(0,0,z),r*z/radius,n,BLUE,.38);}
  }
  return validateFrame(f);
 };
}
