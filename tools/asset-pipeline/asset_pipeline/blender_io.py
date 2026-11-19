"""Small file-format helpers that do not need Blender."""
from __future__ import annotations

from pathlib import Path

import numpy as np


def write_ply_points(path: Path, P, colours=None) -> None:
    P = np.asarray(P, np.float32)
    with open(path, "wb") as fh:
        hdr = ["ply", "format binary_little_endian 1.0", f"element vertex {len(P)}", "property float x", "property float y", "property float z"]
        if colours is not None:
            hdr += ["property uchar red", "property uchar green", "property uchar blue"]
        fh.write(("\n".join(hdr + ["end_header"]) + "\n").encode())
        if colours is None:
            fh.write(P.tobytes())
        else:
            dt = np.dtype([("p", "<f4", 3), ("c", "u1", 3)])
            a = np.empty(len(P), dt)
            a["p"] = P
            a["c"] = np.asarray(colours, np.uint8)
            fh.write(a.tobytes())


def read_ply_points(path: Path):
    import trimesh

    pc = trimesh.load(path, process=False)
    cols = None
    if hasattr(pc, "colors") and pc.colors is not None and len(pc.colors):
        cols = np.asarray(pc.colors)[:, :3]
    return np.asarray(pc.vertices), cols
