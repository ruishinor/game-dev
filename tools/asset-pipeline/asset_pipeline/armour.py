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
import re
import shutil
import subprocess
from pathlib import Path

import numpy as np

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
    from . import armour_design as ad
    from .humanoid_wardrobe import export_pieces

    out = asset.dir("design")
    rep = {"items": params["items"], "bodies": {}}
    files = []
    for key in _bodies(asset):
        body = ad.FitBody(ad.load_body(asset.path("inspect", f"body_{key}.glb")), n=params["samples"])
        pieces = []
        for item in params["items"]:
            mats = {k: f"{item}_{k}" for k in ("vest", "yoke", "panel", "inset", "strap", "hardware", "plate", "trim", "core", "lines")}
            pieces += ad.DESIGNS[item](body, params["base_offset"], mats)
        # every piece clears the body + worn-under shells along the normal by
        # its layer height above the vest (radial lofts sit closer on slopes)
        # The vest is pushed first; every layered piece moves with the vest
        # displacement beneath it, so plates, insets and lines keep their
        # height above the vest. A final push guarantees body clearance.
        from scipy.spatial import cKDTree as _T

        for item in params["items"]:
            vest = next(pc for pc in pieces if pc["name"] == f"{item}__vest")
            old_v = np.asarray(vest["V"], float)
            vest["V"] = ad.push_clear(body, old_v, params["min_gap"])
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
                    pc["V"] = carry(np.asarray(pc["V"], float))
        cl = {}
        for pc in pieces:
            parts = pc["V"] if pc["F"] is None else [(pc["V"], pc["F"])]
            V = np.concatenate([np.asarray(v, float) for v, _ in parts])
            d = ad.clearance(body, V)
            cl[pc["name"]] = {"min_m": round(float(d.min()), 4), "p05_m": round(float(np.percentile(d, 5)), 4)}
            # orientation hint for Blender: torso pieces push out from the
            # spine axis; shoulder pieces from a point under the shoulder
            if "yoke" in pc["name"] or "pauldron" in pc["name"]:
                side = "l" if pc["name"].endswith("_l") else "r"
                sh = body.L["upperarm_" + side]
                pc["axis"] = [float(sh[0] * 0.6), float(sh[1] - 0.08), float(sh[2])]
                pc["axis3d"] = True
            else:
                pc["axis"] = [0.0, float(body.y(0.6)), float(body.centre(body.y(0.6))[2])]
        d_dir = asset.dir("design", key)
        export_pieces(pieces, d_dir / "pieces.npz", d_dir / "pieces.json")
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
            if m.get("emission"):
                spec.append([*srgb_to_linear(m["emission"]).tolist(), m.get("emission_strength", 3.0)])
            out[f"{item}_{slot}"] = spec
    return out


def stage_build(asset, params):
    out_all = asset.dir("build")
    rep = {}
    files = []
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


# ---------------------------------------------------------------- rig


def vertex_normals(V, F):
    n = np.zeros_like(V)
    fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    for c in range(3):
        np.add.at(n, F[:, c], fn)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)


def piece_weights(body, P, joint_names, k=10, smooth=0.0):
    """Skin weights for armour vertices from the k nearest body-surface samples
    (inverse-distance), so armour follows the body's own deformation. `smooth`
    widens the neighbourhood for stiff plates."""
    from .humanoid_rig import pack_weights

    kk = int(k * (1 + smooth))
    d, i = body.tree.query(P, k=kk)
    w = 1.0 / np.maximum(d, 1e-4) ** 2
    w /= w.sum(1, keepdims=True)
    Wd = np.einsum("nk,nkj->nj", w, body.Wd[i])
    return pack_weights({n: Wd[:, j] for j, n in enumerate(joint_names) if Wd[:, j].max() > 0}, joint_names, max_influences=4, prune=0.02)


def stage_rig(asset, params):
    from . import armour_design as ad
    from . import gltf_io as gi
    import cv2

    out = asset.dir("rig")
    rep = {}
    files = []
    for key in _bodies(asset):
        rig = read_json(asset.path("inspect", f"rig_{key}.json"))
        body = ad.FitBody(ad.load_body(asset.path("inspect", f"body_{key}.glb")), n=params["samples"])
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
            Ps, Ns, UVs, Is, Js, Ws = [], [], [], [], [], []
            off = 0
            for pname in info["pieces"]:
                Pp, Nn, UV, I = arr[pname + "_P"], arr[pname + "_N"], arr[pname + "_UV"], arr[pname + "_I"]
                stiff = params["stiffness"].get(re.sub(r"_[lr]?\d*$", "", pname.split("__", 1)[1]), 0.0)
                Jg, Wg = piece_weights(body, Pp, joints, k=params["k"], smooth=stiff)
                Ps.append(Pp), Ns.append(Nn / np.maximum(np.linalg.norm(Nn, axis=1, keepdims=True), 1e-12)), UVs.append(UV)
                Is.append(I + off), Js.append(Jg), Ws.append(Wg)
                off += len(Pp)
            P, N, UV, I, J, Wt = (np.concatenate(x) for x in (Ps, Ns, UVs, Is, Js, Ws))
            mi = w.mesh(item, P, I, normals=N, uvs=UV, joints=J, weights=Wt, material=mat)
            w.node(item, mesh=mi, skin=skin)
            tri[item] = int(len(I))
            skin_store.update({f"{item}_P": P, f"{item}_I": I, f"{item}_J": J, f"{item}_W": Wt})
        glb = out / f"armour_chest_{key}.glb"
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
        src = asset.path("rig", f"armour_chest_{key}.glb")
        dst = out / f"armour_chest_{key}.glb"
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
        mb = b["meshes"]["body"]
        import trimesh

        def dense(m, n, seed):
            tm = trimesh.Trimesh(m["V"], m["F"], process=False)
            P0, fi = trimesh.sample.sample_surface(tm, n, seed=seed)
            return m["F"][fi], trimesh.triangles.points_to_barycentric(tm.triangles[fi], P0), P0
        Fs, bary, S0 = dense(mb, params["surface_samples"], 1)
        armv = (np.isin(mb["J"], arm_j) * mb["W"]).sum(1)
        arm = (armv[Fs] * bary).sum(1) > 0.5
        # layer thickness over each body sample: the worn-under shells are open
        # sheets, so their own normals cannot give a sign past their edges;
        # clearance is measured from the closed body surface minus the
        # thickest shell lying over that spot (bind-pose correspondence)
        btree = cKDTree(S0)
        layer = np.zeros(len(S0))
        for sname in params["under_shells"]:
            if sname not in b["meshes"]:
                continue
            _, _, Sh = dense(b["meshes"][sname], params["surface_samples"] // 3, 2)
            dist, i = btree.query(Sh)
            np.maximum.at(layer, i, dist)
        _, nb = btree.query(S0, k=12)
        layer = layer[nb].max(1)
        Eb = mb["F"][:, :2]
        items = sorted({k[:-2] for k in d.files if k.endswith("_P")})
        res = {it: {"min_clearance_m": 1.0, "inside_fraction_max": 0.0, "arm_contact_fraction_max": 0.0, "max_edge_strain": 0.0} for it in items}
        body_strain = 0.0
        for cname in params["clips"]:
            c = clips[cname]
            T = hr.clip_length(c)
            for t in np.linspace(0, T, params["frames"]):
                pose = hr.pose_at(sk, c, float(t))
                Vp = hr.skin(sk, IBM, jidx, mb["V"], mb["J"], mb["W"], pose)
                Nv = vertex_normals(Vp, mb["F"])
                Sp = (Vp[Fs] * bary[..., None]).sum(1)
                Np = (Nv[Fs] * bary[..., None]).sum(1)
                ratio = (np.linalg.norm(Vp[Eb[:, 0]] - Vp[Eb[:, 1]], axis=1)
                         / np.maximum(np.linalg.norm(mb["V"][Eb[:, 0]] - mb["V"][Eb[:, 1]], axis=1), 1e-9))
                scale = float(np.median(ratio))  # the rig's world carries a global scale
                body_strain = max(body_strain, float(np.percentile(np.abs(ratio / scale - 1), 99)))
                tree = cKDTree(Sp)
                for it in items:
                    P, I = d[f"{it}_P"], d[f"{it}_I"]
                    Pp = hr.skin(sk, IBM, jidx, P, d[f"{it}_J"], d[f"{it}_W"], pose)
                    dist, i = tree.query(Pp)
                    sd = dist * np.sign(np.sum((Pp - Sp[i]) * Np[i], 1)) / scale - layer[i]
                    on_arm = arm[i]  # the resting arm against the side: contact, reported apart
                    r = res[it]
                    body_sd = sd[~on_arm]
                    r["min_clearance_m"] = min(r["min_clearance_m"], float(np.percentile(body_sd, 0.5)))
                    r["inside_fraction_max"] = max(r["inside_fraction_max"], float((body_sd < -0.002).sum() / len(sd)))
                    r["arm_contact_fraction_max"] = max(r["arm_contact_fraction_max"], float((on_arm & (sd < 0.004)).mean()))
                    E = np.unique(np.sort(np.r_[I[:, [0, 1]], I[:, [1, 2]], I[:, [2, 0]]], 1), axis=0)
                    L0 = np.linalg.norm(P[E[:, 0]] - P[E[:, 1]], axis=1)
                    L1 = np.linalg.norm(Pp[E[:, 0]] - Pp[E[:, 1]], axis=1)
                    strain = np.abs(L1 / np.maximum(L0 * scale, 1e-9) - 1)
                    r["max_edge_strain"] = max(r["max_edge_strain"], float(np.percentile(strain, 99)))

        limit = max(params["max_edge_strain_p99"], body_strain * params["strain_vs_body"])
        for it, r in res.items():
            r["pass"] = bool(r["inside_fraction_max"] <= params["max_inside_fraction"] and r["max_edge_strain"] <= limit)
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
    _node([PIPELINE_DIR / "js" / "decompress.mjs", asset.path("export", f"armour_chest_{key}.glb"), dec])
    return dec


def stage_icons(asset, params):
    import cv2

    dec = _decoded(asset, params["body"])
    out = asset.dir("icons")
    res = run_blender("asset_pipeline.blender.armour_render", {"op": "icons", "work": str(asset.work), "glb": str(dec), "out": str(out),
                                                              "items": asset.config["armour"]["design"]["items"], **params}, timeout=7200)
    files = []
    sizes = {}
    for item, png in res["icons"].items():
        im = cv2.imread(png, cv2.IMREAD_UNCHANGED)
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
        shutil.copyfile(asset.path("export", f"armour_chest_{key}.glb"), dst)
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
    ("design", stage_design, lambda a: [a.path("inspect"), HERE / "armour_design.py", HERE / "humanoid_wardrobe.py"], lambda a: _cfg(a, "design")),
    ("build", stage_build, lambda a: [a.path("design"), HERE / "blender" / "humanoid_build.py"],
     lambda a: {**_cfg(a, "build"), "materials": a.config["armour"]["materials"]}),
    ("rig", stage_rig, lambda a: [a.path("build"), a.path("inspect"), HERE / "armour.py", HERE / "gltf_io.py", HERE / "humanoid_rig.py"], lambda a: _cfg(a, "rig")),
    ("export", stage_export, lambda a: [a.path("rig"), PIPELINE_DIR / "js" / "optimize.mjs"], lambda a: _cfg(a, "export")),
    ("validate", stage_validate, lambda a: [a.path("rig"), a.path("inspect"), HERE / "armour.py"], lambda a: _cfg(a, "validate")),
    ("icons", stage_icons, lambda a: [a.path("export"), HERE / "blender" / "armour_render.py"], lambda a: _cfg(a, "icons")),
    ("evidence", stage_evidence, lambda a: [a.path("export"), HERE / "blender" / "armour_render.py"], lambda a: _cfg(a, "evidence")),
    ("publish", stage_publish, lambda a: [a.path("export"), a.path("icons"), a.path("evidence"), a.path("validate")], lambda a: _cfg(a, "publish")),
]
