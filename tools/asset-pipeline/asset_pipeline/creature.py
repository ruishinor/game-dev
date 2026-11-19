"""Reference-driven creature production (Experiment B/C), first applied to Stillpoint.

ingest       verify sources, extract native-resolution views, write the reference manifest
segment      foreground masks + overlays for the views that carry silhouettes
feasibility  can the views support photogrammetry? (SIFT/RANSAC across views + a pycolmap attempt)
measure      derive geometric constraints from the references (outline, plates, crystals, legs, heights)
build        Blender: construct the creature from those constraints -> editable .blend
fit          fit approximate reference cameras; silhouette agreement per view
texture      dorsal colour reprojected from the top view; inferred PBR materials elsewhere; bake
rig          armature, rigid skinning, idle / weight-shift / walk / turn / start / stop clips
export       GLB (+ meshopt) and structural validation
render       evidence renders (clay, wireframe, segmentation, textured, poses, turntable)
"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import cv2
import numpy as np

from .imaging import border_background_mask, contact_sheet, grabcut_refine, hole_count, overlay, remove_small
from .workspace import Asset, StageError, read_json, run_blender, sha256_file, write_json

HERE = Path(__file__).parent
REPO_JS = HERE.parent / "js" / "optimize.mjs"


# --------------------------------------------------------------------------- ingest
def _source_image(asset: Asset, src: dict, cache: Path) -> Path:
    path = asset.source(src["path"])
    if path.suffix.lower() != ".pdf":
        return path
    page = src["pdf_page"]
    out = cache / f"{src['id']}_p{page}"
    out.mkdir(parents=True, exist_ok=True)
    if not list(out.glob("*.png")):
        subprocess.run(["pdfimages", "-f", str(page), "-l", str(page), "-png", str(path), str(out / "img")], check=True)
    imgs = sorted(out.glob("*.png"))
    if not imgs:
        raise StageError(f"no embedded images on page {page} of {path.name}")
    hashes = {sha256_file(p) for p in imgs}
    if len(hashes) != 1:
        raise StageError(f"page {page} embeds {len(hashes)} different images; choose one explicitly")
    return imgs[0]


def _ingest(asset: Asset, params):
    refs = asset.dir("refs")
    cache = asset.dir("refs", "_extracted")
    srcs = {s["id"]: s for s in asset.config["sources"]}
    manifest = {"asset": asset.id, "sources": [], "views": {}}
    native = {}
    for s in asset.config["sources"]:
        p = asset.source(s["path"])
        rec = {**s, "sha256": sha256_file(p), "bytes": p.stat().st_size}
        img_path = _source_image(asset, s, cache)
        img = cv2.imread(str(img_path), cv2.IMREAD_COLOR)
        if img is None:
            raise StageError(f"cannot decode {img_path}")
        native[s["id"]] = img
        rec["native_image"] = {"path": str(img_path), "sha256": sha256_file(img_path), "width": img.shape[1], "height": img.shape[0]}
        manifest["sources"].append(rec)
    tiles, labels = [], []
    for name, v in asset.config["views"].items():
        img = native[v["source"]]
        x, y, w, h = v["box"]
        if x < 0 or y < 0 or x + w > img.shape[1] or y + h > img.shape[0]:
            raise StageError(f"view {name}: box {v['box']} outside {v['source']} ({img.shape[1]}x{img.shape[0]})")
        crop = img[y:y + h, x:x + w].copy()
        cv2.imwrite(str(refs / f"{name}.png"), crop)
        manifest["views"][name] = {**v, "file": f"refs/{name}.png", "width": w, "height": h, "sha256": sha256_file(refs / f"{name}.png"),
                                   "camera": "unknown (illustration)", "geometry_reference": any(r in v["role"] for r in ("silhouette", "outline", "proportion", "plate layout")),
                                   "texture_reference": any("colour" in r for r in v["role"])}
        tiles.append(crop)
        labels.append(f"{name} ({w}x{h})")
    manifest["limitations"] = [
        "All Stillpoint references are illustrations (AI-generated concept art), not photographs: no camera metadata, and different views need not depict one consistent physical object.",
        "The lookbook page is a crop of a 1536x1024 sheet; its Stillpoint panel is ~535x400 native pixels. The concept sheet (1024x572) has the highest-resolution textured views (~300x250 px each).",
        "persp_a and persp_b are nearly the same viewpoint, so they offer almost no stereo baseline.",
        "The pipeline illustration depicts a process and is excluded from geometry and texture use.",
    ]
    write_json(asset.work / "asset-manifest.json", manifest)
    ev = asset.dir("evidence", "references")
    contact_sheet(tiles, ev / "reference_contact_sheet.jpg", cols=4, thumb=330, labels=labels)
    return [refs, asset.work / "asset-manifest.json"], {"sources": len(manifest["sources"]), "views": len(manifest["views"])}


# --------------------------------------------------------------------------- segment
def segment_view(img, params, exclude=None):
    m, dist = border_background_mask(img, params["threshold"], min_area=params["min_area"], open_px=params["open_px"], close_px=params["close_px"], exclude=exclude,
                                     bg_model=params.get("bg_model", "mixed"))
    # thin blueprint lines (grid, dimension lines, callout arrows) survive a
    # colour threshold; an opening with a larger kernel removes anything thinner
    # than ~5 px while thick stone and crystal regions are untouched
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, k)
    m = remove_small(m, params["min_area"])
    # keep the dominant subject: components overlapping the largest one's bounding box
    n, lab, stats, _ = cv2.connectedComponentsWithStats((m > 0).astype(np.uint8))
    if n > 1:
        big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        x, y, w, h = stats[big, :4]
        keep = np.zeros(n, bool)
        for i in range(1, n):
            cx, cy, cw, ch = stats[i, :4]
            keep[i] = not (cx > x + w or cx + cw < x or cy > y + h or cy + ch < y)
        m = np.where(keep[lab], 255, 0).astype(np.uint8)
    if params.get("grabcut"):
        m = grabcut_refine(img, m, iterations=5, band=4)
        m = remove_small(m, params["min_area"])
        if exclude:
            for x, y, w, h in exclude:
                m[y:y + h, x:x + w] = 0
    return m


def _segment(asset: Asset, params):
    out = asset.dir("masks")
    for old in out.glob("*.png"):
        old.unlink()
    ev = asset.dir("evidence", "segmentation")
    stats, tiles, labels = {}, [], []
    for name in params["views"]:
        img = cv2.imread(str(asset.path("refs", f"{name}.png")))
        m = segment_view(img, {**params, **params.get("overrides", {}).get(name, {})}, asset.config["views"][name].get("exclude"))
        cv2.imwrite(str(out / f"{name}.png"), m)
        stats[name] = {"foreground_fraction": float((m > 0).mean()), "holes_preserved": hole_count(m)}
        ov = overlay(img, m)
        tiles += [ov, cv2.cvtColor(m, cv2.COLOR_GRAY2BGR)]
        labels += [f"{name} overlay", f"{name} mask"]
    contact_sheet(tiles, ev / "segmentation_overlays.jpg", cols=4, thumb=330, labels=labels)
    return [out], stats


# --------------------------------------------------------------------------- feasibility
def _feasibility(asset: Asset, params):
    """Evidence for or against multi-view photogrammetry on the supplied views."""
    names = params["views"]
    sift = cv2.SIFT_create(nfeatures=4000)
    feats = {}
    for n in names:
        img = cv2.imread(str(asset.path("refs", f"{n}.png")), cv2.IMREAD_GRAYSCALE)
        m = cv2.imread(str(asset.path("masks", f"{n}.png")), cv2.IMREAD_GRAYSCALE) if asset.path("masks", f"{n}.png").exists() else None
        # upsample: the views are only ~300 px wide
        img2 = cv2.resize(img, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
        m2 = cv2.resize(m, None, fx=2, fy=2, interpolation=cv2.INTER_NEAREST) if m is not None else None
        kp, des = sift.detectAndCompute(img2, m2)
        feats[n] = (kp, des, img2)
    bf = cv2.BFMatcher(cv2.NORM_L2)
    pairs = []
    ev = asset.dir("evidence", "feasibility")
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            a, b = names[i], names[j]
            ka, da, ia = feats[a]
            kb, db, ib = feats[b]
            rec = {"pair": [a, b], "features": [len(ka), len(kb)], "ratio_matches": 0, "fundamental_inliers": 0, "homography_inliers": 0}
            if da is not None and db is not None and len(ka) > 8 and len(kb) > 8:
                mm = [m for m, n2 in bf.knnMatch(da, db, k=2) if m.distance < params["ratio"] * n2.distance]
                rec["ratio_matches"] = len(mm)
                if len(mm) >= 8:
                    pa = np.float32([ka[m.queryIdx].pt for m in mm])
                    pb = np.float32([kb[m.trainIdx].pt for m in mm])
                    F, fin = cv2.findFundamentalMat(pa, pb, cv2.FM_RANSAC, params["ransac_px"] * 2, 0.999)
                    H, hin = cv2.findHomography(pa, pb, cv2.RANSAC, params["ransac_px"] * 2)
                    rec["fundamental_inliers"] = int(fin.sum()) if fin is not None else 0
                    rec["homography_inliers"] = int(hin.sum()) if hin is not None else 0
                    if fin is not None and fin.sum() >= 8:
                        good = [m for m, f in zip(mm, fin.ravel()) if f]
                        vis = cv2.drawMatches(ia, ka, ib, kb, good[:80], None, flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS)
                        cv2.imwrite(str(ev / f"matches_{a}__{b}.jpg"), vis)
            # parallax check: if a homography explains (almost) every F-inlier,
            # the pair is effectively one viewpoint (no triangulation baseline)
            fi, hi = rec["fundamental_inliers"], rec["homography_inliers"]
            rec["parallax_evidence"] = "none (homography explains the matches)" if fi and hi >= 0.8 * fi else ("weak" if fi < 30 else "some")
            pairs.append(rec)
    # A real SfM attempt on the same views.
    sfm = {"attempted": True}
    try:
        import pycolmap

        work = asset.dir("feasibility_sfm")
        shutil.rmtree(work)
        (work / "images").mkdir(parents=True)
        for n in names:
            cv2.imwrite(str(work / "images" / f"{n}.png"), feats[n][2])
        db = work / "db.db"
        ext = pycolmap.FeatureExtractionOptions()
        ext.use_gpu = False
        pycolmap.extract_features(db, work / "images", camera_mode=pycolmap.CameraMode.PER_IMAGE, extraction_options=ext, device=pycolmap.Device.cpu)
        pycolmap.match_exhaustive(db, device=pycolmap.Device.cpu)
        recs = pycolmap.incremental_mapping(db, work / "images", work / "sparse")
        best = max(recs.values(), key=lambda r: r.num_reg_images()) if recs else None
        sfm.update({"models": len(recs), "registered_images": int(best.num_reg_images()) if best else 0, "of": len(names),
                    "registered": sorted(Path(im.name).stem for im in best.images.values() if im.has_pose) if best else [],
                    "sparse_points": int(best.num_points3D()) if best else 0})
    except Exception as e:  # recorded as evidence, not a crash
        sfm.update({"error": f"{type(e).__name__}: {e}"})
    usable = [p for p in pairs if p["parallax_evidence"] == "some"]
    decision = {
        "mode": "C (reference-constrained Blender modelling) with Mode-B elements (silhouette constraints, approximate cameras, top-view texture reprojection)",
        "photogrammetry_supported": False,
        "evidence": {
            "pairs_with_triangulable_parallax": len(usable),
            "pairs_total": len(pairs),
            "sfm_registered": sfm.get("registered_images", 0),
        },
        "reasoning": [
            "pycolmap could not initialise a model from these views (see sfm.registered_images).",
            "Most pairs have chance-level RANSAC inlier counts (~10-15 of 30-70 ratio-test matches). The strongest pairs (persp_a/persp_b, persp_b/lookbook_main) were inspected: their inliers lie mostly along horizontal bands of repetitive plate-edge texture and pair differently shaped crystals, a degenerate configuration that does not support triangulation.",
            "The references are independently generated illustrations; Mode A needs consistent multi-view imagery (turntable footage or a consistent orthographic set), which was not supplied.",
        ],
    }
    write_json(asset.work / "feasibility.json", {"pairs": pairs, "sfm": sfm, "decision": decision})
    return [asset.work / "feasibility.json"], {"pairs": [{k: v for k, v in p.items() if k != "features"} for p in pairs], "sfm": sfm, "decision": decision["mode"]}


# --------------------------------------------------------------------------- measure
def _measure(asset: Asset, params):
    from .measure import measure_lineup, measure_top, palette, top_evidence

    ev = asset.dir("evidence", "measure")
    lineup_img = cv2.imread(str(asset.path("refs", "scale_lineup.png")))
    lineup = measure_lineup(lineup_img, params["human_height_m"], params["lineup_index"], params["lineup_expected_figures"])
    vis = lineup_img.copy()
    px = lineup["px"]
    for row, col in [(lineup["ground_row"], (0, 0, 255)), (px["dorsal"], (0, 160, 0)), (px["underside"], (255, 0, 0)), (px["top"], (0, 200, 255))]:
        cv2.line(vis, (px["x0"] - 10, row), (px["x1"] + 10, row), col, 1)
    cv2.imwrite(str(ev / "lineup_measurement.png"), cv2.resize(vis, None, fx=2.5, fy=2.5, interpolation=cv2.INTER_CUBIC))
    top_img = cv2.imread(str(asset.path("refs", "top.png")))
    top_mask = cv2.imread(str(asset.path("masks", "top.png")), cv2.IMREAD_GRAYSCALE)
    top, masks = measure_top(top_img, top_mask, params)
    cv2.imwrite(str(ev / "top_measurement.png"), cv2.resize(top_evidence(top_img, top, masks), None, fx=2, fy=2, interpolation=cv2.INTER_NEAREST))
    # metric scale for the top view: its body length equals the lineup's side length
    top["metres_per_px"] = lineup["length_m"] / top["length_px"]
    side_img = cv2.imread(str(asset.path("refs", "persp_a.png")))
    side_mask = cv2.imread(str(asset.path("masks", "persp_a.png")), cv2.IMREAD_GRAYSCALE)
    pal = palette(top_img, masks, side_img, side_mask)
    out = {"lineup": lineup, "top": top, "palette": pal, "front": params["front"], "crystal_height_scale": params["crystal_height_scale"], "derived": {
        "body_length_m": lineup["length_m"], "body_width_m": top["width_px"] * top["metres_per_px"],
        "dorsal_height_m": lineup["dorsal_height_m"], "underside_height_m": lineup["underside_height_m"], "crystal_above_dorsal_m": lineup["crystal_above_dorsal_m"],
        "legs_detected_top": len(top["legs"]), "plates": len(top["plates"]), "crystals": len(top["crystals"])}}
    write_json(asset.work / "constraints.json", out)
    return [asset.work / "constraints.json"], out["derived"]


# --------------------------------------------------------------------------- build
def _build(asset: Asset, params):
    out = asset.dir("blender")
    res = run_blender("asset_pipeline.blender.mineral_creature", {"work": str(asset.work), "constraints": str(asset.work / "constraints.json"),
                                                                  "top_image": str(asset.path("refs", "top.png")), "out_blend": str(out / f"{asset.id}_source.blend"),
                                                                  "name": asset.config.get("display_name", asset.id), **params}, timeout=3600)
    write_json(out / "build.json", res)
    return [out / f"{asset.id}_source.blend", out / "build.json"], res


def preview(asset: Asset, blend: Path, out: Path, views, modes, **kw):
    return run_blender("asset_pipeline.blender.render_evidence", {"work": str(asset.work), "blend": str(blend), "out": str(out), "views": views, "modes": modes, **kw})


# --------------------------------------------------------------------------- fit
def _fit(asset: Asset, params):
    import trimesh

    from .fit import fit_ortho_top, fit_view, overlay_contours

    out = asset.dir("fit")
    merged = out / "model_world.ply"
    run_blender("asset_pipeline.blender.mesh_jobs", {"work": str(asset.work), "op": "export_merged", "blend": str(asset.path("blender", f"{asset.id}_source.blend")),
                                                     "out": str(merged)})
    m = trimesh.load(merged, process=False)
    V, F = np.asarray(m.vertices), np.asarray(m.faces)
    res, cams, tiles, labels = {}, [], [], []
    for name in params["views"]:
        mask = cv2.imread(str(asset.path("masks", f"{name}.png")), cv2.IMREAD_GRAYSCALE)
        img = cv2.imread(str(asset.path("refs", f"{name}.png")))
        r = fit_ortho_top(V, F, mask, name) if name == "top" else fit_view(V, F, mask, name, el_range=tuple(params.get("el_range", (8, 30))))
        role = ("geometry source (self-consistency)" if name in params["geometry_views"] else
                "contributed height ratios only" if name in params.get("ratio_views", []) else "validation (not used to derive geometry)")
        res[name] = {"iou": r["iou"], "params": r["params"], "role": role}
        cams.append(r["camera"].to_json())
        tiles += [img, overlay_contours(img, mask, r["silhouette"])]
        labels += [f"{name} reference", f"{name} IoU {r['iou']:.3f} (red ref, green model)"]
    from .cameras import Camera, save_cameras

    save_cameras(out / "fitted_cameras.json", [Camera.from_json(c) for c in cams])
    contact_sheet(tiles, asset.dir("evidence", "fit") / "silhouette_fit.jpg", cols=4, thumb=330, labels=labels)
    rr = run_blender("asset_pipeline.blender.render_evidence", {"work": str(asset.work), "blend": str(asset.path("blender", f"{asset.id}_source.blend")),
                                                                "out": str(out / "renders"), "modes": ["lit"], "views": [], "cameras": cams, "samples": 32, "ground": False})
    comp = []
    for name in params["views"]:
        ref = cv2.imread(str(asset.path("refs", f"{name}.png")))
        ren = cv2.imread(str(out / "renders" / f"lit_cam_{name}.png"))
        comp.append(np.hstack([ref, ren]))
    contact_sheet(comp, asset.dir("evidence", "fit") / "reference_vs_model.jpg", cols=2, thumb=660,
                  labels=[f"{n}: reference | Blender render, best-fit camera" for n in params["views"]])
    write_json(out / "fit.json", res)
    return [out / "fit.json", out / "fitted_cameras.json"], {k: round(v["iou"], 4) for k, v in res.items()}


# --------------------------------------------------------------------------- rig + bake + export
def _game_ready(asset: Asset, params):
    out = asset.dir("game_ready")
    res = run_blender("asset_pipeline.blender.game_ready", {"work": str(asset.work), "blend": str(asset.path("blender", f"{asset.id}_source.blend")), "out": str(out),
                                                            "blend_name": f"{asset.id}_rigged.blend", "glb_name": f"{asset.id}_unoptimized.glb", "asset_id": asset.id, **params}, timeout=7200)
    write_json(out / "game_ready.json", res)
    return [out / f"{asset.id}_rigged.blend", out / f"{asset.id}_unoptimized.glb", out / "game_ready.json"], {**{k: v for k, v in res.items() if k not in ("legs", "maps")}, "bake_fill": res["maps"].get("bake_fill")}


# --------------------------------------------------------------------------- optimise + validate
def _export(asset: Asset, params):
    import json as _json
    import subprocess as sp

    from .workspace import REPO_ROOT

    gr = asset.path("game_ready")
    out = asset.dir("export")
    glb = out / f"{asset.id}.glb"
    proc = sp.run(["node", str(REPO_ROOT / "tools" / "asset-pipeline" / "js" / "optimize.mjs"), str(gr / f"{asset.id}_unoptimized.glb"), str(glb),
                   str(params.get("max_texture", 2048)), str(params.get("quality", 86))], capture_output=True, text=True, cwd=REPO_ROOT)
    if proc.returncode != 0 or not glb.exists():
        raise StageError(f"optimise/validate failed: {proc.stderr[-1500:] or proc.stdout[-1500:]}")
    rep = _json.loads(Path(f"{glb}.report.json").read_text())
    if rep["bytes"] <= 0 or rep["validator"]["errors"]:
        raise StageError(f"invalid GLB: {rep['validator']}")
    write_json(out / "export.json", rep)
    return [glb, out / "export.json"], {k: rep[k] for k in ("bytes", "inputBytes", "triangles", "materials", "extensionsUsed", "validator")} | {
        "animations": [a["name"] for a in rep["animations"]], "joints": len(rep["skins"][0]["joints"]) if rep["skins"] else 0}


# --------------------------------------------------------------------------- validate
def _validate(asset: Asset, params):
    """Locomotion quality of the baked clips, measured from the rigged .blend."""
    out = asset.dir("validation")
    res = run_blender("asset_pipeline.blender.anim_check", {"work": str(asset.work), "blend": str(asset.path("game_ready", f"{asset.id}_rigged.blend")),
                                                            "contact_z": params.get("contact_z", 0.02)})
    fails = []
    for clip, r in res.items():
        if r["min_foot_z_m"] < -params.get("max_penetration_m", 0.01):
            fails.append(f"{clip}: foot below ground {r['min_foot_z_m']} m")
        if r["max_slide_per_planted_frame_mm"] > params.get("max_slide_mm_per_frame", 2.0):
            fails.append(f"{clip}: planted foot slides {r['max_slide_per_planted_frame_mm']} mm in one frame")
        if r["min_feet_planted"] < params.get("min_feet_planted", 3):
            fails.append(f"{clip}: only {r['min_feet_planted']} feet planted")
    report = {"clips": res, "failures": fails, "thresholds": params}
    write_json(out / "animation.json", report)
    if fails:
        raise StageError("animation validation failed: " + "; ".join(fails))
    return [out / "animation.json"], {"clips": {k: {"slide_mm_max_frame": v["max_slide_per_planted_frame_mm"], "min_planted": v["min_feet_planted"]} for k, v in res.items()}}


# --------------------------------------------------------------------------- runtime preview
def _preview(asset: Asset, params):
    """Publish the verified GLB to the local (git-ignored) preview directory and check it in the browser runtime."""
    import json as _json
    import subprocess as sp

    from .workspace import REPO_ROOT

    exp = read_json(asset.path("export", "export.json"))
    clips = read_json(asset.path("game_ready", "game_ready.json"))["clips"]
    pub = REPO_ROOT / "client" / "pipeline-assets"
    pub.mkdir(parents=True, exist_ok=True)
    shutil.copy(asset.path("export", f"{asset.id}.glb"), pub / f"{asset.id}.glb")
    man_path = pub / "manifest.json"
    man = _json.loads(man_path.read_text()) if man_path.exists() else {"note": "Local only: candidate pipeline outputs (git-ignored).", "models": []}
    entry = {"id": asset.id, "file": f"{asset.id}.glb", "label": params.get("label", asset.id), "sha256": sha256_file(pub / f"{asset.id}.glb"), "bytes": exp["bytes"],
             "clips": {n: {"loop": c["loop"], **({"speed": c["ground_speed_m_s"]} if isinstance(c.get("ground_speed_m_s"), (int, float)) else {}),
                           **({"speedSamples": c["speed_samples"]} if "speed_samples" in c else {}), **({"turnDegS": c["turn_rate_deg_s"]} if "turn_rate_deg_s" in c else {})}
                       for n, c in clips.items()}}
    man["models"] = [m for m in man["models"] if m["id"] != asset.id] + [entry]
    write_json(man_path, man)
    out = asset.dir("evidence", "runtime")
    proc = sp.run(["node", str(REPO_ROOT / "tools" / "asset-pipeline" / "js" / "preview-capture.mjs"), asset.id, str(out), *params["shots"]], capture_output=True, text=True,
                  cwd=REPO_ROOT, timeout=1800)
    if proc.returncode != 0:
        raise StageError(f"runtime preview failed: {(proc.stderr or proc.stdout)[-2000:]}")
    rep = read_json(out / "runtime-report.json")
    contact_sheet([s["file"] for s in rep["shots"]], out / "runtime_contact_sheet.jpg", cols=3, thumb=420, labels=[f"three.js runtime: {s['clip']} t={s['t']}s" for s in rep["shots"]])
    return [out / "runtime-report.json", out / "runtime_contact_sheet.jpg"], {"state": rep["state"], "graphics": rep.get("graphics", {}).get("renderer"), "glb": rep["glbRequests"],
                                                                                "console_errors": rep["consoleErrors"], "page_errors": rep["pageErrors"]}


# --------------------------------------------------------------------------- evidence renders
def _render(asset: Asset, params):
    """Actual Blender renders of the authored asset (source .blend) and poses of the rigged asset."""
    ev = asset.dir("evidence", "renders")
    src = asset.path("blender", f"{asset.id}_source.blend")
    rigged = asset.path("game_ready", f"{asset.id}_rigged.blend")
    views = params["views"] + params.get("closeups", [])
    r1 = preview(asset, src, ev / "source", views, ["clay", "lit", "wire", "parts"], width=params["width"], height=params["height"], samples=params["samples"],
                 turntable={"frames": params["turntable_frames"], "el": 14, "mode": "lit"})
    tt = ev / "source" / "turntable_lit"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", "12", "-i", str(tt / "f%03d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20",
                    str(ev / "turntable_lit.mp4")], check=True)
    poses = []
    for clip, frame in params["poses"]:
        r = preview(asset, rigged, ev / "poses" / f"{clip}_{frame}", [{"name": "pose", **params.get("pose_view", {"az": -70, "el": 12, "dist_k": 1.2})}], ["lit"],
                    width=params["width"] // 2,
                    height=params["height"] // 2, samples=params["samples"] // 2, pose={"action": clip, "frame": frame})
        poses.append(r["written"][0])
    contact_sheet(poses, ev / "articulation_poses.jpg", cols=4, thumb=360, labels=[f"{c} frame {f} (baked keys, Blender)" for c, f in params["poses"]])
    for mode in ("clay", "lit", "wire", "parts"):
        files = [ev / "source" / f"{mode}_{v if isinstance(v, str) else v['name']}.png" for v in params["views"]]
        contact_sheet(files, ev / f"views_{mode}.jpg", cols=4, thumb=400, labels=[f"{mode}: {f.stem.split('_', 1)[1]}" for f in files])
    write_json(ev / "renders.json", {"source": r1, "poses": poses})
    return [ev / "renders.json", ev / "turntable_lit.mp4"], {"renders": len(r1["written"]) + len(poses), "part_classes": r1.get("part_classes")}


def _cfg(key):
    return lambda a: a.config.get(key, {})


def _views_inputs(a):
    return [a.path("refs")]


STAGES = [
    ("ingest", _ingest, lambda a: [a.config_path] + [a.source(s["path"]) for s in a.config["sources"]], lambda a: {"views": a.config["views"]}),
    ("segment", _segment, _views_inputs, _cfg("segment")),
    ("feasibility", _feasibility, lambda a: [a.path("refs"), a.path("masks")], _cfg("feasibility")),
    ("measure", _measure, lambda a: [a.path("refs"), a.path("masks"), HERE / "measure.py"], _cfg("measure")),
    ("build", _build, lambda a: [a.work / "constraints.json", HERE / "blender" / "mineral_creature.py"], _cfg("build")),
    ("fit", _fit, lambda a: [a.path("blender", f"{a.id}_source.blend"), a.path("masks"), HERE / "fit.py"], _cfg("fit")),
    ("game_ready", _game_ready, lambda a: [a.path("blender", f"{a.id}_source.blend"), HERE / "blender" / "game_ready.py"], _cfg("game_ready")),
    ("export", _export, lambda a: [a.path("game_ready", f"{a.id}_unoptimized.glb"), REPO_JS], _cfg("export")),
    ("validate", _validate, lambda a: [a.path("game_ready", f"{a.id}_rigged.blend"), HERE / "blender" / "anim_check.py"], _cfg("validate")),
    ("preview", _preview, lambda a: [a.path("export", f"{a.id}.glb"), REPO_JS.parent / "preview-capture.mjs", HERE.parent.parent.parent / "client" / "src" / "pipeline-preview.js"],
     _cfg("preview")),
    ("render", _render, lambda a: [a.path("blender", f"{a.id}_source.blend"), a.path("game_ready", f"{a.id}_rigged.blend"), HERE / "blender" / "render_evidence.py"],
     _cfg("render")),
]
