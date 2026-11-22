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
  const saved=new Map();let active=false, closed=false, shotAge=Infinity, lastState=null;
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
    if(closed)return false;
    restore();active=false;prop.visible=false;
    if(st.dead||st.air||st.hideWeapon){shotAge=Infinity;return false;}
    lastState=st;
    if(st.reducedMotion)shotAge=Infinity;
    const right=inBody(arms[0].upper),left=inBody(arms[1].upper),mid=right.clone().add(left).multiplyScalar(.5);
    // The asset's forward axis is +X, while a humanoid faces local +Z.
    // Prefer a shouldered, forward-facing fit with the grip ahead of the
    // sternum. A limited target yaw is cosmetic only and cannot decide hits.
    const target=st.weaponAimAt;
    let yaw=-Math.PI/2;
    if(target?.isVector3&&[target.x,target.y,target.z].every(Number.isFinite)){
      const direction=humanoid.worldToLocal(target.clone()).sub(mid);
      direction.y=0;
      if(direction.lengthSq()>.01){
        const wanted=-Math.atan2(direction.z,direction.x);
        yaw=Math.max(-Math.PI/2-.4,Math.min(-Math.PI/2+.4,wanted));
      }
    }
    const kick=recoilAmount(shotAge,false);
    if(Number.isFinite(dt)&&dt>0)shotAge+=Math.min(dt,.1);
    // Use the original authored two-hand pose only when more forward fits
    // genuinely cannot reach on this rig/locomotion frame.
    for(const [angle,forward] of [[yaw,.22],[yaw,.14],[-Math.PI/2+.68,.065]]){
      restore();
      prop.rotation.set(0,angle,0);
      prop.position.set(0,0,0);prop.updateWorldMatrix(true,true);
      const neutral=mid.clone().add(new T.Vector3(-.065,-.18,forward)).sub(inBody(grip));
      const tryFit=offset=>{
        prop.position.copy(neutral).addScaledVector(new T.Vector3(1,0,0).applyEuler(prop.rotation),-offset);
        prop.updateWorldMatrix(true,true);
        const targets=[world(grip),world(support)];
        return arms.every((a,i)=>fit(a,targets[i]));
      };
      if(tryFit(kick)||(kick>0&&(restore(),tryFit(0)))){
        active=true;prop.visible=true;return true;
      }
    }
    restore();return false;
  }
  return { update, restore, fire(target=null){if(!active||closed||!prop.visible)return false;if(target?.isVector3&&lastState)update({...lastState,weaponAimAt:target},0);if(!active)return false;shotAge=0;prop.userData.longpointShotCount=(prop.userData.longpointShotCount??0)+1;return true;}, origin(){return active&&prop.visible?world(effect):null;}, dispose(){if(closed)return;restore();active=false;closed=true;prop.removeFromParent();release(prop);} };
}
