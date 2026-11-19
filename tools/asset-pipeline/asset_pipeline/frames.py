"""Frame extraction (FFmpeg) and selection for video inputs.

Every frame is extracted at the configured rate, scored, and then selected
or rejected with a recorded reason:

  blur        Laplacian variance below `min_sharpness_ratio` x the median
  duplicate   almost identical to the previously kept frame (no new viewpoint)
  budget      uniformly thinned to `max_frames`

A contact sheet shows kept (green) and rejected (red) frames.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import cv2
import numpy as np

from .imaging import contact_sheet


def probe(video: Path) -> dict:
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,nb_frames,codec_name", "-of", "json", str(video)],
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)["streams"][0]


def extract_frames(video: Path, out: Path, params: dict, evidence: Path | None = None) -> dict:
    if not Path(video).exists():
        raise FileNotFoundError(video)
    allf = out / "all"
    sel = out / "selected"
    for d in (allf, sel):
        if d.exists():
            shutil.rmtree(d)
        d.mkdir(parents=True)
    info = probe(video)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(video), "-vf", f"fps={params['fps']}", "-start_number", "0", str(allf / "frame_%04d.png")], check=True)
    frames = sorted(allf.glob("*.png"))
    if not frames:
        raise RuntimeError("no frames extracted")
    sharp, small = [], []
    for f in frames:
        g = cv2.imread(str(f), cv2.IMREAD_GRAYSCALE)
        sharp.append(float(cv2.Laplacian(g, cv2.CV_64F).var()))
        small.append(cv2.resize(g, (96, 72), interpolation=cv2.INTER_AREA).astype(np.float32))
    med = float(np.median(sharp))
    records = []
    last = None
    for i, f in enumerate(frames):
        r = {"frame": f.name, "sharpness": sharp[i], "kept": True, "reason": ""}
        if sharp[i] < params["min_sharpness_ratio"] * med:
            r.update(kept=False, reason="blur")
        elif last is not None and float(np.abs(small[i] - small[last]).mean()) < params.get("duplicate_mad", 1.5):
            r.update(kept=False, reason="duplicate")
        else:
            last = i
        records.append(r)
    kept = [r for r in records if r["kept"]]
    if len(kept) > params["max_frames"]:
        keep_idx = set(np.linspace(0, len(kept) - 1, params["max_frames"]).round().astype(int).tolist())
        for j, r in enumerate(kept):
            if j not in keep_idx:
                r.update(kept=False, reason="budget")
    for r in records:
        if r["kept"]:
            shutil.copy(allf / r["frame"], sel / r["frame"])
    (out / "selection.json").write_text(json.dumps({"video": str(video), "probe": info, "median_sharpness": med, "frames": records}, indent=1))
    if evidence is not None:
        labels = [f"{r['frame'][6:10]} {'keep' if r['kept'] else r['reason']}" for r in records]
        cols = [(90, 230, 90) if r["kept"] else (80, 80, 255) for r in records]
        contact_sheet([allf / r["frame"] for r in records], evidence / "frame_selection_contact_sheet.jpg", cols=10, thumb=150, labels=labels, label_colours=cols)
    reasons = {}
    for r in records:
        if not r["kept"]:
            reasons[r["reason"]] = reasons.get(r["reason"], 0) + 1
    return {"extracted": len(records), "selected": sum(r["kept"] for r in records), "rejected": reasons, "median_sharpness": med, "codec": info.get("codec_name"),
            "resolution": [info.get("width"), info.get("height")]}
