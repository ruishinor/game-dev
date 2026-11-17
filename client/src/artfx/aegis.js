import { add,sub,scale,magnitude,vec3,positive,timing,validateFrame,spanPoint } from './common.js';
const BLUE=0x78d6ec, AMBER=0xefb86f, VIOLET=0xb99be8;
export function aegisSampler({variant='base',center=[0,0,0],anchor=null,yaw=0,radius=1.6,duration=3,reducedMotion=false}={}){
 if(!['base','hinge','span','lattice','relay'].includes(variant)||!Number.isFinite(yaw))throw Error('invalid Aegis variant');
 const c=vec3(center);positive(radius,12);positive(duration,120);
 const n=[Math.sin(yaw),0,Math.cos(yaw)],right=[Math.cos(yaw),0,-Math.sin(yaw)],up=[0,1,0];
 let b=null,delta=null,dist=0;
 if(variant==='span'||variant==='relay'){b=vec3(anchor);delta=sub(b,c);dist=magnitude(delta);if(dist<.3||dist>30)throw Error('invalid Aegis anchor distance');}
 const at=(x,y,z=0)=>add(add(add(c,scale(right,x)),scale(up,y)),scale(n,z));
 return t=>{
  const time=timing(t,duration,reducedMotion);if(!time)return [];const {fade,pulse}=time,f=[];
  const emit=(id,type,props,color,opacity)=>f.push({id,type,...props,color,opacity:opacity*fade});
  const ring=(id,at,r,normal,color=BLUE,alpha=.55,arc=Math.PI*2)=>emit(id,'ring',{at,radius:r,normal,arc,tube:.012},color,alpha);
  const beam=(id,a,b,color,alpha=.7)=>emit(id,'beam',{a,b,radius:.018},color,alpha);
  if(variant==='base'){
   emit('dome','hemisphere',{at:c,radius:radius*pulse,surface:'field',motion:!reducedMotion},BLUE,.67);
   ring('rim',c,radius*pulse,up,BLUE,.7);
   if(!reducedMotion)for(let i=0;i<3;i++){let a=Math.PI*i/3+yaw;ring('arch'+i,c,radius*pulse,[Math.sin(a),0,Math.cos(a)],BLUE,.34,Math.PI);}
  }else if(variant==='hinge'){
   const q=at(0,radius*.75,radius*.55),w=radius*1.55,h=radius*1.45;
   emit('shield','panel',{at:q,width:w,height:h,normal:n,surface:'field',motion:!reducedMotion},AMBER,.70);
   const corners=[at(-w/2,radius*.75-h/2,radius*.55),at(w/2,radius*.75-h/2,radius*.55),at(w/2,radius*.75+h/2,radius*.55),at(-w/2,radius*.75+h/2,radius*.55)];
   for(let i=0;i<4;i++)beam('edge'+i,corners[i],corners[(i+1)%4],AMBER);
  }else if(variant==='span'){
   const horizontal=[delta[0],0,delta[2]],hd=magnitude(horizontal);
   // Keep the vertical fallback; a nearly vertical pair cannot define a useful field width.
   if(hd<.25||radius*1.4<=.12){beam('verticalLink',add(c,[0,.3,0]),add(b,[0,.3,0]),VIOLET);ring('source',c,radius*.45,up,VIOLET);ring('target',b,radius*.45,up,VIOLET);}
   else{
    const norm=[-horizontal[2]/hd,0,horizontal[0]/hd],height=radius*1.4,bow=Math.min(.48,hd*.16,radius*.3);
    const p=(u,v)=>spanPoint(c,b,height,bow,u,v);
    emit('spanPanel','span',{a:c,b,height,bow,surface:'field',motion:!reducedMotion},VIOLET,.70);
    // The shader mesh and perimeter use the same curve, including sloped anchor heights.
    for(let i=0;i<16;i++){const u=i/16,v=(i+1)/16;beam('lower'+i,p(u,0),p(v,0),VIOLET,.48);beam('upper'+i,p(u,1),p(v,1),VIOLET,.64);}
    ring('source',c,radius*.45,up,VIOLET);ring('target',b,radius*.45,up,VIOLET);
    for(const [id,u] of [['source',0],['target',1]]){beam(id+'Post',p(u,0),p(u,1),VIOLET,.54);ring(id+'Node',p(u,1),.13,norm,VIOLET,.67);}
    if(!reducedMotion)emit('spanSignal','point',{at:p(time.p,1),radius:.046},BLUE,.75);
   }
  }else if(variant==='lattice'){
   for(let i=0;i<3;i++){const x=(i-1)*radius*.78,q=at(x,radius*.65,radius*.45),w=radius*.74,h=radius*1.3;
    emit('panel'+i,'panel',{at:q,width:w,height:h,normal:n,surface:'field',motion:!reducedMotion},BLUE,.63);
    beam('post'+i,at(x-w/2,0,radius*.45),at(x-w/2,h,radius*.45),BLUE,.65);
    beam('cap'+i,at(x-w/2,h,radius*.45),at(x+w/2,h,radius*.45),BLUE,.65);
   }
   beam('lastPost',at(radius*1.15,0,radius*.45),at(radius*1.15,radius*1.3,radius*.45),BLUE,.65);
  }else{
   ring('source',c,radius*.55,up,AMBER,.62);ring('target',b,radius*.55,up,AMBER,.62);
   beam('relay',add(c,[0,.45,0]),add(b,[0,.45,0]),AMBER,.45);
   emit('packet','point',{at:add(add(c,scale(delta,reducedMotion?.5:time.p)),[0,.45,0]),radius:.075},AMBER,.9);
  }
  return validateFrame(f);
 };
}
