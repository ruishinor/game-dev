// Live placement of the owner-approved pipeline export. No combat,
// companion ownership, quest, reward or network mechanics are introduced.
import {groundHeight} from '../../shared/world.js';
import {stillpointPose,ROCKY_NAME,ROCKY_CREATURE_TYPE} from '../../shared/stillpoint-roam.js';

export const STILLPOINT_URL='/client/assets/stillpoint.glb?v=230506ecfb78';

// Billboard is cosmetic, independently readable at desktop and TV distances.
function rockyNameplate(T,site){
  const canvas=document.createElement('canvas');
  canvas.width=512;canvas.height=160;
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,512,160);
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.shadowColor='rgba(9,20,22,.9)';ctx.shadowBlur=10;
  ctx.font='bold 66px system-ui, sans-serif';ctx.fillStyle='#f3f1db';
  ctx.fillText(ROCKY_NAME,256,57);
  ctx.font='500 39px system-ui, sans-serif';ctx.fillStyle='#b7d1c5';
  ctx.fillText('['+ROCKY_CREATURE_TYPE+']',256,119);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  const plate=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true,depthWrite:false,opacity:.96}));
  plate.name='rocky:nameplate';plate.position.y=site.h+.57;plate.scale.set(2.6,.81,1);
  return plate;
}


export async function loadStillpoint(T,loader,site){
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
  const group=new T.Group();group.name='rocky:stillpoint';
  group.position.set(site.x,groundHeight(site.x,site.z)+.04,site.z);
  group.rotation.y=-.8;
  const fit=new T.Group();
  fit.scale.setScalar(scale);
  root.position.sub(new T.Vector3(center.x,bounds.min.y,center.z));
  fit.add(root);group.add(fit);
  group.add(rockyNameplate(T,site));
  root.traverse(o=>{
    if(o.isMesh){o.castShadow=o.receiveShadow=true;if(o.isSkinnedMesh)o.frustumCulled=false;}
  });
  const mixer=new T.AnimationMixer(root);
  const actions=Object.fromEntries(Object.entries(clips).map(([name,clip])=>[name,mixer.clipAction(clip)]));
  let current='Idle',patTime=0,patCooldown=0;actions.Idle.play();
  function place(p){
    group.position.set(p.x,groundHeight(p.x,p.z)+.04,p.z);
    group.rotation.y=p.yaw;
  }
  place(stillpointPose(0));
  return {group,
  pat(){
    if(patCooldown>0)return false;
    patTime=1.45;patCooldown=2;
    return true;
  },
  update(dt,focus,reducedMotion=false,serverSeconds=0){
    const step=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
    patTime=Math.max(0,patTime-step);patCooldown=Math.max(0,patCooldown-step);
    const pose=stillpointPose(serverSeconds);
    place(pose);
    const near=Math.hypot(focus.x-pose.x,focus.z-pose.z)<40;
    group.visible=near;
    if(!near)return;
    const next=(pose.clip==='Idle'&&patTime>0&&!reducedMotion)?'WeightShift':(reducedMotion&&pose.clip==='WeightShift'?'Idle':pose.clip);
    group.scale.setScalar(patTime>0&&!reducedMotion?1+.014*Math.sin((1.45-patTime)*9):1);
    if(next!==current){
      const previous=actions[current];const action=actions[next];
      action.reset().setEffectiveWeight(1).play().crossFadeFrom(previous,.35,false);
      current=next;
    }
    if(current==='Walk')actions.Walk.setEffectiveTimeScale(Math.max(.05,pose.speed/(.4*scale)));
    // Keep ordinary creature locomotion and fade transitions coherent.
    mixer.update(step);
    group.userData.stillpointClip=current;
  }};
}
