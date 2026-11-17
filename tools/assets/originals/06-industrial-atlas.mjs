import { png } from './image.mjs';
// Original procedural PBR atlas. Base colour is sRGB; normal and ORM are linear.
export const materials=[
 {id:'ceramic',base:[172,166,150],metal:0,rough:171,wear:0.17},
 {id:'ochre_paint',base:[143,110,53],metal:0,rough:154,wear:0.22},
 {id:'graphite_steel',base:[60,69,73],metal:220,rough:125,wear:0.13},
 {id:'bare_alloy',base:[127,134,135],metal:238,rough:108,wear:0.10},
 {id:'technical_fabric',base:[70,75,69],metal:0,rough:220,wear:0.04},
 {id:'rubber',base:[34,39,39],metal:0,rough:232,wear:0.05},
 {id:'concrete',base:[136,131,119],metal:0,rough:223,wear:0.08},
 {id:'polymer',base:[92,87,78],metal:0,rough:183,wear:0.10}
];
const clamp=(x,a=0,b=255)=>Math.min(b,Math.max(a,Math.round(x)));
const fract=x=>x-Math.floor(x);
function hash(x,y,s){let n=Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(s,1274126177);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
function noise(u,v,period,seed){let x=u*period,y=v*period,i=Math.floor(x),j=Math.floor(y),a=fract(x),b=fract(y);a=a*a*(3-2*a);b=b*b*(3-2*b);const mod=k=>((k%period)+period)%period;let p=hash(mod(i),mod(j),seed),q=hash(mod(i+1),mod(j),seed),r=hash(mod(i),mod(j+1),seed),s=hash(mod(i+1),mod(j+1),seed);return (p+(q-p)*a)*(1-b)+(r+(s-r)*a)*b;}
function surface(u,v,m,i,seed){
 u=fract(u);v=fract(v);
 const n=noise(u,v,5,seed+i*31),grain=noise(u,v,31,seed+i*19+9),pits=noise(u,v,17,seed+i*13+42);
 const abrasion=noise(u,v,9,seed+i*111+19),micro=noise(u,v,53,seed+i*61+17);
 // Material-specific structure, not a universal grunge multiplier.
 const wave=(x,k)=>1-Math.abs(fract(x*k)*2-1);
 const chipped=(i===1||i===0)&&abrasion>.79&&grain>.52;
 const cloth=i===4?(wave(u,28)-.5)*(wave(v,28)-.5)*.12:0;
 const ribs=i===5?.028*(wave(u,12)-.5):0;
 const brushing=i===3?(wave(v+u/8,32)-.5)*.007:0;
 const scratch=(i===2||i===3)&&grain>.64&&wave(v+u/8,32)>.92;
 const pores=i===6?Math.max(0,.30-pits)*.14:0;
 const molded=i===7?(micro-.5)*.014:0;
 const h=.016*(n-.5)+.009*(grain-.5)+cloth+ribs+brushing+molded-(chipped?.017:0)-(scratch?.012:0)-pores;
 const c=chipped?[110,111,107]:m.base;
 const tone=(n-.5)*(i===6?38:12)+(grain-.5)*(i===6?18:8)+(cloth+ribs+brushing)*90-(pores*50)+(scratch?13:0);
 return {h,c:c.map(x=>clamp(x+tone)),occ:clamp(250-pores*700-(chipped?10:0)),rough:clamp(m.rough+(grain-.5)*(i===3?12:24)+(chipped?-35:0)+(scratch?-10:0)),metal:chipped?205:m.metal};
}
export function build({cell=128,gutter=6,seed=417}={}){
 if(![64,128].includes(cell)||!Number.isInteger(gutter)||gutter<4||gutter>cell/8||!Number.isSafeInteger(seed))throw Error('invalid atlas settings');
 const width=cell*4,height=cell*2,inner=cell-2*gutter;
 const base=new Uint8Array(width*height*3),normal=new Uint8Array(base.length),orm=new Uint8Array(base.length);
 for(let i=0;i<materials.length;i++){const m=materials[i],col=i%4,row=Math.floor(i/4);
  for(let y=0;y<cell;y++)for(let x=0;x<cell;x++){
   const wrap=k=>((k%inner)+inner)%inner;
   const u=wrap(x-gutter)/inner,v=wrap(y-gutter)/inner,eps=1/inner;
   const s=surface(u,v,m,i,seed),dx=(surface(u+eps,v,m,i,seed).h-surface(u-eps,v,m,i,seed).h)*2,dy=(surface(u,v+eps,m,i,seed).h-surface(u,v-eps,m,i,seed).h)*2;
   const len=Math.hypot(dx,dy,1),at=((row*cell+y)*width+col*cell+x)*3;
   base.set(s.c,at);normal.set([clamp(127.5-127.5*dx/len),clamp(127.5+127.5*dy/len),clamp(127.5+127.5/len)],at);orm.set([s.occ,s.rough,s.metal],at);
  }
 }
 const tiles=materials.map((m,i)=>({id:m.id,offset:[((i%4)*cell+gutter+.5)/width,(Math.floor(i/4)*cell+gutter+.5)/height],scale:[(inner-1)/width,(inner-1)/height],baseColorSpace:'sRGB',normalColorSpace:'linear',ormColorSpace:'linear'}));
 return {width,height,cell,gutter,seed,tiles,raw:{base,normal,orm},files:{base:png(width,height,base),normal:png(width,height,normal),orm:png(width,height,orm)}};
}
