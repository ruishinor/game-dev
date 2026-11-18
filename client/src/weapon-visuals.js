// Presentation-only attachments. See assets/weapon-sources.json for exact CC0 donor bytes.
import {solveArm,aimBone,recoilAmount} from './weapon-pose.js';
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
export function shotProfile(id){
 if(!Object.hasOwn(WEAPON_MODELS,id))return null;
 return id==='longpoint'?{color:0x76c6ed,width:.045,life:.17,heavy:true}:id==='dense'?{color:0xe5a45b,width:.055,life:.15,heavy:false}:id==='tuned'?{color:0x85d7d2,width:.031,life:.12,heavy:false}:{color:0xdaa56c,width:.027,life:.10,heavy:false};
}
export function createWeaponCarry(T,assets,inst,holstered=false){
 const mounts=new Map(),saved=new Map();let active=null,age=Infinity,aim=null;
 const V=()=>new T.Vector3(),Q=()=>new T.Quaternion();
 const find=n=>inst.getObjectByName(n);
 const arms=['r','l'].map(side=>({upper:find('upperarm_'+side),lower:find('lowerarm_'+side),hand:find('hand_'+side)}));
 const bone=holstered?(find('spine_03')||find('spine_02')):(arms[0].hand||arms[1].hand);
 inst.updateWorldMatrix(true,true);
 if(bone)for(const [id,spec] of Object.entries(WEAPON_MODELS)){
  const src=assets.weaponModels?.get(id);if(!src)continue;
  const model=src.clone(true),bounds=new T.Box3().setFromObject(model),size=bounds.getSize(V());
  if(!Number.isFinite(size.x)||size.x<1e-5)continue;
  const scale=spec.length/size.x,rot=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),spec.axis===1?-Math.PI/2:Math.PI/2);
  const rear=spec.axis===1?bounds.min.x:bounds.max.x;
  const grip=new T.Vector3(rear+spec.axis*size.x*(id==='longpoint'?.36:.13),bounds.min.y+size.y*.28,(bounds.min.z+bounds.max.z)/2);
  const muzzle=new T.Vector3(rear+spec.axis*size.x,bounds.min.y+size.y*.78,grip.z);
  const support=new T.Vector3(rear+spec.axis*size.x*.70,bounds.min.y+size.y*.36,grip.z);
  model.scale.setScalar(scale);model.quaternion.copy(rot);
  model.position.copy(grip).multiplyScalar(-scale).applyQuaternion(rot);
  const anchor=new T.Group();anchor.name='weapon-carry:'+id;anchor.add(model);
  const muzzlePoint=new T.Object3D(),supportPoint=new T.Object3D();
  muzzlePoint.name='weapon:muzzle';supportPoint.name='weapon:support';
  muzzlePoint.position.copy(muzzle.sub(grip)).multiplyScalar(scale).applyQuaternion(rot);
  supportPoint.position.copy(support.sub(grip)).multiplyScalar(scale).applyQuaternion(rot);
  anchor.add(muzzlePoint,supportPoint);
  anchor.position.copy(inst.worldToLocal(bone.getWorldPosition(V())));
  if(holstered){anchor.position.z-=.22;anchor.position.y-=.12;anchor.rotation.z=-Math.PI*.62;}
  else anchor.rotation.x=Math.PI*.42;
  inst.add(anchor);anchor.updateMatrixWorld(true);bone.attach(anchor);bone.remove(anchor);
  mounts.set(id,{id,anchor,muzzlePoint,supportPoint,restPos:anchor.position.clone(),restQuat:anchor.quaternion.clone()});
 }
 function restorePose(){
  for(const [b,q] of saved)b.quaternion.copy(q);
  saved.clear();
  if(active){active.anchor.position.copy(active.restPos);active.anchor.quaternion.copy(active.restQuat);}
  inst.updateWorldMatrix(true,true);
 }
 function apply(id){
  const next=Object.hasOwn(WEAPON_MODELS,id)?mounts.get(id):null;
  if((next??null)===active)return;
  restorePose();active?.anchor.removeFromParent();active=next??null;age=Infinity;aim=null;if(active)bone.add(active.anchor);
 }
 function pose(target){
  if(!active||holstered||!target||!arms[0].upper||!arms[0].lower||!arms[0].hand)return false;
  restorePose();
  const right=arms[0],left=arms[1];
  for(const arm of arms)for(const b of [arm.upper,arm.lower,arm.hand])if(b)saved.set(b,b.quaternion.clone());
  const ra=right.upper.getWorldPosition(V()),la=left.upper?.getWorldPosition(V())??ra.clone();
  const center=ra.clone().lerp(la,.5),side=ra.clone().sub(la).normalize();
  const f=target.clone().sub(center);if(f.lengthSq()<.01){restorePose();return false;}f.normalize();
  // Limit the pose to the target-facing half-space; turning remains presentation-only.
  const forward=new T.Vector3(0,0,1).applyQuaternion(inst.getWorldQuaternion(Q()));
  if(f.dot(forward)<.05){restorePose();return false;}
  const scale=inst.getWorldScale(V()).x,heavy=active.id==='longpoint',kick=recoilAmount(age,heavy)*scale;
  const wrist=center.clone().addScaledVector(f,(heavy?.34:.48)*scale-kick).addScaledVector(side,(heavy?.12:.16)*scale);
  wrist.y-=(heavy?.16:.12)*scale;
  const actual=solveArm(T,right.upper,right.lower,right.hand,wrist,side.clone().add(new T.Vector3(0,-.8,0)));
  if(!actual){restorePose();return false;}
  const axis=f.clone();axis.y+=kick*.9;axis.normalize();
  const orientation=Q().setFromRotationMatrix(new T.Matrix4().lookAt(axis,new T.Vector3(),new T.Vector3(0,1,0)));
  const finger=right.hand.children.find(b=>b.isBone&&/^(index|middle)_/.test(b.name));
  if(finger)aimBone(T,right.hand,finger,actual.clone().addScaledVector(axis,.12));
  active.anchor.position.set(0,0,0);
  active.anchor.quaternion.copy(orientation).premultiply(right.hand.getWorldQuaternion(Q()).invert());
  active.anchor.updateWorldMatrix(true,true);
  if(heavy&&left.hand&&left.upper&&left.lower){
   const support=active.supportPoint.getWorldPosition(V());
   const lw=solveArm(T,left.upper,left.lower,left.hand,support,side.clone().negate().add(new T.Vector3(0,-.85,0)));
   const finger=left.hand.children.find(b=>b.isBone&&/^(index|middle)_/.test(b.name));
   if(lw&&finger)aimBone(T,left.hand,finger,lw.clone().addScaledVector(axis,.10));
  }
  return true;
 }
 return {
  apply,restorePose,
  fire(id,target){apply(id);if(!active||holstered)return false;age=0;aim=target.clone();pose(aim);return true;},
  update(dt,st,stepped){age+=dt;if(st.dead||st.air||age>.52){if(saved.size)restorePose();return;}if(stepped&&aim)pose(st.aimAt??aim);},
  muzzle(){return active&&!holstered?active.muzzlePoint.getWorldPosition(V()):null;},
  hand(){return arms[0].hand?.getWorldPosition(V())??null;},
  dispose(){restorePose();active?.anchor.removeFromParent();active=null;mounts.clear();}
 };
}
