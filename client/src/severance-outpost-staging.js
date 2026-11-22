// Expedition Outpost: equipment is integrated into *existing* generator,
// mast and crate collision footprints. No new walk obstruction or services.
import {EXPEDITION_OUTPOST as OP,OUTPOST_COLLIDERS} from '../../shared/severance-gate.js';

export const OUTPOST_STAGING_LIMITS=Object.freeze({lights:0,connectors:5,maxGLB:9});
export function buildOutpostStaging(T,{ground,assets=null}={}){
 const group=new T.Group();group.name='severance-outpost:field-operations';
 const owned=[],mats=[],parts=[];let glb=0;
 const m=(color,metalness=.45,roughness=.66,emissive=0,intensity=0)=>{
  const mat=new T.MeshStandardMaterial({color,metalness,roughness,emissive,emissiveIntensity:intensity});mats.push(mat);return mat;
 };
 const forged=m(0x455259,.68,.44),aged=m(0x8a6443,.38,.71),
  ceramic=m(0xb9b1a0,.21,.67),cableMat=m(0x17232a,.12,.84),
  signal=m(0x75c8bf,.19,.33,0x297a76,.76);
 const add=(geo,material,x,y,z,name)=>{
  const o=new T.Mesh(geo,material);o.name=name;
  o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;
  group.add(o);owned.push(geo);parts.push(o);return o;
 };
 const existing=type=>OUTPOST_COLLIDERS.filter(c=>c.type===type);
 // Compelling worksite silhouette: a mast-mounted telemetry dish and feeder
 // cables to a guarded generator. All overhead connections remain >2.5m.
 const mast=existing('outpost_mast')[0],generator=existing('outpost_generator')[0];
 const top=ground(mast.x,mast.z)+mast.h;
 const dish=add(new T.CylinderGeometry(.82,.82,.08,36),aged,
  mast.x,top-.72,mast.z,'outpost:telemetry-dish');
 dish.rotation.x=-Math.PI/2+.31;
 const focus=add(new T.CylinderGeometry(.055,.08,.65,12),forged,
  mast.x,top-.46,mast.z+.42,'outpost:telemetry-feed');
 focus.rotation.x=.45;
 for(let i=0;i<5;i++){
  const a=(i+.5)*Math.PI*2/5;
  const angle=Math.sin(a)*.4;
  const start=i===0?[generator.x,ground(generator.x,generator.z)+generator.h+.22,generator.z]
    :[mast.x+Math.cos(a)*.78,top-.7,mast.z+Math.sin(a)*.78];
  const dest=i===0?[mast.x,top-.9,mast.z]:[mast.x+.06,top-.30,mast.z+.13];
  const mid=[(start[0]+dest[0])/2,(start[1]+dest[1])/2-.12,(start[2]+dest[2])/2];
  const path=new T.CatmullRomCurve3([new T.Vector3(...start),new T.Vector3(...mid),new T.Vector3(...dest)]);
  add(new T.TubeGeometry(path,22,i===0?.045:.024,7,false),cableMat,0,0,0,'outpost:real-antenna-cabling');
 }
 const genY=ground(generator.x,generator.z);
 for(const side of [-1,1]) {
  // Finite protective power assembly on an already-solid generator housing.
  const x=generator.x+side*.55;
  add(new T.CylinderGeometry(.25,.3,.4,18),forged,
    x,genY+generator.h+.23,generator.z,'outpost:generator-reactor-housing');
  const coil=add(new T.TorusGeometry(.23,.035,8,32),signal,
    x,genY+generator.h+.46,generator.z,'outpost:generator-status-ring');
  coil.rotation.x=Math.PI/2;
 }
 // Field repair station: instrumentation *on top of* the existing two crate
 // clusters, not separate stacks scattered in the player's safe approach.
 const caches=existing('outpost_crates').slice(1);
 for(const [index,c] of caches.entries()) {
  const y=ground(c.x,c.z)+c.h+.09;
  const frame=add(new T.CylinderGeometry(.4,.5,.13,16),forged,
    c.x,y,c.z,'outpost:field-repair-plinth');
  add(new T.TorusGeometry(.31,.035,8,28),ceramic,
    c.x,y+.08,c.z,'outpost:repair-gimbal').rotation.x=Math.PI/2;
  add(new T.OctahedronGeometry(.18,1),index?signal:aged,
    c.x,y+.28,c.z,'outpost:repair-instrument');
 }
 // Reuse approved production utility GLBs as real parts of this service
 // assembly; direct placement on existing worksite footprints is mandatory.
 if(assets?.get?.('sanctum')&&assets.instance){
  const positions=[
   ['Prop_AccessPoint',generator.x,genY+generator.h+.48,generator.z,.65],
   ['Prop_Computer',generator.x+.35,genY+generator.h+.45,generator.z,.38],
   ['Prop_Cable_1',mast.x,ground(mast.x,mast.z)+mast.h*.58,mast.z,.58],
   ...caches.flatMap(c=>{
    const y=ground(c.x,c.z)+c.h+.30;
    return [['Prop_ItemHolder',c.x,y,c.z,.57],['Prop_Light_Floor',c.x,y+.11,c.z,.35]];
   }),
  ];
  for(const [name,x,y,z,scale] of positions)try {
   const o=assets.instance('sanctum',name);
   if(!o)continue;
   o.name='outpost:production-glb:'+name;
   o.position.set(x,y,z);o.scale.setScalar(scale);group.add(o);glb++;
  }catch(err){console.warn('[outpost] optional GLB field service unavailable:',name,err)}
 }
 return {
  group,stats:{glb,connectors:5,lights:0,colliderChanges:0},
  dispose(){group.removeFromParent();for(const geo of new Set(owned))geo.dispose();for(const mat of new Set(mats))mat.dispose();}
 };
}
