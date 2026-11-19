"""Reference-driven architecture (first applied to the Severance Gate).

ingest    verify the owner's reference sheets by hash and crop the orthographic views
measure   segment the front elevation from its blueprint background and measure the
          silhouette (taper, plinth, crown) at a declared total height
build     Blender: author, unwrap, bake and export the Near/Mid/Far/Ruins GLB (severance_gate.py)
optimize  meshopt + WebP through the project's glTF Transform recipe, UV1 kept for the runtime
validate  Khronos validator, scene/part inventory and agreement between measured, built and
          gameplay dimensions
render    Cycles evidence renders of the exported runtime file (severance_gate_render.py)

Concept sheets are illustrations, not photographs: no camera model relates them, so the
geometry is reference-constrained modelling (Stillpoint's Mode C), not reconstruction.
"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import numpy as np

from .workspace import Asset, StageError, read_json, run_blender, sha256_file, write_json

HERE = Path(__file__).parent
REPO_JS = HERE.parent / "js" / "optimize.mjs"


def _load_rgb(path: Path):
    try:
        import cv2

        img = cv2.imread(str(path), cv2.IMREAD_COLOR)
        return None if img is None else img[..., ::-1].copy()
    except ImportError:
        from PIL import Image

        return np.asarray(Image.open(path).convert("RGB"))


def _save_rgb(path: Path, arr):
    from PIL import Image

    Image.fromarray(np.asarray(arr, np.uint8)).save(path)


def _ingest(asset: Asset, params):
    refs = asset.dir("refs")
    manifest = {"asset": asset.id, "sources": [], "views": {}}
    native = {}
    for s in asset.config["sources"]:
        p = asset.source(s["path"])
        digest = sha256_file(p)
        if s.get("sha256") and s["sha256"] != digest:
            raise StageError(f"{s['path']}: hash {digest[:12]} differs from the recorded {s['sha256'][:12]}")
        native[s["id"]] = _load_rgb(p)
        manifest["sources"].append({**s, "sha256": digest, "bytes": p.stat().st_size})
    for name, v in asset.config["views"].items():
        img = native[v["source"]]
        x, y, w, h = v["box"]
        if x < 0 or y < 0 or x + w > img.shape[1] or y + h > img.shape[0]:
            raise StageError(f"view {name}: box outside {v['source']}")
        _save_rgb(refs / f"{name}.png", img[y:y + h, x:x + w])
        manifest["views"][name] = {**v, "file": f"refs/{name}.png", "sha256": sha256_file(refs / f"{name}.png")}
    out = asset.path("asset-manifest.json")
    write_json(out, manifest)
    return [out, refs], {"views": len(manifest["views"])}


def silhouette_rows(img, background_bias=6, max_red=45):
    """Foreground mask of a stone elevation on a dark blue blueprint background."""
    r, g, b = (img[..., i].astype(int) for i in range(3))
    bg = (b > r + background_bias) & (r < max_red)
    fg = ~bg
    rows = []
    for y in range(fg.shape[0]):
        xs = np.flatnonzero(fg[y])
        rows.append((int(xs.min()), int(xs.max())) if xs.size > 8 else None)
    return fg, rows


def _measure(asset: Asset, params):
    view = asset.config["measure"]["view"]
    img = _load_rgb(asset.path("refs", f"{view}.png"))
    _, rows = silhouette_rows(img)
    ys = [y for y, r in enumerate(rows) if r]
    top, ground = ys[0], ys[-1]
    total = float(asset.config["measure"]["height_m"])
    k = total / (ground - top)  # metres per pixel

    def width_at(frac):
        y = int(round(ground - frac * (ground - top)))
        a, b = rows[y]
        return (b - a) * k

    widths = {f"{f:.2f}": round(width_at(f), 2) for f in (0.03, 0.1, 0.18, 0.25, 0.5, 0.75, 0.97)}
    # The plinth top is the highest step outward in the lower third: the first row
    # (scanning down) where the silhouette widens by more than 0.5 m within 4 rows.
    w = np.array([(rows[y][1] - rows[y][0]) * k if rows[y] else 0 for y in range(len(rows))])
    jump = next((y for y in range(int(ground - 0.33 * (ground - top)), ground - 2) if w[y + 2] - w[y - 2] > 0.5), None)
    if jump is None:
        raise StageError("no plinth step found in the front elevation")
    constraints = {
        "view": view, "pixels_per_m": round(1 / k, 2), "assumed_height_m": total,
        "silhouette_width_m": widths,
        "plinth_top_m": round((ground - jump) * k, 2),
        "body_base_width_m": round(w[jump - 3], 2),
        "crown_width_m": round(width_at(0.97), 2),
        "taper_ratio": round(width_at(0.97) / w[jump - 3], 3),
        "method": "blueprint background segmentation (blue-dominant, dark) and per-row extent; scale from the declared total height",
    }
    out = asset.path("constraints.json")
    write_json(out, constraints)
    return [out], constraints


def _build(asset: Asset, params):
    work = asset.dir("build")
    res = run_blender("asset_pipeline.blender.severance_gate", {"work": str(work), "bake": params["bake"], "normal": params["normal"]}, timeout=6 * 3600)
    return [Path(res["glb"]), work / "gate-metrics.json"], {"triangles": res["metrics"]["triangles"]}


def _optimize(asset: Asset, params):
    src = asset.path("build", "severance_gate_raw.glb")
    out = asset.path("export", "severance_gate.glb")
    out.parent.mkdir(parents=True, exist_ok=True)
    node = shutil.which("node")
    if not node:
        raise StageError("node is required for the glTF Transform optimiser")
    proc = subprocess.run([node, str(REPO_JS), str(src), str(out), str(params["max_texture"]), str(params["quality"]), "keep"], capture_output=True, text=True)
    if proc.returncode != 0:
        raise StageError(proc.stderr[-2000:])
    report = read_json(Path(str(out) + ".report.json"))
    return [out, Path(str(out) + ".report.json")], {"bytes": report["bytes"], "triangles": report["triangles"], "validator": report["validator"]}


def _validate(asset: Asset, params):
    report = read_json(asset.path("export", "severance_gate.glb.report.json"))
    metrics = read_json(asset.path("build", "gate-metrics.json"))
    measured = read_json(asset.path("constraints.json"))
    problems = []
    if report["validator"]["errors"]:
        problems.append(f"validator errors: {report['validator']['errors']}")
    for m in ("SG_Stone_Body", "SG_Stone_Base", "SG_Rune", "SG_Channel", "SG_Lamp", "SG_RuneDim"):
        if m not in report["materials"]:
            problems.append(f"missing material {m}")
    built_base = 2 * metrics["body"]["hw0"]
    dev = abs(built_base - measured["body_base_width_m"]) / measured["body_base_width_m"]
    if dev > 0.08:
        problems.append(f"body base width {built_base:.2f} m deviates {dev:.0%} from the measured {measured['body_base_width_m']} m")
    summary = {"problems": problems, "base_width_deviation": round(dev, 3), "bytes": report["bytes"], "triangles": metrics["triangles"]}
    out = asset.path("validate.json")
    write_json(out, summary)
    if problems:
        raise StageError("; ".join(problems))
    return [out], summary


def _render(asset: Asset, params):
    out = asset.dir("evidence")
    res = run_blender("asset_pipeline.blender.severance_gate_render", {"work": str(asset.work), "glb": str(asset.path("build", "severance_gate_raw.glb")),
                                                                      "out": str(out), "samples": params["samples"]}, timeout=6 * 3600)
    return [Path(r) for r in res["renders"]], {"renders": len(res["renders"])}


def _src_inputs(asset):
    return [asset.source(s["path"]) for s in asset.config["sources"]]


STAGES = [
    ("ingest", _ingest, lambda a: _src_inputs(a) + [a.config_path], lambda a: {"views": a.config["views"]}),
    ("measure", _measure, lambda a: [a.path("refs")], lambda a: a.config["measure"]),
    ("build", _build, lambda a: [HERE / "blender" / "severance_gate.py"], lambda a: a.config["build"]),
    ("optimize", _optimize, lambda a: [a.path("build", "severance_gate_raw.glb"), REPO_JS], lambda a: a.config["optimize"]),
    ("validate", _validate, lambda a: [a.path("export"), a.path("build", "gate-metrics.json"), a.path("constraints.json")], lambda a: {}),
    ("render", _render, lambda a: [a.path("build", "severance_gate_raw.glb"), HERE / "blender" / "severance_gate_render.py"], lambda a: a.config["render"]),
]
