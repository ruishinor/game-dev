import { add,sub,scale,magnitude,unit,vec3,positive,timing,validateFrame,linkPoint } from './common.js';
const GREEN=0x83d4a7, TEAL=0x78c9ca, VIOLET=0xb29ce4, UP=[0,1,0];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function restorativeSampler({variant='restore',source=[0,0,0],target=[2,0,0],radius=.8,duration=2.2,reducedMotion=false}={}){
 if(!['restore','bond','transfer','stabilize'].includes(variant))throw Error('unknown restorative effect');
 const a=vec3(source),b=vec3(target);positive(radius,8);positive(duration,120);
 const d=sub(b,a),dist=magnitude(d),linked=['bond','transfer'].includes(variant);
 if(linked&&(dist<.15||dist>30))throw Error('invalid symbiotic link endpoints');
 const n=linked?unit(d):UP,axis=unit(cross(Math.abs(n[1])>.95?[1,0,0]:UP,n));
 const lift=(x,h)=>add(x,[0,h,0]);
 return t=>{
  const q=timing(t,duration,reducedMotion);if(!q)return [];const {p,fade}=q,f=[];
  const emit=(id,type,props,color,opacity)=>f.push({id,type,...props,color,opacity:opacity*fade});
  const ring=(id,at,r,color,alpha,normal=UP)=>emit(id,'ring',{at,radius:r,normal,tube:.012},color,alpha);
  const beam=(id,a,b,color,alpha,r=.012)=>emit(id,'beam',{a,b,radius:r},color,alpha);
  const point=(id,at,r,color,alpha)=>emit(id,'point',{at,radius:r},color,alpha);
  const datum=(prefix,at,r,color,count)=>{for(let i=0;i<count;i++){const theta=i*Math.PI*2/count,x=Math.cos(theta),z=Math.sin(theta);beam(prefix+i,add(at,[x*r*.87,0,z*r*.87]),add(at,[x*r*1.05,0,z*r*1.05]),color,.48,.009);}};
  if(variant==='restore'){
   ring('ground',b,radius,GREEN,.56);ring('inner',b,radius*.73,TEAL,.32);datum('root',b,radius,GREEN,4);
   ring('upper',lift(b,radius*.85),radius*.55,TEAL,.26);
   for(let i=0;i<4;i++){
    const theta=i*Math.PI/2+Math.PI/4,x=Math.cos(theta),z=Math.sin(theta);
    const lower=add(b,[x*radius*.75,radius*.08,z*radius*.75]),upper=add(b,[x*radius*.39,radius*.85,z*radius*.39]);
    beam('channel'+i,lower,upper,TEAL,.23,.009);
    if(!reducedMotion){const phase=(p+i*.25)%1;point('mote'+i,add(lower,scale(sub(upper,lower),phase)),.032,GREEN,.74);}
   }
  }else if(linked){
   const c=variant==='bond'?VIOLET:GREEN,aa=lift(a,.5),bb=lift(b,.5),s=Math.min(radius*.34,dist*.30,1.4);
   const bend=scale(axis,s);
   ring('source',a,radius*.48,c,.46);ring('target',b,radius*.65,c,.55);
   ring('sourceNode',aa,Math.min(radius*.12,.19),c,.52,n);ring('targetNode',bb,Math.min(radius*.16,.23),c,.65,n);
   // Bond has reciprocal channels; transfer has a single directed channel.
   const paths=variant==='bond'?[bend,scale(bend,-1)]:[scale(bend,.6)];
   for(let i=0;i<paths.length;i++){
    emit('link'+i,'linkCurve',{a:aa,b:bb,bend:paths[i],tube:i===0?.013:.010},i===0?c:TEAL,i===0?.64:.44);
    const count=reducedMotion?1:2;
    for(let j=0;j<count;j++){const phase=reducedMotion?.5:(p+j/count)%1,t=i===1?1-phase:phase;point('signal'+i+'_'+j,linkPoint(aa,bb,paths[i],t),.038,i===0?c:TEAL,.81);}
   }
  }else{
   emit('dome','hemisphere',{at:b,radius:radius*1.2,surface:'field',motion:!reducedMotion},TEAL,.39);
   ring('rim',b,radius*1.2,GREEN,.57);ring('datum',b,radius*.91,GREEN,.31);datum('anchor',b,radius*1.2,TEAL,4);
   const h=lift(b,radius*.75),s=Math.min(.15,radius*.32);
   beam('crossH',add(h,[-s,0,0]),add(h,[s,0,0]),GREEN,.65,.012);
   beam('crossV',add(h,[0,-s,0]),add(h,[0,s,0]),GREEN,.65,.012);
  }
  return validateFrame(f);
 };
}
