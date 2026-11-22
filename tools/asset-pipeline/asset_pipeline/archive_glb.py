"""Source archive as first-class, fully ingested input to Attunement's asset pipeline.

The 138 original GLBs are reusable import inputs under the pipeline workspace.
No manual file copying, individual model whitelisting, or owner sign-off is
needed to ingest and iterate on them. Runtime release/asset quality remains a
separate technical validation step.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path, PurePosixPath
from zipfile import ZipFile

from .workspace import REPO_ROOT, StageError

MAX_MEMBER_BYTES = 96 * 1024 * 1024
MAX_ARCHIVE_BYTES = 512 * 1024 * 1024
ARCHIVE_PREFIX = "glb-low-poly-models-building-blocks/"


def _hash(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def read_source_library(archive: Path, sha256: str):
    raw = archive.read_bytes()
    actual = _hash(raw)
    if actual != sha256:
        raise StageError(f"archive hash mismatch: {actual}")
    entries = []
    total = 0
    with ZipFile(archive) as zipfile:
        for info in zipfile.infolist():
            if info.is_dir():
                continue
            name = info.filename
            path = PurePosixPath(name)
            if ".." in path.parts or path.is_absolute() or "\\" in name:
                raise StageError(f"unsafe archive member: {name}")
            if not name.lower().endswith(".glb"):
                continue  # benign metadata is not a model input
            if not name.startswith(ARCHIVE_PREFIX):
                raise StageError(f"unexpected GLB source hierarchy: {name}")
            if info.file_size > MAX_MEMBER_BYTES:
                raise StageError(f"oversized archive model: {name}")
            total += info.file_size
            if total > MAX_ARCHIVE_BYTES:
                raise StageError("archive exceeds bounded import budget")
            entries.append(info)
    if len(entries) != 138:
        raise StageError(f"expected 138 source GLBs, found {len(entries)}")
    return entries


def inspect_glb(data: bytes) -> dict:
    import struct
    if (len(data) < 20 or data[:4] != b"glTF" or
            struct.unpack_from("<I", data, 4)[0] != 2 or
            struct.unpack_from("<I", data, 8)[0] != len(data)):
        raise StageError("invalid GLB 2.0 header")
    chunk_length, chunk_type = struct.unpack_from("<II", data, 12)
    if chunk_type != 0x4E4F534A or chunk_length > len(data) - 20:
        raise StageError("invalid GLB JSON chunk")
    try:
        metadata = json.loads(data[20:20 + chunk_length])
    except (ValueError, UnicodeDecodeError) as exc:
        raise StageError("invalid GLB JSON") from exc
    if metadata.get("asset", {}).get("version") != "2.0":
        raise StageError("invalid glTF asset version")
    return {
        "meshes": len(metadata.get("meshes", [])),
        "nodes": len(metadata.get("nodes", [])),
        "skins": len(metadata.get("skins", [])),
        "animations": len(metadata.get("animations", [])),
        "materials": len(metadata.get("materials", [])),
        "textures": len(metadata.get("textures", [])),
    }


def archive_path(asset) -> Path:
    return asset.source(asset.config["archive"]["path"])


def _index(asset, extract: bool):
    config = asset.config["archive"]
    source = archive_path(asset)
    infos = read_source_library(source, config["sha256"])
    destination = asset.work / "imports"
    if extract:
        destination.mkdir(parents=True, exist_ok=True)
    result = []
    outputs = []
    with ZipFile(source) as z:
        for index, item in enumerate(infos):
            data = z.read(item)
            metadata = inspect_glb(data)
            digest = _hash(data)
            # Stable filename and source hierarchy, without path traversal or
            # copying asset bytes into client/pipeline-assets or client/assets.
            basename = PurePosixPath(item.filename).name
            filename = f"{index:03d}-{digest[:12]}-{basename}"
            target = destination / filename
            if extract:
                if not target.exists() or _hash(target.read_bytes()) != digest:
                    target.write_bytes(data)
                outputs.append(target)
            result.append({
                "index": index, "source": item.filename,
                "pipeline_input": str(target.relative_to(REPO_ROOT)),
                "bytes": len(data), "sha256": digest, **metadata,
            })
    file = asset.work / ("imports.json" if extract else "source-inventory.json")
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps({
        "asset": asset.id, "kind": "archive-glb-source",
        "source_archive_sha256": config["sha256"],
        "count": len(result),
        "status": "pipeline-input" if extract else "indexed",
        "entries": result,
    }, indent=2) + "\n")
    outputs.append(file)
    return outputs, {"models": len(result), "imported": extract,
                     "working_directory": str(destination), "index": str(file)}


def inventory(asset, _params):
    return _index(asset, False)


def ingest(asset, _params):
    return _index(asset, True)


def inputs(asset):
    return [archive_path(asset), asset.config_path]


def params(asset):
    return {"sha256": asset.config["archive"]["sha256"],
            "version": 1}


STAGES = [
    ("inventory", inventory, inputs, params),
    ("ingest", ingest, inputs, params),
]
