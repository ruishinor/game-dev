import { kit, random } from './geometry.mjs';
import { sweep,shard } from './organic-shapes.mjs';
export function build({variant='ground',seed=417,density=8}={}){
 if(!['ground','mature','wall','pipe'].includes(variant)||!Number.isSafeInteger(seed)||!Number.isInteger(density)||density<3||density>16)throw Error('invalid colony settings');
 const k=kit(),r=random(seed),m=variant==='mature'?1.6:1,TAU=Math.PI*2;
 const orb=(mat,p,s)=>k.orb(mat,p,s,{sides:8,rows:5,smooth:true});
 const tube=(mat,p,width)=>sweep(k,mat,p,width,6);
 const a0=r()*TAU;
 if(variant==='pipe'){
  const nodes=[];
  for(let i=0;i<density;i++){
   const a=a0+TAU*i/density+(r()-.5)*.12,z=(r()-.5)*.62,rad=.355,p=[Math.cos(a)*rad,Math.sin(a)*rad,z];nodes.push({a,z});
   orb('biofilm',p,[.061,.061,.102]);orb('bioRidge',[Math.cos(a)*.389,Math.sin(a)*.389,z+.035],[.043,.043,.052]);
   shard(k,i%3?'mineral':'mineralDark',p,[Math.cos(a),Math.sin(a),(r()-.5)*.48],.22+r()*.40,.033+r()*.04,r);
   if(i%3===0)shard(k,'mineralDark',[p[0],p[1],z-.06],[Math.cos(a+.2),Math.sin(a+.2),-.24],.13+r()*.18,.025+r()*.018,r);
  }
  for(let i=0;i<density;i++){
   const a=nodes[i],b=nodes[(i+1)%density],end=b.a<=a.a?b.a+TAU:b.a;
   for(const offset of [-.060,.060]){
    const pts=Array.from({length:5},(_,j)=>{const t=j/4,ang=a.a+(end-a.a)*t,rad=.351+.025*Math.sin(Math.PI*t);return [Math.cos(ang)*rad,Math.sin(ang)*rad,a.z+(b.z-a.z)*t+offset*Math.sin(Math.PI*t)];});
    tube('biofilm',pts,[.018,.017,.022,.017,.018]);
   }
  }
 }else{
  const nodes=[],hub=[0,.059*m,0];orb('biofilm',hub,[.21*m,.059*m,.18*m]);
  for(let i=0;i<density;i++){
   const a=a0+TAU*i/density+(r()-.5)*.46,dist=(.24+r()*.33)*m,x=Math.cos(a)*dist,z=Math.sin(a)*dist*.77,p=[x,.069*m,z];nodes.push(p);
   const s=(.075+r()*.063)*m;orb(i%3?'biofilm':'bioRidge',p,[s,.062*m,s*.78]);
   orb('membrane',[x*.94,.125*m,z*.94],[s*.60,.038*m,s*.45]);
   const height=(i%4===0?.58+r()*.37:.16+r()*.47)*m,lean=.12+r()*.43;
   shard(k,i%3?'mineral':'mineralDark',[x,.105*m,z],[Math.cos(a)*lean,1,Math.sin(a)*lean],height,(.035+r()*.057)*m,r);
   if(i%2===0)shard(k,'mineralDark',[x+.05*m,.07*m,z-.035*m],[Math.cos(a-.8)*.65,.65,Math.sin(a-.8)*.65],(.16+r()*.26)*m,(.025+r()*.025)*m,r);
   tube('biofilm',[hub,[x*.25,.045*m,z*.28],[x*.65,.049*m,z*.70],p],[.039*m,.024*m,.025*m,.033*m]);
   if(i%2===0)for(const q of [-1,1]){
    const end=[x+Math.cos(a+q*.52)*.23*m,.014*m,z+Math.sin(a+q*.52)*.21*m];
    tube('bioRidge',[p,[(p[0]+end[0])*.5+q*z*.07,.034*m,(p[2]+end[2])*.5-q*x*.07],end],[.024*m,.014*m,.0045*m]);
   }
  }
  for(let i=0;i<density;i++){
   const a=nodes[i],b=nodes[(i+1)%density];
   for(const side of [-1,1]){
    const pts=Array.from({length:4},(_,j)=>{const t=j/3,p=a.map((v,k)=>v+(b[k]-v)*t),bend=Math.sin(Math.PI*t);return [p[0]*(1+.18*side*bend),(.069+(side===1?.125:.012)*bend)*m,p[2]*(1+.18*side*bend)];});
    tube(side===1?'bioRidge':'biofilm',pts,[.018*m,.013*m,.013*m,.018*m]);
   }
  }
 }
 if(variant==='wall'){
  const rot=([x,y,z])=>[x,-z,y];
  for(const p of k.parts){if(p.center)p.center=rot(p.center);if(p.kind==='orb')p.size=[p.size[0],p.size[2],p.size[1]];if(p.vertices)p.vertices=p.vertices.map(rot);}
 }
 return k.parts;
}
