"""Command-line entry point.

    python -m asset_pipeline list
    python -m asset_pipeline inspect --asset <id>
    python -m asset_pipeline <stage> --asset <id> [--force]
    python -m asset_pipeline all --asset <id> [--force] [--from <stage>]

Stages are defined per asset kind (see STAGES in the kind modules). Each
stage is cached on the hash of its inputs and parameters; --force reruns it.
"""
from __future__ import annotations

import argparse
import importlib
import shutil
import sys

from .workspace import ASSET_CONFIG_DIR, Asset, StageError, run_stage

KINDS = {
    "controlled-benchmark": "asset_pipeline.benchmark",
    "reference-driven-creature": "asset_pipeline.creature",
    "reference-driven-architecture": "asset_pipeline.architecture",
    "imported-mechanical-humanoid": "asset_pipeline.mech_humanoid",
    "body-fitted-armour": "asset_pipeline.armour",
    "archive-glb-source": "asset_pipeline.archive_glb",
}


def stages_for(asset: Asset):
    kind = asset.config.get("kind")
    if kind not in KINDS:
        raise StageError(f"unknown asset kind '{kind}'")
    try:
        return importlib.import_module(KINDS[kind]).STAGES
    except ModuleNotFoundError as e:
        if e.name != KINDS[kind]:
            raise
        raise StageError(f"asset kind '{kind}' needs {KINDS[kind]}, which is not in this checkout") from None


def inspect(asset: Asset) -> None:
    import platform

    print(f"asset      {asset.id} ({asset.config.get('kind')})")
    print(f"config     {asset.config_path}")
    print(f"workspace  {asset.work}")
    print(f"python     {platform.python_version()}  {sys.executable}")
    for mod in ("bpy", "numpy", "scipy", "cv2", "trimesh", "skimage", "pycolmap"):
        try:
            m = importlib.import_module(mod)
            v = getattr(m, "__version__", None) or getattr(getattr(m, "app", None), "version_string", "")
            extra = f" cuda={m.has_cuda}" if mod == "pycolmap" else ""
            print(f"  {mod:9s} {v}{extra}")
        except Exception as e:  # report, do not fail
            print(f"  {mod:9s} MISSING ({type(e).__name__})")
    for tool in ("ffmpeg", "node"):
        print(f"  {tool:9s} {shutil.which(tool) or 'MISSING'}")
    for src in asset.config.get("sources", []):
        try:
            asset.source(src["path"])
            print(f"  source ok  {src['path']}")
        except StageError as e:
            print(f"  source MISSING  {e}")
    print("stages:")
    for name, *_ in stages_for(asset):
        rec = asset.state["stages"].get(name)
        status = rec["status"] if rec else "not run"
        when = rec.get("finished", "") if rec else ""
        print(f"  {name:22s} {status:8s} {when}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="asset_pipeline")
    ap.add_argument("stage")
    ap.add_argument("--asset")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--from", dest="start")
    a = ap.parse_args(argv)
    if a.stage == "list":
        for p in sorted(ASSET_CONFIG_DIR.glob("*/asset.json")):
            print(p.parent.name)
        return 0
    if not a.asset:
        ap.error("--asset is required")
    try:
        asset = Asset.load(a.asset)
        if a.stage == "inspect":
            inspect(asset)
            return 0
        stages = stages_for(asset)
        names = [s[0] for s in stages]
        if a.stage == "all":
            todo = stages[names.index(a.start):] if a.start else stages
        elif a.stage in names:
            todo = [stages[names.index(a.stage)]]
        else:
            ap.error(f"unknown stage '{a.stage}'. Stages for {asset.id}: {', '.join(names)}")
        for name, fn, inputs, params in todo:
            run_stage(asset, name, fn, inputs(asset), params(asset), force=a.force)
    except StageError as e:
        print(f"FAILED: {e}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
