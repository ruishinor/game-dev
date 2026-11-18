// glTF-side helpers for refitting the humanoid rig: read the rest pose, move
// joints to new world positions (keeping every rest rotation) and recompute
// the inverse bind matrices.

/** {name: {parent, world}} for every skin joint, in the document's world space. */
export function readRig(skin) {
  const rig = {};
  for (const j of skin.listJoints()) rig[j.getName()] = { parent: j.getParentNode()?.getName() || null, world: j.getWorldTranslation() };
  return rig;
}

// column-major mat4 helpers (rigid + uniform scale only)
function invertAffine(m) {
  // general 4x4 inverse for affine matrices
  const [a00, a01, a02, , a10, a11, a12, , a20, a21, a22, , a30, a31, a32] = m;
  const b01 = a22 * a11 - a12 * a21;
  const b11 = -a22 * a10 + a12 * a20;
  const b21 = a21 * a10 - a11 * a20;
  let det = a00 * b01 + a01 * b11 + a02 * b21;
  det = 1 / det;
  const o = new Array(16).fill(0);
  o[0] = b01 * det;
  o[1] = (-a22 * a01 + a02 * a21) * det;
  o[2] = (a12 * a01 - a02 * a11) * det;
  o[4] = b11 * det;
  o[5] = (a22 * a00 - a02 * a20) * det;
  o[6] = (-a12 * a00 + a02 * a10) * det;
  o[8] = b21 * det;
  o[9] = (-a21 * a00 + a01 * a20) * det;
  o[10] = (a11 * a00 - a01 * a10) * det;
  o[12] = -(a30 * o[0] + a31 * o[4] + a32 * o[8]);
  o[13] = -(a30 * o[1] + a31 * o[5] + a32 * o[9]);
  o[14] = -(a30 * o[2] + a31 * o[6] + a32 * o[10]);
  o[15] = 1;
  return o;
}
const xform = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];

/** Move joints (top-down) so their world translation equals world[name]. */
export function moveJoints(skin, world) {
  const joints = skin.listJoints();
  const depth = (n) => (n.getParentNode() ? 1 + depth(n.getParentNode()) : 0);
  for (const j of [...joints].sort((a, b) => depth(a) - depth(b))) {
    const w = world[j.getName()];
    if (!w) continue;
    const parent = j.getParentNode();
    const local = parent ? xform(invertAffine(parent.getWorldMatrix()), w) : w;
    j.setTranslation(local);
  }
  const ibm = skin.getInverseBindMatrices();
  const arr = new Float32Array(joints.length * 16);
  joints.forEach((j, i) => arr.set(invertAffine(j.getWorldMatrix()), i * 16));
  ibm.setArray(arr);
}
