// Derelict relay: cosmetic, bounded to the existing simulation footprint.
import { mergeGeometries, paintTexture } from './gear-kit.js';
export function buildRelayTower(T,p){
 const g=new T.Group();g.name='relay:structural-mast';
 const textures=paintTexture(T,'relay-mast',{base:'#766456',metal:'#92958d',seams:false,seed:112});
 const frame=new T.MeshStandardMaterial({color:textures?0xffffff:0x766456,roughness:.8,metalness:.45,map:textures?.map??null,roughnessMap:textures?.roughnessMap??null});
 const base=new T.MeshStandardMaterial({color:0x575753,roughness:.92,metalness:.12});
 const hardware=new T.MeshStandardMaterial({color:0x3c4445,roughness:.64,metalness:.62});
 const casing=new T.MeshStandardMaterial({color:0x8d8b79,roughness:.78,metalness:.3});
 const sets=new Map([frame,base,hardware,casing].map(m=>[m,[]]));
 const add=(m,geo,x=0,y=0,z=0)=>{geo.translate(x,y,z);sets.get(m).push(geo)};
 const box=(m,w,h,d,x,y,z)=>add(m,new T.BoxGeometry(w,h,d),x,y,z);
 const cyl=(m,r1,r2,h,x,y,z,n=20)=>add(m,new T.CylinderGeometry(r1,r2,h,n),x,y,z);
 const beam=(m,a,b,w=.12,d=w)=>{const A=new T.Vector3(...a),B=new T.Vector3(...b),v=B.clone().sub(A),geo=new T.BoxGeometry(w,v.length(),d);geo.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),v.normalize()));geo.translate(...A.clone().add(B).multiplyScalar(.5).toArray());sets.get(m).push(geo)};
 // Concrete footing supports four tapered frame legs. Cross-braces connect
 // each level; antenna offsets remain inside the original 2.4m radius.
 cyl(base,2.1,2.2,.48,0,.24,0,12);
 const levels=[.55,2.75,4.95,7.15,9.35,11.55],rad=[1.26,1.09,.94,.79,.64,.48];
 const corners=yidx=>[[1,1],[-1,1],[-1,-1],[1,-1]].map(([x,z])=>[x*rad[yidx],levels[yidx],z*rad[yidx]]);
 for(const [x,y,z] of corners(0))box(hardware,.46,.17,.46,x,y-.085,z);
 for(let k=0;k<levels.length;k++){
   const a=corners(k);
   for(let i=0;i<4;i++)beam(hardware,a[i],a[(i+1)%4],.105);
   if(k===levels.length-1)break;
   const b=corners(k+1);
   for(let i=0;i<4;i++){beam(frame,a[i],b[i],.17);beam(frame,a[i],b[(i+1)%4],.085);beam(hardware,a[(i+1)%4],b[i],.07)}
 }
 // Service trunk, ladder, partial upper gantry and offset antenna.
 for(let k=0;k<5;k++)cyl(hardware,.10,.10,2.18,0,1.64+k*2.2,0,12);
 for(const x of [-.22,.22])beam(frame,[x,.6,.91],[x,10.2,.45],.048);
 for(let k=0;k<23;k++){const y=.65+k*.41;beam(hardware,[-.22,y,.91-(y-.6)*.048],[.22,y,.91-(y-.6)*.048],.033)}
 box(hardware,1.42,.16,1.38,0,11.5,0);
 beam(frame,[0,11.55,0],[.24,13.58,-.16],.17);
 beam(hardware,[-1.25,12.25,0],[1.25,12.25,0],.095);
 for(const x of [-.92,.86]){beam(frame,[x,12.25,0],[x,13.22,.01],.052);box(casing,.24,.88,.16,x,12.71,.09)}
 // Distinct equipment enclosure at service platform; no new interaction.
 box(casing,.62,.74,.48,1.18,.87,.1);
 box(hardware,.58,.63,.07,1.18,.88,.37);
 for(let i=0;i<4;i++)box(frame,.42,.035,.045,1.18,.69+i*.10,.42);
 cyl(hardware,.18,.21,.12,.24,13.61,-.16,12);
 for(const [m,src] of sets){const geo=mergeGeometries(T,src);for(const p of src)p.dispose();const mesh=new T.Mesh(geo,m);mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh)}
 const lamp=new T.Mesh(new T.SphereGeometry(.12,12,8),new T.MeshBasicMaterial({color:0xff5a4a}));lamp.position.set(.24,13.77,-.16);lamp.name='relay:marker-lamp';g.add(lamp);
 let disposed=false;
 return {group:g,update(t){lamp.visible=Math.sin((Number.isFinite(t)?t:0)*3)>-.2},dispose(){if(disposed)return;disposed=true;for(const m of g.children){m.geometry.dispose();m.material.dispose()}textures?.map.dispose();textures?.roughnessMap.dispose()}};
}
