"""imported-mechanical-humanoid workflow.

Productionises an *existing* accepted humanoid mesh (here: the owner-approved
Halo Construct GLB) into a rigged, wardrobed, optimised runtime asset. It
reuses the shared pipeline infrastructure (workspace/stage caching,
Blender subprocess jobs, render_evidence, js/optimize.mjs) and adds only
what this asset family needs. It does not reconstruct anything.

Stages (python -m asset_pipeline <stage> --asset halo_construct):

  inspect    verify the source hash, record structure, extract the atlas
  baseline   Blender renders of the untouched source (lit / clay / wire)
  analyze    landmarks, regions, flattening of baked-in accessories
  clean      Blender: manifold remesh, protected decimation, UVs, bakes
  materials  texture synthesis for the cleaned body (garments, PBR)
  wardrobe   body-fitted security / vendor pieces; Blender bakes
  rig        skeleton, weights, ring variant, clips; assembles the GLB
  export     js/optimize.mjs (WebP, Meshopt) + Khronos validator
  validate   skinning / ground / rigidity / garment / aperture checks
  evidence   Blender renders of the final asset
  publish    copy the runtime GLB and the compact committed outputs
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import numpy as np

from .workspace import PIPELINE_DIR, REPO_ROOT, StageError, portable, read_json, run_blender, sha256_file, write_json

HERE = Path(__file__).resolve().parent


def _cfg(asset, key):
    return asset.config["humanoid"][key]


def _src(asset):
    s = next(s for s in asset.config["sources"] if s["id"] == "accepted_mesh")
    return asset.source(s["path"]), s


# ---------------------------------------------------------------- inspect


def stage_inspect(asset, params):
    from . import humanoid_analysis as ha

    path, s = _src(asset)
    digest = sha256_file(path)
    if digest != s["sha256"]:
        raise StageError(f"source hash mismatch: {digest} != recorded {s['sha256']}")
    S = ha.load_source(path)
    out = asset.dir("inspect")
    import cv2

    cv2.imwrite(str(out / "atlas.png"), S.image[..., ::-1])
    rep = {"source": portable(path), "sha256": digest, "bytes": path.stat().st_size, **S.stats}
    write_json(out / "source.json", rep)
    return [out / "source.json", out / "atlas.png"], {k: rep[k] for k in ("sha256", "bytes", "triangles", "vertices", "height", "texture_size")}


# ---------------------------------------------------------------- baseline


BASELINE_VIEWS = [
    "front", "back", "left", "right", "three_quarter", "three_quarter_rear",
    {"name": "head", "az": 20, "el": 6, "dist_k": 0.24, "target": [0, 0, 1.70]},
    {"name": "hands", "az": 20, "el": 4, "dist_k": 0.32, "target": [0.30, 0, 0.88]},
    {"name": "feet", "az": 25, "el": 14, "dist_k": 0.3, "target": [0, 0, 0.12]},
    {"name": "joints", "az": 60, "el": 6, "dist_k": 0.36, "target": [0.2, 0, 1.0]},
]


def stage_baseline(asset, params):
    path, _ = _src(asset)
    out = asset.dir("baseline")
    res = run_blender("asset_pipeline.blender.render_evidence", {
        "work": str(asset.work), "blend": str(path), "out": str(out), "modes": ["lit", "clay", "wire"],
        "views": BASELINE_VIEWS, "width": params["width"], "height": params["height"], "samples": params["samples"]})
    files = sorted(out.glob("*.png"))
    if len(files) < 3 * len(BASELINE_VIEWS):
        raise StageError(f"baseline wrote {len(files)} of {3 * len(BASELINE_VIEWS)} renders")
    return files, {"renders": len(files)}


# ---------------------------------------------------------------- analyze


def _samples(V, F, UV, image, n, seed):
    import trimesh

    tm = trimesh.Trimesh(V, F, process=False)
    P, fi = trimesh.sample.sample_surface(tm, n, seed=seed)
    bc = trimesh.triangles.points_to_barycentric(tm.triangles[fi], P)
    uv = (UV[F[fi]] * bc[:, :, None]).sum(1)
    H, W = image.shape[:2]
    rgb = image[np.clip((uv[:, 1] * H).astype(int), 0, H - 1), np.clip((uv[:, 0] * W).astype(int), 0, W - 1)] / 255.0
    return P, rgb


def stage_analyze(asset, params):
    from . import humanoid_analysis as ha

    path, _ = _src(asset)
    S = ha.load_source(path)
    P, rgb = _samples(S.V, S.F, S.UV, S.image, 300000, 3)
    L, rep = ha.find_landmarks(S.V, S.vertex_rgb, params["landmarks"], samples=(P, ha.luminance(rgb)))
    crotch, arm_join = rep["crotch_y"], rep["arm_join_y"]
    reg = ha.label_regions(S.V, crotch, arm_join, params["landmarks"].get("neck_top", 1.575))
    R = {n: reg == i for i, n in enumerate(ha.REGIONS)}
    fl = params["flatten"]
    zc = lambda y: (0.0, float(np.interp(y, [L["pelvis"][1], L["neck_01"][1]], [L["pelvis"][2], L["neck_01"][2]])))
    V1 = S.V.copy()
    disp = np.zeros(len(V1))
    for band in fl["torso_bands"]:
        V1, d, _ = ha.flatten_protrusions(V1, R["torso"], zc, band["y"][0], band["y"][1], order=band.get("order", 8),
                                          outward_weight=band.get("outward_weight", 0.04), x_limit=band.get("x_limit"))
        disp += d
    knee = {s: L["calf_" + s] for s in "lr"}
    hip = {s: L["thigh_" + s] for s in "lr"}

    def axis(s):
        def f(y):
            t = (y - knee[s][1]) / (hip[s][1] - knee[s][1])
            c = knee[s] + (hip[s] - knee[s]) * t
            return (c[0], c[2])
        return f
    ly = fl["leg_band"]
    for s, o in (("l", "r"), ("r", "l")):
        own = R["leg_" + s] | (R["torso"] & ((S.V[:, 0] > 0) if s == "l" else (S.V[:, 0] < 0)))
        oth = R["leg_" + o] | (R["torso"] & ((S.V[:, 0] < 0) if s == "l" else (S.V[:, 0] > 0)))
        V1, d, _ = ha.flatten_protrusions(V1, own, axis(s), ly[0], ly[1], mirror=False, donor=oth, donor_centre_fn=axis(o))
        disp += d
    out = asset.dir("analyze")
    np.save(out / "clean_positions.npy", V1)
    np.save(out / "faces.npy", S.F)
    np.save(out / "kit_points.npy", V1[disp > fl.get("kit_threshold", 0.004)])
    lm = {k: np.round(v, 5).tolist() for k, v in L.items()}
    rep.update({"moved_vertices_over_2mm": int((disp > 0.002).sum()), "max_displacement_m": float(disp.max()),
                "kit_points": int((disp > fl.get("kit_threshold", 0.004)).sum())})
    write_json(out / "landmarks.json", lm)
    write_json(out / "report.json", rep)
    files = [out / f for f in ("clean_positions.npy", "faces.npy", "kit_points.npy", "landmarks.json", "report.json")]
    return files, {"crotch_y": round(crotch, 3), "arm_join_y": round(arm_join, 3), "moved_vertices": rep["moved_vertices_over_2mm"]}


# ---------------------------------------------------------------- clean


def stage_clean(asset, params):
    path, _ = _src(asset)
    out = asset.dir("clean")
    a = asset.path("analyze")
    res = run_blender("asset_pipeline.blender.humanoid_build", {
        "op": "clean", "work": str(asset.work), "out": str(out), "source": str(path),
        "clean_positions": str(a / "clean_positions.npy"), "faces": str(a / "faces.npy"), **params})
    write_json(out / "clean.json", res)
    files = [out / res["low"], out / res["high"], out / "clean.json"] + [out / f for f in res["images"].values()]
    return files, {k: res[k] for k in ("high_triangles", "low_triangles", "protected_fraction")}


# ---------------------------------------------------------------- materials


def stage_materials(asset, params):
    from . import humanoid_materials as hm

    c = asset.path("clean")
    imgs = read_json(c / "clean.json")["images"]
    L = read_json(asset.path("analyze", "landmarks.json"))
    maps, rep = hm.synthesize({k: c / v for k, v in imgs.items()}, params, np.load(asset.path("analyze", "kit_points.npy")), landmarks=L)
    out = asset.dir("materials")
    files = []
    for k in ("basecolor", "orm", "normal", "emissive"):
        hm.write_rgb(out / f"body_{k}.png", maps[k])
        files.append(out / f"body_{k}.png")
    hm.write_rgb(out / "masks.png", maps["masks"])
    write_json(out / "report.json", rep)
    return files + [out / "masks.png", out / "report.json"], rep["texel_fractions"]


# ---------------------------------------------------------------- wardrobe


def body_samples(asset, n=250000, seed=5):
    import trimesh

    from . import gltf_io as gi
    from . import humanoid_analysis as ha

    m = gi.read_mesh(asset.path("clean", "body_low.glb"))
    rep = read_json(asset.path("analyze", "report.json"))
    tm = trimesh.Trimesh(m["positions"].astype(float), m["indices"], process=False)
    P, fi = trimesh.sample.sample_surface(tm, n, seed=seed)
    neck_top = asset.config["humanoid"]["analyze"]["landmarks"].get("neck_top", 1.575)
    return P, tm.face_normals[fi], ha.label_regions(P, rep["crotch_y"], rep["arm_join_y"], neck_top)


def stage_wardrobe(asset, params):
    from . import humanoid_analysis as ha
    from . import humanoid_wardrobe as hw

    L = read_json(asset.path("analyze", "landmarks.json"))
    P, N, reg = body_samples(asset)
    body = hw.Body(P, N, reg, ha.REGIONS, L)
    pieces = hw.design_security(body) + hw.design_vendor(body)
    out = asset.dir("wardrobe")
    meta = hw.export_pieces(pieces, out / "pieces.npz", out / "pieces.json")
    res = run_blender("asset_pipeline.blender.humanoid_build", {
        "op": "wardrobe", "work": str(asset.work), "out": str(out), "pieces_npz": str(out / "pieces.npz"),
        "pieces_json": str(out / "pieces.json"), "texture": params["texture"]})
    write_json(out / "wardrobe.json", res)
    files = [out / "pieces.json", out / "wardrobe.json", out / res["blend"]]
    for sset in res["sets"].values():
        files += [out / sset["npz"]] + [out / f for f in sset["images"].values()]
    return files, {k: v["triangles"] for k, v in res["sets"].items()}


# ---------------------------------------------------------------- rig


def extract_reference(asset, params):
    out = asset.dir("rig")
    ref = REPO_ROOT / params["reference_rig"]
    dst = out / "reference_rig.json"
    cmd = ["node", str(PIPELINE_DIR / "js" / "extract-rig.mjs"), str(ref), str(dst), *params["clips"]]
    proc = subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True)
    if proc.returncode:
        raise StageError("extract-rig failed: " + proc.stderr[-1500:])
    return read_json(dst)


def ring_variant(V, head_mask, params):
    """Remap the open ring along its centreline ellipse to a new aspect.

    Each ring vertex is expressed as (ellipse angle, offset along the
    ellipse normal, offset along its tangent, depth) relative to the source
    centreline and rebuilt on the target ellipse, so ring thickness, the
    optical units and the aperture are carried over rather than stretched.
    """
    H = V[head_mask]
    y_bot, y_top = params["ring_bottom"], H[:, 1].max()
    mid = H[np.abs(H[:, 1] - 0.5 * (y_bot + y_top)) < 0.012]
    outer_x, inner_x = np.abs(mid[:, 0]).max(), np.abs(mid[:, 0]).min()
    cy = 0.5 * (y_bot + y_top)
    top_inner = H[(np.abs(H[:, 0]) < 0.015) & (H[:, 1] > cy)][:, 1].min()
    a1 = 0.5 * (outer_x + inner_x)
    b1 = 0.5 * ((y_top - cy) + (top_inner - cy))
    a2, b2 = params["ring_half_width"], params["ring_half_height"]
    cy2 = cy - b1 + b2
    x, y = V[:, 0], V[:, 1] - cy
    th = np.arctan2(y / b1, x / a1)
    q1 = np.stack([a1 * np.cos(th), b1 * np.sin(th)], 1)
    n1 = np.stack([np.cos(th) / a1, np.sin(th) / b1], 1)
    n1 /= np.linalg.norm(n1, axis=1, keepdims=True)
    t1 = np.stack([-n1[:, 1], n1[:, 0]], 1)
    d = np.stack([x, y], 1) - q1
    dr, dt = (d * n1).sum(1), (d * t1).sum(1)
    q2 = np.stack([a2 * np.cos(th), b2 * np.sin(th)], 1)
    n2 = np.stack([np.cos(th) / a2, np.sin(th) / b2], 1)
    n2 /= np.linalg.norm(n2, axis=1, keepdims=True)
    t2 = np.stack([-n2[:, 1], n2[:, 0]], 1)
    p2 = q2 + dr[:, None] * n2 + dt[:, None] * t2
    w = np.clip((V[:, 1] - params["blend"][0]) / (params["blend"][1] - params["blend"][0]), 0, 1)
    w = (w * w * (3 - 2 * w)) * head_mask
    out = V.copy()
    out[:, 0] = x * (1 - w) + p2[:, 0] * w
    out[:, 1] = (y + cy) * (1 - w) + (p2[:, 1] + cy2) * w
    return out, {"source_ellipse": [float(a1), float(b1), float(cy)], "target_ellipse": [a2, b2, float(cy2)]}


def vertex_normals(V, F, weld_decimals=5):
    from .humanoid_analysis import weld_map

    wm = weld_map(V, weld_decimals)
    fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    acc = np.zeros((wm.max() + 1, 3))
    for c in range(3):
        np.add.at(acc, wm[F[:, c]], fn)
    n = acc[wm]
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)


def guard_clip(skel, rig_mod, idle, bind_world, params):
    """Guard_Watch_Loop: the reference idle tiled to a long loop with a slow,
    restrained head/optic scan (neck and head yaw about world up)."""
    reps = params["guard"]["idle_repeats"]
    period = rig_mod.clip_length(idle)
    T = period * reps
    fps = 15
    times = np.round(np.arange(0, T + 1e-6, 1 / fps), 5)
    amp = np.radians(params["guard"]["scan_degrees"])
    chans = []
    for ch in idle["channels"]:
        tt = np.asarray(ch["times"])
        vals = np.asarray(ch["values"]).reshape(len(tt), -1)
        allt, allv = [], []
        for r in range(reps):
            for k in range(len(tt)):
                if r and k == 0:
                    continue
                allt.append(tt[k] + r * period)
                allv.append(vals[k])
        chans.append({"node": ch["node"], "path": ch["path"], "interpolation": ch.get("interpolation", "LINEAR"),
                      "times": np.array(allt), "values": np.array(allv)})
    up = np.array([0, 1.0, 0])
    for name, share in (("neck_01", 0.45), ("Head", 0.55)):
        ch = next(c for c in chans if c["node"] == name and c["path"] == "rotation")
        base = np.array([rig_mod.sample_channel(ch["times"], ch["values"], "LINEAR", t, "rotation") for t in times])
        p = skel.parent[skel.index[name]]
        Rp = rig_mod.world_rot(bind_world[[p]])[0]
        local_up = rig_mod.qrot(rig_mod.qinv(Rp), up)
        ang = share * amp * np.sin(2 * np.pi * times / T) * (0.6 + 0.4 * np.sin(4 * np.pi * times / T + 0.7))
        qs = np.array([rig_mod.qmul(rig_mod.q_axis_angle(local_up, a), q) for a, q in zip(ang, base)])
        ch["times"], ch["values"] = times, qs
    return {"name": "Guard_Watch_Loop", "channels": chans}


def stage_rig(asset, params):
    from . import gltf_io as gi
    from . import humanoid_analysis as ha
    from . import humanoid_rig as hr
    from scipy.spatial import cKDTree

    ref = extract_reference(asset, params)
    L = {k: np.asarray(v) for k, v in read_json(asset.path("analyze", "landmarks.json")).items()}
    rep_an = read_json(asset.path("analyze", "report.json"))
    rig = hr.build_rig(ref, L)
    clips = {a["name"]: a for a in ref["animations"]}
    bl = hr.bind_local_rotations(rig)

    def feet_y(k):
        sk = hr.Skeleton(hr.make_nodes(rig, k))
        W = sk.world(*hr.pose_at(sk, clips[params["ground_clip"]], 0.0))
        return min(W[sk.index["ball_l"]][1, 3], W[sk.index["ball_r"]][1, 3])
    lo, hi = 0.5, 1.5
    for _ in range(50):
        m = 0.5 * (lo + hi)
        lo, hi = (lo, m) if feet_y(m) > L["ball_l"][1] else (m, hi)
    k = 0.5 * (lo + hi)
    nodes = hr.make_nodes(rig, k)
    sk = hr.Skeleton(nodes)
    pel = sk.index["pelvis"]
    bind = {"name": "Bind_Pose", "channels": [{"node": n, "path": "rotation", "times": [0.0], "values": list(q)} for n, q in bl.items()]
            + [{"node": "pelvis", "path": "translation", "times": [0.0], "values": sk.t[pel].tolist()}]}
    Wb = sk.world(*hr.pose_at(sk, bind, 0))
    joints = ref["joints"]
    jidx = np.array([sk.index[n] for n in joints])
    IBM = np.linalg.inv(Wb[jidx])
    IBMfull = np.zeros((len(sk.names), 4, 4))
    IBMfull[jidx] = IBM
    # ---- body
    body = gi.read_mesh(asset.path("clean", "body_low.glb"))
    V, F, UV = body["positions"].astype(float), body["indices"].astype(int), body["uvs"]
    neck_top = asset.config["humanoid"]["analyze"]["landmarks"].get("neck_top", 1.575)
    reg = ha.label_regions(V, rep_an["crotch_y"], rep_an["arm_join_y"], neck_top)
    arm = np.isin(reg, [ha.REGIONS.index("arm_l"), ha.REGIONS.index("arm_r")])
    fa = arm[F]
    low = V[F][:, :, 1].max(1) < rep_an["arm_join_y"] - 0.03
    bridge = (fa.any(1) & ~fa.all(1)) & low
    F = F[~bridge]
    W = hr.body_weights(V, reg, ha.REGIONS, rig, params["weights"])
    J, Wt = hr.pack_weights(W, joints)
    Vb = hr.skin(sk, IBMfull, jidx, V, J, Wt, hr.pose_at(sk, bind, 0))
    bind_err = float(np.abs(Vb - V).max())
    if bind_err > 1e-5:
        raise StageError(f"Bind_Pose does not reproduce the body (max error {bind_err:.2e} m)")
    head_v = V[:, 1] > params["ring"]["ring_bottom"] - 0.01
    ring_faces = head_v[F].all(1)
    Fcore, Fring = F[~ring_faces], F[ring_faces]
    Vh, ring_rep = ring_variant(V, head_v, params["ring"])
    # ---- props authored in a held pose: e.g. the warden's stave stands upright
    # through the right hand's grip *in the guard clip*, then is bound rigidly
    # to the pelvis so idle sway cannot tilt it (a hand-bound staff swings).
    guard = guard_clip(sk, hr, clips["Idle_Loop"], Wb, params)
    anchors = {}
    for name, a in params.get("anchored_props", {}).items():
        clip = guard if a["clip"] == "Guard_Watch_Loop" else clips[a["clip"]]
        Wp = sk.world(*hr.pose_at(sk, clip, a["time"]))
        fi, gi_ = sk.index[a["follow"]], a["grip"]
        hand_bind = Wb[fi][:3, 3]
        tip_bind = L[gi_]
        grip_bind = hand_bind + a["grip_fraction"] * (tip_bind - hand_bind)
        # grip point carried into the posed frame by the hand bone
        grip_pose = (Wp[fi] @ np.linalg.inv(Wb[fi]) @ np.r_[grip_bind, 1])[:3]
        bi = sk.index[a["bone"]]
        anchors[name] = {"shift_xz": (grip_pose - grip_bind)[[0, 2]], "to_bind": Wb[bi] @ np.linalg.inv(Wp[bi]), "bone": a["bone"]}
    # ---- wardrobe
    wd = read_json(asset.path("wardrobe", "wardrobe.json"))
    meta = {m["name"]: m for m in read_json(asset.path("wardrobe", "pieces.json"))}
    tree = cKDTree(V)
    sets = {}
    for set_name, info in wd["sets"].items():
        arr = np.load(asset.path("wardrobe", info["npz"]))
        groups = {}
        for pname in info["pieces"]:
            m = meta[pname]
            P, Nn, UVp, I = arr[pname + "_P"], arr[pname + "_N"], arr[pname + "_UV"], arr[pname + "_I"]
            rule = m["skin"]
            if rule == "anchored":
                an = anchors[pname]
                Pp = P.copy()
                Pp[:, 0] += an["shift_xz"][0]
                Pp[:, 2] += an["shift_xz"][1]
                Pp[:, 1] -= Pp[:, 1].min()  # grounded in the held pose
                P = (np.c_[Pp, np.ones(len(Pp))] @ an["to_bind"].T)[:, :3]
                Nn = Nn @ an["to_bind"][:3, :3].T
                rule = "rigid:" + an["bone"]
            if rule.startswith("rigid:"):
                Jg, Wg = hr.transfer_weights(P, None, None, None, rigid=rule.split(":", 1)[1], joint_names=joints)
            else:
                Jg, Wg = hr.transfer_weights(P, V, J, Wt, joint_names=joints)
            gname = set_name if m.get("core", True) else pname
            groups.setdefault(gname, []).append((P, Nn, UVp, I, Jg, Wg))
        sets[set_name] = groups
    # ---- clips
    out_clips = [bind] + [clips[c] for c in params["clips"]]
    out_clips.append(guard)
    # ---- write
    w = gi.GlbWriter()
    root = w.node("HaloConstruct")
    nidx = {}
    for i in sk.order:
        nd = nodes[i]
        par = nidx[nd["parent"]] if nd["parent"] in nidx else root
        nidx[nd["name"]] = w.node(nd["name"], parent=par, t=nd.get("t"), r=nd.get("r"), s=nd.get("s"))
    skin = w.skin("halo_skeleton", [nidx[n] for n in joints], IBM, skeleton=nidx["root"])
    m_dir = asset.path("materials")
    tex = lambda f, nm: w.image(Path(f).read_bytes(), nm)
    t_body = {k: tex(m_dir / f"body_{k}.png", "body_" + k) for k in ("basecolor", "orm", "normal")}
    import cv2

    em = cv2.imread(str(m_dir / "body_emissive.png"))[..., ::-1].astype(np.float32) / 255
    es = params.get("emissive_size", 512)  # optics only: a small map is enough
    t_body["emissive"] = w.image(gi.png_bytes(cv2.resize(em, (es, es), interpolation=cv2.INTER_AREA)), "body_emissive")
    mat_body = w.material("halo_body", base=t_body["basecolor"], orm=t_body["orm"], normal=t_body["normal"],
                          emissive=t_body["emissive"], emissive_factor=params["optics_default"])
    N_body = vertex_normals(V, F)
    Nh = vertex_normals(Vh, F)

    def add_mesh(name, Pm, Fm, Nm, UVm, Jm, Wm, mat):
        used = np.unique(Fm)
        remap = -np.ones(len(Pm), int)
        remap[used] = np.arange(len(used))
        mi = w.mesh(name, Pm[used], remap[Fm], normals=Nm[used], uvs=UVm[used], joints=Jm[used], weights=Wm[used], material=mat)
        w.node(name, mesh=mi, skin=skin)  # scene root: glTF ignores a skinned node's transform
        return int(len(Fm))
    tri = {}
    tri["body"] = add_mesh("body", V, Fcore, N_body, UV, J, Wt, mat_body)
    tri["ring_vertical"] = add_mesh("ring_vertical", V, Fring, N_body, UV, J, Wt, mat_body)
    tri["ring_horizontal"] = add_mesh("ring_horizontal", Vh, Fring, Nh, UV, J, Wt, mat_body)
    for set_name, groups in sets.items():
        wdir = asset.path("wardrobe")
        imgs = wd["sets"][set_name]["images"]
        import cv2

        rough = cv2.imread(str(wdir / imgs["roughness"]), cv2.IMREAD_GRAYSCALE).astype(np.float32) / 255
        metal = cv2.imread(str(wdir / imgs["metallic"]), cv2.IMREAD_GRAYSCALE).astype(np.float32) / 255
        orm = np.stack([np.ones_like(rough), rough, metal], -1)
        orm_png = gi.png_bytes(orm)
        tb = tex(wdir / imgs["basecolor"], set_name + "_basecolor")
        to = w.image(orm_png, set_name + "_orm")
        tn = tex(wdir / imgs["normal"], set_name + "_normal")
        mat = w.material("halo_" + set_name, base=tb, orm=to, normal=tn)
        for gname, parts in groups.items():
            off = 0
            Ps, Ns, UVs, Is, Js, Ws = [], [], [], [], [], []
            for P, Nn, UVp, I, Jg, Wg in parts:
                Ps.append(P), Ns.append(Nn), UVs.append(UVp), Is.append(I + off), Js.append(Jg), Ws.append(Wg)
                off += len(P)
            nm = gname if gname == set_name else gname
            tri[nm] = add_mesh(nm, np.concatenate(Ps), np.concatenate(Is), np.concatenate(Ns), np.concatenate(UVs),
                               np.concatenate(Js), np.concatenate(Ws), mat)
    for c in out_clips:
        chans = []
        for ch in c["channels"]:
            if ch["node"] not in nidx:
                continue
            chans.append((nidx[ch["node"]], ch["path"], ch["times"], ch["values"], ch.get("interpolation", "LINEAR")))
        w.animation(c["name"], chans)
    out = asset.dir("rig")
    glb = out / "halo_construct_npc.glb"
    size = w.write(glb)
    np.savez_compressed(out / "skin.npz", V=V, F=F, J=J, Wt=Wt, IBM=IBM, Vh=Vh, Fcore=Fcore, Fring=Fring)
    rep = {"root_scale_k": k, "bind_reproduction_max_error_m": bind_err, "bridge_faces_removed": int(bridge.sum()),
           "triangles": tri, "joints": len(joints), "clips": [c["name"] for c in out_clips], "ring_variant": ring_rep,
           "bytes": size, "reference_rig": params["reference_rig"]}
    write_json(out / "rig.json", rep)
    json.dump({"nodes": nodes, "bind": bind, "guard": out_clips[-1]}, open(out / "rig_nodes.json", "w"),
              default=lambda o: o.tolist() if isinstance(o, np.ndarray) else float(o))
    return [glb, out / "rig.json", out / "skin.npz", out / "rig_nodes.json"], {"k": round(k, 4), "triangles": tri, "bytes": size}


# ---------------------------------------------------------------- export


def stage_export(asset, params):
    src = asset.path("rig", "halo_construct_npc.glb")
    out = asset.dir("export")
    dst = out / "halo_construct_npc.glb"
    cmd = ["node", str(PIPELINE_DIR / "js" / "optimize.mjs"), str(src), str(dst), str(params["max_texture"]), str(params["quality"])]
    proc = subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True)
    if proc.returncode:
        raise StageError("optimize failed: " + (proc.stderr or proc.stdout)[-2000:])
    rep = read_json(Path(str(dst) + ".report.json"))
    rep["file"] = portable(dst)
    rep["sha256"] = sha256_file(dst)
    write_json(out / "export.json", rep)
    return [dst, out / "export.json"], {"bytes": rep["bytes"], "triangles": rep["triangles"], "validator_errors": rep["validator"]["errors"],
                                        "validator_warnings": rep["validator"]["warnings"]}


STAGES = [
    ("inspect", stage_inspect, lambda a: [a.config_path, HERE / "humanoid_analysis.py"], lambda a: {"source": a.config["sources"]}),
    ("baseline", stage_baseline, lambda a: [_src(a)[0], HERE / "blender" / "render_evidence.py"], lambda a: _cfg(a, "baseline")),
    ("analyze", stage_analyze, lambda a: [_src(a)[0], HERE / "humanoid_analysis.py"], lambda a: _cfg(a, "analyze")),
    ("clean", stage_clean, lambda a: [a.path("analyze"), HERE / "blender" / "humanoid_build.py"], lambda a: _cfg(a, "clean")),
    ("materials", stage_materials, lambda a: [a.path("clean"), a.path("analyze", "landmarks.json"), HERE / "humanoid_materials.py"], lambda a: _cfg(a, "materials")),
    ("wardrobe", stage_wardrobe, lambda a: [a.path("clean", "body_low.glb"), a.path("analyze", "landmarks.json"), HERE / "humanoid_wardrobe.py",
                                            HERE / "blender" / "humanoid_build.py"], lambda a: _cfg(a, "wardrobe")),
    ("rig", stage_rig, lambda a: [a.path("clean", "body_low.glb"), a.path("materials"), a.path("wardrobe", "wardrobe.json"),
                                  a.path("analyze", "landmarks.json"), HERE / "humanoid_rig.py", HERE / "gltf_io.py", HERE / "mech_humanoid.py",
                                  REPO_ROOT / "client" / "assets" / "humanoid_m.glb", PIPELINE_DIR / "js" / "extract-rig.mjs"], lambda a: _cfg(a, "rig")),
    ("export", stage_export, lambda a: [a.path("rig", "halo_construct_npc.glb"), PIPELINE_DIR / "js" / "optimize.mjs"], lambda a: _cfg(a, "export")),
]


# ---------------------------------------------------------------- validate


def aperture_area(P, cell=0.002):
    """Area (m^2) of the background region enclosed by the ring in a front (XY) projection."""
    import cv2

    lo = P[:, :2].min(0) - 0.01
    hi = P[:, :2].max(0) + 0.01
    W, H = (np.ceil((hi - lo) / cell).astype(int) + 1)
    img = np.zeros((H, W), np.uint8)
    ij = ((P[:, :2] - lo) / cell).astype(int)
    img[ij[:, 1], ij[:, 0]] = 255
    img = cv2.dilate(img, np.ones((3, 3), np.uint8), iterations=2)
    flood = img.copy()
    mask = np.zeros((H + 2, W + 2), np.uint8)
    cv2.floodFill(flood, mask, (0, 0), 128)
    return float((flood == 0).sum() * cell * cell)


def stage_validate(asset, params):
    from . import humanoid_rig as hr
    from scipy.spatial import cKDTree

    rig = read_json(asset.path("rig", "rig.json"))
    rn = json.load(open(asset.path("rig", "rig_nodes.json")))
    ref = read_json(asset.path("rig", "reference_rig.json"))
    clips = {a["name"]: a for a in ref["animations"]}
    clips["Guard_Watch_Loop"] = rn["guard"]
    sk = hr.Skeleton(rn["nodes"])
    d = np.load(asset.path("rig", "skin.npz"))
    joints = ref["joints"]
    jidx = np.array([sk.index[n] for n in joints])
    IBM = np.zeros((len(sk.names), 4, 4))
    IBM[jidx] = d["IBM"]
    V, J, Wt = d["V"], d["J"], d["Wt"]
    out = {"bind_reproduction_max_error_m": rig["bind_reproduction_max_error_m"]}
    rigid = Wt[:, 0] > 0.999
    out["rigid_vertex_fraction"] = float(rigid.mean())
    F = d["F"]
    E = np.unique(np.sort(np.r_[F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]], 1), axis=0)
    same_bone = rigid[E[:, 0]] & rigid[E[:, 1]] & (J[E[:, 0], 0] == J[E[:, 1], 0])
    L0 = np.linalg.norm(V[E[:, 0]] - V[E[:, 1]], axis=1)
    # garments, by role
    import numpy as _np
    wd = read_json(asset.path("wardrobe", "wardrobe.json"))
    meta = {m["name"]: m for m in read_json(asset.path("wardrobe", "pieces.json"))}
    garments = {}
    for set_name, info in wd["sets"].items():
        arr = _np.load(asset.path("wardrobe", info["npz"]))
        Ps = [arr[p + "_P"] for p in info["pieces"] if meta[p].get("core", True) and meta[p]["mat"] != "stave"]
        Gp = np.concatenate(Ps)
        Jg, Wg = hr.transfer_weights(Gp, V, J, Wt, joint_names=joints)
        rigid_rule = np.concatenate([np.full(len(arr[p + "_P"]), meta[p]["skin"]) for p in info["pieces"] if meta[p].get("core", True) and meta[p]["mat"] != "stave"])
        for i, rule in enumerate(rigid_rule):
            if rule.startswith("rigid:"):
                Jg[i] = [joints.index(rule.split(":", 1)[1]), 0, 0, 0]
                Wg[i] = [1, 0, 0, 0]
        garments[set_name] = (Gp, Jg, Wg)
    roles = params["roles"]
    out["clips"] = {}
    Nb = vertex_normals(V, F)
    for cname, role_list in params["clips"].items():
        c = clips[cname]
        T = hr.clip_length(c)
        rec = {"min_body_y": 1e9, "max_coupling_strain": 0.0, "max_rigid_strain": 0.0, "garment_penetration": {}}
        for t in np.linspace(0, T, params["frames"]):
            pose = hr.pose_at(sk, c, float(t))
            Vp = hr.skin(sk, IBM, jidx, V, J, Wt, pose)
            rec["min_body_y"] = min(rec["min_body_y"], float(Vp[:, 1].min()))
            L1 = np.linalg.norm(Vp[E[:, 0]] - Vp[E[:, 1]], axis=1)
            strain = np.abs(L1 - L0) / np.maximum(L0, 1e-6)
            rec["max_rigid_strain"] = max(rec["max_rigid_strain"], float(strain[same_bone].max()))
            rec["max_coupling_strain"] = max(rec["max_coupling_strain"], float(np.percentile(strain[~same_bone], 99)))
            tree = cKDTree(Vp)
            Np = vertex_normals(Vp, F)
            for role in role_list:
                Gp, Jg, Wg = garments[roles[role]]
                Gq = hr.skin(sk, IBM, jidx, Gp, Jg, Wg, pose)
                dd, ii = tree.query(Gq)
                inside = ((Gq - Vp[ii]) * Np[ii]).sum(1) < -params["penetration_tolerance"]
                rec["garment_penetration"][role] = max(rec["garment_penetration"].get(role, 0.0), float(inside.mean()))
        out["clips"][cname] = rec
    # ring aperture: source vs both variants
    head = V[:, 1] > 1.6
    out["ring_aperture_m2"] = {"vertical": aperture_area(V[head]), "horizontal": aperture_area(d["Vh"][head])}
    src_ap = params.get("source_aperture_reference")
    checks = {
        "bind_pose_exact": out["bind_reproduction_max_error_m"] < 1e-5,
        "rigid_shells_do_not_stretch": all(r["max_rigid_strain"] < 1e-4 for r in out["clips"].values()),
        "feet_on_ground": all(r["min_body_y"] > -params["ground_tolerance"] for r in out["clips"].values()),
        "ring_aperture_open": min(out["ring_aperture_m2"].values()) > params["min_aperture_m2"],
        "garment_penetration_below_limit": all(v <= params["max_penetration_fraction"] for r in out["clips"].values() for v in r["garment_penetration"].values()),
    }
    out["checks"] = checks
    o = asset.dir("validate")
    write_json(o / "validate.json", out)
    failed = [k for k, v in checks.items() if not v]
    if failed and params.get("strict", True):
        raise StageError(f"validation failed: {failed} (see {o / 'validate.json'})")
    return [o / "validate.json"], {"checks": checks}


# ---------------------------------------------------------------- evidence


def stage_evidence(asset, params):
    glb = asset.path("export", "halo_construct_npc.glb")
    dec = asset.dir("evidence") / "decoded.glb"
    proc = subprocess.run(["node", str(PIPELINE_DIR / "js" / "decompress.mjs"), str(glb), str(dec)], cwd=REPO_ROOT, capture_output=True, text=True)
    if proc.returncode:
        raise StageError("decompress failed: " + proc.stderr[-1500:])
    out = asset.dir("evidence")
    res = run_blender("asset_pipeline.blender.humanoid_evidence", {"work": str(asset.work), "glb": str(dec), "out": str(out),
                                                                    "samples": params["samples"], "shots": params["shots"]}, timeout=7200)
    # source vs derivative, clay and wire comparisons reuse render_evidence on the source and on a decoded body-only file
    src, _ = _src(asset)
    cmp_dir = asset.dir("evidence", "source")
    run_blender("asset_pipeline.blender.render_evidence", {"work": str(asset.work), "blend": str(src), "out": str(cmp_dir), "modes": ["lit", "clay", "wire"],
                                                           "views": ["front", "left"], "width": 600, "height": 760, "samples": params["samples"]})
    files = [Path(f) for f in res["renders"]] + sorted(cmp_dir.glob("*.png"))
    return files, {"renders": len(files)}


# ---------------------------------------------------------------- publish


def stage_publish(asset, params):
    outd = PIPELINE_DIR / "assets" / asset.id / "outputs"
    outd.mkdir(parents=True, exist_ok=True)
    glb = asset.path("export", "halo_construct_npc.glb")
    dst = REPO_ROOT / params["runtime_path"]
    shutil.copyfile(glb, dst)
    exp = read_json(asset.path("export", "export.json"))
    exp["file"] = params["runtime_path"]
    exp["sha256"] = sha256_file(dst)
    write_json(outd / "export.json", exp)
    copies = {"rig/rig.json": "rig.json", "analyze/landmarks.json": "landmarks.json", "analyze/report.json": "analyze.json",
              "clean/clean.json": "clean.json", "materials/report.json": "materials.json", "wardrobe/wardrobe.json": "wardrobe.json",
              "validate/validate.json": "validate.json", "inspect/source.json": "source.json"}
    for a, b in copies.items():
        if asset.path(a).exists():
            shutil.copyfile(asset.path(a), outd / b)
    # editable Blender sources: the rigged runtime asset (armature, weights, actions, variant meshes)
    run_blender("asset_pipeline.blender.humanoid_build", {"op": "blend", "work": str(asset.work), "imports": [str(asset.path("rig", "halo_construct_npc.glb"))],
                                                          "out": str(outd / "halo_construct_rigged.blend"),
                                                          "collections": {"body": ["body", "ring_"], "security": ["security", "equip_", "stave"], "vendor": ["vendor"]}})
    shutil.copyfile(asset.path("wardrobe", "wardrobe_source.blend"), outd / "halo_construct_wardrobe_source.blend")
    ev = outd / "evidence"
    ev.mkdir(exist_ok=True)
    import cv2

    for f in params["evidence"]:
        srcf = asset.path(f)
        if srcf.exists():
            im = cv2.imread(str(srcf))
            cv2.imwrite(str(ev / (Path(f).stem.replace("/", "_") + ".jpg")), im, [cv2.IMWRITE_JPEG_QUALITY, 86])
    files = [dst, outd / "export.json", outd / "halo_construct_rigged.blend", outd / "halo_construct_wardrobe_source.blend"]
    return files, {"runtime": params["runtime_path"], "sha256": exp["sha256"], "bytes": exp["bytes"]}


STAGES += [
    ("validate", stage_validate, lambda a: [a.path("rig", "skin.npz"), a.path("rig", "rig_nodes.json"), HERE / "mech_humanoid.py"], lambda a: _cfg(a, "validate")),
    ("evidence", stage_evidence, lambda a: [a.path("export", "halo_construct_npc.glb"), HERE / "blender" / "humanoid_evidence.py"], lambda a: _cfg(a, "evidence")),
    ("publish", stage_publish, lambda a: [a.path("export", "halo_construct_npc.glb"), a.path("validate", "validate.json"), a.path("evidence")], lambda a: _cfg(a, "publish")),
]
