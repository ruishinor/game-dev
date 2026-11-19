// Presentation-only two-bone solve. Joint lengths come from the actual rig,
// so both body frames preserve their own proportions. No combat decisions.
export function aimBone(T,bone,child,target){
 const at=bone.getWorldPosition(new T.Vector3()),old=child.getWorldPosition(new T.Vector3()).sub(at),next=target.clone().sub(at);
 if(old.lengthSq()<1e-10||next.lengthSq()<1e-10)return;
 const delta=new T.Quaternion().setFromUnitVectors(old.normalize(),next.normalize());
 const world=delta.multiply(bone.getWorldQuaternion(new T.Quaternion()));
 if(bone.parent)world.premultiply(bone.parent.getWorldQuaternion(new T.Quaternion()).invert());
 bone.quaternion.copy(world);bone.updateWorldMatrix(false,true);
}
export function solveArm(T,upper,lower,hand,target,pole){
 if(!upper||!lower||!hand)return null;
 const a=upper.getWorldPosition(new T.Vector3()),b=lower.getWorldPosition(new T.Vector3()),c=hand.getWorldPosition(new T.Vector3());
 const l1=a.distanceTo(b),l2=b.distanceTo(c);
 if(l1<.01||l2<.01)return null;
 const axis=target.clone().sub(a);const wanted=axis.length();
 if(wanted<1e-5)return null;axis.divideScalar(wanted);
 const d=Math.max(Math.abs(l1-l2)+.001,Math.min(l1+l2-.001,wanted));
 const side=pole.clone().addScaledVector(axis,-pole.dot(axis));
 if(side.lengthSq()<1e-6){side.set(0,-1,0).addScaledVector(axis,axis.y);if(side.lengthSq()<1e-6)side.set(1,0,0);}
 side.normalize();
 const along=(l1*l1-l2*l2+d*d)/(2*d),height=Math.sqrt(Math.max(0,l1*l1-along*along));
 const elbow=a.clone().addScaledVector(axis,along).addScaledVector(side,height);
 const wrist=a.clone().addScaledVector(axis,d);
 aimBone(T,upper,lower,elbow);aimBone(T,lower,hand,wrist);
 return hand.getWorldPosition(new T.Vector3());
}
export function recoilAmount(age,heavy=false){
 if(!Number.isFinite(age)||age<0||age>=.42)return 0;
 const kick=age<.055?1-age/.055*.28:.72*Math.exp(-(age-.055)*15);
 return kick*(heavy?.095:.055);
}
