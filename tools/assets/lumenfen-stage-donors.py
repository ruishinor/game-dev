#!/usr/bin/env python3
"""Stage selected GLB donors into Attunement's production asset pipeline workspace.

Donors are usable immediately for further composition and reconstruction.
"""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[2]
SPEC = ROOT / "assets/lumenfen-donors.json"

def stage(destination: Path) -> None:
    spec = json.loads(SPEC.read_text(encoding="utf-8"))
    archive = ROOT / spec["sourceArchive"]
    if not archive.is_file():
        raise RuntimeError(f"Missing owner GLB archive: {archive}")
    donors = spec["donors"]
    if len({d["id"] for d in donors}) != len(donors):
        raise ValueError("Duplicate Lumenfen donor IDs")
    destination.mkdir(parents=True, exist_ok=True)
    records = []
    with zipfile.ZipFile(archive, "r") as z:
        members = [m for m in z.infolist() if not m.is_dir() and m.filename.lower().endswith(".glb")]
        for d in donors:
            name = d["file"]
            found = [m for m in members if Path(m.filename).name == name]
            if len(found) != 1:
                raise ValueError(f"Expected one source for {name}, found {len(found)}")
            m = found[0]
            parts = Path(m.filename).parts
            if ".." in parts or Path(m.filename).is_absolute() or m.file_size > 30_000_000:
                raise ValueError(f"Unsafe source ZIP member: {m.filename}")
            data = z.read(m)
            if len(data) != m.file_size or not data.startswith(b"glTF"):
                raise ValueError(f"Damaged or non-GLB member: {m.filename}")
            target = destination / (d["id"] + ".glb")
            target.write_bytes(data)
            records.append({
                "id": d["id"], "donor": m.filename, "node": d["node"],
                "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                "role": d["role"], "requiredTreatment": d["requiredTreatment"]
            })
    (destination / "sources.json").write_text(
        json.dumps({"status": spec["status"], "sources": records}, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Staged {len(records)} donor inputs in {destination}.")
    for r in records:
        print(f"{r['id']}: {r['bytes']} bytes sha256 {r['sha256'][:12]}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: python3 tools/assets/lumenfen-stage-donors.py <temporary-staging-directory>")
    stage(Path(sys.argv[1]).resolve())
