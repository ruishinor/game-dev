"""Structure-from-Motion with pycolmap (CPU SIFT, exhaustive matching, incremental mapping).

Only images (and their foreground masks, so that background features cannot
drive the solution) go in. Outputs, in the reconstruction's own arbitrary
similarity frame:

  cameras_sfm.json   registered cameras, OpenCV convention, undistorted pinhole
  undistorted/       images and masks with COLMAP's radial distortion removed
  sparse_points.ply  triangulated sparse points
  sparse/            the COLMAP model (binary)
"""
from __future__ import annotations

import shutil
from pathlib import Path

import cv2
import numpy as np

from .blender_io import write_ply_points
from .cameras import Camera, save_cameras


def _pose(im):
    cfw = im.cam_from_world() if callable(getattr(im, "cam_from_world", None)) else im.cam_from_world
    return np.array(cfw.rotation.matrix()), np.array(cfw.translation)


def run_sfm(images: Path, masks: Path, out: Path, params: dict, evidence: Path | None = None):
    import pycolmap

    if out.exists():
        for p in out.iterdir():
            shutil.rmtree(p) if p.is_dir() else p.unlink()
    out.mkdir(parents=True, exist_ok=True)
    # COLMAP looks for <mask_path>/<image name>.png
    cmask = out / "colmap_masks"
    cmask.mkdir()
    names = sorted(p.name for p in Path(images).glob("*.png"))
    for n in names:
        shutil.copy(Path(masks) / n, cmask / f"{n}.png")
    db = out / "database.db"
    reader = pycolmap.ImageReaderOptions()
    reader.camera_model = "SIMPLE_RADIAL"
    reader.mask_path = str(cmask)
    ext = pycolmap.FeatureExtractionOptions()
    ext.max_image_size = params["max_image_size"]
    ext.use_gpu = False
    pycolmap.extract_features(db, images, camera_mode=pycolmap.CameraMode.SINGLE, reader_options=reader, extraction_options=ext, device=pycolmap.Device.cpu)
    pycolmap.match_exhaustive(db, device=pycolmap.Device.cpu)
    recs = pycolmap.incremental_mapping(db, images, out / "sparse")
    if not recs:
        raise RuntimeError("Structure-from-Motion registered no model")
    best = max(recs.values(), key=lambda r: r.num_reg_images())
    best.write(out / "sparse")
    cam_ids = {im.camera_id for im in best.images.values()}
    if len(cam_ids) != 1:
        raise RuntimeError("expected a single shared camera")
    cam = best.cameras[next(iter(cam_ids))]
    f, cx, cy, k = cam.params
    K = np.array([[f, 0, cx], [0, f, cy], [0, 0, 1]])
    dist = np.array([k, 0, 0, 0], float)
    (out / "undistorted" / "images").mkdir(parents=True)
    (out / "undistorted" / "masks").mkdir()
    cams = []
    for iid in sorted(best.reg_image_ids()):
        im = best.images[iid]
        R, t = _pose(im)
        stem = Path(im.name).stem
        img = cv2.imread(str(Path(images) / im.name))
        msk = cv2.imread(str(Path(masks) / im.name), cv2.IMREAD_GRAYSCALE)
        cv2.imwrite(str(out / "undistorted" / "images" / f"{stem}.png"), cv2.undistort(img, K, dist))
        um = cv2.undistort(msk, K, dist)
        cv2.imwrite(str(out / "undistorted" / "masks" / f"{stem}.png"), np.where(um > 127, 255, 0).astype(np.uint8))
        cams.append(Camera(stem, cam.width, cam.height, K.copy(), R, t))
    save_cameras(out / "cameras_sfm.json", cams, {"frame": "pycolmap reconstruction (arbitrary similarity)", "distortion_removed": {"model": "SIMPLE_RADIAL", "k": float(k)}})
    P = np.array([p.xyz for p in best.points3D.values()])
    C = np.array([p.color for p in best.points3D.values()], np.uint8)
    write_ply_points(out / "sparse_points.ply", P, C)
    summary = {
        "input_images": len(names),
        "registered_images": int(best.num_reg_images()),
        "models": len(recs),
        "sparse_points": int(best.num_points3D()),
        "mean_reprojection_error_px": float(best.compute_mean_reprojection_error()),
        "mean_track_length": float(best.compute_mean_track_length()),
        "mean_observations_per_image": float(best.compute_mean_observations_per_reg_image()),
        "estimated_focal_px": float(f),
        "estimated_principal_point": [float(cx), float(cy)],
        "estimated_radial_k": float(k),
        "unregistered": sorted(set(Path(n).stem for n in names) - {c.name for c in cams}),
    }
    if evidence is not None:
        plot_cameras(cams, P, C, evidence / "sfm_cameras_points.png", "SfM: estimated cameras + sparse points")
    return summary


def plot_cameras(cams, P, C, path, title, extra=None):
    """Two orthographic projections (top, side) of camera centres/axes and points."""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    centres = np.array([c.center for c in cams])
    axes = np.array([c.R[2] for c in cams])
    # principal frame of the camera rig for a readable top view
    mu = centres.mean(0)
    U, S, Vt = np.linalg.svd(centres - mu)
    B = Vt  # rows: two in-plane axes, normal
    fig, ax = plt.subplots(1, 2, figsize=(12, 6))
    for k, (a, b, lab) in enumerate([(0, 1, "rig plane"), (0, 2, "side")]):
        q = (P - mu) @ B.T if len(P) else np.zeros((0, 3))
        cc = (centres - mu) @ B.T
        dd = axes @ B.T
        if len(q):
            ax[k].scatter(q[:, a], q[:, b], s=0.3, c=(C / 255.0) if C is not None and len(C) == len(q) else "k")
        ax[k].scatter(cc[:, a], cc[:, b], c="r", s=12)
        scale = np.ptp(cc[:, a]) * 0.06 + 1e-6
        for c0, d0 in zip(cc, dd):
            ax[k].plot([c0[a], c0[a] + d0[a] * scale], [c0[b], c0[b] + d0[b] * scale], "r-", lw=0.8)
        if extra is not None:
            e = (extra - mu) @ B.T
            ax[k].scatter(e[:, a], e[:, b], c="b", s=12, marker="x")
        ax[k].set_aspect("equal")
        ax[k].set_title(f"{title} — {lab}")
    fig.tight_layout()
    fig.savefig(path, dpi=110)
    plt.close(fig)
