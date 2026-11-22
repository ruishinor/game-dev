#!/usr/bin/env python3
"""Inspect owner-supplied GLB archive WITHOUT promoting source meshes into gameplay.

Outputs mechanical/rigging *candidates*, not approved appearances or licences.
This is a read-only, streaming GLB JSON-chunk audit; source ZIP stays unmodified.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import struct
import zipfile

ARCHIVE = Path("assets/source-archives/glb-low-poly-models-building-blocks.zip")
HUMAN_WORDS = re.compile(r"human|humanoid|person|people|npc|character|avatar|villag|worker|citizen|soldier|warrior|mage|knight|guard|male|female|woman|man|pilot|adventur|explorer", re.I)
JOINT_WORDS = re.compile(r"(^|[^a-z])(hip|pelvis|spine|neck|head|arm|hand|leg|knee|foot|shoulder)([^a-z]|$)", re.I)
IGNORE_ROLE_WORDS = re.compile(r"halo.?construct|severance.?soldier", re.I)
MAX_JSON = 24 * 1024 * 1024


def glb_metadata(stream, size: int) -> dict:
    header = stream.read(20)
    if len(header) != 20:
        raise ValueError("truncated GLB header")
    magic, version, length, json_length, chunk_type = struct.unpack("<4s4I", header)
    if magic != b"glTF" or version != 2 or chunk_type != 0x4E4F534A:
        raise ValueError("not a glTF 2.0 binary with leading JSON chunk")
    if length > size or json_length > MAX_JSON or json_length + 20 > length:
        raise ValueError("GLB JSON length outside allowable bounds")
    payload = stream.read(json_length)
    if len(payload) != json_length:
        raise ValueError("truncated GLB JSON")
    return json.loads(payload)


def describe(path: str, doc: dict, size: int) -> dict:
    nodes = doc.get("nodes", [])
    meshes = doc.get("meshes", [])
    skins = doc.get("skins", [])
    anims = doc.get("animations", [])
    accessors = doc.get("accessors", [])
    materials = doc.get("materials", [])
    textures = doc.get("textures", [])
    joints = {j for skin in skins for j in skin.get("joints", []) if isinstance(j, int) and 0 <= j < len(nodes)}
    joint_names = [str(nodes[j].get("name", "")) for j in joints]
    names = [str(node.get("name", "")) for node in nodes]
    name_text = " ".join([path, *names[:160]])
    joint_tokens = sum(bool(JOINT_WORDS.search(name)) for name in joint_names)
    raw_score = sum(bool(re.search(token, name_text, re.I)) for token in [
        r"humanoid|human|person|character|avatar",
        r"npc|villag|citizen|worker|explorer",
        r"male|female|woman|man|adventur",
        r"head", r"spine", r"pelvis|hips", r"arm|hand", r"leg|foot",
    ])
    score = min(9, raw_score + min(2, joint_tokens // 4))
    primitives = [p for mesh in meshes for p in mesh.get("primitives", [])]
    triangles = 0
    mesh_names = [str(mesh.get("name", "")) for mesh in meshes][:18]
    no_normal = 0
    no_uv = 0
    for prim in primitives:
        attrs = prim.get("attributes", {})
        if "NORMAL" not in attrs:
            no_normal += 1
        if "TEXCOORD_0" not in attrs:
            no_uv += 1
        mode = prim.get("mode", 4)
        idx = prim.get("indices")
        attr = attrs.get("POSITION")
        accessor_id = idx if isinstance(idx, int) else attr
        if mode == 4 and isinstance(accessor_id, int) and accessor_id < len(accessors):
            triangles += accessors[accessor_id].get("count", 0) // 3
    # An animation doesn't automatically prove skin compatibility: it may move
    # a rigid prop. Likewise, a skin is not proof of a human-compatible rig.
    if skins and joint_tokens >= 4 and score >= 4:
        bucket = "rigged-humanoid-candidate"
    elif skins:
        bucket = "other-skinned-candidate"
    elif HUMAN_WORDS.search(name_text):
        bucket = "unrigged-humanoid-reference"
    else:
        bucket = "other-source-block"
    excluded = bool(IGNORE_ROLE_WORDS.search(name_text))
    if excluded:
        bucket = "excluded-protected-role"
    return {
        "source": path, "bytes": size, "category": bucket,
        "score": score, "nodes": len(nodes), "meshes": len(meshes), "mesh_names": mesh_names,
        "triangles_estimated": triangles, "skins": len(skins), "joints": len(joints),
        "humanoid_joint_names": joint_tokens,
        "animations": len(anims), "materials": len(materials), "textures": len(textures),
        "primitives_missing_normals": no_normal, "primitives_missing_uv0": no_uv,
        "candidate_for_direct_runtime_use": False,
    }


def run(archive: Path, output: Path) -> dict:
    if not archive.is_file():
        raise FileNotFoundError(f"source archive not present: {archive}")
    records = []
    checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
    with zipfile.ZipFile(archive) as z:
        for member in sorted(z.infolist(), key=lambda m: m.filename):
            if not member.filename.lower().endswith(".glb") or member.is_dir():
                continue
            try:
                with z.open(member) as source:
                    doc = glb_metadata(source, member.file_size)
                row = describe(member.filename, doc, member.file_size)
            except Exception as exc:
                row = {"source": member.filename, "bytes": member.file_size, "category": "invalid",
                       "error": str(exc), "candidate_for_direct_runtime_use": False}
            records.append(row)
    sorted_rows = sorted(records, key=lambda r: (r.get("category") != "rigged-humanoid-candidate",
                                                  -r.get("score", 0), r["source"].lower()))
    report = {"archive": str(archive), "sha256": checksum, "models_examined": len(records),
              "status": "SOURCE STUDY ONLY — no derivative is visually approved or shipped",
              "models": sorted_rows}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Inspected {len(records)} archive GLBs; SHA-256 {checksum}")
    for k in sorted(set(r["category"] for r in records)):
        print(f"{k}: {sum(r['category'] == k for r in records)}")
    print("\nRigged humanoid and human-shaped donor candidates:")
    for row in sorted_rows:
        if row["category"] in ("rigged-humanoid-candidate", "unrigged-humanoid-reference"):
            print(f"  [{row['category']}] {row['source']} | skins={row['skins']} "
                  f"joints={row['joints']} clips={row['animations']} "
                  f"tris~{row['triangles_estimated']} score={row['score']}")
    print(f"Full mechanical inventory: {output}")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, default=ARCHIVE)
    parser.add_argument("--output", type=Path, default=Path("artifacts/archive-character-candidates.json"))
    args = parser.parse_args()
    run(args.archive, args.output)
