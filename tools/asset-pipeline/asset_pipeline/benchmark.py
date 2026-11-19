"""Experiment A: controlled reconstruction benchmark stages.

capture        Blender renders the ground-truth object (capture/ + ground_truth/)
segment        foreground masks for the captured images
recon_known    A1: dense stereo + TSDF fusion with the known cameras
video          encode the non-holdout views as a turntable-style video
extract        extract and select frames from that video (no camera data)
sfm            A2: pycolmap Structure-from-Motion on the extracted frames
recon_sfm      A2: dense stereo + TSDF fusion with the estimated cameras
texture        reproject captured colour onto the A1 and A2 meshes
evaluate       compare against ground truth; hold-out view validation
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

from .cameras import load_cameras, save_cameras
from .workspace import Asset, StageError, read_json, run_blender, write_json


def _capture(asset: Asset, params):
    out = asset.dir("capture_root")
    res = run_blender(params["generator"], {"work": str(asset.work), "out": str(out), **{k: v for k, v in params.items() if k != "generator"}})
    write_json(out / "capture" / "capture.json", res)
    return [out / "capture", out / "ground_truth"], res


def holdout_names(asset: Asset):
    cams = load_cameras(capture_dir(asset) / "cameras_known.json")
    h = asset.config["holdout"]
    return [c.name for i, c in enumerate(cams) if i % h["every"] == h["offset"]]


def capture_dir(asset: Asset) -> Path:
    return asset.path("capture_root", "capture")


def gt_dir(asset: Asset) -> Path:
    return asset.path("capture_root", "ground_truth")


def _segment(asset: Asset, params):
    from .imaging import segment_folder

    out = asset.dir("masks")
    summary = segment_folder(capture_dir(asset) / "images", out, params, overlays=asset.dir("evidence", "segmentation"))
    return [out], summary


def _recon(asset: Asset, cams_path: Path, images: Path, masks: Path, out: Path, params, exclude=()):
    from .dense import reconstruct

    cams = [c for c in load_cameras(cams_path) if c.name not in set(exclude)]
    if len(cams) < 3:
        raise StageError(f"only {len(cams)} usable cameras")
    return reconstruct(cams, images, masks, out, params)


def _recon_known(asset: Asset, params):
    out = asset.dir("A1_known_cameras")
    hold = holdout_names(asset)
    s = _recon(asset, capture_dir(asset) / "cameras_known.json", capture_dir(asset) / "images", asset.path("masks"), out, params, exclude=hold)
    s["holdout_excluded"] = hold
    return [out / "mesh.ply", out / "dense_points.ply"], s


def _video(asset: Asset, params):
    """Non-holdout views, in capture order, encoded as a lossy video. No camera data is kept."""
    import shutil
    import subprocess
    import tempfile

    hold = set(holdout_names(asset))
    imgs = sorted(p for p in (capture_dir(asset) / "images").glob("*.png") if p.stem not in hold)
    out = asset.dir("video") / "turntable.mp4"
    with tempfile.TemporaryDirectory() as td:
        for i, p in enumerate(imgs):
            shutil.copy(p, Path(td) / f"f{i:04d}.png")
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(params["fps"]), "-i", str(Path(td) / "f%04d.png"), "-c:v", params["codec"], "-crf",
               str(params["crf"]), "-pix_fmt", "yuv420p", str(out)]
        subprocess.run(cmd, check=True)
    return [out], {"frames": len(imgs), "bytes": out.stat().st_size}


def _extract(asset: Asset, params):
    from .frames import extract_frames

    out = asset.dir("frames")
    s = extract_frames(asset.path("video", "turntable.mp4"), out, params, evidence=asset.dir("evidence", "frames"))
    return [out / "selected"], s


def _segment_frames(asset: Asset, params):
    from .imaging import segment_folder

    out = asset.dir("frames", "masks")
    s = segment_folder(asset.path("frames", "selected"), out, params, overlays=None)
    return [out], s


def _sfm(asset: Asset, params):
    from .sfm import run_sfm

    out = asset.dir("A2_sfm")
    s = run_sfm(asset.path("frames", "selected"), asset.path("frames", "masks"), out, params, evidence=asset.dir("evidence", "sfm"))
    return [out / "cameras_sfm.json", out / "sparse_points.ply"], s


def _recon_sfm(asset: Asset, params):
    out = asset.dir("A2_estimated_cameras")
    u = asset.path("A2_sfm", "undistorted")
    s = _recon(asset, asset.path("A2_sfm", "cameras_sfm.json"), u / "images", u / "masks", out, params)
    return [out / "mesh.ply", out / "dense_points.ply"], s


def _texture(asset: Asset, params):
    from .texture import texture_mesh

    hold = holdout_names(asset)
    res = {}
    outs = []
    for exp, cams_path, images, masks in [
        ("A1_known_cameras", capture_dir(asset) / "cameras_known.json", capture_dir(asset) / "images", asset.path("masks")),
        ("A2_estimated_cameras", asset.path("A2_sfm", "cameras_sfm.json"), asset.path("A2_sfm", "undistorted", "images"), asset.path("A2_sfm", "undistorted", "masks")),
    ]:
        d = asset.path(exp)
        if not (d / "mesh.ply").exists():
            continue
        cams = [c for c in load_cameras(cams_path) if c.name not in set(hold)]
        res[exp] = texture_mesh(asset, d / "mesh.ply", cams, images, masks, d / "textured", params)
        outs.append(d / "textured")
    if not outs:
        raise StageError("no reconstructed meshes to texture")
    return outs, res


def _evaluate(asset: Asset, params):
    from .metrics import evaluate_benchmark

    out = asset.dir("evaluation")
    s = evaluate_benchmark(asset, out, params)
    return [out / "report.json"], s


def _cfg(key):
    return lambda a: a.config[key]


STAGES = [
    ("capture", _capture, lambda a: [Path(__file__).parent / "blender" / "benchmark_scene.py"], _cfg("capture")),
    ("segment", _segment, lambda a: [capture_dir(a) / "images"], _cfg("segment")),
    ("recon_known", _recon_known, lambda a: [capture_dir(a) / "images", a.path("masks"), Path(__file__).parent / "dense.py"], _cfg("dense")),
    ("video", _video, lambda a: [capture_dir(a) / "images"], _cfg("video")),
    ("extract", _extract, lambda a: [a.path("video", "turntable.mp4"), Path(__file__).parent / "frames.py"], _cfg("extract")),
    ("segment_frames", _segment_frames, lambda a: [a.path("frames", "selected")], _cfg("segment")),
    ("sfm", _sfm, lambda a: [a.path("frames", "selected"), a.path("frames", "masks"), Path(__file__).parent / "sfm.py"], _cfg("sfm")),
    ("recon_sfm", _recon_sfm, lambda a: [a.path("A2_sfm", "cameras_sfm.json"), a.path("A2_sfm", "undistorted"), Path(__file__).parent / "dense.py"], _cfg("dense")),
    ("texture", _texture, lambda a: [a.path("A1_known_cameras", "mesh.ply"), a.path("A2_estimated_cameras", "mesh.ply"), Path(__file__).parent / "texture.py"],
     _cfg("texture")),
    ("evaluate", _evaluate, lambda a: [a.path("A1_known_cameras", "textured"), a.path("A2_estimated_cameras", "textured"), Path(__file__).parent / "metrics.py"],
     lambda a: {"holdout": a.config["holdout"]}),
]
