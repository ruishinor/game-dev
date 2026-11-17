import { add,sub,scale,magnitude,vec3,positive,timing,validateFrame } from './common.js';
const GREEN=0x83d4a7, TEAL=0x78c9ca, VIOLET=0xb29ce4, UP=[0,1,0];
export function restorativeSampler({variant='restore',source=[0,0,0],target=[2,0,0],radius=.8,duration=2.2,reducedMotion=false}={}){
 if(!['restore','bond','transfer','stabilize'].includes(variant))throw Error('unknown restorative effect');
 const a=vec3(source),b=vec3(target);positive(radius,8);positive(duration,120);
 const d=sub(b,a),dist=magnitude(d);
 if(['bond','transfer'].includes(variant)&&(dist<.15||dist>30))throw Error('invalid symbiotic link endpoints');
 return t=>{
  const q=timing(t,duration,reducedMotion);if(!q)return [];const {p,fade}=q,f=[];
  const emit=(id,type,props,color,opacity)=>f.push({id,type,...props,color,opacity:opacity*fade});
  const ring=(id,at,r,color,alpha)=>emit(id,'ring',{at,radius:r,normal:UP,tube:.012},color,alpha);
  const beam=(id,a,b,color,alpha,r=.012)=>emit(id,'beam',{a,b,radius:r},color,alpha);
  const lift=(x,h)=>add(x,[0,h,0]);
  if(variant==='restore'){
   ring('ground',b,radius,GREEN,.58);ring('upper',lift(b,radius*.85),radius*.55,TEAL,.28);
   if(!reducedMotion)for(let i=0;i<5;i++){const phase=(p+i*.19)%1,a=i*Math.PI*2/5+p*.8;emit('mote'+i,'point',{at:add(b,[Math.cos(a)*radius*.55,.1+phase*radius*1.45,Math.sin(a)*radius*.55]),radius:.035},GREEN,.65);}
  }else if(variant==='bond'||variant==='transfer'){
   const c=variant==='bond'?VIOLET:GREEN;
   ring('source',a,radius*.48,c,.46);ring('target',b,radius*.65,c,.55);
   const aa=lift(a,.5),bb=lift(b,.5);
   beam('link',aa,bb,c,.50,.018);
   if(variant==='bond'&&!reducedMotion){beam('secondary',lift(a,.58),lift(b,.58),TEAL,.22,.009);}
   const count=reducedMotion?1:3;
   for(let i=0;i<count;i++){const phase=reducedMotion?.5:(p+i/count)%1;emit('signal'+i,'point',{at:add(aa,scale(d,phase)),radius:.045},c,.85);}
  }else{
   emit('dome','hemisphere',{at:b,radius:radius*1.2},TEAL,.10);
   ring('rim',b,radius*1.2,GREEN,.66);
   const h=lift(b,radius*.75);
   beam('crossH',add(h,[-.15,0,0]),add(h,[.15,0,0]),GREEN,.7,.016);
   beam('crossV',add(h,[0,-.15,0]),add(h,[0,.15,0]),GREEN,.7,.016);
  }
  return validateFrame(f);
 };
}
