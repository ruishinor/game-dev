import { buildKestrelRegulatorGallery } from './kestrel-regulator-gallery.js';
// Kestrel's recognisable pressure-machine complex. These parts sit inside
// existing vessel/wall/roof footprints: no new solid gameplay obstacles.
export const KESTREL_PLANT_LIMITS=Object.freeze({dynamos:2,lights:0});
export function buildKestrelPressurePlant(T,assets=null){
 const group=new T.Group();group.name='kestrel:pressure-plant';
 const materials=[],geometries=[],motors=[];
 const m=(color,metalness=.65,roughness=.5,emissive=0,intensity=0)=>{
  const mat=new T.MeshStandardMaterial({color,metalness,roughness,emissive,emissiveIntensity:intensity});
  materials.push(mat);return mat;
 };
 const iron=m(0x2b363f,.73,.54),steel=m(0x77858d,.75,.36),
   brass=m(0x9d8666,.67,.48),ceramic=m(0xd4d0bd,.24,.62),
   coil=m(0x5aa9a6,.28,.28,0x217c81,1.1),rubber=m(0x11191e,.18,.87);
 const add=(geo,mat,name,x,y,z)=>{
  const o=new T.Mesh(geo,mat);o.name=name;o.position.set(x,y,z);
  o.castShadow=true;o.receiveShadow=true;group.add(o);geometries.push(geo);
  return o;
 };
 // Two pressure-dynamo yokes visibly brace the existing glass vessels:
 // recognizable tall circular machines, not more anonymous cargo boxes.
 for(const [index,z] of [-4,4].entries()){
  const x=-4.1;
  for(const [r,thick,mat] of [[1.48,.14,steel],[1.23,.075,coil],[1.05,.045,brass]]){
   const hoop=add(new T.TorusGeometry(r,thick,12,64),mat,'kestrel:dynamo-yoke',x,2.25,z);
   hoop.rotation.y=Math.PI/2;
  }
  for(const y of [1.16,3.32]){
   const hub=add(new T.CylinderGeometry(.43,.51,.32,24,1),iron,'kestrel:dynamo-rotor-hub',x, y,z);
   hub.rotation.x=Math.PI/2;
   add(new T.TorusGeometry(.33,.033,10,36),ceramic,'kestrel:dynamo-bearing',x,y,z+.19);
  }
  for(const dx of [-.95,.95])for(const dz of [-.69,.69]){
   const strut=add(new T.CylinderGeometry(.07,.095,3.6,12),brass,'kestrel:dynamo-tension-rod',
     x+dx,2.28,z+dz);
   strut.rotation.z=dx*.12;
  }
  const motor=new T.Group();motor.name='kestrel:dynamo-kinetic-rotor:'+index;
  motor.position.set(x,2.25,z);group.add(motor);
  const geo=new T.TorusGeometry(.78,.065,10,48);
  geometries.push(geo);
  const rotor=new T.Mesh(geo,coil);rotor.name='kestrel:dynamo-rotation';
  rotor.rotation.y=Math.PI/2;motor.add(rotor);motors.push(motor);
  // Mechanical inspection ports and deliberate colour-coded access.
  const panel=add(new T.CylinderGeometry(.33,.33,.18,24),rubber,'kestrel:dynamo-inspection-port',
    x+.7,2.25,z);
  panel.rotation.z=Math.PI/2;
  const pulse=add(new T.IcosahedronGeometry(.19,2),coil,'kestrel:dynamo-power-core',x+.87,2.25,z);
  pulse.castShadow=false;
 }
 // Continuous overhead feed manifold makes the two containment units one
 // machine. All hanging connections remain above standing-player headroom.
 const tube=(points,radius,mat,name)=>{
  const path=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));
  return add(new T.TubeGeometry(path,56,radius,12,false),mat,name,0,0,0);
 };
 for(const x of [-5.35,-2.85]){
  tube([[x,3.7,-4],[x,4.38,-3.15],[x,4.58,-1.2],[x,4.58,1.2],
    [x,4.38,3.15],[x,3.7,4]],.10,x<-4?brass:steel,'kestrel:overhead-feed-line');
  for(const z of [-4,4]){
   const collar=add(new T.TorusGeometry(.20,.062,10,30),rubber,
     'kestrel:pressure-coupler',x,4.04,z);
   collar.rotation.x=Math.PI/2;
  }
 }
 // Central suspended stabilizer, a recognizable gyroscopic instrument, not
 // another wall cassette or waist-high collision hazard.
 const core=add(new T.CylinderGeometry(.66,.88,.42,32),steel,'kestrel:manifold-control-hub',-4.1,4.49,0);
 const rotor=add(new T.TorusGeometry(.93,.105,12,48),brass,'kestrel:manifold-stabilizer',-4.1,4.33,0);
 rotor.rotation.x=Math.PI/2;
 const lens=add(new T.SphereGeometry(.38,20,14),coil,'kestrel:manifold-sensor',-4.1,4.16,0);
 lens.castShadow=false;
 // Paired wall-mounted regulator bays complete the physical path from the
 // overhead feeds to relief risers; all elements remain cosmetic.
 const regulators=buildKestrelRegulatorGallery(T);
 group.add(regulators.group);
 // Reuse registered GLB machinery rather than shipping an all-primitives
 // replacement. These are restrained to the existing west wall/roof zone.
 let glbParts=0;
 if(assets?.get?.('sanctum')&&assets?.instance)for(const [name,x,y,z,ry,s] of [
  ['Prop_Vent_Big',-6.15,3.8,-4,Math.PI/2,.52],
  ['Prop_Vent_Big',-6.15,3.8,4,Math.PI/2,.52],
  ['Prop_Computer',-6.28,2.05,0,Math.PI/2,.38],
  ['Prop_Cable_1',-5.9,4.72,0,Math.PI/2,.54],
 ])try{
  const obj=assets.instance('sanctum',name);
  if(!obj)continue;
  obj.name='kestrel:plant-glb:'+name;
  obj.position.set(x,y,z);obj.rotation.y=ry;obj.scale.setScalar(s);
  group.add(obj);glbParts++;
 }catch(err){console.warn('[kestrel] optional plant GLB unavailable',name,err);}
 return {
  group,stats:{dynamos:motors.length,glbParts,regulatorBays:regulators.stats.bays,colliderChanges:0,newLights:0},
  update(t,{reducedMotion=false}={}){
   for(let i=0;i<motors.length;i++)motors[i].rotation.z=reducedMotion?0:Math.sin(t*.3+i)*.16;
   coil.emissiveIntensity=reducedMotion?0.9:1+.12*Math.sin(t*.8);
  },
  dispose(){
   group.removeFromParent();
   regulators.dispose();
   for(const g of new Set(geometries))g.dispose();
   for(const m of new Set(materials))m.dispose();
  },
 };
}
