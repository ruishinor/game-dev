// Low-profile visual ecology. Ground-conforming, no harvesting or collision.
import { mergeGeometries } from './gear-kit.js';
export function buildSinterColonies(T,sites,groundHeight,rng){
 const root=new T.Group();root.name='sinter:habitats';
 const materials=[
   new T.MeshStandardMaterial({color:0x6e7259,roughness:.94}),
   new T.MeshStandardMaterial({color:0x98957b,roughness:.83}),
   new T.MeshStandardMaterial({color:0x4f5c43,roughness:.91}),
   new T.MeshStandardMaterial({color:0xb5ad91,roughness:.72,metalness:.06})
 ];
 const batches=(site,name)=>{const g=new T.Group();g.name='sinter:'+name;g.position.set(site.x,0,site.z);root.add(g);const parts=materials.map(()=>[]);
   const add=(m,geo)=>{const p=geo.getAttribute('position');for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);p.setY(i,y+groundHeight(x+site.x,z+site.z));}p.needsUpdate=true;geo.computeVertexNormals();parts[m].push(geo)};
   const nodule=(m,x,z,a,b,h,rot)=>{const geo=new T.IcosahedronGeometry(1,1);geo.scale(a,h,b).rotateY(rot).translate(x,h*.56,z);add(m,geo)};
   const runner=(m,x,z,xx,zz,r)=>{const mx=(x+xx)/2,mz=(z+zz)/2;const curve=new T.CatmullRomCurve3([new T.Vector3(x,.014,z),new T.Vector3(mx,.032,mz),new T.Vector3(xx,.018,zz)]);add(m,new T.TubeGeometry(curve,6,r,6,false))};
   const finish=()=>{for(let i=0;i<parts.length;i++)if(parts[i].length){const geo=mergeGeometries(T,parts[i]);parts[i].forEach(p=>p.dispose());const mesh=new T.Mesh(geo,materials[i]);mesh.receiveShadow=true;g.add(mesh)}};
   return {add,nodule,runner,finish};
 };
 const nursery=batches(sites.nursery,'nursery'),random=rng(17119);
 // Interrupted crescent retains open south-west approach; interconnected flat
 // nodules with runners like a mineral-bound organic crust, not a fence.
 for(let i=0;i<11;i++){
   if(i>=6&&i<=8)continue;
   const a=i*Math.PI*2/11,x=Math.cos(a)*1.1,z=Math.sin(a)*.82;
   nursery.nodule(0,x,z,.26,.34,.10,-a);
   nursery.nodule(1,x+Math.cos(a)*.07,z+Math.sin(a)*.07,.15,.19,.075,a);
   nursery.nodule(2,x*.79,z*.79,.10,.14,.045,a);
   if(i!==5&&i!==10){const b=(i+1)*Math.PI*2/11;nursery.runner(2,x,z,Math.cos(b)*1.1,Math.sin(b)*.82,.025)}
 }
 for(let i=0;i<6;i++){const a=i*Math.PI/3,x=Math.cos(a)*.38,z=Math.sin(a)*.28;nursery.nodule(i%2?2:1,x,z,.09+random()*.04,.15,.078,a);nursery.runner(2,x,z,x*.45,z*.45,.019)}
 nursery.finish();
 const bed=batches(sites.mineral,'mineral-bed'),rnd=rng(17118);
 // Deposits arise from a connected substrate at varied scales. No glowing
 // pickup indicator and no raised visual barrier.
 for(let i=0;i<16;i++){
   const a=rnd()*Math.PI*2,rad=.25+rnd()*1.24,x=Math.cos(a)*rad,z=Math.sin(a)*rad;
   bed.nodule(0,x,z,.19+rnd()*.07,.18+rnd()*.09,.055,a);
   for(let k=0;k<2;k++){
     const phi=a+k*1.6,dx=Math.cos(phi)*.09,dz=Math.sin(phi)*.09,h=.05+rnd()*.07;
     const geo=new T.CylinderGeometry(.012,.052+rnd()*.025,h,5).rotateZ((rnd()-.5)*.42).rotateY(phi).translate(x+dx,h*.52+.024,z+dz);
     bed.add(k?3:1,geo);
   }
   bed.runner(2,x,z,x*.74,z*.74,.021);
 }
 bed.finish();
 let disposed=false;
 return {group:root,dispose(){if(disposed)return;disposed=true;root.traverse(o=>{if(o.isMesh)o.geometry.dispose()});materials.forEach(m=>m.dispose())}};
}
