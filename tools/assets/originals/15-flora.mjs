import { kit,random } from './geometry.mjs';
import { sweep } from './organic-shapes.mjs';
// Ground-attached flora. Original seeded shapes, no simulated growth or harvesting.
export function build({species='nodules',seed=417,count=4,mature=false}={}){
 if(!['nodules','fungi'].includes(species)||!Number.isSafeInteger(seed)||!Number.isInteger(count)||count<2||count>9||typeof mature!=='boolean')throw Error('invalid flora settings');
 const k=kit(),r=random(seed),m=mature?1.35:1,TAU=Math.PI*2;
 const orb=(mat,p,s)=>k.orb(mat,p,s,{sides:10,rows:7,smooth:true});
 // A closed flattened petal, curved radially upward/inward around the core.
 function petal(p,a,s,bend){
  const vertices=[],triangles=[],rows=8,n=8;
  const radial=[Math.cos(a),0,Math.sin(a)],side=[-radial[2],0,radial[0]];
  const center=t=>p.map((v,i)=>v+radial[i]*s*(.25+1.01*Math.sin(t*Math.PI*.80))+(i===1?s*(1.83*t+.13*Math.sin(t*Math.PI)):0));
  vertices.push(center(0));
  for(let i=1;i<rows;i++){const t=i/rows,c=center(t),w=s*(.35+.12*bend)*Math.pow(Math.sin(t*Math.PI),.8),th=s*.045*Math.sin(t*Math.PI);
   for(let j=0;j<n;j++){const theta=j*TAU/n;vertices.push(c.map((v,d)=>v+side[d]*w*Math.cos(theta)+(d===1?th*Math.sin(theta)*.45:radial[d]*th*Math.sin(theta))));}
  }
  const top=vertices.push(center(1))-1;
  // Consistent closed winding, selected by signed volume to make normals outward.
  for(let j=0;j<n;j++){const q=(j+1)%n;triangles.push([0,1+q,1+j]);for(let i=0;i<rows-2;i++){const x=1+i*n+j,y=1+i*n+q;triangles.push([x,y,y+n],[x,y+n,x+n]);}const x=1+(rows-2)*n;triangles.push([top,x+j,x+q]);}
  pushClosed('bioRidge',vertices,triangles);
 }
 function pushClosed(material,vertices,triangles){
  let volume=0;for(const ids of triangles){const [a,b,c]=ids.map(i=>vertices[i]);volume+=a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]);}
  if(volume<0)for(const t of triangles)[t[1],t[2]]=[t[2],t[1]];
  k.parts.push({kind:'mesh',material,vertices,triangles,smooth:true});
 }
 function capGeometry(p,s,phase){
  // Wavy ear-shaped cap with recessed underside and slightly convex upper surface.
  const vertices=[],triangles=[],n=20,rows=3;
  for(let layer=0;layer<2;layer++){
   vertices.push([p[0],p[1]+s*(layer?-.035:.40),p[2]]);
   for(let j=1;j<=rows;j++){const t=j/rows;for(let i=0;i<n;i++){
    const a=i*TAU/n,rad=s*t*(1+.10*Math.cos(3*a+phase)+.055*Math.sin(5*a));
    const edge=s*(.065*Math.sin(3*a+phase)+.045*Math.cos(5*a))*t*t;
    vertices.push([p[0]+rad*Math.cos(a),p[1]+s*(layer?-.035+.105*t:.40-.27*t*t)+edge,p[2]+rad*Math.sin(a)*.82]);
   }}
  }
  const layer=1+n*rows;
  for(let j=0;j<n;j++){const q=(j+1)%n;triangles.push([0,1+q,1+j],[layer,layer+1+j,layer+1+q]);
   for(let i=0;i<rows-1;i++){const x=1+i*n+j,y=1+i*n+q;triangles.push([x,y,y+n],[x,y+n,x+n],[x+layer,y+n+layer,y+layer],[x+layer,x+n+layer,y+n+layer]);}
   const x=1+(rows-1)*n+j,y=1+(rows-1)*n+q;triangles.push([x,y,x+layer],[y,y+layer,x+layer]);
  }
  pushClosed('cap',vertices,triangles);
  // Separate raised gills on the underside; narrow, non-emissive ridges.
  for(let i=0;i<12;i++){const a=i*TAU/12,dir=[Math.cos(a),0,Math.sin(a)*.82];
   const pt=t=>[p[0]+dir[0]*s*t,p[1]+s*(-.06+.13*t),p[2]+dir[2]*s*t];
   sweep(k,'gill',[pt(.15),pt(.52),pt(.84)],[s*.018,s*.020,s*.007],5);
  }
 }
 orb('biofilm',[0,.026*m,0],[.18*m,.026*m,.16*m]);
 const offset=r()*TAU;
 for(let i=0;i<count;i++){
  const a=offset+i*TAU/count+(r()-.5)*.42,d=(.08+r()*.19)*m,x=Math.cos(a)*d,z=Math.sin(a)*d;
  const h=((species==='nodules'?.27:.13)+r()*(species==='nodules'?.30:.27))*m,root=[x,.035*m,z],top=[x*1.40,.05*m+h,z*1.40],mid=[x*1.2,.04*m+h*.47,z*1.13];
  sweep(k,'biofilm',[[0,.028*m,0],[x*.52,.025*m,z*.52],root],[.026*m,.020*m,.025*m],6);
  sweep(k,'stem',[root,[x*.96,.075*m,z*1.14],mid,[x*1.38,.05*m+h*.78,z*1.22],top],[.026*m,.023*m,.019*m,.016*m,.020*m],8);
  if(i%2===0){const end=[x+Math.cos(a+.7)*.17*m,.009*m,z+Math.sin(a+.7)*.17*m];sweep(k,'bioRidge',[root,[(root[0]+end[0])*.5,.016*m,(root[2]+end[2])*.5],end],[.020*m,.012*m,.004*m],6);}
  if(species==='nodules'){
   const s=(.052+r()*.032)*m;orb('biofilm',top,[s*.72,s*.25,s*.72]);
   orb('noduleCore',[top[0],top[1]+s*.82,top[2]],[s*.68,s*.87,s*.68]);
   for(let j=0;j<3;j++)petal(top,a+j*TAU/3+(r()-.5)*.20,s,.4+r()*.6);
   if(i%2===0){const p=[mid[0]+Math.cos(a+.9)*.085*m,mid[1]+.025*m,mid[2]+Math.sin(a+.9)*.085*m];sweep(k,'stem',[mid,p],[.014*m,.005*m],6);orb('leaf',p,[.037*m,.013*m,.028*m]);}
  }else{
   const s=(.075+r()*.078)*m;capGeometry(top,s,a);
   if(i%3===0){const p=[top[0]+s*.21,top[1]+s*.35,top[2]];orb('violet',p,[s*.07,s*.036,s*.07]);}
  }
 }
 return k.parts;
}
