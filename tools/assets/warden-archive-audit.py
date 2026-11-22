#!/usr/bin/env python3
"""Read-only identification of candidate Warden rifle and wardrobe donor nodes.

The owner ZIP remains quarantined. This script does not extract source GLBs,
publish binary artifacts, or approve any low-poly model for runtime use.
"""
import json
import re
import struct
from pathlib import Path
from zipfile import ZipFile

ARCHIVE = Path("assets/source-archives/glb-low-poly-models-building-blocks.zip")
NAME = re.compile(r"rifle|carbine|assault|sniper|gun|firearm|weapon|tactical|security|armor|armour|uniform|vest|jacket|coat|clothing|outfit|military|soldier|guard", re.I)
PREFERRED = re.compile(r"rifle|carbine|assault|sniper|long.?gun", re.I)

def inspect(member, z):
    with z.open(member) as file:
        header = file.read(20)
        if len(header) != 20:
            raise ValueError("short GLB header")
        magic, version, total, size, chunk = struct.unpack("<4sIIII", header)
        if magic != b"glTF" or version != 2 or total != member.file_size or chunk != 0x4e4f534a or size > 32_000_000:
            raise ValueError("not a supported GLB")
        doc = json.loads(file.read(size))
    nodes = doc.get("nodes", [])
    materials = doc.get("materials", [])
    matches = []
    for i, node in enumerate(nodes):
        name = node.get("name", "")
        if NAME.search(name):
            matches.append({"id": i, "name": name, "mesh": node.get("mesh"), "children": len(node.get("children", []))})
    return doc, matches

def main():
    if not ARCHIVE.is_file():
        raise SystemExit(f"missing source archive: {ARCHIVE}")
    reports = []
    with ZipFile(ARCHIVE) as z:
        files = [m for m in z.infolist() if not m.is_dir() and m.filename.lower().endswith(".glb")]
        for m in files:
            doc, matches = inspect(m, z)
            title = Path(m.filename).name
            if not NAME.search(title) and not matches:
                continue
            reports.append({
                "file": m.filename, "bytes": m.file_size, "meshes": len(doc.get("meshes", [])),
                "materials": len(doc.get("materials", [])),
                "animations": len(doc.get("animations", [])),
                "namedNodes": matches[:110],
                "matchesTotal": len(matches),
                "preferredRifles": [x for x in matches if PREFERRED.search(x["name"])][:40],
            })
    print(f"Archive files: {len(files)}; named weapon/clothing donor packs: {len(reports)}")
    for r in reports:
        print("PACK", r["file"], "bytes", r["bytes"], "meshes", r["meshes"], "matches", r["matchesTotal"])
        for x in r["namedNodes"]:
            print("  NODE", x["id"], x["name"], "mesh", x["mesh"], "children", x["children"])
    print("READ-ONLY. No runtime or visual approval.")
    Path("warden-archive-audit.json").write_text(json.dumps(reports, indent=2) + "\n", encoding="utf8")

if __name__ == "__main__":
    main()
