// Live placement of the owner-approved pipeline export. No combat,
// companion ownership, quest, reward or network mechanics are introduced.
import {groundHeight} from '../../shared/world.js';
import {stillpointPose} from '../../shared/stillpoint-roam.js';

export const STILLPOINT_URL='/client/assets/stillpoint.glb?v=230506ecfb78';

export async function loadStillpoint(T,loader,site,{poseAt=stillpointPose}={}){
  const gltf=await loader.loadAsync(STILLPOINT_URL);
  const root=gltf.scene;
  const clips=Object.fromEntries(['Idle','Walk','WeightShift'].map(name=>[name,gltf.animations.find(c=>c.name===name)]));
  for(const [name,clip] of Object.entries(clips))if(!clip?.tracks.length)throw new Error('Missing Stillpoint '+name+' animation');
  root.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(root);
  const center=bounds.getCenter(new T.Vector3());
  const size=bounds.getSize(new T.Vector3());
  if(![size.x,size.y,size.z,center.x,center.z,bounds.min.y].every(Number.isFinite)||Math.min(size.x,size.y,size.z)<=0)
    throw new Error('Invalid Stillpoint bounds');
  // Respect the authored metre scale unless fitting requires reducing it.
  const scale=Math.min(1,site.r*.94/(Math.hypot(size.x,size.z)/2),site.h/size.y);
  const group=new T.Group();group.name='stillpoint:live';
  group.position.set(site.x,groundHeight(site.x,site.z)+.04,site.z);
  group.rotation.y=-.8;
  const fit=new T.Group();
  fit.scale.setScalar(scale);
  root.position.sub(new T.Vector3(center.x,bounds.min.y,center.z));
  fit.add(root);group.add(fit);
  root.traverse(o=>{
    if(o.isMesh){o.castShadow=o.receiveShadow=true;if(o.isSkinnedMesh)o.frustumCulled=false;}
  });
  const mixer=new T.AnimationMixer(root);
  const actions=Object.fromEntries(Object.entries(clips).map(([name,clip])=>[name,mixer.clipAction(clip)]));
  let current='Idle';actions.Idle.play();
  function place(p){
    group.position.set(p.x,groundHeight(p.x,p.z)+.04,p.z);
    group.rotation.y=p.yaw;
  }
  place(poseAt(0));
  return {group,update(dt,focus,reducedMotion=false,serverSeconds=0){
    const pose=poseAt(serverSeconds);
    place(pose);
    const near=Math.hypot(focus.x-pose.x,focus.z-pose.z)<40;
    group.visible=near;
    if(!near)return;
    const next=reducedMotion&&pose.clip==='WeightShift'?'Idle':pose.clip;
    if(next!==current){
      const previous=actions[current];const action=actions[next];
      action.reset().setEffectiveWeight(1).play().crossFadeFrom(previous,.35,false);
      current=next;
    }
    if(current==='Walk')actions.Walk.setEffectiveTimeScale(Math.max(.05,pose.speed/(.4*scale)));
    // Keep ordinary creature locomotion and fade transitions coherent.
    mixer.update(Math.max(0,Math.min(.1,dt)));
    group.userData.stillpointClip=current;
  },dispose(){
    mixer.stopAllAction();
    group.removeFromParent();
    const materials=new Set(),geometries=new Set();
    root.traverse(o=>{if(!o.isMesh)return;geometries.add(o.geometry);for(const m of [].concat(o.material))materials.add(m);});
    for(const geo of geometries)geo?.dispose?.();
    for(const m of materials)m?.dispose?.();
  }};
}
