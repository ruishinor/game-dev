// Brineworks evidence instruments: visual-only, grounded and material-batched.
// The ledger and receiver keep their existing authoritative interaction envelopes.
import { mergeGeometries } from './gear-kit.js';
export function buildSurveyTerminal(T, ledger) {
  const group=new T.Group();
  group.name=ledger?'brine:shift-ledger':'brine:pressure-receiver';
  const mat=(color,roughness,metalness,extra={})=>new T.MeshStandardMaterial({color,roughness,metalness,...extra});
  const dark=mat(0x303836,.86,.32), paint=mat(ledger?0x98805a:0x536f70,.77,.25);
  const steel=mat(0x858b84,.54,.65), rubber=mat(0x272b28,.94,.04);
  const display=mat(ledger?0xb99e6d:0x739f95,.42,.12,{emissive:ledger?0x886124:0x416e65,emissiveIntensity:.28});
  const batches=new Map();
  const add=(material,geo)=>{if(!batches.has(material))batches.set(material,[]);batches.get(material).push(geo);};
  const box=(m,w,h,d,x,y,z,rx=0,rz=0)=>add(m,new T.BoxGeometry(w,h,d).rotateX(rx).rotateZ(rz).translate(x,y,z));
  const cyl=(m,r,h,x,y,z,rx=0)=>add(m,new T.CylinderGeometry(r,r,h,16).rotateX(rx).translate(x,y,z));
  for(const side of [-1,1]){
    box(rubber,.23,.12,.96,side*.54,.06,0);
    box(steel,.09,.84,.76,side*.52,.60,0);
    for(const z of [-.33,.33])cyl(steel,.036,.035,side*.54,.135,z);
  }
  box(steel,1.36,.10,.94,0,.17,0);
  box(paint,.94,.91,.72,0,.675,0);
  box(dark,.80,.58,.055,0,.63,.365);
  box(steel,1.12,.10,.82,0,1.16,0);
  for(const side of [-1,1]){
    for(let i=0;i<4;i++)box(dark,.022,.041,.36,side*.478,.44+i*.11,0);
    for(const y of [.40,.99])cyl(steel,.027,.022,side*.38,y,.407,Math.PI/2);
  }
  if(ledger){
    for(const y of [.48,.77]){
      box(paint,.72,.22,.075,0,y,.40);
      box(steel,.25,.035,.035,0,y,.455);
    }
    const a=.18, fy=1.30, fz=-.06;
    const panel=(m,w,h,d,x,y,z)=>box(m,w,h,d,x,fy+y*Math.cos(a)-z*Math.sin(a),fz+y*Math.sin(a)+z*Math.cos(a),a);
    panel(dark,1.03,.21,.67,0,0,0);
    panel(display,.76,.025,.37,0,.119,-.08);
    for(const x of [-.28,0,.28])panel(steel,.16,.045,.09,x,.13,.23);
    // Recessed horizontal data marks; decorative, not invented readable records.
    for(let i=0;i<3;i++)panel(dark,.44-i*.07,.008,.013,-.08,.138,-.18+i*.075);
    box(dark,.9,.22,.10,0,1.43,-.38);
  }else{
    box(dark,.78,.56,.075,0,.82,.384);
    cyl(steel,.18,.06,-.13,.89,.44,Math.PI/2);
    cyl(display,.135,.018,-.13,.89,.474,Math.PI/2);
    for(let i=0;i<7;i++){
      const a=-Math.PI*.75+i*Math.PI*.25;
      box(dark,.012,.021,.008,-.13+Math.sin(a)*.108,.89+Math.cos(a)*.108,.489,0,-a);
    }
    box(dark,.019,.105,.012,-.13,.925,.49,0,-.7);
    for(const y of [.72,.85,.98])box(steel,.14,.038,.038,.24,y,.44);
    cyl(dark,.19,.16,-.31,1.29,-.17);
    cyl(steel,.095,.49,-.31,1.60,-.17);
    cyl(dark,.14,.09,-.31,1.76,-.17);
    add(steel,new T.SphereGeometry(1,16,10).scale(.18,.11,.18).translate(-.31,1.88,-.17));
    box(paint,.37,.29,.32,.29,1.34,-.12);
    box(display,.17,.025,.16,.29,1.498,-.12);
  }
  for(const [m,parts] of batches){
    const geometry=mergeGeometries(T,parts);
    for(const p of parts)p.dispose();
    const mesh=new T.Mesh(geometry,m);
    mesh.castShadow=m!==display;mesh.receiveShadow=true;
    group.add(mesh);
  }
  let disposed=false;
  return {group,height:ledger?1.65:2,radius:.8,hover:0,update(){},dispose(){
    if(disposed)return;disposed=true;
    for(const mesh of group.children){mesh.geometry.dispose();mesh.material.dispose();}
  }};
}
