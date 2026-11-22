#!/usr/bin/env python3
"""Audit owner-supplied source GLBs without extracting or publishing them to the client.

This is deliberately inventory-only. Classification is advisory; no model is
automatically approved for production by a matching filename.
"""
import hashlib
import json
from pathlib import Path
import struct
import sys
import zipfile

ARCHIVE = Path("assets/source-archives/glb-low-poly-models-building-blocks.zip")
KEYWORDS = {
    "vegetation": ("tree", "plant", "grass", "bush", "leaf", "flower", "mushroom", "root", "fern"),
    "fauna": ("animal", "creature", "bird", "fish", "bug", "insect", "wolf", "deer", "beast"),
    "architecture": ("building", "house", "hut", "roof", "wall", "door", "window", "arch", "tower", "bridge", "stairs"),
    "materials": ("rock", "stone", "wood", "log", "metal", "crystal", "ore", "moss", "coral"),
    "props": ("crate", "barrel", "lantern", "lamp", "fence", "wagon", "tools", "furniture", "pot"),
}

def classify(name, node_names):
    hay = (name + " " + " ".join(node_names)).casefold()
    return [cat for cat, words in KEYWORDS.items() if any(w in hay for w in words)] or ["unclassified"]

def main():
    if not ARCHIVE.is_file():
        raise SystemExit("GLB source archive absent. Merge the quarantined archive first.")
    entries = []
    digests = {}
    with zipfile.ZipFile(ARCHIVE) as z:
        for entry in z.infolist():
            if entry.is_dir() or not entry.filename.lower().endswith(".glb"):
                continue
            name = Path(entry.filename.replace("\\", "/"))
            if name.is_absolute() or ".." in name.parts:
                raise ValueError(f"Unsafe ZIP member: {entry.filename}")
            with z.open(entry) as src:
                header = src.read(20)
                if len(header) != 20:
                    raise ValueError(f"Truncated GLB: {entry.filename}")
                magic, version, length, chunk_len, chunk_type = struct.unpack("<4sIIII", header)
                if magic != b"glTF" or version != 2 or length != entry.file_size or chunk_type != 0x4E4F534A:
                    raise ValueError(f"Invalid glTF 2.0 binary header: {entry.filename}")
                if chunk_len > entry.file_size - 20 or chunk_len > 32 * 1024 * 1024:
                    raise ValueError(f"Invalid JSON chunk: {entry.filename}")
                doc = json.loads(src.read(chunk_len))
                if doc.get("asset", {}).get("version") != "2.0" or not doc.get("meshes"):
                    raise ValueError(f"Invalid GLB mesh document: {entry.filename}")
            # ZIP CRC+size is *not* a content hash; report it only as duplicate hint.
            key = (entry.CRC, entry.file_size)
            digests.setdefault(key, []).append(entry.filename)
            nodes = [x.get("name", "") for x in doc.get("nodes", []) if x.get("name")][:7]
            cats = classify(entry.filename, nodes)
            record = {
                "path": entry.filename, "bytes": entry.file_size, "classes": cats,
                "meshes": len(doc.get("meshes", [])), "materials": len(doc.get("materials", [])),
                "animations": len(doc.get("animations", [])), "nodes": nodes,
            }
            entries.append(record)
    entries.sort(key=lambda x: x["path"].casefold())
    print(f"SOURCE GLB INVENTORY: {len(entries)} files (no client asset promotion)")
    for rec in entries:
        print(json.dumps(rec, ensure_ascii=False, separators=(",", ":")))
    dupes = [v for v in digests.values() if len(v) > 1]
    print("POSSIBLE DUPLICATES BY CRC+SIZE:", json.dumps(dupes, ensure_ascii=False))
    print("CANDIDATE COUNTS:", json.dumps({
        k: sum(k in r["classes"] for r in entries) for k in KEYWORDS
    }))
    if len(entries) != 138:
        raise SystemExit(f"Expected 138 GLBs, found {len(entries)}.")

if __name__ == "__main__":
    main()
