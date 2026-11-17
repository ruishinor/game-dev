import { kit, random } from './geometry.mjs';
// Ground: +Y out of ground; wall: +Z out of wall; pipe: Z-axis clearance.
export function build({variant='ground',seed=417,density=8}={}){
 if(!['ground','mature','wall','pipe'].includes(variant)||!Number.isSafeInteger(seed)||!Number.isInteger(density)||density<3||density>16)throw Error('invalid colony settings');
 const k=kit(),r=random(seed),{orb,rod,crystal}=k;
 const TAU=Math.PI*2,n=variant==='mature'?1.6:1;
 if(variant==='pipe'){
  // Wrap a pipe of about 0.25 m outer radius without a solid centre.
  for(let i=0;i<density;i++){
   const a=TAU*i/density+.1*(r()-.5),z=(r()-.5)*.75;
   const outward=[Math.cos(a),Math.sin(a),0],pos=[outward[0]*.32,outward[1]*.32,z];
   orb('dermal',pos,[.065,.065,.15],{sides:9,rows:5});
   orb('membrane',[outward[0]*.36,outward[1]*.36,z+.045],[.052,.052,.065],{sides:8,rows:5});
   const h=.13+r()*.35,tip=[outward[0]*(.32+h),outward[1]*(.32+h),z+(r()-.5)*.16];
   crystal(i%3?'crystal':'crystalDark',pos,tip,.044+r()*.055,{sides:5+i%2,r2:.024+r()*.025,tip:.05+r()*.065});
   const a2=a+TAU/density/2;
   rod('dermal',[outward[0]*.32,outward[1]*.32,z],[Math.cos(a2)*.34,Math.sin(a2)*.34,z+.06],.023,{sides:6});
  }
 }else{
  const nodes=[];
  orb('dermal',[0,.079*n,0],[.36*n,.079*n,.27*n],{sides:12,rows:6});
  for(let i=0;i<density;i++){
   const a=TAU*i/density+(r()-.5)*.43,d=(.16+r()*.38)*n,x=Math.cos(a)*d,z=Math.sin(a)*d*.75;
   const y=.07*n,base=[x,y,z];nodes.push(base);
   const s=(.095+r()*.073)*n;
   orb('dermal',base,[s,.065*n,s*.72],{sides:9,rows:5});
   orb('membrane',[x*.94,.115*n,z*.94],[s*.52,.045*n,s*.45],{sides:8,rows:5});
   const h=(.17+r()*.66)*n,l=(r()-.2)*.29*n;
   crystal(i%3?'crystal':'crystalDark',[x,.10*n,z],[x+Math.cos(a)*l,.10*n+h,z+Math.sin(a)*l],(.038+r()*.067)*n,{r2:(.020+r()*.043)*n,sides:5+i%2,tip:(.07+r()*.12)*n});
   if(i%3===0){const x2=x+.075*n,z2=z-.04*n;crystal('crystalDark',[x2,.082*n,z2],[x2-.07*n,.22*n+r()*.14*n,z2+.08*n],.035*n,{r2:.023*n,sides:5,tip:.07*n});}
   // Branching substrate connecting visible nodules without spanning empty air.
   const middle=[x*.43,.045*n,z*.43];rod('dermal',[0,.04*n,0],middle,.045*n,{sides:7});rod('membrane',middle,[x,.06*n,z],.028*n,{sides:7});
   if(i%4===0)rod('violet',[x*.50,.078*n,z*.50],[x*.86,.103*n,z*.86],.007*n,{sides:5});
  }
  for(let i=0;i<nodes.length;i++){const a=nodes[i],b=nodes[(i+1)%nodes.length];const mid=[(a[0]+b[0])*.39,.04*n,(a[2]+b[2])*.39];rod('dermal',[a[0],.04*n,a[2]],mid,.022*n,{sides:6});rod('dermal',mid,[b[0],.04*n,b[2]],.022*n,{sides:6});}
 }
 if(variant==='wall'){
  const rot=([x,y,z])=>[x,-z,y];
  for(const p of k.parts){if(p.center)p.center=rot(p.center);if(p.a)p.a=rot(p.a);if(p.b)p.b=rot(p.b);if(p.kind==='orb')p.size=[p.size[0],p.size[2],p.size[1]];}
 }
 return k.parts;
}
