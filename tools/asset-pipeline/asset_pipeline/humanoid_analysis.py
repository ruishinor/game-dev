"""Geometry analysis of an imported, fused humanoid mesh (no Blender).

Used by the imported-mechanical-humanoid workflow. Everything works in the
source glTF frame: +Y up, +Z forward (the character faces +Z), +X is the
character's left. Units are metres.

The source is one fused surface, so structure is recovered from the mesh
itself:

* horizontal slab clustering separates arms, legs and torso and finds the
  crotch and the arm/torso junction;
* the dark mechanical couplings (elbow, wrist, knee, ankle) are found as
  peaks of dark-texel fraction along each limb, inside configured search
  windows, and the joint pivot is the cross-section centroid at that height;
* `clean_profile` fits a smooth lower envelope to each cross-section of a
  body region, so baked-in accessories (pouches, straps, flaps) can be
  clamped back onto the body surface underneath them.
"""
from __future__ import annotations

import json
import struct
from dataclasses import dataclass

import numpy as np
import scipy.sparse as sp
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree

# ---------------------------------------------------------------- loading


@dataclass
class SourceMesh:
    V: np.ndarray        # (n,3) float64 positions
    F: np.ndarray        # (m,3) int faces
    UV: np.ndarray       # (n,2) glTF UVs (v down from top is 1-v)
    image: np.ndarray    # (h,w,3) uint8 RGB base colour atlas
    vertex_rgb: np.ndarray  # (n,3) float [0,1] atlas colour at each vertex
    stats: dict


def _accessor(j, binbuf, idx):
    acc = j["accessors"][idx]
    bv = j["bufferViews"][acc["bufferView"]]
    comps = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[acc["type"]]
    dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[acc["componentType"]]
    off = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    stride = bv.get("byteStride")
    n = acc["count"]
    item = np.dtype(dt).itemsize * comps
    if stride and stride != item:
        raw = np.frombuffer(binbuf, np.uint8, count=stride * (n - 1) + item, offset=off)
        rows = np.lib.stride_tricks.as_strided(raw, (n, item), (stride, 1))
        return np.ascontiguousarray(rows).view(dt).reshape(n, comps)
    a = np.frombuffer(binbuf, dt, count=n * comps, offset=off)
    return a.reshape(n, comps) if comps > 1 else a


def read_glb(path):
    b = open(path, "rb").read()
    if b[:4] != b"glTF":
        raise ValueError(f"{path}: not a GLB")
    jlen = struct.unpack("<I", b[12:16])[0]
    j = json.loads(b[20:20 + jlen])
    rest = b[20 + jlen:]
    binbuf = rest[8:8 + struct.unpack("<I", rest[:4])[0]] if rest else b""
    return j, binbuf


def load_source(path) -> SourceMesh:
    import cv2

    j, binbuf = read_glb(path)
    if len(j.get("meshes", [])) != 1 or len(j["meshes"][0]["primitives"]) != 1:
        raise ValueError("expected exactly one mesh with one primitive")
    prim = j["meshes"][0]["primitives"][0]
    V = _accessor(j, binbuf, prim["attributes"]["POSITION"]).astype(np.float64)
    UV = _accessor(j, binbuf, prim["attributes"]["TEXCOORD_0"]).astype(np.float64)
    F = _accessor(j, binbuf, prim["indices"]).astype(np.int64).reshape(-1, 3)
    img_idx = j["textures"][j["materials"][prim["material"]]["pbrMetallicRoughness"]["baseColorTexture"]["index"]]["source"]
    bv = j["bufferViews"][j["images"][img_idx]["bufferView"]]
    data = np.frombuffer(binbuf, np.uint8, count=bv["byteLength"], offset=bv.get("byteOffset", 0))
    image = cv2.imdecode(data, cv2.IMREAD_COLOR)[..., ::-1].copy()
    H, W = image.shape[:2]
    px = np.clip((UV[:, 0] * W).astype(int), 0, W - 1)
    py = np.clip((UV[:, 1] * H).astype(int), 0, H - 1)
    rgb = image[py, px].astype(np.float64) / 255
    lo, hi = V.min(0), V.max(0)
    stats = {
        "vertices": int(len(V)), "triangles": int(len(F)),
        "meshes": len(j["meshes"]), "materials": len(j.get("materials", [])),
        "textures": len(j.get("textures", [])), "texture_size": [int(W), int(H)],
        "skins": len(j.get("skins", [])), "animations": len(j.get("animations", [])),
        "bounds_min": lo.round(4).tolist(), "bounds_max": hi.round(4).tolist(),
        "height": round(float(hi[1] - lo[1]), 4),
        "texcoord_v_convention": "glTF (row = v * height)",
    }
    return SourceMesh(V, F, UV, image, rgb, stats)


def luminance(rgb):
    return rgb @ np.array([0.3, 0.59, 0.11])


# ---------------------------------------------------------------- slabs


def slab_clusters(P, y0, y1, link=0.025, min_pts=12):
    """Connected clusters of the points in a horizontal slab, in the XZ plane."""
    idx = np.nonzero((P[:, 1] >= y0) & (P[:, 1] < y1))[0]
    if len(idx) < min_pts:
        return []
    q = P[idx][:, [0, 2]]
    pairs = cKDTree(q).query_pairs(link, output_type="ndarray")
    A = sp.coo_matrix((np.ones(len(pairs)), (pairs[:, 0], pairs[:, 1])), shape=(len(q), len(q)))
    n, lab = connected_components(A, directed=False)
    out = []
    for c in range(n):
        m = lab == c
        if m.sum() < min_pts:
            continue
        out.append({"idx": idx[m], "cx": float(q[m, 0].mean()), "cz": float(q[m, 1].mean()),
                    "wx": float(np.ptp(q[m, 0])), "wz": float(np.ptp(q[m, 1]))})
    return sorted(out, key=lambda c: c["cx"])


def split_heights(P, step=0.01, arm_x=0.2):
    """Crotch height (legs separate) and arm junction height (arms join the torso).

    Scans 1 cm slabs: the crotch is the highest slab below mid-height whose
    central (|x| < arm_x) points form two clusters; the arm junction is the
    lowest slab above the crotch where no cluster lies outside |x| > arm_x.
    """
    lo, hi = P[:, 1].min(), P[:, 1].max()
    mid = lo + 0.5 * (hi - lo)
    crotch = None
    for y in np.arange(mid, lo, -step):
        cl = [c for c in slab_clusters(P, y, y + step) if abs(c["cx"]) < arm_x]
        if len(cl) >= 2 and min(c["cx"] for c in cl) < -0.03 and max(c["cx"] for c in cl) > 0.03:
            crotch = float(y + step)
            break
    if crotch is None:
        raise ValueError("could not find the crotch (legs never separate)")
    arm_join = None
    seen_arms = False
    for y in np.arange(crotch, hi, step):
        cl = slab_clusters(P, y, y + step)
        outer = [c for c in cl if abs(c["cx"]) >= arm_x]
        if len(outer) >= 2:
            seen_arms = True
        elif seen_arms and not outer:
            arm_join = float(y)
            break
    if arm_join is None:
        raise ValueError("could not find where the arms join the torso")
    return crotch, arm_join


# ---------------------------------------------------------------- regions

REGIONS = ["torso", "head", "arm_l", "arm_r", "leg_l", "leg_r"]


def label_regions(V, crotch, arm_join, neck_top, arm_x=0.2, hand_x=0.26, step=0.01):
    """Per-vertex coarse region from slab clusters (left = +X).

    Above the crotch a cluster outside |x| >= arm_x is an arm. Below it the
    hanging hands are told from the legs and feet by |x| >= hand_x and by
    lying in the upper half of the leg span.
    """
    lab = np.full(len(V), REGIONS.index("torso"), np.int8)
    lab[V[:, 1] >= neck_top] = REGIONS.index("head")
    for y in np.arange(V[:, 1].min(), arm_join, step):
        for c in slab_clusters(V, y, y + step, min_pts=1):
            side = "l" if c["cx"] > 0 else "r"
            is_arm = abs(c["cx"]) >= arm_x if y >= crotch else (abs(c["cx"]) >= hand_x and y > 0.5 * crotch)
            if is_arm:
                lab[c["idx"]] = REGIONS.index("arm_" + side)
            elif y < crotch:
                # below the crotch a cluster can still straddle both legs (a fused flap): split by x
                ids = c["idx"]
                lab[ids] = np.where(V[ids, 0] > 0, REGIONS.index("leg_l"), REGIONS.index("leg_r"))
    return lab


def dark_band(P, lum, y_lo, y_hi, step=0.02, dark=0.35):
    """Height of the strongest dark band (fraction of dark samples) in [y_lo, y_hi)."""
    best, best_y = -1.0, None
    profile = []
    for y in np.arange(y_lo, y_hi - 1e-9, step / 2):
        m = (P[:, 1] >= y) & (P[:, 1] < y + step)
        if m.sum() < 20:
            continue
        f = float((lum[m] < dark).mean())
        profile.append((round(float(y + step / 2), 3), round(f, 3)))
        if f > best:
            best, best_y = f, float(y + step / 2)
    if best_y is None:
        raise ValueError(f"no samples between {y_lo:.2f} and {y_hi:.2f}")
    return best_y, best, profile


def section_centroid(P, y, half=0.01):
    m = np.abs(P[:, 1] - y) < half
    if m.sum() < 5:
        raise ValueError(f"empty section at y={y:.3f}")
    return P[m].mean(0)


def find_landmarks(V, rgb, cfg, samples=None):
    """Joint pivots in the source frame. Returns (landmarks dict, report dict)."""
    lum_v = luminance(rgb)
    P, lum = (V, lum_v) if samples is None else samples
    crotch, arm_join = split_heights(V)
    neck_top = cfg.get("neck_top", 1.575)
    reg_s = label_regions(P, crotch, arm_join, neck_top)
    rep = {"crotch_y": crotch, "arm_join_y": arm_join, "bands": {}}
    L = {}
    w = cfg["band_windows"]
    for side, sgn in (("l", 1), ("r", -1)):
        arm = P[reg_s == REGIONS.index("arm_" + side)]
        alum = lum[reg_s == REGIONS.index("arm_" + side)]
        bottom = float(arm[:, 1].min())
        span = arm_join - bottom
        ey, ef, eprof = dark_band(arm, alum, bottom + w["elbow"][0] * span, bottom + w["elbow"][1] * span)
        wy, wf, wprof = dark_band(arm, alum, bottom + w["wrist"][0] * span, bottom + w["wrist"][1] * span)
        rep["bands"]["elbow_" + side] = {"y": ey, "dark_fraction": ef}
        rep["bands"]["wrist_" + side] = {"y": wy, "dark_fraction": wf}
        L["lowerarm_" + side] = section_centroid(arm, ey)
        L["hand_" + side] = section_centroid(arm, wy)
        top = section_centroid(arm, arm_join - 0.03, 0.015)
        L["upperarm_" + side] = top + np.array([-sgn * cfg.get("shoulder_inset", 0.01), cfg.get("shoulder_lift", 0.04), 0.0])
        tip = arm[arm[:, 1] < bottom + 0.015].mean(0)
        L["hand_tip_" + side] = tip
        leg = P[reg_s == REGIONS.index("leg_" + side)]
        llum = lum[reg_s == REGIONS.index("leg_" + side)]
        kn, kf, _ = dark_band(leg, llum, w["knee"][0] * crotch, w["knee"][1] * crotch)
        an, af, _ = dark_band(leg, llum, w["ankle"][0] * crotch, w["ankle"][1] * crotch)
        rep["bands"]["knee_" + side] = {"y": kn, "dark_fraction": kf}
        rep["bands"]["ankle_" + side] = {"y": an, "dark_fraction": af}
        L["calf_" + side] = section_centroid(leg, kn)
        L["foot_" + side] = section_centroid(leg, an)
        sole = leg[leg[:, 1] < leg[:, 1].min() + 0.03]
        toe_z = np.percentile(sole[:, 2], 98)
        heel_z = np.percentile(sole[:, 2], 2)
        ball_z = heel_z + cfg.get("ball_fraction", 0.62) * (toe_z - heel_z)
        L["ball_" + side] = np.array([sole[:, 0].mean(), cfg.get("ball_height", 0.035), ball_z])
        L["toe_" + side] = np.array([sole[:, 0].mean(), cfg.get("ball_height", 0.035), toe_z])
    # hip pivots: symmetric about the midline, at hip_lift above the crotch.
    # Their spacing comes from the back half of each upper-leg section, which
    # a fused front flap or hip pouch cannot pull sideways.
    hip_y = crotch + cfg.get("hip_lift", 0.07)
    xs = []
    for side in ("l", "r"):
        leg = P[reg_s == REGIONS.index("leg_" + side)]
        sec = leg[np.abs(leg[:, 1] - (crotch - 0.03)) < 0.015]
        back = sec[sec[:, 2] <= np.median(sec[:, 2])]
        xs.append(abs(float(back[:, 0].mean())))
    hip_x = float(np.mean(xs))
    torso = P[reg_s == REGIONS.index("torso")]
    pel = section_centroid(torso, hip_y, 0.02)
    L["thigh_l"] = np.array([hip_x, hip_y, pel[2]])
    L["thigh_r"] = np.array([-hip_x, hip_y, pel[2]])
    rep["hip_x"] = hip_x
    L["pelvis"] = np.array([0.0, hip_y, pel[2]])
    nb = cfg.get("neck_base", 1.5)
    L["neck_01"] = np.array([0.0, nb, section_centroid(torso, nb, 0.015)[2]])
    head = P[P[:, 1] >= neck_top]
    L["Head"] = np.array([0.0, neck_top, section_centroid(head, neck_top + 0.01, 0.01)[2]])
    L["head_top"] = np.array([0.0, float(V[:, 1].max()), float(head[head[:, 1] > V[:, 1].max() - 0.02][:, 2].mean())])
    rep["neck_top_y"] = neck_top
    return {k: np.asarray(v, float) for k, v in L.items()}, rep


# ---------------------------------------------------------------- clean profiles


def _fourier_basis(theta, order):
    cols = [np.ones_like(theta)]
    for k in range(1, order + 1):
        cols += [np.cos(k * theta), np.sin(k * theta)]
    return np.stack(cols, 1)


def lower_envelope(theta, r, order=6, iters=12, outward_weight=0.04, trim=0.008):
    """Smooth radius r(theta) fitted from inside: outward residuals are downweighted.

    Accessories sit outside the body surface, so an asymmetric reweighted
    least-squares fit (inliers on or under the curve dominate) first finds
    the body cross-section beneath them. A low-order fit still rings around
    a large step, which would dent the rest of the section, so points more
    than `trim` outside that fit are then dropped as outliers and the curve
    is refitted to the remaining points by ordinary least squares.
    """
    B = _fourier_basis(theta, order)
    coef = np.linalg.lstsq(B, r, rcond=None)[0]
    for _ in range(iters):
        res = r - B @ coef
        w = np.where(res > 0, outward_weight, 1.0)
        sw = np.sqrt(w)
        coef = np.linalg.lstsq(B * sw[:, None], r * sw, rcond=None)[0]
    if trim:
        for _ in range(3):
            keep = (r - B @ coef) <= trim
            if keep.sum() < B.shape[1] * 2:
                break
            coef = np.linalg.lstsq(B[keep], r[keep], rcond=None)[0]
    return coef


def eval_envelope(coef, theta, order):
    return _fourier_basis(np.asarray(theta, float), order) @ coef


def _smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def flatten_protrusions(V, sel, centre_fn, y_lo, y_hi, *, step=0.02, order=8, margin=0.003,
                        soft=(0.004, 0.014), feather=0.03, x_limit=None, mirror=True,
                        donor=None, donor_centre_fn=None, smooth_rows=1, outward_weight=0.04):
    """Pull accessories that protrude from a body region back onto the body.

    Each horizontal section of the selected vertices (optionally with its
    X-mirror, or with a mirrored donor region such as the other leg) is
    fitted with a smooth lower envelope r(theta). A vertex moves radially
    onto envelope+margin only in proportion to how far it protrudes: not at
    all below soft[0], fully beyond soft[1]. The weight also ramps to zero
    over `feather` metres at the band ends (and at |x| = x_limit), so the
    edited surface stays continuous with everything around it.

    Returns (new V, displacement magnitude per vertex, protrusion residual).
    """
    ys = np.arange(y_lo, y_hi + 1e-9, step)
    rows = []
    for y in ys:
        m = sel & (np.abs(V[:, 1] - y) < step)
        if x_limit is not None:
            m &= np.abs(V[:, 0]) < x_limit + feather
        cx, cz = centre_fn(y)
        th, r = np.arctan2(V[m, 0] - cx, V[m, 2] - cz), np.hypot(V[m, 0] - cx, V[m, 2] - cz)
        if mirror:
            th, r = np.concatenate([th, -th]), np.concatenate([r, r])
        if donor is not None:
            d = donor & (np.abs(V[:, 1] - y) < step)
            ox, oz = donor_centre_fn(y)
            th = np.concatenate([th, np.arctan2(-(V[d, 0] - ox), V[d, 2] - oz)])
            r = np.concatenate([r, np.hypot(V[d, 0] - ox, V[d, 2] - oz)])
        rows.append(lower_envelope(th, r, order, outward_weight=outward_weight) if len(r) >= 4 * order + 4 else None)
    have = [c for c in rows if c is not None]
    if not have:
        return V.copy(), np.zeros(len(V)), np.zeros(len(V))
    C = np.array([c if c is not None else have[0] for c in rows])
    if smooth_rows:
        k = np.ones(2 * smooth_rows + 1) / (2 * smooth_rows + 1)
        Cp = np.pad(C, ((smooth_rows, smooth_rows), (0, 0)), mode="edge")
        C = np.stack([np.convolve(Cp[:, i], k, mode="valid") for i in range(C.shape[1])], 1)
    idx = np.nonzero(sel & (V[:, 1] >= y_lo) & (V[:, 1] <= y_hi))[0]
    y = V[idx, 1]
    f = np.clip((y - y_lo) / step, 0, len(ys) - 1.000001)
    i0 = f.astype(int)
    t = f - i0
    coef = C[i0] * (1 - t[:, None]) + C[np.minimum(i0 + 1, len(ys) - 1)] * t[:, None]
    cxz = np.array([centre_fn(v) for v in y])
    dx, dz = V[idx, 0] - cxz[:, 0], V[idx, 2] - cxz[:, 1]
    th, r = np.arctan2(dx, dz), np.hypot(dx, dz)
    r_env = np.einsum("ij,ij->i", _fourier_basis(th, order), coef) + margin
    resid = r - r_env
    w = _smoothstep(soft[0], soft[1], resid)
    w *= _smoothstep(y_lo, y_lo + feather, y) * (1 - _smoothstep(y_hi - feather, y_hi, y))
    if x_limit is not None:
        w *= 1 - _smoothstep(x_limit, x_limit + feather, np.abs(V[idx, 0]))
    r_new = r - w * np.maximum(resid, 0)
    scale = np.where(r > 1e-9, r_new / np.maximum(r, 1e-9), 1.0)
    V2 = V.copy()
    V2[idx, 0] = cxz[:, 0] + dx * scale
    V2[idx, 2] = cxz[:, 1] + dz * scale
    disp = np.zeros(len(V))
    disp[idx] = r - r_new
    res_all = np.zeros(len(V))
    res_all[idx] = resid
    return V2, disp, res_all


def weld_map(V, decimals=6):
    """Map each vertex to a representative of its position (UV seams duplicate vertices)."""
    _, inv = np.unique(np.round(V, decimals), axis=0, return_inverse=True)
    return inv.ravel()
