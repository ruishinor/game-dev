// Kestrel Deep pressure vessel. Presentation only: dimensions derive from
// the authoritative prop; an inspection window reveals an inert specimen.
// No quest, collision, power or interaction state is introduced here.
import { mergeGeometries } from './gear-kit.js';

export function buildContainmentVessel(THREE, p) {
  const R=p.r, H=p.h, g=new THREE.Group();
  g.name='kestrel:vessel:'+p.seed;
  const steel=new THREE.MeshStandardMaterial({color:0x697673,metalness:.62,roughness:.56});
  const dark=new THREE.MeshStandardMaterial({color:0x303a39,metalness:.49,roughness:.72});
  const flange=new THREE.MeshStandardMaterial({color:0x97958a,metalness:.65,roughness:.58});
  const paint=new THREE.MeshStandardMaterial({color:0x937649,metalness:.22,roughness:.81});
  const mineral=new THREE.MeshStandardMaterial({color:p.seed%2?0x505e50:0x64695b,metalness:.11,roughness:.87});
  const glass=new THREE.MeshStandardMaterial({color:0x90aaa0,transparent:true,opacity:.25,depthWrite:false,roughness:.24,metalness:.03,side:THREE.DoubleSide});
  const batches=new Map();
  const add=(mat,geo)=>{
    if(!batches.has(mat))batches.set(mat,[]);
    batches.get(mat).push(geo);
  };
  const cyl=(mat,rad,h,y,x=0,z=0)=>add(mat,new THREE.CylinderGeometry(rad*R,rad*R,h*H,32).translate(x*R,y*H,z*R));
  const lathe=(mat,pts)=>add(mat,new THREE.LatheGeometry(pts.map(([r,y])=>new THREE.Vector2(r*R,y*H)),40));
  const box=(mat,w,h,d,y,rad,a=0)=>add(mat,new THREE.BoxGeometry(w*R,h*H,d*R).rotateY(a).translate(Math.sin(a)*rad*R,y*H,Math.cos(a)*rad*R));
  cyl(dark,.94,.08,.04);
  cyl(steel,.70,.13,.145);
  // Dished transitions, pressure flanges, and a capped service neck.
  lathe(steel,[[0,.20],[.44,.20],[.65,.225],[.75,.26],[.78,.32]]);
  lathe(steel,[[.78,.68],[.75,.74],[.65,.795],[.45,.83],[0,.83]]);
  cyl(dark,.29,.12,.89);
  cyl(flange,.38,.035,.965);
  cyl(dark,.25,.015,.9925);
  for(const y of [.30,.70]){
    cyl(dark,.86,.047,y);
    cyl(flange,.885,.014,y+.022);
    for(let i=0;i<12;i++){
      const a=i*Math.PI/6;
      cyl(flange,.028,.020,y+.038,Math.sin(a)*.83,Math.cos(a)*.83);
    }
  }
  // Separate jacket sections leave two real viewing apertures.
  const a=.38, q=Math.PI/2;
  for(const [start,end] of [[a,q-a],[q+a,2*Math.PI-a]]){
    add(steel,new THREE.CylinderGeometry(.79*R,.79*R,.40*H,40,1,true,start,end-start).translate(0,.50*H,0));
  }
  for(const center of [0,q]){
    for(const angle of [center-a,center+a])box(dark,.09,.40,.12,.50,.79,angle);
    const geo=new THREE.CylinderGeometry(.76*R,.76*R,.39*H,18,1,true,center-a,2*a).translate(0,.50*H,0);
    const m=new THREE.Mesh(geo,glass);m.name='containment-window';m.renderOrder=2;g.add(m);
  }
  // Mineral growth, not a light source or an implied live specimen.
  cyl(dark,.45,.035,.335);
  const profile=[[0,.35],[.20,.37],[.36,.41],[.28,.46],[.39,.50],[.21,.55],[.30,.60],[.09,.64],[0,.65]];
  const geo=new THREE.LatheGeometry(profile.map(([r,y],i)=>new THREE.Vector2(r*R*(1+((p.seed+i)%3-1)*.09),y*H)),17);
  add(mineral,geo);
  for(const angle of [Math.PI,Math.PI*1.5]){
    const x=Math.sin(angle)*.84,z=Math.cos(angle)*.84;
    cyl(flange,.045,.33,.49,x,z);
    cyl(dark,.065,.025,.36,x,z);cyl(dark,.065,.025,.62,x,z);
    box(paint,.19,.045,.035,.18,.72,angle);
  }
  for(const [mat,parts] of batches){
    const combined=mergeGeometries(THREE,parts);
    for(const part of parts)part.dispose();
    const mesh=new THREE.Mesh(combined,mat);mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);
  }
  return g;
}
