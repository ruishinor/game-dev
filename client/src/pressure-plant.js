// Brineworks pressure plant, a static public environmental prop. All dimensions
// map to the existing collider; no electrical, hydraulic or quest simulation.
import { mergeGeometries,paintTexture } from './gear-kit.js';
export function buildPressurePlant(T,p){
  const root=new T.Group();root.name='brine:pressure-plant';
  const W=p.hw*2,D=p.hd*2,H=p.h;
  const mat=(color,roughness,metalness,more={})=>new T.MeshStandardMaterial({color,roughness,metalness,...more});
  const maps=paintTexture(T,'brine-pressure-plant',{base:'#8e7956',metal:'#81877a',seed:613,seams:false});
  const coat=mat(maps?0xffffff:0x8e7956,.73,.28,maps??{});
  const steel=mat(0x7b8179,.54,.62),dark=mat(0x39413c,.77,.40),base=mat(0x54534c,.93,.12);
  const seal=mat(0x262b28,.94,.03),panel=mat(0x9caa8a,.48,.18);
  const batches=new Map();
  const add=(m,g)=>{if(!batches.has(m))batches.set(m,[]);batches.get(m).push(g);};
  const box=(m,w,h,d,x,y,z)=>add(m,new T.BoxGeometry(w*W,h*H,d*D).translate(x*W,y*H,z*D));
  const cyl=(m,r,h,x,y,z,rz=0,rx=0)=>add(m,new T.CylinderGeometry(r,r,h,24).rotateZ(rz).rotateX(rx).translate(x,y,z));
  // Broad pad, two continuous skids, low-profile mount.
  box(base,.96,.075,.94,0,.0375,0);
  for(const z of [-.32,.32]){
    box(dark,.89,.07,.105,0,.11,z);
    for(const x of [-.36,0,.36])box(steel,.14,.032,.16,x,.16,z);
  }
  const R=Math.min(W*.161,D*.235),tankY=H*.17,tankH=H*.53;
  // Two industrial pressure vessels, dished endcaps and clamp collars.
  for(const side of [-1,1]){
    const x=side*W*.233;
    const profile=[[0,0],[.55*R,.03*tankH],[.86*R,.075*tankH],[R,.16*tankH],[R,.83*tankH],[.86*R,.92*tankH],[.48*R,.975*tankH],[0,tankH]];
    add(coat,new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r,y+tankY)),36).translate(x,0,0));
    for(const y of [tankY+tankH*.20,tankY+tankH*.79]){
      cyl(seal,R*1.035,.095,x,y,0);cyl(steel,R*1.06,.042,x,y+.024,0);
    }
    for(const z of [-D*.18,D*.18])box(dark,.19,.12,.12,side*.233,.157,z/D);
    cyl(steel,R*.26,H*.055,x,tankY+tankH+H*.025,0);
    cyl(dark,R*.34,H*.018,x,tankY+tankH+H*.060,0);
    for(const z of [-.15,.15])box(steel,.065,.045,.07,side*.233,.74,z);
  }
  // Raised hard-piped manifold adds a readable upper silhouette.
  const curve=(m,pts,r)=>add(m,new T.TubeGeometry(new T.CatmullRomCurve3(pts.map(([x,y,z])=>new T.Vector3(x*W,y*H,z*D))),28,r,10,false));
  for(const side of [-1,1]){
    curve(steel,[[side*.233,.76,0],[side*.233,.82,0],[side*.15,.85,0],[side*.08,.85,0],[0,.80,0]],.09);
    curve(dark,[[side*.233,.24,.18],[side*.28,.27,.30],[side*.17,.35,.34],[side*.10,.40,.24]],.087);
    cyl(steel,.13,.055,side*W*.233,H*.76,0);
  }
  box(dark,.30,.075,.23,0,.765,0);
  box(steel,.12,.13,.15,0,.82,0);
  box(coat,.105,.065,.12,0,.925,0);
  // Motor head and independent inspectable control face; no implied live readout.
  box(dark,.24,.20,.27,0,.39,.22);
  box(steel,.22,.18,.055,0,.39,.38);
  for(let i=0;i<5;i++)box(dark,.165,.009,.012,0,.335+i*.026,.412);
  for(const side of [-1,1]){
    cyl(steel,.12,.04,side*W*.064,H*.52,D*.38,0,Math.PI/2);
    cyl(panel,.084,.015,side*W*.064,H*.52,D*.391,0,Math.PI/2);
  }
  box(coat,.20,.045,.19,0,.505,.22);
  for(const [m,geos] of batches){
    const g=mergeGeometries(T,geos);geos.forEach(x=>x.dispose());
    const mesh=new T.Mesh(g,m);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
  }
  return root;
}
