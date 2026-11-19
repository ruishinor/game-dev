"""Mechanical humanoid rig built on an existing runtime skeleton (no Blender).

Approach (documented in tools/asset-pipeline/README.md):

* The Halo skeleton copies the project's humanoid skeleton exactly: same
  joint names, hierarchy and *rest local rotations*. Only joint positions
  change, so every existing humanoid clip (absolute local rotations plus a
  pelvis translation) drives it without per-key conversion. A uniform scale
  `k` on `root` adapts the clips' pelvis translation to Halo's proportions;
  k is solved so the feet of the first Idle_Loop frame land on the ground.
* The bind pose is the source mesh's own pose. Each bone's bind world
  rotation is its humanoid rest rotation pre-multiplied by the minimal
  rotation that turns the humanoid bone direction onto the Halo landmark
  direction, so under any clip a Halo bone points where the humanoid bone
  points. A `Bind_Pose` clip reproduces the source mesh exactly (tested).
* Skin weights are rigid per segment, with smooth blends only inside
  narrow bands at the mechanical couplings (elbow, wrist, knee, ankle,
  spine, neck) and wider ones at the shoulders and the cloth at the hips.
  Ceramic shells therefore stay rigid; couplings and garments flex.

Frames: glTF (+Y up, +Z forward), metres, quaternions as (x, y, z, w).
"""
from __future__ import annotations

import json

import numpy as np
from scipy.spatial import cKDTree

# ---------------------------------------------------------------- quaternions


def qmul(a, b):
    ax, ay, az, aw = np.moveaxis(np.asarray(a, float), -1, 0)
    bx, by, bz, bw = np.moveaxis(np.asarray(b, float), -1, 0)
    return np.stack([aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
                     aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz], -1)


def qinv(q):
    q = np.asarray(q, float)
    return np.concatenate([-q[..., :3], q[..., 3:]], -1)


def qrot(q, v):
    q = np.asarray(q, float)
    v = np.asarray(v, float)
    u, w = q[..., :3], q[..., 3:4]
    t = 2 * np.cross(u, v)
    return v + w * t + np.cross(u, t)


def qnorm(q):
    q = np.asarray(q, float)
    return q / np.linalg.norm(q, axis=-1, keepdims=True)


def q_between(a, b):
    """Minimal rotation taking direction a to direction b."""
    a = np.asarray(a, float) / np.linalg.norm(a)
    b = np.asarray(b, float) / np.linalg.norm(b)
    c = np.cross(a, b)
    d = float(np.dot(a, b))
    if d < -0.999999:
        axis = np.cross(a, [1, 0, 0])
        if np.linalg.norm(axis) < 1e-6:
            axis = np.cross(a, [0, 1, 0])
        axis /= np.linalg.norm(axis)
        return np.array([*axis, 0.0])
    return qnorm(np.array([*c, 1 + d]))


def q_axis_angle(axis, ang):
    axis = np.asarray(axis, float) / np.linalg.norm(axis)
    return np.array([*(axis * np.sin(ang / 2)), np.cos(ang / 2)])


def qslerp(a, b, t):
    a, b = np.asarray(a, float), np.asarray(b, float)
    d = np.sum(a * b, -1, keepdims=True)
    b = np.where(d < 0, -b, b)
    d = np.abs(d)
    lin = d > 0.9995
    th = np.arccos(np.clip(d, -1, 1))
    s = np.sin(th)
    wa = np.where(lin, 1 - t, np.sin((1 - t) * th) / np.where(s == 0, 1, s))
    wb = np.where(lin, t, np.sin(t * th) / np.where(s == 0, 1, s))
    return qnorm(wa * a + wb * b)


def trs(t, r, s):
    x, y, z, w = r
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    M = np.eye(4)
    M[:3, :3] = R * np.asarray(s, float)[None, :]
    M[:3, 3] = t
    return M


# ---------------------------------------------------------------- skeleton


class Skeleton:
    """Node hierarchy (names, parents, rest TRS) with forward kinematics."""

    def __init__(self, nodes):
        self.names = [n["name"] for n in nodes]
        self.index = {n: i for i, n in enumerate(self.names)}
        self.parent = [self.index.get(n["parent"], -1) if n["parent"] else -1 for n in nodes]
        self.t = np.array([n.get("t") or [0, 0, 0] for n in nodes], float)
        self.r = np.array([n.get("r") or [0, 0, 0, 1] for n in nodes], float)
        self.s = np.array([n.get("s") or [1, 1, 1] for n in nodes], float)
        self.joint = [bool(n.get("joint", True)) for n in nodes]
        order, seen = [], set()

        def visit(i):
            if i in seen:
                return
            if self.parent[i] >= 0:
                visit(self.parent[i])
            seen.add(i)
            order.append(i)
        for i in range(len(nodes)):
            visit(i)
        self.order = order

    def children(self, name):
        i = self.index[name]
        return [self.names[j] for j, p in enumerate(self.parent) if p == i]

    def world(self, t=None, r=None, s=None):
        t = self.t if t is None else t
        r = self.r if r is None else r
        s = self.s if s is None else s
        W = np.zeros((len(self.names), 4, 4))
        for i in self.order:
            L = trs(t[i], r[i], s[i])
            W[i] = L if self.parent[i] < 0 else W[self.parent[i]] @ L
        return W


def world_rot(W):
    """Rotation quaternions of (uniformly scaled) world matrices."""
    out = []
    for M in W:
        R = M[:3, :3] / np.linalg.norm(M[:3, 0])
        tr = np.trace(R)
        if tr > 0:
            s = np.sqrt(tr + 1) * 2
            q = [(R[2, 1] - R[1, 2]) / s, (R[0, 2] - R[2, 0]) / s, (R[1, 0] - R[0, 1]) / s, 0.25 * s]
        else:
            i = int(np.argmax(np.diag(R)))
            j, k = (i + 1) % 3, (i + 2) % 3
            s = np.sqrt(1 + R[i, i] - R[j, j] - R[k, k]) * 2
            q = [0, 0, 0, (R[k, j] - R[j, k]) / s]
            q[i] = 0.25 * s
            q[j] = (R[j, i] + R[i, j]) / s
            q[k] = (R[k, i] + R[i, k]) / s
        out.append(qnorm(np.array(q)))
    return np.array(out)


# Bones whose bind direction is fitted to a landmark: bone -> landmark the bone points at.
# Hands, feet and toes are deliberately absent: they keep the reference's rest
# orientation relative to their parent. Halo's ankle pivot sits far higher
# above the sole than the reference's, so aiming the foot at the ball would
# make every clip tip the heel through the ground; inheriting keeps a flat
# reference foot flat. Their children are still placed at Halo landmarks.
AIM = {
    "pelvis": "spine_01", "spine_01": "spine_02", "spine_02": "spine_03", "spine_03": "neck_01",
    "neck_01": "Head", "Head": "head_top",
    "clavicle_l": "upperarm_l", "upperarm_l": "lowerarm_l", "lowerarm_l": "hand_l",
    "clavicle_r": "upperarm_r", "upperarm_r": "lowerarm_r", "lowerarm_r": "hand_r",
    "thigh_l": "calf_l", "calf_l": "foot_l", "thigh_r": "calf_r", "calf_r": "foot_r",
}
# humanoid node standing in for a landmark that is not itself a joint
LANDMARK_PROXY = {"head_top": ("Head", 0.25), "hand_tip_l": ("middle_04_leaf_l", None), "hand_tip_r": ("middle_04_leaf_r", None),
                  "toe_l": ("ball_leaf_l", None), "toe_r": ("ball_leaf_r", None)}


def complete_landmarks(L, ref: Skeleton, Wref):
    """Spine and clavicle positions from the reference proportions."""
    P = {k: np.asarray(v, float) for k, v in L.items()}
    pos = {n: Wref[i][:3, 3] for i, n in enumerate(ref.names)}
    yp, yn = pos["pelvis"][1], pos["neck_01"][1]
    for b in ("spine_01", "spine_02", "spine_03"):
        f = (pos[b][1] - yp) / (yn - yp)
        P[b] = P["pelvis"] + f * (P["neck_01"] - P["pelvis"])
    torso = (P["neck_01"][1] - P["pelvis"][1]) / (yn - yp)
    for s in ("l", "r"):
        sx = abs(P["upperarm_" + s][0]) / abs(pos["upperarm_" + s][0])
        off = pos["clavicle_" + s] - pos["spine_03"]
        P["clavicle_" + s] = P["spine_03"] + np.array([off[0] * sx, off[1] * torso, off[2] * torso])
    return P


def build_rig(ref_json, landmarks, *, root_name="root"):
    """Halo skeleton: returns dict with nodes, bind data and helpers."""
    ref = Skeleton(ref_json["nodes"])
    Wr = ref.world()
    Rr = world_rot(Wr)
    Pr = Wr[:, :3, 3]
    P = complete_landmarks(landmarks, ref, Wr)
    n = len(ref.names)
    Rb = Rr.copy()
    Pb = Pr.copy()

    def ref_target(name):
        if name in ref.index:
            return Pr[ref.index[name]]
        proxy, ext = LANDMARK_PROXY[name]
        if ext is None:
            return Pr[ref.index[proxy]]
        i = ref.index[proxy]
        return Pr[i] + qrot(Rr[i], [0, ext, 0])

    for i in ref.order:
        name = ref.names[i]
        p = ref.parent[i]
        if name in P:
            Pb[i] = P[name]
        elif p >= 0:
            # carry the reference offset in the parent's bind frame, scaled by the parent's length ratio
            par = ref.names[p]
            ratio = 1.0
            if par in AIM:
                tgt = AIM[par]
                lr = np.linalg.norm(ref_target(tgt) - Pr[p])
                lh = np.linalg.norm(P[tgt] - P[par]) if tgt in P and par in P else lr
                ratio = lh / max(lr, 1e-9)
            local = qrot(qinv(Rr[p]), Pr[i] - Pr[p])
            Pb[i] = Pb[p] + qrot(Rb[p], local * ratio)
        if name in AIM and AIM[name] in P:
            d_ref = ref_target(AIM[name]) - Pr[i]
            d_halo = P[AIM[name]] - Pb[i]
            Rb[i] = qmul(q_between(d_ref, d_halo), Rr[i])
        elif p >= 0:
            Rb[i] = qmul(Rb[p], qmul(qinv(Rr[p]), Rr[i]))
    return {"ref": ref, "Pr": Pr, "Rr": Rr, "Pb": Pb, "Rb": Rb, "landmarks": P}


def make_nodes(rig, k):
    """Halo node list: reference rest rotations, Halo translations, root scale k."""
    ref = rig["ref"]
    Pb, Rb = rig["Pb"], rig["Rb"]
    nodes = []
    for i, name in enumerate(ref.names):
        p = ref.parent[i]
        node = {"name": name, "parent": ref.names[p] if p >= 0 else None, "r": ref.r[i].tolist(),
                "s": [1.0, 1.0, 1.0], "joint": ref.joint[i]}
        if name == "root":
            node["s"] = [k, k, k]
            node["t"] = ref.t[i].tolist()
        elif p < 0 or not ref.joint[p]:
            node["t"] = ref.t[i].tolist()
        else:
            # child offset in the parent's bind frame, undoing the root scale
            node["t"] = (qrot(qinv(Rb[p]), Pb[i] - Pb[p]) / k).tolist()
        nodes.append(node)
    return nodes


def bind_local_rotations(rig):
    ref, Rb = rig["ref"], rig["Rb"]
    out = {}
    for i, name in enumerate(ref.names):
        p = ref.parent[i]
        if not ref.joint[i]:
            continue
        if p >= 0 and ref.joint[p]:
            out[name] = qnorm(qmul(qinv(Rb[p]), Rb[i]))
        else:
            # top joint (root): world rotation of the non-joint ancestors is identity in the reference
            out[name] = qnorm(Rb[i]) if p < 0 else qnorm(qmul(qinv(world_rot(ref.world()[[p]])[0]), Rb[i]))
    return out


# ---------------------------------------------------------------- clips


def sample_channel(times, values, interp, t, path):
    times = np.asarray(times, float)
    v = np.asarray(values, float).reshape(len(times), -1)
    if t <= times[0] or len(times) == 1:
        return v[0]
    if t >= times[-1]:
        return v[-1]
    j = int(np.searchsorted(times, t) - 1)
    if interp == "STEP":
        return v[j]
    a = (t - times[j]) / (times[j + 1] - times[j])
    if path == "rotation":
        return qslerp(v[j], v[j + 1], a)
    return v[j] * (1 - a) + v[j + 1] * a


def pose_at(skel: Skeleton, clip, t):
    T, R, S = skel.t.copy(), skel.r.copy(), skel.s.copy()
    for ch in clip["channels"]:
        i = skel.index.get(ch["node"])
        if i is None:
            continue
        v = sample_channel(ch["times"], ch["values"], ch.get("interpolation", "LINEAR"), t, ch["path"])
        {"translation": T, "rotation": R, "scale": S}[ch["path"]][i] = v
    return T, R, S


def clip_length(clip):
    return max(ch["times"][-1] for ch in clip["channels"])


# ---------------------------------------------------------------- skinning


def inverse_binds(skel: Skeleton, bind_clip):
    W = skel.world(*pose_at(skel, bind_clip, 0.0))
    return np.linalg.inv(W)


def skin(skel, IBM, joints_idx, V, J, Wt, pose):
    """Linear blend skinning. J/Wt: (n,4) joint *skin* indices and weights."""
    W = skel.world(*pose)
    M = np.einsum("jab,jbc->jac", W[joints_idx], IBM[joints_idx])
    Vh = np.c_[V, np.ones(len(V))]
    out = np.zeros((len(V), 3))
    for c in range(J.shape[1]):
        out += Wt[:, c:c + 1] * np.einsum("nab,nb->na", M[J[:, c]], Vh)[:, :3]
    return out


def _ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def chain_weights(V, joints, bones, widths):
    """Rigid segments with smooth blends across each joint plane.

    joints: [(J position, incoming dir, outgoing dir)] between consecutive bones.
    Returns (n, len(bones)) weights.
    """
    m = []
    for (J, d1, d2), h in zip(joints, widths):
        nrm = d1 / np.linalg.norm(d1) + d2 / np.linalg.norm(d2)
        nrm /= np.linalg.norm(nrm)
        m.append(_ss(-h, h, (V - J) @ nrm))
    W = np.zeros((len(V), len(bones)))
    acc = np.ones(len(V))
    for i in range(len(bones)):
        if i < len(m):
            W[:, i] = acc * (1 - m[i])
            acc = acc * m[i]
        else:
            W[:, i] = acc
    return W


def body_weights(V, regions, region_names, rig, cfg):
    """Per-vertex bone weights (dict bone -> array) for the body mesh."""
    P = rig["landmarks"]
    n = len(V)
    R = {nm: regions == i for i, nm in enumerate(region_names)}
    w = {}

    def add(b, arr):
        w[b] = w.get(b, np.zeros(n)) + arr

    bw = cfg["blend_widths"]
    up = np.array([0, 1.0, 0])
    # torso chain (vertical planes at each spine joint)
    spine = ["pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "Head"]
    sj = [(P[b], up, up) for b in spine[1:]]
    Wt = chain_weights(V, sj, spine, [bw["spine"]] * 3 + [bw["neck"], bw["head"]])
    torso_like = R["torso"] | R["head"]
    # hips: torso and upper-leg vertices blend into the thigh of their side below the hip
    hip_y = P["thigh_l"][1]
    leg_m = _ss(bw["hip"], -bw["hip"], V[:, 1] - hip_y) * _ss(0.0, 0.035, np.abs(V[:, 0]))
    # shoulders: lateral torso vertices follow clavicle then upper arm
    ax = np.abs(V[:, 0])
    sh = cfg["shoulder"]
    high = _ss(sh["y"][0], sh["y"][1], V[:, 1])
    arm_m = _ss(sh["arm_x"][0], sh["arm_x"][1], ax) * high
    clav_m = _ss(sh["clav_x"][0], sh["clav_x"][1], ax) * high * (1 - arm_m)
    rest = 1 - leg_m - arm_m - clav_m
    for i, b in enumerate(spine):
        add(b, np.where(torso_like, Wt[:, i] * rest, 0))
    for s, sg in (("l", 1), ("r", -1)):
        side = (V[:, 0] * sg) > 0
        add("clavicle_" + s, np.where(torso_like & side, clav_m, 0))
        # arm chain
        arm = R["arm_" + s]
        chain = ["upperarm_" + s, "lowerarm_" + s, "hand_" + s]
        js = [(P["lowerarm_" + s], P["lowerarm_" + s] - P["upperarm_" + s], P["hand_" + s] - P["lowerarm_" + s]),
              (P["hand_" + s], P["hand_" + s] - P["lowerarm_" + s], P["hand_tip_" + s] - P["hand_" + s])]
        Wa = chain_weights(V, js, chain, [bw["elbow"], bw["wrist"]])
        # top of the arm region blends into the clavicle
        top = _ss(P["upperarm_" + s][1] - 0.02, P["upperarm_" + s][1] + 0.05, V[:, 1])
        for i, b in enumerate(chain):
            add(b, np.where(arm, Wa[:, i] * (1 - 0.5 * top), 0) + np.where(torso_like & side, arm_m * Wa[:, i], 0))
        add("clavicle_" + s, np.where(arm, 0.5 * top * Wa[:, 0], 0))
        # leg chain
        leg = R["leg_" + s]
        lchain = ["thigh_" + s, "calf_" + s, "foot_" + s, "ball_" + s]
        lj = [(P["calf_" + s], P["calf_" + s] - P["thigh_" + s], P["foot_" + s] - P["calf_" + s]),
              (P["foot_" + s], P["foot_" + s] - P["calf_" + s], P["ball_" + s] - P["foot_" + s]),
              (P["ball_" + s], P["ball_" + s] - P["foot_" + s], P["toe_" + s] - P["ball_" + s])]
        Wl = chain_weights(V, lj, lchain, [bw["knee"], bw["ankle"], bw["ball"]])
        for i, b in enumerate(lchain):
            add(b, np.where(leg, Wl[:, i] * leg_m + (Wl[:, i] if i == 0 else 0) * 0, 0)
                + np.where(torso_like & side, leg_m * Wl[:, i], 0))
        add("pelvis", np.where(leg & side, 1 - leg_m, 0))
    return w


def pack_weights(wdict, joint_names, max_influences=4):
    names = list(wdict)
    M = np.stack([wdict[b] for b in names], 1)
    M = np.clip(M, 0, None)
    order = np.argsort(-M, 1)[:, :max_influences]
    Wt = np.take_along_axis(M, order, 1)
    s = Wt.sum(1, keepdims=True)
    if (s <= 1e-9).any():
        raise ValueError(f"{int((s <= 1e-9).sum())} vertices have no bone influence")
    Wt = Wt / s
    J = np.array([[joint_names.index(names[k]) for k in row] for row in order])
    return J, Wt


def transfer_weights(Vg, Vb, Jb, Wb, rigid=None, joint_names=None, k=6):
    """Garment weights: inverse-distance blend of the nearest body vertices,
    or one rigid bone (rigid plates must not bend across a joint)."""
    if rigid:
        j = joint_names.index(rigid)
        J = np.zeros((len(Vg), 4), int)
        J[:, 0] = j
        W = np.zeros((len(Vg), 4))
        W[:, 0] = 1
        return J, W
    d, idx = cKDTree(Vb).query(Vg, k=k)
    w = 1 / np.maximum(d, 1e-4) ** 2
    acc = {}
    nj = len(joint_names)
    dense = np.zeros((len(Vg), nj))
    for c in range(k):
        for slot in range(4):
            np.add.at(dense, (np.arange(len(Vg)), Jb[idx[:, c], slot]), w[:, c] * Wb[idx[:, c], slot])
    order = np.argsort(-dense, 1)[:, :4]
    W = np.take_along_axis(dense, order, 1)
    W /= W.sum(1, keepdims=True)
    return order, W


# ---------------------------------------------------------------- authored clips


def two_bone_ik(a, b, c, target, pole):
    """New positions of b (elbow) and c (wrist) for chain a-b-c reaching target."""
    l1, l2 = np.linalg.norm(b - a), np.linalg.norm(c - b)
    d = target - a
    dist = np.clip(np.linalg.norm(d), 1e-6, l1 + l2 - 1e-4)
    d = d / np.linalg.norm(d)
    cos_a = np.clip((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1)
    pdir = pole - a
    pdir = pdir - d * np.dot(pdir, d)
    pdir /= np.linalg.norm(pdir)
    elbow = a + d * (l1 * cos_a) + pdir * (l1 * np.sqrt(1 - cos_a * cos_a))
    wrist = a + d * dist
    return elbow, wrist


def json_dump(path, obj):
    with open(path, "w") as f:
        json.dump(obj, f, indent=1, default=lambda o: o.tolist() if isinstance(o, np.ndarray) else float(o))
