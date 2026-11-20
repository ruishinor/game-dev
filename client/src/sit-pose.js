// Procedural seated pose for the sit/stand emote. The bundled animation
// library has no sitting clip, so the existing skeleton is posed on top of
// the sampled idle animation: pelvis lowered to the ground, knees raised,
// slight forward lean, hands resting on the knees. Cosmetic only; posture
// itself is server state (public row flag). Works in the humanoid's local
// space (+Y up, +Z forward), measured from the bind pose, so it does not
// depend on per-bone axis conventions.
const SEAT = 0.17;          // pelvis height above the feet when seated
const THIGH_RISE = 0.62;    // radians above horizontal (knees up)

export function createSitPose(T, humanoid) {
  const bone = n => humanoid.getObjectByName(n);
  const names = ['pelvis', 'spine_01', 'spine_02', 'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r',
    'upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r'];
  const b = Object.fromEntries(names.map(n => [n, bone(n)]));
  if (names.some(n => !b[n])) return null;
  const v = () => new T.Vector3(), q = () => new T.Quaternion();
  const world = n => n.getWorldPosition(v());
  const local = n => humanoid.worldToLocal(world(n));
  const toWorld = p => humanoid.localToWorld(p.clone());
  humanoid.updateWorldMatrix(true, true);
  const len = (a, c) => local(a).distanceTo(local(c));
  const L = { thigh: len(b.thigh_l, b.calf_l), calf: len(b.calf_l, b.foot_l), upper: len(b.upperarm_l, b.lowerarm_l), lower: len(b.lowerarm_l, b.hand_l) };
  const footY = (local(b.foot_l).y + local(b.foot_r).y) / 2;
  const animated = new Map(), pelvisAnimated = v();
  function orient(boneNode, child, targetWorld) {
    const at = world(boneNode), current = world(child).sub(at).normalize(), desired = targetWorld.clone().sub(at).normalize();
    if (current.lengthSq() < .9 || desired.lengthSq() < .9) return;
    const turn = q().setFromUnitVectors(current, desired);
    const rotation = boneNode.getWorldQuaternion(q()).premultiply(turn);
    boneNode.quaternion.copy(boneNode.parent.getWorldQuaternion(q()).invert().multiply(rotation));
    boneNode.updateWorldMatrix(true, true);
  }
  // Two-bone limb toward a target with an outward/backward elbow pole.
  function reach(upper, lower, hand, target, side) {
    const start = local(upper), dir = target.clone().sub(start), d = Math.min(dir.length(), L.upper + L.lower - 1e-3);
    dir.normalize();
    const pole = new T.Vector3(side * .8, -.2, -.6);
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const along = (L.upper * L.upper - L.lower * L.lower + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L.upper * L.upper - along * along));
    const elbow = start.clone().addScaledVector(dir, along).addScaledVector(pole, h);
    orient(upper, lower, toWorld(elbow));
    orient(lower, hand, toWorld(start.clone().addScaledVector(dir, d)));
  }
  return {
    /** Apply after the animation sample. k in [0,1] blends from the animated pose. */
    apply(k) {
      if (!(k > 0)) return;
      humanoid.updateWorldMatrix(true, true);
      animated.clear();
      for (const n of names) animated.set(n, b[n].quaternion.clone());
      pelvisAnimated.copy(b.pelvis.position);
      // 1. Lower the pelvis to the ground, slightly back.
      const pelvis = local(b.pelvis);
      const seat = new T.Vector3(pelvis.x, footY + SEAT, pelvis.z - .06);
      b.pelvis.position.copy(b.pelvis.parent.worldToLocal(toWorld(seat)));
      b.pelvis.updateWorldMatrix(true, true);
      // 2. Lean the spine forward a little.
      const s1 = local(b.spine_01);
      orient(b.spine_01, b.spine_02, toWorld(s1.clone().add(new T.Vector3(0, 1, .28).normalize().multiplyScalar(len(b.spine_01, b.spine_02)))));
      // 3. Knees up, feet flat in front.
      const knees = {};
      for (const [side, s] of [['l', 1], ['r', -1]]) {
        const hip = local(b['thigh_' + side]);
        const knee = hip.clone().add(new T.Vector3(s * .07, Math.sin(THIGH_RISE), Math.cos(THIGH_RISE)).normalize().multiplyScalar(L.thigh));
        orient(b['thigh_' + side], b['calf_' + side], toWorld(knee));
        const drop = Math.max(0, knee.y - (footY + .02)), ahead = Math.sqrt(Math.max(0, L.calf * L.calf - drop * drop));
        const ankle = knee.clone().add(new T.Vector3(s * .02, -drop, ahead));
        orient(b['calf_' + side], b['foot_' + side], toWorld(ankle));
        orient(b['foot_' + side], b['ball_' + side], toWorld(local(b['foot_' + side]).add(new T.Vector3(0, -.03, .12))));
        knees[side] = local(b['calf_' + side]);
      }
      // 4. Hands resting on the knees.
      for (const [side, s] of [['l', 1], ['r', -1]])
        reach(b['upperarm_' + side], b['lowerarm_' + side], b['hand_' + side], knees[side].clone().add(new T.Vector3(s * .02, .07, -.03)), s);
      // Blend toward the seated result.
      if (k < 1) {
        for (const n of names) b[n].quaternion.copy(animated.get(n).slerp(b[n].quaternion, k));
        b.pelvis.position.lerpVectors(pelvisAnimated, b.pelvis.position, k);
      }
      humanoid.updateWorldMatrix(true, true);
    },
  };
}
