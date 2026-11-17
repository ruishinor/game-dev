import { kit } from './geometry.mjs';
// Curved shell carrier around a smooth biological core. Local +Z forward.
// Existing animated lens and four tendril attachment locations are preserved.
export function build(){
 const k=kit(),{box,orb,rod,ring}=k;
 function shell(material,start,arc,t0,t1,raise=0){
  const rows=raise?4:8,cols=raise?4:6,vertices=[],triangles=[],stride=cols+1,layer=(rows+1)*stride;
  for(let inner=0;inner<2;inner++)for(let i=0;i<=rows;i++)for(let j=0;j<=cols;j++){
   const t=t0+(t1-t0)*i/rows,f=j/cols,a=start+arc*f+.15*(t-.5),r=.145+.077*Math.sin(Math.PI*t)+raise-(inner?.016:0),ridge=.009*Math.sin(Math.PI*f)*Math.sin(Math.PI*t);
   vertices.push([(r+ridge)*Math.cos(a)*1.06,(r+ridge)*Math.sin(a)*.86,-.225+t*.365]);
  }
  const add=(a,b,c,d,flip=false)=>{triangles.push(flip?[a,c,b]:[a,b,c],flip?[a,d,c]:[a,c,d]);};
  for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){const a=i*stride+j,b=a+1,c=a+stride+1,d=a+stride;add(a,b,c,d);add(a+layer,b+layer,c+layer,d+layer,true);}
  for(let i=0;i<rows;i++){let a=i*stride,b=a+stride;add(a,b,b+layer,a+layer);a=i*stride+cols;b=a+stride;add(a,a+layer,b+layer,b);}
  for(let j=0;j<cols;j++){let a=j,b=a+1;add(a,a+layer,b+layer,b);a=rows*stride+j;b=a+1;add(a,b,b+layer,a+layer);}
  k.parts.push({kind:'mesh',material,vertices,triangles,smooth:true});
 }
 const hose=(m,pts,r)=>{for(let i=1;i<pts.length;i++)rod(m,pts[i-1],pts[i],r,{sides:8});};
 orb('frame',[0,0,-.10],[.176,.151,.133],{sides:18,rows:10,smooth:true});
 orb('dermal',[0,0,.012],[.174,.140,.141],{sides:22,rows:12,smooth:true});
 for(let i=0;i<4;i++){const a=i*Math.PI/2+.31; shell('ceramic',a,1.13,.10,.94);const x=Math.cos(a+.56),y=Math.sin(a+.56);
  shell(i===0||i===2?'ochre':'steel',a+.17,.52,.14,.39,.012);
  for(const t of [.24,.76]){const rr=.145+.077*Math.sin(Math.PI*t)+.013,z=-.225+t*.365;
   rod('steel',[x*rr*1.06,y*rr*.86,z],[x*(rr+.014)*1.06,y*(rr+.014)*.86,z],.009,{sides:8});}
  const a2=a+1.30;const pos=t=>{const r=.142+.065*Math.sin(Math.PI*t);return [r*Math.cos(a2)*1.06,r*Math.sin(a2)*.86,-.225+t*.365];};
  hose('black',[pos(.12),pos(.40),pos(.67),pos(.90)],.011);
  orb('membrane',[Math.cos(a2)*.155,Math.sin(a2)*.129,.095],[.034,.030,.032],{sides:10,rows:6,smooth:true});
 }
 rod('frame',[0,0,.108],[0,0,.17],.091,{sides:18,r2:.079});ring('steel',[0,0,.173],.077,.009,{sides:20,segments:6});
 rod('black',[0,0,.172],[0,0,.194],.067,{sides:18,r2:.058});ring('copper',[0,0,.194],.062,.007,{sides:20,segments:6});
 rod('screen',[0,0,.195],[0,0,.206],.052,{sides:20});for(const x of [-.109,.109]){
  box('frame',[x,-.043,.121],[.052,.037,.065]);rod('cyan',[x,-.043,.153],[x,-.043,.162],.010,{sides:10});
  for(let i=0;i<3;i++)box('steel',[x,(i-1)*.024,-.206],[.040,.008,.017]);
 }
 box('frame',[0,-.168,-.025],[.220,.068,.128]);box('ochre',[0,-.192,.039],[.176,.028,.036]);
 for(let i=0;i<4;i++){const x=(i-1.5)*.051,z=-.025+(i%2)*.045;rod('steel',[x,-.18,z],[x,-.211,z],.024,{sides:10});}
 rod('steel',[0,0,-.225],[0,.092,-.277],.012,{sides:10});rod('cyan',[0,.092,-.277],[0,.118,-.291],.008,{sides:10});
 return k.parts;
}
