// Presentation-only attachments. See assets/weapon-sources.json for exact CC0 donor bytes.
export const WEAPON_MODELS=Object.freeze({
  "field": {
    "length": 0.32,
    "axis": 1,
    "sha": "8cd54a77bbf39083defc25168465d5c52402c7e1"
  },
  "tuned": {
    "length": 0.36,
    "axis": 1,
    "sha": "dec22f154f7ef51353ecd7b08896cb040a5380e9"
  },
  "dense": {
    "length": 0.42,
    "axis": 1,
    "sha": "08deefbd48caa7670b15a91181ddafd57e5885f2"
  },
  "longpoint": {
    "length": 0.76,
    "axis": -1,
    "sha": "d5e6c529293d51e29217622465f38cadf32d43b2"
  }
});
export async function loadWeaponModels(assets){
 assets.weaponModels=new Map();
 await Promise.all(Object.entries(WEAPON_MODELS).map(async ([id,spec])=>{
  try{
   const gltf=await assets.loader.loadAsync('/client/weapon-assets/'+id+'.glb?v='+spec.sha);
   gltf.scene.traverse(o=>{if(o.isMesh){o.geometry.userData.shared=true;o.castShadow=true;for(const m of Array.isArray(o.material)?o.material:[o.material])m.isShared=true;}});
   assets.weaponModels.set(id,gltf.scene);
  }catch(err){console.warn('[weapons] carry model unavailable: '+id,err.message||err);}
 }));
}
export function createWeaponCarry(THREE,assets,inst,holstered=false){
 const mounts=new Map();let active=null;
 inst.updateMatrixWorld(true);
 const bone=inst.getObjectByName(holstered?'spine_03':'hand_r')||inst.getObjectByName(holstered?'spine_02':'hand_l');
 if(bone)for(const [id,spec] of Object.entries(WEAPON_MODELS)){
  const src=assets.weaponModels?.get(id);if(!src)continue;
  const model=src.clone(true),size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  if(!Number.isFinite(size.x)||size.x<1e-5)continue;
  model.scale.setScalar(spec.length/size.x);model.rotation.y=spec.axis===1?Math.PI:0;
  const anchor=new THREE.Group();anchor.name='weapon-carry:'+id;anchor.add(model);model.position.y=holstered?0:-.025;
  anchor.position.copy(inst.worldToLocal(bone.getWorldPosition(new THREE.Vector3())));
  if(holstered){anchor.position.z-=.22;anchor.position.y-=.12;anchor.rotation.z=-Math.PI*.62;}
  else anchor.position.x+=bone.name==='hand_r'?-.025:.025;
  inst.add(anchor);anchor.updateMatrixWorld(true);bone.attach(anchor);
  bone.remove(anchor);mounts.set(id,anchor);
 }
 return {apply(id){const next=Object.hasOwn(WEAPON_MODELS,id)?mounts.get(id):null;if((next??null)===active)return;active?.removeFromParent();active=next??null;if(active)bone.add(active);},dispose(){active?.removeFromParent();active=null;mounts.clear();}};
}
