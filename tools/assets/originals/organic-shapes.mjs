// Closed organic swept meshes. Coordinates in metres; no runtime simulation.
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,k)=>a.map(v=>v*k);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const l=Math.hypot(...a);if(l<1e-8)throw Error('zero sweep tangent');return mul(a,1/l);};
export function sweep(k,material,points,radii,sides=6){
 if(points.length!==radii.length||points.length<2||sides<5||radii.some(r=>!Number.isFinite(r)||r<=0))throw Error('invalid sweep');
 const vertices=[],triangles=[],dir=unit(sub(points.at(-1),points[0])),ref=Math.abs(dir[1])>.7?[1,0,0]:[0,1,0];
 for(let i=0;i<points.length;i++){
  const w=unit(sub(points[Math.min(i+1,points.length-1)],points[Math.max(i-1,0)])),u=unit(cross(ref,w)),v=cross(w,u);
  for(let j=0;j<sides;j++){const a=j*2*Math.PI/sides;vertices.push(add(points[i],mul(add(mul(u,Math.cos(a)),mul(v,Math.sin(a))),radii[i])));}
 }
 for(let i=0;i<points.length-1;i++)for(let j=0;j<sides;j++){const a=i*sides+j,b=i*sides+(j+1)%sides,c=b+sides,d=a+sides;triangles.push([a,b,c],[a,c,d]);}
 const lo=vertices.push(points[0])-1,hi=vertices.push(points.at(-1))-1,last=(points.length-1)*sides;
 for(let j=0;j<sides;j++){const q=(j+1)%sides;triangles.push([lo,q,j],[hi,last+j,last+q]);}
 k.parts.push({kind:'mesh',material,vertices,triangles,smooth:true});
}
export function shard(k,material,base,axis,height,radius,random){
 const w=unit(axis),ref=Math.abs(w[1])>.85?[1,0,0]:[0,1,0],u=unit(cross(ref,w)),v=cross(w,u),n=6,vertices=[],triangles=[],twist=(random()-.5)*.25,scales=Array.from({length:n},()=>.77+random()*.46);
 for(let ring=0;ring<3;ring++)for(let j=0;j<n;j++){
  const a=j*2*Math.PI/n+ring*twist,t=[0,.62,.86][ring],r=radius*scales[j]*[.78,1,.75][ring];vertices.push(add(add(base,mul(w,height*t)),mul(add(mul(u,Math.cos(a)),mul(v,Math.sin(a))),r)));
 }
 for(let i=0;i<2;i++)for(let j=0;j<n;j++){const a=i*n+j,b=i*n+(j+1)%n;triangles.push([a,b,b+n],[a,b+n,a+n]);}
 const lo=vertices.push(base)-1,hi=vertices.push(add(add(base,mul(w,height)),mul(u,radius*(random()-.5)*.40)))-1;
 for(let j=0;j<n;j++){const q=(j+1)%n;triangles.push([lo,q,j],[hi,2*n+j,2*n+q]);}
 k.parts.push({kind:'mesh',material,vertices,triangles});
}
