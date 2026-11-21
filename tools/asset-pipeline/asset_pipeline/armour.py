"""body-fitted-armour workflow: wearable 3D armour from the inventory designs.

Turns the existing vector inventory illustrations of the armour items into
modelled, textured, skinned 3D assets fitted to the project's runtime bodies,
plus inventory icons rendered from those exact assets with the same Blender
(Cycles) renderer the Stillpoint and Halo Construct routes use.

Stages (python -m asset_pipeline <stage> --asset armour_chest):

  inspect    verify the body sources, dequantize them, extract the skeleton
             and the clips used for validation
  design     loft every item over each body (armour_design.py); clearance
  build      Blender: thickness, bevels, procedural PBR, baked atlases
             (the generalised humanoid_build "wardrobe" op)
  rig        skin every piece to the body skeleton (weights transferred from
             the body surface) and write one GLB per body
  export     js/optimize.mjs (WebP + Meshopt) + Khronos validator
  validate   clearance against the skinned body and worn-under shells over
             the validation clips; deformation of rigid plates
  icons      Cycles renders of each item from the exported GLB -> inventory
             icons (transparent WebP) and a hero render
  evidence   worn renders on both bodies, bind and posed
  publish    runtime GLBs and icons into client/assets, compact outputs
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

from .workspace import PIPELINE_DIR, REPO_ROOT, StageError, portable, read_json, run_blender, sha256_file, write_json

HERE = Path(__file__).resolve().parent


def _cfg(asset, key):
    return asset.config["armour"][key]


def _bodies(asset):
    return asset.config["armour"]["bodies"]


def _source(asset, sid):
    return next(s for s in asset.config["sources"] if s["id"] == sid)


def _node(args):
    proc = subprocess.run(["node", *map(str, args)], cwd=REPO_ROOT, capture_output=True, text=True)
    if proc.returncode:
        raise StageError(f"{Path(str(args[0])).name} failed: " + (proc.stderr or proc.stdout)[-2000:])
    return proc.stdout


class _Mats(dict):
    """Material slot -> per-item material name ("<item>_<slot>")."""

    def __init__(self, item):
        super().__init__()
        self.item = item

    def __missing__(self, k):
        return f"{self.item}_{k}"


def srgb_to_linear(hexstr):
    c = np.array([int(hexstr[i:i + 2], 16) for i in (1, 3, 5)], float) / 255
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


# ---------------------------------------------------------------- inspect


def stage_inspect(asset, params):
    out = asset.dir("inspect")
    rep = {"bodies": {}}
    files = []
    for key, sid in _bodies(asset).items():
        s = _source(asset, sid)
        path = asset.source(s["path"])
        digest = sha256_file(path)
        if digest != s["sha256"]:
            raise StageError(f"{sid}: hash mismatch {digest} != recorded {s['sha256']}")
        plain = out / f"body_{key}.glb"
        _node([PIPELINE_DIR / "js" / "dequantize.mjs", path, plain])
        rig = out / f"rig_{key}.json"
        _node([PIPELINE_DIR / "js" / "extract-rig.mjs", path, rig])
        # clips live on the male body; the game drives both bodies with them
        clip_src = asset.source(_source(asset, params["clip_body"])["path"])
        clips = out / "clips.json"
        _node([PIPELINE_DIR / "js" / "extract-rig.mjs", clip_src, clips, *params["clips"]])
        rj = read_json(rig)
        rj["animations"] = read_json(clips)["animations"]
        write_json(rig, rj)
        from .armour_design import load_body

        b = load_body(plain)
        mb = b["meshes"]["body"]
        rep["bodies"][key] = {"source": portable(path), "sha256": digest, "joints": len(b["joints"]),
                              "body_vertices": int(len(mb["V"])), "height_m": float(mb["V"][:, 1].max() - mb["V"][:, 1].min()),
                              "landmarks": {k: [round(float(x), 4) for x in b["bind"][k]] for k in
                                            ("pelvis", "spine_02", "spine_03", "neck_01", "clavicle_l", "upperarm_l")},
                              "meshes": sorted(b["meshes"])}
        files += [plain, rig]
    write_json(out / "inspect.json", rep)
    return files + [out / "inspect.json"], {k: v["sha256"][:12] for k, v in rep["bodies"].items()}


# ---------------------------------------------------------------- design


def stage_design(asset, params):
    from . import armour_cinderlock  # noqa: F401  (registers the Cinderlock designs)
    from . import armour_families  # noqa: F401  (Vesperglass, Strataweave, Mycelial)
    from . import armour_design as ad
    from .humanoid_wardrobe import export_pieces

    out = asset.dir("design")
    rep = {"items": params["items"], "bodies": {}}
    files = []
    for key in _bodies(asset):
        body = ad.FitBody(ad.load_body(asset.path("inspect", f"body_{key}.glb")), n=params["samples"],
                          **({"under": tuple(params["fit_surfaces"])} if params.get("fit_surfaces") else {}))
        pieces = []
        for item in params["items"]:
            mats = _Mats(item)
            pieces += ad.DESIGNS[params.get("design_of", {}).get(item, item)](body, params["base_offset"], mats)
        # every piece clears the body + worn-under shells along the normal by
        # its layer height above the vest (radial lofts sit closer on slopes)
        # The vest is pushed first; every layered piece moves with the vest
        # displacement beneath it, so plates, insets and lines keep their
        # height above the vest. A final push guarantees body clearance.
        from scipy.spatial import cKDTree as _T

        for item in params["items"]:
            if any(pc.get("hs") for pc in pieces if pc["set"] == item):
                # hard-surface items are authored at explicit layers on the
                # convex envelope; only their soft base layer is pushed clear
                for pc in pieces:
                    if pc["set"] == item and not pc.get("hs"):
                        pc["V"] = ad.push_clear(body, ad.relax(pc["V"], pc["F"], params["relax"]), params["min_gap"])
                        pc["even"] = False
                continue
            # the base layer of each item (the vest, a glove, a legging...) is
            # pushed first; layered pieces carry its displacement
            vest = next((pc for pc in pieces if pc["set"] == item and (pc.get("base") or pc["name"] == f"{item}__vest")), None)
            if vest is None:
                for pc in pieces:
                    if pc["set"] == item:
                        gap = pc.get("gap", params["min_gap"])
                        if pc["F"] is None:
                            pc["V"] = [(ad.push_clear(body, np.asarray(v, float), gap), f) for v, f in pc["V"]]
                        else:
                            V0 = ad.relax(pc["V"], pc["F"], params["relax"]) if pc.get("relax", True) else np.asarray(pc["V"], float)
                            pc["V"] = ad.push_clear(body, V0, gap) if gap > 0 else V0
                        pc["even"] = False
                continue
            old_v = np.asarray(vest["V"], float)
            vest["V"] = ad.push_clear(body, ad.relax(old_v, vest["F"], params["relax"]), params["min_gap"])
            vest["even"] = False
            disp = vest["V"] - old_v
            vt = _T(old_v)

            def carry(V):
                dd, ii = vt.query(V, k=6)
                w = 1 / np.maximum(dd, 1e-4)
                w /= w.sum(1, keepdims=True)
                return ad.push_clear(body, V + np.einsum("nk,nkd->nd", w, disp[ii]), params["min_gap"])
            for pc in pieces:
                if pc["set"] != item or pc is vest:
                    continue
                if pc["F"] is None:
                    pc["V"] = [(carry(np.asarray(v, float)), f) for v, f in pc["V"]]
                else:
                    pc["V"] = carry(ad.relax(pc["V"], pc["F"], params["relax"]) if pc.get("relax", True) else np.asarray(pc["V"], float))
                pc["even"] = False
        cl = {}
        for pc in pieces:
            parts = pc["V"] if pc["F"] is None else [(pc["V"], pc["F"])]
            V = np.concatenate([np.asarray(v, float) for v, _ in parts]) if len(parts) else np.zeros((0, 3))
            if len(V) == 0:  # generated in Blender (anchor soles) or FX-only (capillaries, lamps)
                continue
            d = ad.clearance(body, V)
            cl[pc["name"]] = {"min_m": round(float(d.min()), 4), "p05_m": round(float(np.percentile(d, 5)), 4)}
            # orientation hint for Blender: torso pieces push out from the
            # spine axis; shoulder pieces from a point under the shoulder
            if "axis" in pc:
                continue
            if "yoke" in pc["name"] or "pauldron" in pc["name"]:
                side = "l" if pc["name"].endswith("_l") else "r"
                sh = body.L["upperarm_" + side]
                pc["axis"] = [float(sh[0] * 0.6), float(sh[1] - 0.08), float(sh[2])]
                pc["axis3d"] = True
            else:
                pc["axis"] = [0.0, float(body.y(0.6)), float(body.centre(body.y(0.6))[2])]
        d_dir = asset.dir("design", key)
        export_pieces(pieces, d_dir / "pieces.npz", d_dir / "pieces.json")
        # bind-pose occluder for the bakes: body, hands, head, shoes
        Vs, Fs, o = [], [], 0
        for mname in ("body", "hands", "head", "shell_shoes"):
            if mname in body.meshes:
                Vs.append(body.meshes[mname]["V"])
                Fs.append(body.meshes[mname]["F"] + o)
                o += len(body.meshes[mname]["V"])
        np.savez(d_dir / "body.npz", V=np.concatenate(Vs), F=np.concatenate(Fs))
        files.append(d_dir / "body.npz")
        worst = min(v["min_m"] for v in cl.values())
        rep["bodies"][key] = {"pieces": len(pieces), "min_clearance_m": worst, "clearance": cl}
        files += [d_dir / "pieces.npz", d_dir / "pieces.json"]
    write_json(out / "design.json", rep)
    return files + [out / "design.json"], {k: {"pieces": v["pieces"], "min_clearance_m": v["min_clearance_m"]} for k, v in rep["bodies"].items()}


# ---------------------------------------------------------------- build


def blender_materials(asset):
    """Palette (sRGB hex, from the vector art) -> linear tuples for the wardrobe op."""
    out = {}
    for item, mats in asset.config["armour"]["materials"].items():
        for slot, m in mats.items():
            base = srgb_to_linear(m["base"]).tolist()
            worn = srgb_to_linear(m.get("worn", m["base"])).tolist()
            spec = [base, worn, m.get("metallic", 0.0), m.get("roughness", 0.6), m.get("noise", 20.0), bool(m.get("weave", False))]
            spec.append([*srgb_to_linear(m["emission"]).tolist(), m.get("emission_strength", 3.0)] if m.get("emission") else None)
            spec.append(m.get("mottle", asset.config["armour"]["build"].get("mottle", 0.12)))
            spec.append(m.get("wear", asset.config["armour"]["build"].get("wear", 0.3)))
            out[f"{item}_{slot}"] = spec
    return out


def stage_build(asset, params):
    out_all = asset.dir("build")
    rep = {}
    files = []
    if params.get("builder") == "hardsurface":
        return _build_hardsurface(asset, params)
    for key in _bodies(asset):
        d_dir = asset.path("design", key)
        out = asset.dir("build", key)
        res = run_blender("asset_pipeline.blender.humanoid_build", {
            "op": "wardrobe", "work": str(asset.work), "out": str(out), "pieces_npz": str(d_dir / "pieces.npz"),
            "pieces_json": str(d_dir / "pieces.json"), "texture": params["texture"], "materials": blender_materials(asset),
            "blend_name": f"armour_{key}_source.blend"}, timeout=7200)
        write_json(out / "build.json", res)
        rep[key] = {k: v["triangles"] for k, v in res["sets"].items()}
        files += [out / "build.json", out / res["blend"]]
        for sset in res["sets"].values():
            files += [out / sset["npz"]] + [out / f for f in sset["images"].values()]
    write_json(out_all / "build.json", rep)
    return files, rep


def hs_material_specs(asset):
    """Composite parameters per material (colours as linear RGB)."""
    out = {}
    for item, mats in asset.config["armour"]["materials"].items():
        for slot, m in mats.items():
            spec = {k: v for k, v in m.items() if k not in ("base", "edge", "worn", "emission")}
            spec["base"] = srgb_to_linear(m["base"]).tolist()
            spec["edge"] = srgb_to_linear(m.get("edge", m.get("worn", m["base"]))).tolist()
            if isinstance(m.get("pattern_rgb"), str):
                spec["pattern_rgb"] = srgb_to_linear(m["pattern_rgb"]).tolist()
            out[f"{item}_{slot}"] = spec
    return out


def _build_hardsurface(asset, params):
    out_all = asset.dir("build")
    rep, files = {}, []
    for key in _bodies(asset):
        d_dir = asset.path("design", key)
        out = asset.dir("build", key)
        tex = {k: (v // 4 if params.get("preview") else v) for k, v in params["texture"].items()}
        res = run_blender("asset_pipeline.blender.armour_hardsurface", {
            "work": str(asset.work), "out": str(out), "pieces_npz": str(d_dir / "pieces.npz"), "pieces_json": str(d_dir / "pieces.json"),
            "body_npz": str(d_dir / "body.npz"), "materials": hs_material_specs(asset), "texture": tex,
            "samples": 4 if params.get("preview") else params.get("samples", 16), "blend_name": f"armour_{key}_source.blend"}, timeout=14400)
        res["hardsurface"] = True
        write_json(out / "build.json", res)
        rep[key] = {k: v["triangles"] for k, v in res["sets"].items()}
        files += [out / "build.json", out / res["blend"]]
        for sset in res["sets"].values():
            files += [out / sset["npz"]] + [out / f for f in sset["images"].values()]
    write_json(out_all / "build.json", rep)
    return files, rep


# ---------------------------------------------------------------- rig


def vertex_normals(V, F):
    n = np.zeros_like(V)
    fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    for c in range(3):
        np.add.at(n, F[:, c], fn)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)


ARM = ("upperarm", "lowerarm", "hand", "thumb", "index", "middle", "ring", "pinky")
LEG = ("thigh", "calf", "foot", "ball")


def _policy_tree(body, surfaces):
    cache = body.__dict__.setdefault("_policy_trees", {})
    key = tuple(surfaces)
    if key not in cache:
        idx = np.nonzero(np.isin(body.src, [body.surfaces.index(s) for s in surfaces if s in body.surfaces]))[0]
        cache[key] = (cKDTree(body.P[idx]), idx)
    return cache[key]


def _band_smooth(c, Wd, sigma, bins=512):
    """Gaussian blend of weights along one coordinate (the "band" mode):
    sum_u g(c_v - c_u) W_u / sum_u g(c_v - c_u), with the sources binned so
    large plates do not need an N x N matrix (the dense form ran out of
    memory on a 25k-vertex greave)."""
    c = np.asarray(c, float)
    lo, hi = float(c.min()), float(c.max())
    if hi - lo < 1e-9:
        return np.repeat(Wd.mean(0, keepdims=True), len(Wd), 0)
    nb = int(min(bins, max(8, len(c))))
    b = np.minimum(((c - lo) / (hi - lo) * nb).astype(int), nb - 1)
    centres = lo + (np.arange(nb) + 0.5) * (hi - lo) / nb
    S = np.zeros((nb, Wd.shape[1]))
    np.add.at(S, b, Wd)
    n = np.bincount(b, minlength=nb).astype(float)
    G = np.exp(-((c[:, None] - centres[None, :]) / sigma) ** 2)
    return (G @ S) / np.maximum(G @ n, 1e-12)[:, None]


def limb_weights(body, P, joint_names, policy, k=10, smooth=0.0, mode=None):
    """Weights for limb armour (gauntlets, greaves, boots): follow the limb's
    own joints on one side only, sampled from the named fit surfaces."""
    from .humanoid_rig import pack_weights

    tree, idx = _policy_tree(body, policy.get("surfaces", body.surfaces))
    d, i = tree.query(P, k=int(k * (1 + smooth)))
    w = 1.0 / np.maximum(d, 1e-4) ** 2
    w /= w.sum(1, keepdims=True)
    Wd = np.einsum("nk,nkj->nj", w, body.Wd[idx[i]])
    side = policy.get("side")
    ok = np.array([n.startswith(tuple(policy["joints"])) and (side is None or n.endswith("_" + side)) for n in joint_names])
    Wd[:, ~ok] = 0
    if mode and mode[0] == "rigid":
        Wd[:] = Wd.mean(0, keepdims=True)
    elif mode and mode[0] == "band":
        c = P @ np.asarray(mode[1], float) if isinstance(mode[1], list) else P[:, {"x": 0, "y": 1, "z": 2}[mode[1]]]
        Wd = _band_smooth(c, Wd, mode[2])
    s = Wd.sum(1, keepdims=True)
    fallback = s[:, 0] < 1e-6
    if fallback.any():  # no allowed joint nearby: the policy's first joint
        Wd[fallback, joint_names.index(policy["joints"][0] + (f"_{side}" if side else ""))] = 1
    Wd /= Wd.sum(1, keepdims=True)
    J, W = pack_weights({n: Wd[:, j] for j, n in enumerate(joint_names) if Wd[:, j].max() > 0}, joint_names, max_influences=4, prune=0.02)
    if J.shape[1] < 4:
        pad = 4 - J.shape[1]
        J = np.c_[J, np.zeros((len(J), pad), J.dtype)]
        W = np.c_[W, np.zeros((len(W), pad), W.dtype)]
    return J, W


def piece_weights(body, P, joint_names, k=10, smooth=0.0, arm_cap=0.0, mode=None):
    """Skin weights for armour vertices from the k nearest body-surface samples
    (inverse-distance), so armour follows the body's own deformation. `smooth`
    widens the neighbourhood for stiff plates. Armour is torso-borne: arm
    influence is capped at `arm_cap` (0 for chest pieces, a share of the
    upper arm for shoulder yokes), so the T-pose -> rest arm swing cannot
    tear pieces that only sit near the armpit or over the shoulder."""
    from .humanoid_rig import pack_weights

    kk = int(k * (1 + smooth))
    d, i = body.tree.query(P, k=kk)
    w = 1.0 / np.maximum(d, 1e-4) ** 2
    w /= w.sum(1, keepdims=True)
    Wd = np.einsum("nk,nkj->nj", w, body.Wd[i])
    arm = np.array([n.startswith(ARM) or n.startswith(LEG) for n in joint_names])
    upper = np.array([n.startswith("upperarm") for n in joint_names])
    Wd[:, arm & ~upper] = 0  # legs (coat-skirt samples near the hem) and forearms/hands never drive armour
    a = Wd[:, upper].sum(1, keepdims=True)
    Wd[:, upper] *= np.minimum(1.0, arm_cap / np.maximum(a, 1e-9))
    rest = Wd[:, ~arm].sum(1, keepdims=True)
    target = 1 - Wd[:, upper].sum(1, keepdims=True)
    Wd[:, ~arm] *= target / np.maximum(rest, 1e-9)
    # plates move (nearly) as one: a single shared blend ("rigid"), or blends
    # that vary only along one axis ("band": height for torso plates, across
    # the shoulder for yokes) so they bend with the spine but do not shear
    if mode and mode[0] == "rigid":
        Wd[:] = Wd.mean(0, keepdims=True)
    elif mode and mode[0] == "band":
        ax = {"x": 0, "y": 1, "z": 2}[mode[1]]
        c = np.abs(P[:, ax]) if ax == 0 else P[:, ax]
        Wd = _band_smooth(c, Wd, mode[2])
    J, W = pack_weights({n: Wd[:, j] for j, n in enumerate(joint_names) if Wd[:, j].max() > 0}, joint_names, max_influences=4, prune=0.02)
    if J.shape[1] < 4:  # a piece influenced by fewer joints packs narrower
        pad = 4 - J.shape[1]
        J = np.c_[J, np.zeros((len(J), pad), J.dtype)]
        W = np.c_[W, np.zeros((len(W), pad), W.dtype)]
    return J, W


def stage_rig(asset, params):
    from . import armour_design as ad
    from . import gltf_io as gi
    import cv2

    out = asset.dir("rig")
    rep = {}
    files = []
    for key in _bodies(asset):
        rig = read_json(asset.path("inspect", f"rig_{key}.json"))
        fs = asset.config["armour"]["design"].get("fit_surfaces")
        body = ad.FitBody(ad.load_body(asset.path("inspect", f"body_{key}.glb")), n=params["samples"], **({"under": tuple(fs)} if fs else {}))
        joints = rig["joints"]
        assert joints == body.joints, "skeleton joint order differs between rig and body"
        IBM = np.asarray(rig["inverseBindMatrices"], float).reshape(-1, 4, 4).transpose(0, 2, 1)
        meta = {m["name"]: m for m in read_json(asset.path("design", key, "pieces.json"))}
        build = read_json(asset.path("build", key, "build.json"))
        w = gi.GlbWriter()
        root = w.node(f"Armour_{key}")
        nidx = {}
        nodes = {n["name"]: n for n in rig["nodes"]}
        order = []
        seen = set()

        def visit(name):
            if name in seen or name not in nodes:
                return
            if nodes[name]["parent"]:
                visit(nodes[name]["parent"])
            seen.add(name)
            order.append(name)
        for n in nodes:
            visit(n)
        for name in order:
            nd = nodes[name]
            par = nidx.get(nd["parent"], root)
            nidx[name] = w.node(name, parent=par, t=nd.get("t"), r=nd.get("r"), s=nd.get("s"))
        skin = w.skin(f"armour_{key}_skeleton", [nidx[n] for n in joints], IBM, skeleton=nidx[joints[0]])
        tri = {}
        skin_store = {}
        bdir = asset.path("build", key)
        for item, info in build["sets"].items():
            imgs = info["images"]
            rough = cv2.imread(str(bdir / imgs["roughness"]), cv2.IMREAD_GRAYSCALE).astype(np.float32) / 255
            metal = cv2.imread(str(bdir / imgs["metallic"]), cv2.IMREAD_GRAYSCALE).astype(np.float32) / 255
            orm = np.stack([np.ones_like(rough), rough, metal], -1)
            tb = w.image((bdir / imgs["basecolor"]).read_bytes(), item + "_basecolor")
            to = w.image(gi.png_bytes(orm), item + "_orm")
            tn = w.image((bdir / imgs["normal"]).read_bytes(), item + "_normal")
            em = None
            if "emissive" in imgs:
                ei = cv2.imread(str(bdir / imgs["emissive"]))[..., ::-1].astype(np.float32) / 255
                es = params.get("emissive_size", 512)
                em = w.image(gi.png_bytes(cv2.resize(ei, (es, es), interpolation=cv2.INTER_AREA)), item + "_emissive")
            mat = w.material(f"armour_{item}", base=tb, orm=to, normal=tn, emissive=em,
                             emissive_factor=(1.0, 1.0, 1.0) if em is not None else (0, 0, 0))
            arr = np.load(bdir / info["npz"])

            def weights_for(pname, Pp):
                kind = re.sub(r"_[lr]?\d*$", "", pname.split("__", 1)[1])
                stiff = params["stiffness"].get(kind, 0.0)
                pol = meta.get(pname, {}).get("weights")
                wmode = meta.get(pname, {}).get("weight_mode") or params["weight_modes"].get(kind)
                if pol:
                    return limb_weights(body, Pp, joints, pol, k=params["k"], smooth=stiff, mode=wmode)
                return piece_weights(body, Pp, joints, k=params["k"], smooth=stiff, arm_cap=params["arm_cap"].get(kind, 0.0), mode=wmode)

            if build.get("hardsurface"):
                # one joined mesh per item; a per-vertex piece id selects the
                # weight policy; inlays are a second, emissive mesh (flow UVs)
                def by_piece(P, PI):
                    J = np.zeros((len(P), 4), np.int64)
                    Wt = np.zeros((len(P), 4))
                    for k, pname in enumerate(info["pieces"]):
                        sel = PI == k
                        if sel.any():
                            J[sel], Wt[sel] = weights_for(pname, P[sel])
                    return J, Wt
                P, N, UV, I = arr["P"], arr["N"], arr["UV"], arr["I"]
                J, Wt = by_piece(P, arr["piece"])
                mi = w.mesh(item, P, I, normals=N, uvs=UV, joints=J, weights=Wt, material=mat)
                # body shells this piece replaces (the runtime hides them while it is worn)
                hides = params.get("hides", {}).get(item)
                w.node(item, mesh=mi, skin=skin, **({"extras": {"hides": list(hides)}} if hides else {}))
                tri[item] = int(len(I))
                skin_store.update({f"{item}_P": P, f"{item}_I": I, f"{item}_J": J, f"{item}_W": Wt})
                if "FX_P" in arr.files:
                    fxmat = w.material(f"{params.get('fx_material', 'CL_Channel')}", base_factor=(0.05, 0.01, 0.01, 1), metallic=0.0, roughness=0.4,
                                       emissive_factor=tuple(params.get("fx_emissive", (1.0, 0.16, 0.08))))
                    FJ, FW = by_piece(arr["FX_P"], arr["FX_piece"])
                    fi = w.mesh(f"{item}__fx", arr["FX_P"], arr["FX_I"], normals=arr["FX_N"], uvs=arr["FX_UV"], joints=FJ, weights=FW, material=fxmat)
                    w.node(f"{item}__fx", mesh=fi, skin=skin)
                    tri[item + "__fx"] = int(len(arr["FX_I"]))
                if "GL_P" in arr.files:  # translucent layer (prisms, membranes, lenses)
                    g = params.get("glass", {})
                    glmat = w.material(g.get("material", "Armour_Glass"), base_factor=tuple(g.get("rgba", (0.6, 0.85, 1.0, 0.35))),
                                       metallic=g.get("metallic", 0.0), roughness=g.get("roughness", 0.08),
                                       emissive_factor=tuple(g.get("emissive", (0.0, 0.0, 0.0))), alpha_mode="BLEND", double_sided=True)
                    GJ, GW = by_piece(arr["GL_P"], arr["GL_piece"])
                    gi_ = w.mesh(f"{item}__glass", arr["GL_P"], arr["GL_I"], normals=arr["GL_N"], uvs=arr["GL_UV"], joints=GJ, weights=GW, material=glmat)
                    w.node(f"{item}__glass", mesh=gi_, skin=skin)
                    tri[item + "__glass"] = int(len(arr["GL_I"]))
                continue
            Ps, Ns, UVs, Is, Js, Ws = [], [], [], [], [], []
            off = 0
            for pname in info["pieces"]:
                Pp, Nn, UV, I = arr[pname + "_P"], arr[pname + "_N"], arr[pname + "_UV"], arr[pname + "_I"]
                Jg, Wg = weights_for(pname, Pp)
                Ps.append(Pp), Ns.append(Nn / np.maximum(np.linalg.norm(Nn, axis=1, keepdims=True), 1e-12)), UVs.append(UV)
                Is.append(I + off), Js.append(Jg), Ws.append(Wg)
                off += len(Pp)
            P, N, UV, I, J, Wt = (np.concatenate(x) for x in (Ps, Ns, UVs, Is, Js, Ws))
            mi = w.mesh(item, P, I, normals=N, uvs=UV, joints=J, weights=Wt, material=mat)
            w.node(item, mesh=mi, skin=skin)
            tri[item] = int(len(I))
            skin_store.update({f"{item}_P": P, f"{item}_I": I, f"{item}_J": J, f"{item}_W": Wt})
        if params.get("fx_anchors"):
            from .armour_fx_anchors import compute as fx_anchors

            jidx_of = {n: i for i, n in enumerate(joints)}
            for item, lst in fx_anchors(body, list(build["sets"]), asset.config["armour"]["design"]["base_offset"]).items():
                for k, (kind, p_, joint) in enumerate(lst):
                    local = IBM[jidx_of[joint]] @ np.r_[p_, 1.0]
                    w.node(f"fxa--{item}--{kind}--{k}", parent=nidx[joint], t=local[:3])
        glb = out / f"{asset.id}_{key}.glb"
        size = w.write(glb)
        np.savez_compressed(out / f"skin_{key}.npz", IBM=IBM, **skin_store)
        rep[key] = {"triangles": tri, "bytes": size, "joints": len(joints)}
        files += [glb, out / f"skin_{key}.npz"]
    write_json(out / "rig.json", rep)
    return files + [out / "rig.json"], {k: v["triangles"] for k, v in rep.items()}


# ---------------------------------------------------------------- export


def stage_export(asset, params):
    out = asset.dir("export")
    rep = {}
    files = []
    for key in _bodies(asset):
        src = asset.path("rig", f"{asset.id}_{key}.glb")
        dst = out / f"{asset.id}_{key}.glb"
        _node([PIPELINE_DIR / "js" / "optimize.mjs", src, dst, params["max_texture"], params["quality"]])
        r = read_json(Path(str(dst) + ".report.json"))
        r["file"] = portable(dst)
        r["sha256"] = sha256_file(dst)
        rep[key] = r
        files.append(dst)
        if r["validator"]["errors"]:
            raise StageError(f"glTF validator errors in {dst.name}: {r['validator']}")
    write_json(out / "export.json", rep)
    return files + [out / "export.json"], {k: {"bytes": v["bytes"], "triangles": v["triangles"], "validator_errors": v["validator"]["errors"]} for k, v in rep.items()}


# ---------------------------------------------------------------- validate


def stage_validate(asset, params):
    """Clearance of every armour vertex from the skinned body (and the
    worn-under shells) over the validation clips, and stretch of the stiff
    plates. Measured on the same weights the runtime GLB carries."""
    from . import armour_design as ad
    from . import humanoid_rig as hr
    from scipy.spatial import cKDTree

    rep = {"clips": params["clips"], "bodies": {}}
    ok = True
    for key in _bodies(asset):
        rig = read_json(asset.path("inspect", f"rig_{key}.json"))
        b = ad.load_body(asset.path("inspect", f"body_{key}.glb"))
        sk = hr.Skeleton(rig["nodes"])
        joints = rig["joints"]
        jidx = np.array([sk.index[n] for n in joints])
        IBM = np.zeros((len(sk.names), 4, 4))
        d = np.load(asset.path("rig", f"skin_{key}.npz"))
        IBM[jidx] = d["IBM"]
        clips = {a["name"]: a for a in rig["animations"]}
        ji = {n: i for i, n in enumerate(joints)}
        arm_j = [i for n, i in ji.items() if n.startswith(("upperarm", "lowerarm", "hand", "thumb", "index", "middle", "ring", "pinky"))]
        import trimesh

        # the surface the armour must clear: the body plus the worn-under
        # shells (the body mesh is hollow under them), densely sampled and
        # carried through skinning by barycentric coordinates
        surf = []
        for k, m in enumerate(["body"] + [x for x in params["under_shells"] if x in b["meshes"]]):
            ms = b["meshes"][m]
            tm = trimesh.Trimesh(ms["V"], ms["F"], process=False)
            P0, fi = trimesh.sample.sample_surface(tm, max(4000, int(params["surface_samples"] * tm.area / 1.2)), seed=k + 1)
            bary = trimesh.triangles.points_to_barycentric(tm.triangles[fi], P0)
            armv = (np.isin(ms["J"], arm_j) * ms["W"]).sum(1)
            surf.append((ms, ms["F"][fi], bary, (armv[ms["F"][fi]] * bary).sum(1) > 0.5))
        arm = np.concatenate([x[3] for x in surf])
        is_shell = np.concatenate([np.full(len(x[1]), x[0] is not b["meshes"]["body"]) for x in surf])
        mb = b["meshes"]["body"]
        Eb = mb["F"][:, :2]
        items = sorted({k[:-2] for k in d.files if k.endswith("_P")})
        res = {it: {"min_clearance_m": 1.0, "inside_fraction_max": 0.0, "inside_body_fraction_max": 0.0, "inside_shell_fraction_max": 0.0,
                    "arm_contact_fraction_max": 0.0, "max_edge_strain": 0.0} for it in items}
        body_strain = 0.0
        for cname in params["clips"]:
            c = clips[cname]
            T = hr.clip_length(c)
            for t in np.linspace(0, T, params["frames"]):
                pose = hr.pose_at(sk, c, float(t))
                Sps, Nps = [], []
                for ms, Fs, bary, _ in surf:
                    Vp = hr.skin(sk, IBM, jidx, ms["V"], ms["J"], ms["W"], pose)
                    Nv = vertex_normals(Vp, ms["F"])
                    Sps.append((Vp[Fs] * bary[..., None]).sum(1))
                    Nps.append((Nv[Fs] * bary[..., None]).sum(1))
                    if ms is mb:
                        ratio = (np.linalg.norm(Vp[Eb[:, 0]] - Vp[Eb[:, 1]], axis=1)
                                 / np.maximum(np.linalg.norm(mb["V"][Eb[:, 0]] - mb["V"][Eb[:, 1]], axis=1), 1e-9))
                        scale = float(np.median(ratio))  # the rig's world carries a global scale
                        body_strain = max(body_strain, float(np.percentile(np.abs(ratio / scale - 1), 99)))
                Sp, Np = np.concatenate(Sps), np.concatenate(Nps)
                tree = cKDTree(Sp)
                layer = np.zeros(len(Sp))
                for it in items:
                    P, I = d[f"{it}_P"], d[f"{it}_I"]
                    Pp = hr.skin(sk, IBM, jidx, P, d[f"{it}_J"], d[f"{it}_W"], pose)
                    dist, i = tree.query(Pp)
                    sd = dist * np.sign(np.sum((Pp - Sp[i]) * Np[i], 1)) / scale - layer[i]
                    # the resting arm against a torso piece's side is contact,
                    # reported apart; limb pieces must clear their own limb
                    on_arm = arm[i] if it in params.get("arm_contact_items", items) else np.zeros(len(i), bool)
                    r = res[it]
                    body_sd = sd[~on_arm]
                    r["min_clearance_m"] = min(r["min_clearance_m"], float(np.percentile(body_sd, 0.5)))
                    r["inside_fraction_max"] = max(r["inside_fraction_max"], float((body_sd < -0.002).sum() / len(sd)))
                    inside = (sd < -0.002) & ~on_arm
                    r["inside_body_fraction_max"] = max(r["inside_body_fraction_max"], float((inside & ~is_shell[i]).mean()))
                    r["inside_shell_fraction_max"] = max(r["inside_shell_fraction_max"], float((inside & is_shell[i]).mean()))
                    r["arm_contact_fraction_max"] = max(r["arm_contact_fraction_max"], float((on_arm & (sd < 0.004)).mean()))
                    E = np.unique(np.sort(np.r_[I[:, [0, 1]], I[:, [1, 2]], I[:, [2, 0]]], 1), axis=0)
                    L0 = np.linalg.norm(P[E[:, 0]] - P[E[:, 1]], axis=1)
                    L1 = np.linalg.norm(Pp[E[:, 0]] - Pp[E[:, 1]], axis=1)
                    strain = np.abs(L1 / np.maximum(L0 * scale, 1e-9) - 1)
                    r["max_edge_strain"] = max(r["max_edge_strain"], float(np.percentile(strain, 99)))

        limit = max(params["max_edge_strain_p99"], body_strain * params["strain_vs_body"])
        for it, r in res.items():
            # skin and the cloth shells are judged separately: the shells carry
            # their own arm-swing weights and may brush the torso-borne armour
            r["pass"] = bool(r["inside_body_fraction_max"] <= params["max_inside_body_fraction"]
                             and r["inside_shell_fraction_max"] <= params["max_inside_shell_fraction"]
                             and r["min_clearance_m"] >= params["min_clearance_p05_m"] and r["max_edge_strain"] <= limit)
            ok &= r["pass"]
        rep["bodies"][key] = {"items": res, "body_edge_strain_p99": body_strain, "edge_strain_limit": limit}
    rep["all_pass"] = bool(ok)
    out = asset.dir("validate")
    write_json(out / "validate.json", rep)
    if not ok and params.get("strict", True):
        raise StageError("armour validation failed: " + json.dumps(rep["bodies"])[:1500])
    return [out / "validate.json"], {"all_pass": ok}


# ---------------------------------------------------------------- icons / evidence


def _decoded(asset, key):
    out = asset.dir("icons")
    dec = out / f"decoded_{key}.glb"
    _node([PIPELINE_DIR / "js" / "decompress.mjs", asset.path("export", f"{asset.id}_{key}.glb"), dec])
    return dec


def blueprint_sheet(rgba):
    """Holographic schematic card: navy sheet, fine and major grid, a soft
    projection glow under the linework, corner ticks (BGRA in, BGRA out)."""
    import cv2

    h, w = rgba.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    bg = np.zeros((h, w, 3), np.float32)
    g = 0.65 + 0.35 * (1 - np.hypot(xx / w - 0.5, yy / h - 0.42) * 1.4)
    bg[...] = np.array([0.15, 0.10, 0.03], np.float32)[None, None] * g[..., None]  # BGR navy
    fine, major = max(8, w // 32), max(32, w // 8)
    for step, col, a in ((fine, (0.34, 0.24, 0.08), 0.5), (major, (0.55, 0.40, 0.12), 0.85)):
        grid = ((xx % step) < 1) | ((yy % step) < 1)
        bg[grid] = bg[grid] * (1 - a) + np.array(col, np.float32) * a
    al = rgba[..., 3:4].astype(np.float32) / 255
    glow = cv2.GaussianBlur(al[..., 0], (0, 0), w / 60)[..., None]
    bg = bg + np.array([1.0, 0.75, 0.25], np.float32) * glow * 0.25
    fg = rgba[..., :3].astype(np.float32) / 255
    out = bg * (1 - al) + fg * al
    o8 = np.ascontiguousarray((np.clip(out, 0, 1) * 255).astype(np.uint8))
    t, L, m = max(1, w // 128), w // 10, max(3, w // 40)
    col = (255, 230, 140)
    for (x0, y0, dx, dy) in ((m, m, 1, 1), (w - 1 - m, m, -1, 1), (m, h - 1 - m, 1, -1), (w - 1 - m, h - 1 - m, -1, -1)):
        cv2.line(o8, (x0, y0), (x0 + dx * L, y0), col, t)
        cv2.line(o8, (x0, y0), (x0, y0 + dy * L), col, t)
    return np.dstack([o8, np.full((h, w), 255, np.uint8)])


def stage_icons(asset, params):
    import cv2

    dec = _decoded(asset, params["body"])
    out = asset.dir("icons")
    # one Blender process per item: a whole set's renders in one process
    # accumulated past the memory limit on the heaviest family
    res = {"icons": {}}
    for item in asset.config["armour"]["design"]["items"]:
        r = run_blender("asset_pipeline.blender.armour_render", {"op": "icons", "work": str(asset.work), "glb": str(dec), "out": str(out),
                                                                "items": [item], **params}, timeout=7200)
        res["icons"].update(r["icons"])
    files = []
    sizes = {}
    for item, png in res["icons"].items():
        im = cv2.imread(png, cv2.IMREAD_UNCHANGED)
        if item.startswith("blueprint_"):
            im = blueprint_sheet(im)
        for s in params["export_sizes"]:
            sm = cv2.resize(im, (s, s), interpolation=cv2.INTER_AREA)
            f = out / f"{item}_{s}.webp"
            cv2.imwrite(str(f), sm, [cv2.IMWRITE_WEBP_QUALITY, params["webp_quality"]])
            files.append(f)
            sizes[f.name] = f.stat().st_size
        files.append(Path(png))
    write_json(out / "icons.json", {"icons": res["icons"], "bytes": sizes})
    return files + [out / "icons.json"], {"icons": len(res["icons"]), "bytes": sum(sizes.values())}


def stage_evidence(asset, params):
    out = asset.dir("evidence")
    files = []
    for key in _bodies(asset):
        dec = _decoded(asset, key)
        res = run_blender("asset_pipeline.blender.armour_render", {"op": "worn", "work": str(asset.work), "glb": str(dec),
                                                                  "body": str(asset.path("inspect", f"body_{key}.glb")), "out": str(out),
                                                                  "clip_glb": str(asset.path("inspect", "body_m.glb")),
                                                                  "prefix": key, "items": asset.config["armour"]["design"]["items"], **params}, timeout=7200)
        files += [Path(f) for f in res["renders"]]
    return files, {"renders": len(files)}


# ---------------------------------------------------------------- publish


def stage_publish(asset, params):
    import cv2

    outd = PIPELINE_DIR / "assets" / asset.id / "outputs"
    outd.mkdir(parents=True, exist_ok=True)
    exp = read_json(asset.path("export", "export.json"))
    pub = {"runtime": {}, "icons": {}}
    files = []
    for key, rel in params["runtime"].items():
        dst = REPO_ROOT / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(asset.path("export", f"{asset.id}_{key}.glb"), dst)
        exp[key]["file"] = rel
        exp[key]["sha256"] = sha256_file(dst)
        pub["runtime"][key] = {"file": rel, "sha256": exp[key]["sha256"], "bytes": dst.stat().st_size}
        files.append(dst)
    write_json(outd / "export.json", exp)
    icon_dir = REPO_ROOT / params["icons_dir"]
    icon_dir.mkdir(parents=True, exist_ok=True)
    for f in sorted(asset.path("icons").glob(f"*_{params['icon_size']}.webp")):
        item = f.name[: -len(f"_{params['icon_size']}.webp")]
        dst = icon_dir / f"{item}.webp"
        shutil.copyfile(f, dst)
        pub["icons"][item] = {"file": portable(dst), "sha256": sha256_file(dst), "bytes": dst.stat().st_size}
        files.append(dst)
    write_json(outd / "publish.json", pub)
    # the client's synchronous icon lookup, content-hashed for cache busting;
    # merged across every pipeline asset that publishes icons
    allicons = {}
    for rec in sorted((PIPELINE_DIR / "assets").glob("*/outputs/publish.json")):
        allicons.update(read_json(rec).get("icons", {}))
    mod = REPO_ROOT / params["icons_module"]
    lines = ["// Generated by tools/asset-pipeline (armour publish stages); do not edit.",
             "// Inventory icons rendered in Cycles from the exported 3D armour (docs/art/ARMOUR-3D.md).",
             "const ICONS = Object.freeze({"]
    for item, info in sorted(allicons.items()):
        lines.append(f"  {item}: '/{info['file']}?v={info['sha256'][:12]}',")
    lines += ["});", "export const RENDERED_ICON_IDS = Object.freeze(Object.keys(ICONS));",
              "export function renderedItemIcon(id) { return typeof id === 'string' && Object.hasOwn(ICONS, id) ? ICONS[id] : null; }", ""]
    mod.write_text("\n".join(lines))
    files.append(mod)
    for a, b in {"inspect/inspect.json": "inspect.json", "design/design.json": "design.json", "build/build.json": "build.json",
                 "rig/rig.json": "rig.json", "validate/validate.json": "validate.json", "icons/icons.json": "icons.json"}.items():
        if asset.path(a).exists():
            shutil.copyfile(asset.path(a), outd / b)
    for key in _bodies(asset):
        b = asset.path("build", key, f"armour_{key}_source.blend")
        if b.exists():
            shutil.copyfile(b, outd / b.name)
            files.append(outd / b.name)
    ev = outd / "evidence"
    ev.mkdir(exist_ok=True)
    for f in sorted(asset.path("evidence").glob("*.png")) + sorted(asset.path("icons").glob("*_hero.png")):
        im = cv2.imread(str(f), cv2.IMREAD_UNCHANGED)
        if im.shape[-1] == 4:  # flatten icons on the inventory panel colour for review
            a = im[..., 3:4].astype(np.float32) / 255
            im = (im[..., :3] * a + np.array([38, 44, 46], np.float32) * (1 - a)).astype(np.uint8)
        cv2.imwrite(str(ev / (f.stem + ".jpg")), im, [cv2.IMWRITE_JPEG_QUALITY, 86])
    write_json(outd / "publish.json", pub)
    return files + [outd / "publish.json"], {k: v["bytes"] for k, v in pub["runtime"].items()}


STAGES = [
    ("inspect", stage_inspect, lambda a: [a.config_path, PIPELINE_DIR / "js" / "dequantize.mjs", PIPELINE_DIR / "js" / "extract-rig.mjs"]
     + [a.source(_source(a, s)["path"]) for s in _bodies(a).values()], lambda a: _cfg(a, "inspect")),
    ("design", stage_design, lambda a: [a.path("inspect"), HERE / "armour_design.py", HERE / "armour_cinderlock.py",
                                                 HERE / "armour_families.py", HERE / "armour_parts.py", HERE / "humanoid_wardrobe.py"], lambda a: _cfg(a, "design")),
    ("build", stage_build, lambda a: [a.path("design"), HERE / "blender" / "humanoid_build.py", HERE / "blender" / "armour_hardsurface.py"],
     lambda a: {**_cfg(a, "build"), "materials": a.config["armour"]["materials"], **({"preview": True} if os.environ.get("ARMOUR_PREVIEW") else {})}),
    ("rig", stage_rig, lambda a: [a.path("build"), a.path("inspect"), a.path("design"), HERE / "armour.py", HERE / "armour_fx_anchors.py", HERE / "gltf_io.py", HERE / "humanoid_rig.py"], lambda a: _cfg(a, "rig")),
    ("export", stage_export, lambda a: [a.path("rig"), PIPELINE_DIR / "js" / "optimize.mjs"], lambda a: _cfg(a, "export")),
    ("validate", stage_validate, lambda a: [a.path("rig"), a.path("inspect"), HERE / "armour.py"], lambda a: _cfg(a, "validate")),
    ("icons", stage_icons, lambda a: [a.path("export"), HERE / "blender" / "armour_render.py"], lambda a: _cfg(a, "icons")),
    ("evidence", stage_evidence, lambda a: [a.path("export"), HERE / "blender" / "armour_render.py"], lambda a: _cfg(a, "evidence")),
    ("publish", stage_publish, lambda a: [a.path("export"), a.path("icons"), a.path("evidence"), a.path("validate")], lambda a: _cfg(a, "publish")),
]
