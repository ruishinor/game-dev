// Live placement of the owner-approved pipeline export. No combat,
// companion ownership, quest, reward or network mechanics are introduced.
import {groundHeight} from '../../shared/world.js';

export const STILLPOINT_URL='/client/assets/stillpoint.glb?v=230506ecfb78';

export async function loadStillpoint(T,loader,site){
  const gltf=await loader.loadAsync(STILLPOINT_URL);
  const root=gltf.scene;
  const idle=gltf.animations.find(clip=>clip.name==='Idle');
  if(!idle||!idle.tracks.length)throw new Error('Missing Stillpoint Idle animation');
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
  mixer.clipAction(idle).play();
  return {group,update(dt,focus,reducedMotion=false){
    const near=Math.hypot(focus.x-site.x,focus.z-site.z)<40;
    group.visible=near;
    if(near&&!reducedMotion)mixer.update(Math.max(0,Math.min(.1,dt)));
  }};
}
