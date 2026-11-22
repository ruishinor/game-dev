// Cosmetic back mount for the joined Electrical Combat Rod.
// The humanoid faces local +Z. A stowed rod is centered between the shoulders,
// close behind the torso, and crosses the back toward the opposite hip.
// Return the bind-pose mount in the animated spine bone's local coordinates.
// This changes no weapon state, inventory, hit detection, or combat results.
export function createRodBackMount(T, humanoid, spine) {
  const right=humanoid?.getObjectByName('upperarm_r');
  const left=humanoid?.getObjectByName('upperarm_l');
  if(!right||!left||!spine)return null;
  humanoid.updateWorldMatrix(true,true);
  const shoulder=right.getWorldPosition(new T.Vector3())
    .add(left.getWorldPosition(new T.Vector3())).multiplyScalar(.5);
  humanoid.worldToLocal(shoulder);
  // The joined rod is 1.52 m long. Centering 0.28 m below the shoulders,
  // with a shallow back offset, puts its tips near shoulder and hip height.
  // The old (.30, 1.34, -.52) body-space position left it floating outboard.
  const probe=new T.Object3D();
  probe.position.copy(shoulder).add(new T.Vector3(0,-.28,-.32));
  probe.quaternion.setFromUnitVectors(
    new T.Vector3(0,1,0),new T.Vector3(.64,1,0).normalize());
  humanoid.add(probe);
  probe.updateWorldMatrix(true);
  spine.attach(probe);
  const mount={position:probe.position.clone(),quaternion:probe.quaternion.clone()};
  probe.removeFromParent();
  return mount;
}
