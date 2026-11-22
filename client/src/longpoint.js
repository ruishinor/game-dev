// Cosmetic pose adapter for the Longpoint asset. No character/weapon state or
// gameplay mechanics are changed. Forward is local +X; all units are art units.
import { recoilAmount } from './weapon-pose.js';

export const LONGPOINT_TRACE = Object.freeze({color:0x86d8ff,width:.045,life:.21});

export function poseLongpoint(group, deployment = 0) {
  const left=group?.getObjectByName('SupportLeft');
  const right=group?.getObjectByName('SupportRight');
  if(!left||!right) return false;
  const a=Number.isFinite(deployment)?Math.max(0,Math.min(1,deployment)):0;
  for(const [node,sign] of [[left,1],[right,-1]]) {
    node.rotation.set(-sign*.35*a,0,-1.72*a,'XYZ');
  }
  return true;
}

// In-world visual fitting, independent of the authoritative combat simulation.
// Existing character animation remains the source of non-arm motion.
export function createLongpointPresentation(T, humanoid, prop, release = () => {}) {
  const arms = ['r','l'].map(side => ({ side, upper:humanoid.getObjectByName('upperarm_'+side), lower:humanoid.getObjectByName('lowerarm_'+side), hand:humanoid.getObjectByName('hand_'+side) }));
  const anchors = ['GripAnchor','SupportAnchor','EffectAnchor'].map(name => prop?.getObjectByName(name));
  if (!prop || anchors.some(x=>!x) || arms.some(a=>!a.upper||!a.lower||!a.hand||a.lower.parent!==a.upper||a.hand.parent!==a.lower)) return null;
  const [grip,support,effect]=anchors;
  const v=()=>new T.Vector3(), q=()=>new T.Quaternion();
  const world=n=>n.getWorldPosition(v()), inBody=n=>humanoid.worldToLocal(world(n));
  const saved=new Map();let active=false, closed=false, shotAge=Infinity;
  prop.scale.setScalar(.43);prop.visible=false;humanoid.add(prop);poseLongpoint(prop,0);
  function restore(){if(!saved.size)return;for(const [bone,rotation] of saved)bone.quaternion.copy(rotation);saved.clear();humanoid.updateWorldMatrix(true,true);}
  function orient(bone,child,target){
    const at=world(bone), current=world(child).sub(at).normalize(), desired=target.clone().sub(at).normalize();
    if(current.lengthSq()<.9||desired.lengthSq()<.9)return false;
    const turn=q().setFromUnitVectors(current,desired), worldRotation=bone.getWorldQuaternion(q()).premultiply(turn);
    const parentRotation=bone.parent.getWorldQuaternion(q()).invert();
    if(!saved.has(bone))saved.set(bone,bone.quaternion.clone());
    bone.quaternion.copy(parentRotation.multiply(worldRotation));bone.updateWorldMatrix(true,true);return true;
  }
  function fit(a,target){
    const start=world(a.upper), elbow=world(a.lower), wrist=world(a.hand), upperLength=start.distanceTo(elbow), lowerLength=elbow.distanceTo(wrist);
    const direction=target.clone().sub(start), dist=direction.length();
    if(!Number.isFinite(dist)||dist>upperLength+lowerLength-1e-5||dist<Math.abs(upperLength-lowerLength)+1e-5)return false;
    direction.divideScalar(dist);
    // A stable artistic elbow pole relative to the animated torso.
    const pole=humanoid.localToWorld(new T.Vector3(a.side==='r'?-.65:.65,-.35,-.55)).sub(humanoid.localToWorld(v()));
    pole.addScaledVector(direction,-pole.dot(direction));if(pole.lengthSq()<1e-8)return false;pole.normalize();
    const along=(upperLength*upperLength-lowerLength*lowerLength+dist*dist)/(2*dist);
    const height=Math.sqrt(Math.max(0,upperLength*upperLength-along*along));
    const bend=start.clone().addScaledVector(direction,along).addScaledVector(pole,height);
    return orient(a.upper,a.lower,bend)&&orient(a.lower,a.hand,target)&&world(a.hand).distanceTo(target)<.004;
  }
  function update(st={},dt=0){
    if(closed)return false;restore();active=false;prop.visible=false;
    if(st.dead||st.air||st.hideWeapon){shotAge=Infinity;return false;}
    if(st.reducedMotion)shotAge=Infinity;
    const right=inBody(arms[0].upper), left=inBody(arms[1].upper);
    const mid=right.clone().add(left).multiplyScalar(.5);
    // Preserve the existing carried pose; only a confirmed firing event
    // adds a bounded local cosmetic recoil. Never change server aiming.
    const angle=.68;
    prop.rotation.set(0,-Math.PI/2+angle,0);
    prop.position.set(0,0,0);prop.updateWorldMatrix(true,true);
    const aim=mid.clone().add(new T.Vector3(-.065,-.18,.065));
    const gripLocal=inBody(grip);
    const neutral=aim.sub(gripLocal);
    const kick=recoilAmount(shotAge,prop.userData.rifleFamily==='bastion-rifle');
    if(Number.isFinite(dt)&&dt>0)shotAge+=Math.min(dt,.1);
    const tryFit=(offset,clearance)=>{
      prop.position.copy(neutral)
        .addScaledVector(new T.Vector3(1,0,0).applyEuler(prop.rotation),-offset)
        .add(new T.Vector3(0,0,clearance));
      prop.updateWorldMatrix(true,true);
      const targets=[world(grip),world(support)];
      return arms.every((a,i)=>fit(a,targets[i]));
    };
    // Move the receiver forward of the torso, preserving only poses where
    // both hands still reach their actual authored GLB attachment anchors.
    let fitted=false;
    for(const clearance of [.24,.18,.12,.06,0]){
      if(tryFit(kick,clearance)){fitted=true;break;}
      restore();
      if(kick&&tryFit(0,clearance)){fitted=true;break;}
      restore();
    }
    if(!fitted)return false;
    active=true;prop.visible=true;return true;
  }
  return { update, restore, fire(){if(!active||closed||!prop.visible)return false;shotAge=0;prop.userData.rifleShotCount=(prop.userData.rifleShotCount??0)+1;if(!prop.userData.rifleFamily)prop.userData.longpointShotCount=(prop.userData.longpointShotCount??0)+1;return true;}, origin(){return active&&prop.visible?world(effect):null;}, dispose(){if(closed)return;restore();active=false;closed=true;prop.removeFromParent();release(prop);} };
}
