import { kit, random } from './geometry.mjs';
// Ground-centred seeded flora, no runtime biological simulation.
export function build({species='nodules',seed=417,count=4,mature=false}={}){
 if(!['nodules','fungi'].includes(species)||!Number.isSafeInteger(seed)||!Number.isInteger(count)||count<2||count>9||typeof mature!=='boolean')throw Error('invalid flora settings');
 const k=kit(),r=random(seed),{orb,rod,ring}=k,m=mature?1.35:1;
 orb('stem',[0,.036*m,0],[.25*m,.036*m,.23*m],{sides:10,rows:5});
 for(let i=0;i<count;i++){
  const a=i*Math.PI*2/count+(r()-.5)*.45,d=(.065+r()*.20)*m,x=Math.cos(a)*d,z=Math.sin(a)*d;
  const root=[x,.04*m,z],mid=[x*1.12,.15*m,z*1.12],h=((species==='nodules'?.30:.17)+r()*(species==='nodules'?.29:.24))*m,top=[x*1.5,.08*m+h,z*1.46];
  rod('stem',[0,.031*m,0],root,.024*m,{sides:6});
  rod('dermal',root,mid,.026*m,{r2:.018*m,sides:7});rod('stem',mid,top,.017*m,{r2:.012*m,sides:7});
  if(species==='nodules'){
   const s=(.054+r()*.025)*m,cy=top[1]+s*.68,px=top[0],pz=top[2];
   orb('membrane',[px,top[1]-.012*m,pz],[s*1.12,s*.40,s*.95],{sides:10,rows:5});
   orb('amber',[px,cy,pz],[s*.68,s*1.0,s*.68],{sides:10,rows:7});
   // Four enclosing organic lobes leave visible gaps around the bioactive core.
   for(let j=0;j<4;j++){const p=a+j*Math.PI/2,dx=Math.cos(p),dz=Math.sin(p);
    rod('dermal',[px+dx*s*.45,top[1],pz+dz*s*.45],[px+dx*s*.90,cy+s*.48,pz+dz*s*.90],s*.16,{r2:s*.095,sides:6});
    orb('membrane',[px+dx*s*.77,cy+s*.07,pz+dz*s*.77],[s*.33,s*.63,s*.33],{sides:7,rows:5});
   }
   if(i%2===0){const side=[x*1.8,mid[1]+.07*m,z*1.8];rod('stem',mid,side,.011*m,{sides:6});orb('leaf',side,[.046*m,.018*m,.032*m],{sides:8,rows:5});}
  }else{
   const s=(.076+r()*.069)*m,px=top[0],pz=top[2],cy=top[1];
   orb('cap',[px,cy+.018*m,pz],[s,s*.38,s*.89],{sides:12,rows:7});
   orb('membrane',[px,cy-.013*m,pz],[s*.88,s*.14,s*.79],{sides:10,rows:5});
   // Thin segmented gill detail; tiny activity accents on selected caps.
   for(let j=0;j<6;j++){const p=j*Math.PI/3;rod('dermal',[px,cy-.020*m,pz],[px+Math.cos(p)*s*.72,cy-.020*m,pz+Math.sin(p)*s*.65],.0035*m,{sides:5});}
   if(i%2===0){orb('violet',[px+s*.24,cy+s*.32,pz],[s*.11,.006*m,s*.11],{sides:7,rows:4});}
  }
 }
 return k.parts;
}
