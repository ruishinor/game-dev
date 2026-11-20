// Procedural cross-legged seated pose for the sit/stand emote, following the
// owner's seated-pose reference sheet (2026-11-20): pelvis on the ground
// plane, knees wide and low, shins crossed in front with each foot tucked
// under the opposite knee, a slightly rounded forward lean with the head
// kept up, forearms resting on the knees and hands draped over them.
// The bundled animation library has no sitting clip, so the existing skeleton
// is posed on top of the sampled idle animation. Cosmetic only; posture is
// server state (public row flag). Works in the humanoid's local space
// (+Y up, +Z forward), measured from the bind pose, so it does not depend on
// per-bone axis conventions; the left/right sign is read from the hips.
const POSE = Object.freeze({
  seat: 0.13,          // pelvis joint above the ground plane
  pelvisBack: 0.05,    // pelvis shifted back so the crossed shins sit in front
  kneeSpread: 0.78,    // thigh direction: outward, slightly down, forward
  kneeDrop: -0.16,
  kneeAhead: 0.6,
  shinAcross: 0.94,    // shin direction: across the body, nearly level
  shinRise: -0.06,
  shinAhead: 0.02,
  cross: 0.1,          // front/back layering of the crossed shins
  lean: 0.2,           // forward lean of the lower spine
  round: 0.14,         // additional rounding of the upper spine
});

export function createSitPose(T, humanoid) {
  const bone = n => humanoid.getObjectByName(n);
  const names = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head',
    'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r',
    'upperarm_l', 'lowerarm_l', 'hand_l', 'middle_01_l', 'upperarm_r', 'lowerarm_r', 'hand_r', 'middle_01_r'];
  const b = Object.fromEntries(names.map(n => [n, bone(n)]));
  if (names.some(n => !b[n])) return null;
  const v = () => new T.Vector3(), q = () => new T.Quaternion();
  const world = n => n.getWorldPosition(v());
  const local = n => humanoid.worldToLocal(world(n));
  const toWorld = p => humanoid.localToWorld(p.clone());
  humanoid.updateWorldMatrix(true, true);
  const len = (a, c) => local(a).distanceTo(local(c));
  const L = { thigh: len(b.thigh_l, b.calf_l), calf: len(b.calf_l, b.foot_l), upper: len(b.upperarm_l, b.lowerarm_l), lower: len(b.lowerarm_l, b.hand_l) };
  // Ground plane: the balls of the feet rest just above it in the bind pose.
  const ground = Math.min(local(b.ball_l).y, local(b.ball_r).y) - 0.025;
  const ankleLift = Math.min(local(b.foot_l).y, local(b.foot_r).y) - ground;
  // Character-left is the side of thigh_l, whatever the rig's axis sign.
  const left = Math.sign(local(b.thigh_l).x - local(b.thigh_r).x) || 1;
  const sides = [['l', left], ['r', -left]];
  const animated = new Map(), pelvisAnimated = v();
  function orient(boneNode, child, targetWorld) {
    const at = world(boneNode), current = world(child).sub(at).normalize(), desired = targetWorld.clone().sub(at).normalize();
    if (current.lengthSq() < .9 || desired.lengthSq() < .9) return;
    const turn = q().setFromUnitVectors(current, desired);
    const rotation = boneNode.getWorldQuaternion(q()).premultiply(turn);
    boneNode.quaternion.copy(boneNode.parent.getWorldQuaternion(q()).invert().multiply(rotation));
    boneNode.updateWorldMatrix(true, true);
  }
  const aim = (boneNode, child, dir) => orient(boneNode, child, toWorld(local(boneNode).add(dir.clone().normalize().multiplyScalar(Math.max(.05, len(boneNode, child))))));
  // Two-bone limb toward a target with an outward/backward elbow pole.
  function reach(upper, lower, hand, target, s) {
    const start = local(upper), dir = target.clone().sub(start), d = Math.min(dir.length(), L.upper + L.lower - 1e-3);
    dir.normalize();
    const pole = new T.Vector3(s * .85, -.15, -.5);
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const along = (L.upper * L.upper - L.lower * L.lower + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L.upper * L.upper - along * along));
    const elbow = start.clone().addScaledVector(dir, along).addScaledVector(pole, h);
    orient(upper, lower, toWorld(elbow));
    orient(lower, hand, toWorld(start.clone().addScaledVector(dir, d)));
  }
  return {
    pose: POSE,
    /** Apply after the animation sample. k in [0,1] blends from the animated pose. */
    apply(k) {
      if (!(k > 0)) return;
      humanoid.updateWorldMatrix(true, true);
      animated.clear();
      for (const n of names) animated.set(n, b[n].quaternion.clone());
      pelvisAnimated.copy(b.pelvis.position);
      // 1. Pelvis on the ground plane, slightly back.
      const pelvis = local(b.pelvis);
      b.pelvis.position.copy(b.pelvis.parent.worldToLocal(toWorld(new T.Vector3(pelvis.x, ground + POSE.seat, pelvis.z - POSE.pelvisBack))));
      b.pelvis.updateWorldMatrix(true, true);
      // 2. Rounded forward lean; the neck brings the head back up to look ahead.
      aim(b.spine_01, b.spine_02, new T.Vector3(0, 1, POSE.lean));
      aim(b.spine_02, b.spine_03, new T.Vector3(0, 1, POSE.lean + POSE.round));
      aim(b.spine_03, b.neck_01, new T.Vector3(0, 1, POSE.lean + POSE.round * .6));
      aim(b.neck_01, b.Head, new T.Vector3(0, 1, .08));
      // 3. Crossed legs: knees wide and low, each shin across to the other side.
      const knees = {};
      for (const [side, s] of sides) {
        const layer = side === 'l' ? 1 : -1; // left shin crosses in front
        const hip = local(b['thigh_' + side]);
        const knee = hip.clone().add(new T.Vector3(s * POSE.kneeSpread, POSE.kneeDrop, POSE.kneeAhead).normalize().multiplyScalar(L.thigh));
        knee.y = Math.max(knee.y, ground + .1);
        orient(b['thigh_' + side], b['calf_' + side], toWorld(knee));
        const shin = new T.Vector3(-s * POSE.shinAcross, POSE.shinRise, POSE.shinAhead + layer * POSE.cross).normalize().multiplyScalar(L.calf);
        const ankle = local(b['calf_' + side]).add(shin);
        ankle.y = Math.max(ankle.y, ground + ankleLift * .75 + (layer > 0 ? .03 : 0));
        orient(b['calf_' + side], b['foot_' + side], toWorld(ankle));
        // Foot tucked under the opposite knee: toes forward and outward, resting on its outer edge.
        aim(b['foot_' + side], b['ball_' + side], new T.Vector3(-s * .45, -.25, .85));
        knees[side] = local(b['calf_' + side]);
      }
      // 4. Forearms on the knees, hands draped over them.
      for (const [side, s] of sides) {
        reach(b['upperarm_' + side], b['lowerarm_' + side], b['hand_' + side], knees[side].clone().add(new T.Vector3(-s * .04, .1, .06)), s);
        aim(b['hand_' + side], b['middle_01_' + side], new T.Vector3(s * .1, -.85, .45));
      }
      // Blend toward the seated result.
      if (k < 1) {
        for (const n of names) b[n].quaternion.copy(animated.get(n).slerp(b[n].quaternion, k));
        b.pelvis.position.lerpVectors(pelvisAnimated, b.pelvis.position, k);
      }
      humanoid.updateWorldMatrix(true, true);
    },
  };
}
