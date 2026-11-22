// Original game-art props, not real firearm manufacturing geometry.
// Anchor locations mirror the proven Longpoint two-hand visual fitting contract.
// Dimensions are art units; all geometry and material resources are instance-owned.
import { LONGPOINT_TRACE } from './longpoint.js';
const TRACES=Object.freeze({
 longpoint:LONGPOINT_TRACE,
 'relay-carbine':Object.freeze({color:0x75e2ca,width:.025,life:.12}),
 'bastion-rifle':Object.freeze({color:0xf1b969,width:.072,life:.24})
});
export function rifleFamily(token){
 if(typeof token!=='string')return null;
 const name=token.endsWith('-stowed')?token.slice(0,-7):token;
 return Object.hasOwn(TRACES,name)?name:null;
}
export function isStowedRifle(token){return !!rifleFamily(token)&&token.endsWith('-stowed');}
export function rifleTrace(token){return typeof token==='string'&&Object.hasOwn(TRACES,token)?TRACES[token]:null;}

export function createRifleFamily(T,family){
 if(family!=='relay-carbine'&&family!=='bastion-rifle')return null;
 const heavy=family==='bastion-rifle',g=new T.Group();
 g.name=heavy?'BastionRifle':'RelayCarbine';g.userData.rifleFamily=family;
 const mat=(color,metalness,roughness,emissive=0)=>new T.MeshStandardMaterial({color,metalness,roughness,emissive,emissiveIntensity:.65});
 const dark=mat(0x22282c,.52,.57), shell=mat(heavy?0x676151:0x506c69,.48,.48),edge=mat(0x505a60,.74,.39),
       grip=mat(0x1e2224,.05,.83),light=mat(heavy?0xf1b969:0x75e2ca,.22,.26,heavy?0xf1b969:0x75e2ca);
 const add=(name,geo,m,x,y,z,rot=0)=>{
   const mesh=new T.Mesh(geo,m);mesh.name=name;mesh.position.set(x,y,z);mesh.rotation.z=rot;mesh.castShadow=true;g.add(mesh);return mesh;
 };
 const box=(name,m,x,y,z,a,b,c,rot=0)=>add(name,new T.BoxGeometry(a,b,c),m,x,y,z,rot);
 const tube=(name,m,x,y,z,len,r1,r2)=>add(name,new T.CylinderGeometry(r1,r2,len,12),m,x,y,z,-Math.PI/2);
 // Faceted receiver shell; extruded side silhouette with bevel highlights.
 const hull=(name,m,points,depth)=>{
   const sh=new T.Shape();points.forEach(([x,y],i)=>i?sh.lineTo(x,y):sh.moveTo(x,y));sh.closePath();
   const geo=new T.ExtrudeGeometry(sh,{depth:depth-.018,bevelEnabled:true,bevelThickness:.009,bevelSize:.009,bevelSegments:1,steps:1});
   geo.translate(0,0,-(depth-.018)/2);return add(name,geo,m,0,0,0);
 };
 hull('Receiver',shell,heavy?[[-.56,.15],[.12,.15],[.36,.08],[.36,-.14],[-.52,-.14],[-.61,-.045]]:[[-.5,.115],[.28,.115],[.4,.055],[.3,-.09],[-.48,-.095],[-.57,-.025]],heavy?.205:.13);
 hull('Stock',dark,heavy?[[-.95,.08],[-.56,.10],[-.52,-.12],[-.86,-.18],[-.95,-.13]]:[[-.86,.075],[-.52,.075],[-.52,-.04],[-.75,-.14],[-.86,-.14]],heavy?.15:.105);
 box('ButtPad',grip,heavy?-.96:-.87,-.028,0,.045,.20,heavy?.16:.12);
 box('RearGrip',grip,-.37,-.18,0,.105,.215,.105,-.18);
 box('GripCap',edge,-.35,-.294,0,.12,.025,.115,-.18);
 hull('EnergyCassette',dark,[[-.17,-.10],[.075,-.10],[.10,-(heavy?.36:.25)],[-.12,-(heavy?.33:.27)]],heavy?.145:.115);
 for(const sign of [-1,1]){
  box('CassetteRib',edge,-.085,-.20,sign*(heavy?.081:.065),.025,.16,.012);
  box('ReceiverRail',edge,-.08,.08,sign*(heavy?.113:.075),.48,.032,.016);
  box('ChargeIndicator',light,.08,.045,sign*(heavy?.115:.078),.16,.019,.013);
 }
 if(heavy){
   hull('HeavyShroud',shell,[[.30,.14],[.9,.14],[1.03,.07],[1.03,-.12],[.3,-.15]],.25);
   for(const sign of [-1,1]){
     tube('Channel',dark,1.04,.025,sign*.077,.52,.047,.047);
     tube('EmitterCollar',edge,1.3,.025,sign*.077,.11,.067,.060);
     box('CoilWindow',light,.65,.02,sign*.14,.34,.027,.014);
     for(let i=0;i<5;i++)box('CoolingRib',dark,.40+i*.09,-.065,sign*.141,.026,.073,.025);
   }
   box('HeavyForegrip',grip,.42,-.15,0,.22,.07,.15);
 }else{
   hull('CompactShroud',dark,[[.29,.095],[.63,.095],[.75,.03],[.66,-.08],[.29,-.095]],.13);
   tube('PulseChannel',edge,.78,.02,0,.32,.033,.034);
   tube('EmitterCollar',dark,.96,.02,0,.12,.048,.045);
   box('Foregrip',grip,.42,-.105,0,.23,.064,.11);
   for(let i=0;i<4;i++)for(const sign of [-1,1])box('VentedRib',shell,.34+i*.064,.028,sign*.076,.025,.055,.014);
 }
 box('SightRail',edge,-.05,heavy?.17:.135,0,.35,.025,.09);
 if(heavy){
   tube('OpticBody',dark,-.04,.235,0,.25,.06,.058);
   tube('OpticGlass',light,.087,.235,0,.012,.048,.048);
 }else{
   box('ReflexSight',dark,.04,.19,0,.14,.091,.09);
   box('ReflexLens',light,.115,.194,0,.009,.047,.065);
 }
 const muzzle=heavy?1.37:1.025;
 // The visible attachment adapter and both hand targets are decoratively aligned.
 for(const [name,point] of Object.entries({GripAnchor:[-.37,-.19,0],SupportAnchor:[.42,-.096,0],EffectAnchor:[muzzle,heavy?.025:.02,0],ShoulderAnchor:[heavy?-.95:-.86,.01,0]})){
   const n=new T.Object3D();n.name=name;n.position.set(...point);g.add(n);
 }
 return g;
}
