"""Geometry and image metrics, and the Experiment A evaluation.

Evaluation is the only code that reads ground truth. For A2 (estimated
cameras), the reconstruction lives in the SfM's arbitrary similarity frame.
It is aligned to the ground-truth frame with a similarity (Umeyama) fitted
between estimated and true camera centres, the standard benchmark
convention. That alignment is used only for measurement.
"""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from .cameras import Camera, load_cameras, rotation_angle_deg, umeyama
from .workspace import read_json, run_blender, write_json


def sample_surface(mesh, n, seed=0):
    import trimesh

    pts, _ = trimesh.sample.sample_surface(mesh, n, seed=seed)
    return np.asarray(pts)


def surface_distances(recon, gt, n=200000):
    from scipy.spatial import cKDTree

    pr = sample_surface(recon, n, 1)
    pg = sample_surface(gt, n, 2)
    acc = cKDTree(pg).query(pr, workers=-1)[0]  # recon -> gt (accuracy)
    comp = cKDTree(pr).query(pg, workers=-1)[0]  # gt -> recon (completeness)
    return acc, comp, pg


def distance_report(acc, comp, diag):
    def st(d):
        return {"mean": float(d.mean()), "median": float(np.median(d)), "p90": float(np.percentile(d, 90)), "max": float(d.max())}

    r = {"accuracy_recon_to_gt": st(acc), "completeness_gt_to_recon": st(comp), "chamfer_mean": float((acc.mean() + comp.mean()) / 2),
         "chamfer_mean_pct_of_diagonal": float(100 * (acc.mean() + comp.mean()) / 2 / diag), "fscore": {}}
    for pct in (0.5, 1.0, 2.0):
        tau = diag * pct / 100
        p = float((acc < tau).mean())
        rc = float((comp < tau).mean())
        r["fscore"][f"{pct}%"] = {"tau": tau, "precision": p, "recall": rc, "f": 2 * p * rc / (p + rc) if p + rc else 0.0}
    return r


def silhouette(V, F, cam: Camera):
    """Binary silhouette of a mesh seen by a camera (union of projected triangles)."""
    uv, z = cam.project(V)
    m = np.zeros((cam.height, cam.width), np.uint8)
    good = (z[F] > 1e-6).all(1)
    tris = np.round(uv[F[good]] * 8).astype(np.int32)
    # one call per triangle: fillPoly over many polygons uses an even-odd rule
    # and would cancel overlapping triangles
    for tri in tris:
        cv2.fillConvexPoly(m, tri, 255, lineType=cv2.LINE_8, shift=3)
    return m


def iou(a, b):
    a, b = a > 0, b > 0
    u = (a | b).sum()
    return float((a & b).sum() / u) if u else 1.0


def psnr(a, b, mask):
    d = (a.astype(np.float64) - b.astype(np.float64))[mask > 0]
    mse = (d ** 2).mean()
    return float(10 * np.log10(255 ** 2 / mse)) if mse > 0 else 99.0, float(np.abs(d).mean())


def genus(mesh):
    try:
        return int(round((2 * mesh.body_count - mesh.euler_number) / 2)) if mesh.is_watertight else None
    except Exception:
        return None


def evaluate_benchmark(asset, out: Path, params) -> dict:
    import trimesh

    from .benchmark import capture_dir, gt_dir, holdout_names

    gt = trimesh.load(gt_dir(asset) / "ground_truth.ply", process=False)
    lo, hi = gt.bounds
    diag = float(np.linalg.norm(hi - lo))
    parts_dir = asset.path("evaluation", "gt_parts")
    if not parts_dir.exists():
        run_blender("asset_pipeline.blender.mesh_jobs", {"work": str(asset.work), "op": "export_parts", "blend": str(gt_dir(asset) / "ground_truth.blend"), "out": str(parts_dir)})
    parts = {p.stem: trimesh.load(p, process=False) for p in sorted(parts_dir.glob("*.ply"))}
    cams_gt = load_cameras(capture_dir(asset) / "cameras_known.json")
    by_name = {c.name: c for c in cams_gt}
    hold = holdout_names(asset)
    non_hold = [c for c in cams_gt if c.name not in set(hold)]
    report = {"ground_truth": {"triangles": int(len(gt.faces)), "bbox_diagonal": diag, "extent": (hi - lo).tolist()}, "holdout_views": hold, "experiments": {}}
    comparisons = {h: [cv2.imread(str(capture_dir(asset) / "images" / f"{h}.png"))] for h in hold}

    for exp in ("A1_known_cameras", "A2_estimated_cameras"):
        d = asset.path(exp)
        if not (d / "mesh.ply").exists():
            report["experiments"][exp] = {"status": "not run"}
            continue
        rec = trimesh.load(d / "mesh.ply", process=False)
        r = {"status": "ok", "reconstruction": read_json(asset.work / "state.json")["stages"].get("recon_known" if exp.startswith("A1") else "recon_sfm", {}).get("summary", {})}
        r["reconstruction"].pop("views", None)
        sim = (1.0, np.eye(3), np.zeros(3))
        if exp.startswith("A2"):
            est = load_cameras(asset.path("A2_sfm", "cameras_sfm.json"))
            # frame_%04d k  <->  k-th non-holdout capture view (video stage construction)
            pairs = [(e, non_hold[int(e.name.split("_")[1])]) for e in est]
            src = np.array([e.center for e, _ in pairs])
            dst = np.array([g.center for _, g in pairs])
            s, Rs, ts = umeyama(src, dst)
            sim = (s, Rs, ts)
            pos_err = np.linalg.norm((s * src @ Rs.T + ts) - dst, axis=1)
            rot_err = [rotation_angle_deg(e.R @ Rs.T, g.R) for e, g in pairs]
            f_true = non_hold[0].K[0, 0]
            r["camera_estimation"] = {
                "registered": len(est), "offered": read_json(asset.work / "state.json")["stages"]["sfm"]["summary"]["input_images"],
                "position_error_m": {"mean": float(pos_err.mean()), "max": float(pos_err.max())},
                "position_error_pct_of_camera_distance": float(100 * pos_err.mean() / np.mean([np.linalg.norm(g.center - np.array([0, 0, 0.45])) for _, g in pairs])),
                "rotation_error_deg": {"mean": float(np.mean(rot_err)), "max": float(np.max(rot_err))},
                "focal_px": {"estimated": float(est[0].K[0, 0]), "true": float(f_true), "error_pct": float(100 * abs(est[0].K[0, 0] - f_true) / f_true)},
                "similarity_scale": float(s),
            }
            rec = rec.copy()
            rec.vertices = s * np.asarray(rec.vertices) @ Rs.T + ts
            rec.export(d / "mesh_aligned_to_gt_for_evaluation.ply")
        acc, comp, pg = surface_distances(rec, gt)
        r["surface"] = distance_report(acc, comp, diag)
        rlo, rhi = rec.bounds
        r["relative_extent_error_pct"] = (100 * ((rhi - rlo) - (hi - lo)) / (hi - lo)).tolist()
        r["genus"] = genus(rec)
        # per-part completeness: fraction of each GT part's surface within 1% of the diagonal
        from scipy.spatial import cKDTree

        tree = cKDTree(sample_surface(rec, 200000, 3))
        # Only each part's exterior surface counts: faces buried inside another
        # part (where parts interpenetrate) cannot be observed by any camera.
        r["part_completeness_1pct"] = {}
        r["part_exterior_fraction"] = {}
        for name, pm in parts.items():
            pp = sample_surface(pm, 20000, 4)
            buried = np.zeros(len(pp), bool)
            for other, om in parts.items():
                if other != name and om.is_watertight:
                    buried |= om.contains(pp)
            ext_pts = pp[~buried]
            dd = tree.query(ext_pts, workers=-1)[0]
            r["part_completeness_1pct"][name] = float((dd < 0.01 * diag).mean())
            r["part_exterior_fraction"][name] = float((~buried).mean())
        # hold-out silhouettes (GT cameras; A2 mesh already aligned)
        V, F = np.asarray(rec.vertices), np.asarray(rec.faces)
        ious = []
        for h in hold:
            c = by_name[h]
            sg = silhouette(np.asarray(gt.vertices), np.asarray(gt.faces), c)
            sr = silhouette(V, F, c)
            ious.append(iou(sg, sr))
        r["holdout_silhouette_iou"] = {"mean": float(np.mean(ious)), "min": float(np.min(ious)), "per_view": dict(zip(hold, ious))}
        # hold-out photometric check: unlit render of the reprojected texture vs the held-out photo
        tdir = d / "textured"
        if (tdir / "basecolor_reprojected.png").exists():
            s_, Rs_, ts_ = sim
            rcams = []
            for h in hold:
                c = by_name[h]
                R2 = c.R @ Rs_
                t2 = (c.R @ ts_ + c.t) / s_
                rcams.append(Camera(h, c.width, c.height, c.K, R2, t2).to_json())
            run_blender("asset_pipeline.blender.mesh_jobs", {"work": str(asset.work), "op": "assemble", "blend": str(tdir / "unwrapped.blend"),
                                                             "texture": str(tdir / "basecolor_reprojected.png"), "out_blend": str(tdir / f"{exp}_textured.blend"),
                                                             "out_glb": str(tdir / f"{exp}_textured.glb"), "render_cameras": rcams, "render_out": str(tdir / "holdout_renders")})
            ps, maes = [], []
            for h in hold:
                photo = cv2.imread(str(capture_dir(asset) / "images" / f"{h}.png"))
                rend = cv2.imread(str(tdir / "holdout_renders" / f"{h}.png"), cv2.IMREAD_UNCHANGED)
                alpha = rend[..., 3]
                sg = silhouette(np.asarray(gt.vertices), np.asarray(gt.faces), by_name[h])
                m = ((alpha > 127) & (sg > 0)).astype(np.uint8)
                p_, mae = psnr(rend[..., :3], photo, m)
                ps.append(p_)
                maes.append(mae)
                comp_img = photo.copy()
                comp_img[alpha > 127] = rend[..., :3][alpha > 127]
                comparisons[h].append(comp_img)
            r["holdout_photometric"] = {"psnr_db_mean": float(np.mean(ps)), "mean_abs_error_8bit": float(np.mean(maes)), "per_view_psnr": dict(zip(hold, ps))}
            r["texture"] = read_json(asset.work / "state.json")["stages"].get("texture", {}).get("summary", {}).get(exp)
        report["experiments"][exp] = r
    write_json(out / "report.json", report)
    # evidence: held-out photo | A1 render | A2 render
    rows = []
    for h in hold:
        ims = comparisons[h]
        ims = [cv2.putText(im.copy(), lab, (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA)
               for im, lab in zip(ims, ["held-out photo (not used)", "A1 known cams: unlit reprojection", "A2 SfM cams: unlit reprojection"])]
        rows.append(np.hstack([cv2.resize(i, (400, 300)) for i in ims]))
    if rows:
        cv2.imwrite(str(asset.dir("evidence", "evaluation") / "holdout_comparison.jpg"), np.vstack(rows))
    return {k: {kk: vv for kk, vv in v.items() if kk in ("surface", "holdout_silhouette_iou", "camera_estimation", "holdout_photometric", "genus")}
            for k, v in report["experiments"].items()}
