"""Asset configuration, per-asset workspace and resumable stage state.

Every asset has a tracked configuration at tools/asset-pipeline/assets/<id>/asset.json
and an untracked workspace at .asset-cache/pipeline/<id>/ for bulky
intermediates. Original source material lives wherever the configuration
points (normally the git-ignored /art-source/) and is never written to.

A stage records the SHA-256 of its declared inputs, its parameters and its
outputs in <workspace>/state.json. It is skipped when all of those still
match, so a failed or edited stage can be rerun without restarting the
pipeline.
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = PIPELINE_DIR.parent.parent
ASSET_CONFIG_DIR = PIPELINE_DIR / "assets"
CACHE_ROOT = Path(os.environ.get("ASSET_PIPELINE_CACHE", REPO_ROOT / ".asset-cache" / "pipeline"))


class StageError(RuntimeError):
    """A stage could not produce its outputs. The message says why."""


def sha256_file(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def sha256_paths(paths) -> str:
    """Hash of every file under the given paths (sorted, path-relative)."""
    h = hashlib.sha256()
    for p in sorted(Path(x) for x in paths):
        if not p.exists():
            h.update(f"missing:{p.name}".encode())
            continue
        files = sorted(q for q in p.rglob("*") if q.is_file()) if p.is_dir() else [p]
        for f in files:
            h.update(str(f.name).encode())
            h.update(sha256_file(f).encode())
    return h.hexdigest()


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=1, sort_keys=False, default=_json_default) + "\n")
    tmp.replace(path)


def _json_default(o):
    import numpy as np

    if isinstance(o, (np.floating,)):
        return float(o)
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    if isinstance(o, Path):
        return str(o)
    raise TypeError(type(o))


def read_json(path: Path):
    return json.loads(Path(path).read_text())


@dataclass
class Asset:
    id: str
    config: dict
    config_path: Path
    work: Path
    state: dict = field(default_factory=dict)

    @classmethod
    def load(cls, asset_id: str) -> "Asset":
        cfg_path = ASSET_CONFIG_DIR / asset_id / "asset.json"
        if not cfg_path.exists():
            raise StageError(f"no configuration for asset '{asset_id}' at {cfg_path}")
        cfg = read_json(cfg_path)
        if cfg.get("id") != asset_id:
            raise StageError(f"{cfg_path}: id '{cfg.get('id')}' does not match '{asset_id}'")
        work = CACHE_ROOT / asset_id
        work.mkdir(parents=True, exist_ok=True)
        state_path = work / "state.json"
        state = read_json(state_path) if state_path.exists() else {"stages": {}}
        return cls(asset_id, cfg, cfg_path, work, state)

    # paths -------------------------------------------------------------
    def path(self, *parts) -> Path:
        p = self.work.joinpath(*parts)
        return p

    def dir(self, *parts) -> Path:
        p = self.work.joinpath(*parts)
        p.mkdir(parents=True, exist_ok=True)
        return p

    def source(self, rel: str) -> Path:
        """Resolve a configured source path (relative to the repository root)."""
        p = (REPO_ROOT / rel).resolve()
        if not p.exists():
            raise StageError(f"missing source input: {rel}")
        return p

    # stage bookkeeping --------------------------------------------------
    def save_state(self) -> None:
        write_json(self.work / "state.json", self.state)

    def stage_key(self, name: str, inputs, params) -> str:
        h = hashlib.sha256()
        h.update(sha256_paths(inputs).encode())
        h.update(json.dumps(params, sort_keys=True, default=str).encode())
        return h.hexdigest()

    def is_current(self, name: str, key: str) -> bool:
        rec = self.state["stages"].get(name)
        if not rec or rec.get("key") != key or rec.get("status") != "ok":
            return False
        outs = [Path(o) for o in rec.get("outputs", [])]
        if not outs or not all(o.exists() for o in outs):
            return False
        return rec.get("outputs_hash") == sha256_paths(outs)

    def record(self, name: str, key: str, outputs, summary: dict, seconds: float) -> None:
        self.state["stages"][name] = {
            "status": "ok",
            "key": key,
            "outputs": [str(o) for o in outputs],
            "outputs_hash": sha256_paths(outputs),
            "summary": summary,
            "seconds": round(seconds, 1),
            "finished": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
        self.save_state()

    def record_failure(self, name: str, message: str) -> None:
        self.state["stages"][name] = {"status": "failed", "error": message, "finished": time.strftime("%Y-%m-%dT%H:%M:%S")}
        self.save_state()


def run_stage(asset: Asset, name: str, fn, inputs, params: dict, force: bool = False):
    """Run fn(asset, params) -> (outputs, summary) unless its recorded result is current."""
    key = asset.stage_key(name, inputs, params)
    if not force and asset.is_current(name, key):
        print(f"[{asset.id}] {name}: up to date (cached)")
        return asset.state["stages"][name]["summary"]
    print(f"[{asset.id}] {name}: running")
    t0 = time.time()
    try:
        outputs, summary = fn(asset, params)
    except StageError as e:
        asset.record_failure(name, str(e))
        raise
    except Exception as e:  # recorded, then re-raised with the traceback
        asset.record_failure(name, f"{type(e).__name__}: {e}")
        raise
    missing = [str(o) for o in outputs if not Path(o).exists()]
    if missing:
        asset.record_failure(name, f"declared outputs missing: {missing}")
        raise StageError(f"{name}: declared outputs missing: {missing}")
    asset.record(name, key, outputs, summary, time.time() - t0)
    print(f"[{asset.id}] {name}: done in {time.time() - t0:.1f}s")
    return summary


def run_blender(module: str, payload: dict, timeout: int = 3600) -> dict:
    """Run a Blender (bpy) script module in a fresh interpreter.

    Each Blender job gets its own process so scene state, memory and crashes
    are isolated. The payload goes in as JSON; the script writes its result
    JSON to payload["result"].
    """
    payload = dict(payload)
    result = Path(payload.setdefault("result", str(Path(payload["work"]) / f".{module.split('.')[-1]}.result.json")))
    if result.exists():
        result.unlink()
    env = dict(os.environ, PYTHONPATH=str(PIPELINE_DIR) + os.pathsep + os.environ.get("PYTHONPATH", ""))
    cmd = [sys.executable, "-m", module, json.dumps(payload, default=str)]
    proc = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=timeout)
    log = Path(payload["work"]) / "logs" / f"{module.split('.')[-1]}.log"
    log.parent.mkdir(parents=True, exist_ok=True)
    log.write_text(proc.stdout + "\n--- stderr ---\n" + proc.stderr)
    if proc.returncode != 0 or not result.exists():
        tail = (proc.stderr or proc.stdout)[-2500:]
        raise StageError(f"Blender job {module} failed (exit {proc.returncode}); log {log}\n{tail}")
    return read_json(result)
