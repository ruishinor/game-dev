// Attunement visual reconstruction of two owner-archive rifle donors.
// Read-only source GLBs live behind the server's exact-path extraction gate.
// Stock source geometry is materially rebuilt with higher-resolution receiver,
// rail, optic, vent and muzzle details and authored graphite PBR finishes.
// No combat simulation, firing or authorization is attached to Sanctum Wardens.
import * as THREE from 'three';

export const WARDEN_RIFLES=Object.freeze({
 carbine:{file:'sanctum-warden-carbine.glb',length:0.93},
 marksman:{file:'sanctum-warden-marksman.glb',length:1.09},
});
const STEEL=new THREE.MeshStandardMaterial({color:0x21282e,roughness:0.36,metalness:0.82});
const CERAMIC=new THREE.MeshStandardMaterial({color:0x363e43,roughness:0.53,metalness:0.53});
const RUBBER=new THREE.MeshStandardMaterial({color:0x111719,roughness:0.81,metalness:0.06});
const BRONZE=new THREE.MeshStandardMaterial({color:0x897452,roughness:0.43,metalness:0.70});
for(const m of [STEEL,CERAMIC,RUBBER,BRONZE])m.isShared=true;

// One download per source asset. Three's loader shares geometry across copies.
export async function loadWardenRifles(assets){
 assets.wardenRifles=new Map();
 await Promise.all(Object.entries(WARDEN_RIFLES).map(async([id,spec])=>{
  try{
   const gltf=await assets.loader.loadAsync('/client/assets/'+spec.file);
   const source=gltf.scene;
   const box=new THREE.Box3().setFromObject(source);
   const size=box.getSize(new THREE.Vector3());
   if(!Number.isFinite(size.x+size.y+size.z)||Math.max(size.x,size.y,size.z)<0.03)throw Error('invalid rifle bounds');
   source.traverse(o=>{
    if(!o.isMesh)return;
    o.geometry.userData.shared=true;
    o.castShadow=true;
    for(const m of Array.isArray(o.material)?o.material:[o.material])m.isShared=true;
   });
   assets.wardenRifles.set(id,source);
  }catch(err){console.warn('[wardens] rifle source '+id+' unavailable; retain original stave:',err.message||err);}
 }));
}
const prism=(w,h,d,mat,x,y,z,name)=>{
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
 mesh.position.set(x,y,z);mesh.name=name;mesh.castShadow=true;return mesh;
};
function barrel(radius,len,mat,x,y,z,name){
 const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,len,16,1),mat);
 mesh.rotation.x=Math.PI/2;mesh.position.set(x,y,z);mesh.name=name;mesh.castShadow=true;return mesh;
}
function reconstruct(source,spec,optic){
 const model=source.clone(true);
 const group=new THREE.Group();group.name='warden:rifle-reconstruction';
 const bounds=new THREE.Box3().setFromObject(model);
 const size=bounds.getSize(new THREE.Vector3());
 const center=bounds.getCenter(new THREE.Vector3());
 const longest=size.x>=size.z&&size.x>=size.y?'x':size.z>=size.y?'z':'y';
 const length=Math.max(size.x,size.y,size.z);
 // Center the entire source ensemble, then point its major axis forward (+Z).
 const rotate=new THREE.Group();
 rotate.add(model);
 model.position.sub(center);
 rotate.scale.setScalar(spec.length/length);
 if(longest==='x')rotate.rotation.y=-Math.PI/2;
 else if(longest==='y')rotate.rotation.x=Math.PI/2;
 group.add(rotate);
 model.traverse(o=>{
  if(!o.isMesh)return;
  const old=Array.isArray(o.material)?o.material:[o.material];
  const paints=old.map((m,i)=>{
   const painted=m.clone();
   painted.isShared=false;
   painted.color.setHex(i%3===0?0x171e23:i%3===1?0x353b40:0x51575a);
   painted.metalness=i%3===0?0.64:0.78;
   painted.roughness=i%3===2?0.55:0.39;
   painted.emissive?.setHex(0x000000);
   return painted;
  });
  o.material=Array.isArray(o.material)?paints:paints[0];
 });
 const L=spec.length;
 // These components change the actual silhouette and surface detail, not
 // merely applying a black paint or a shader to an unmodified low-poly gun.
 group.add(
  prism(.16,.13,L*.34,CERAMIC,0,0,-L*.06,'warder:precision-receiver'),
  prism(.13,.07,L*.44,STEEL,0,.097,L*.02,'warder:top-rail'),
  prism(.10,.11,L*.29,RUBBER,0,-.072,-L*.32,'warder:buttstock'),
  prism(.095,.16,.08,STEEL,0,-.13,-L*.08,'warder:magazine-well'),
  barrel(.028,L*.47,STEEL,0,-.012,L*.27,'warder:lined-barrel'),
  barrel(.042,.085,CERAMIC,0,-.012,L*.48,'warder:muzzle-brake'),
  prism(.095,.082,.17,CERAMIC,0,.17,-L*.01,'warder:optic-housing')
 );
 // Sights, segmented barrel shroud and cooling apertures.
 for(let i=0;i<8;i++){
  const z=-L*.06+i*L*.041;
  for(const side of [-1,1]){
   const vent=prism(.008,.014,.023,RUBBER,side*.091,.017,z,'warder:vent');
   group.add(vent);
  }
 }
 for(const side of [-1,1]){
  group.add(prism(.024,.045,.11,BRONZE,side*.099,.04,-L*.13,'warder:resonance-clamp'));
 }
 const sight=new THREE.Mesh(new THREE.CircleGeometry(.021,20),new THREE.MeshStandardMaterial({
  color:0x0d1b1c,emissive:new THREE.Color().setRGB(...optic),emissiveIntensity:.40,roughness:.13,metalness:.05,side:THREE.DoubleSide,
 }));
 sight.name='warden:resonance-sight';sight.position.set(0,.173,L*.048);
 sight.rotation.x=-Math.PI/2;group.add(sight);
 const status=new THREE.Mesh(new THREE.BoxGeometry(.014,.012,.048),sight.material);
 status.position.set(.11,.035,-L*.13);status.name='warden:status-emitter';group.add(status);
 return {group,sightMaterial:sight.material,origin:source};
}

/** Source model loaded? Used to retain the existing stave when unavailable. */
export function hasWardenRifle(assets,variant=0){
 const id=variant%4===3?'marksman':'carbine';
 return !!assets.wardenRifles?.has(id);
}
/** Subtle powered-optic status VFX only: Wardens do not fire or acquire targets. */
export function createWardenRifle(assets,inst,variant,optic){
 const id=variant%4===3?'marksman':'carbine';
 const source=assets.wardenRifles?.get(id);
 if(!source)return null;
 const made=reconstruct(source,WARDEN_RIFLES[id],optic);
 const root=new THREE.Group();root.name='warden:equipped-'+id;
 root.add(made.group);
 // Weapons sit in front of the chest at a low-ready angle, clear of the ring
 // and without substituting procedural weapon slots or player inventory.
 made.group.rotation.set(.40,variant%2===0?-.22:.18,0);
 root.position.set(.07,1.13,.39);
 inst.add(root);
 const chest=inst.getObjectByName('spine_02');
 const w=new THREE.Vector3();
 return {
  id,group:root,material:made.sightMaterial,
  update(dt,st){
   // Follow the animated chest without depending on the guard's weapon combat IK.
   if(chest){
    inst.updateMatrixWorld(true);
    chest.getWorldPosition(w);inst.worldToLocal(w);
    root.position.set(w.x+.07,w.y-.13,w.z+.39);
   }
   const time=Number.isFinite(st.t)?st.t:0;
   made.sightMaterial.emissiveIntensity=.32+.14*(.5+.5*Math.sin(time*2.1+variant*1.5));
  },
 };
}
