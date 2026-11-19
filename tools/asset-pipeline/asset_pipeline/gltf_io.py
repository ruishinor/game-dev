"""Minimal, dependency-free glTF 2.0 (GLB) reading and writing.

The writer builds exactly what the imported-humanoid workflow needs: one
node hierarchy, any number of (optionally skinned) triangle meshes sharing
one skin, PBR materials with embedded PNG textures, and linear/step
animation channels. Optimisation (WebP, Meshopt) is left to the existing
js/optimize.mjs recipe, so this file stays plain and easy to validate.
"""
from __future__ import annotations

import json
import struct
from pathlib import Path

import numpy as np

from .humanoid_analysis import _accessor, read_glb  # noqa: F401  (re-exported)

FLOAT, UINT, USHORT, UBYTE = 5126, 5125, 5123, 5121
ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER = 34962, 34963


def read_mesh(path, mesh=0, prim=0):
    """Positions, normals, uvs, indices of one primitive of a plain (uncompressed) GLB."""
    j, binbuf = read_glb(path)
    pr = j["meshes"][mesh]["primitives"][prim]
    a = pr["attributes"]
    out = {"positions": _accessor(j, binbuf, a["POSITION"]).astype(np.float32),
           "indices": _accessor(j, binbuf, pr["indices"]).astype(np.uint32).reshape(-1, 3)}
    if "NORMAL" in a:
        out["normals"] = _accessor(j, binbuf, a["NORMAL"]).astype(np.float32)
    if "TEXCOORD_0" in a:
        out["uvs"] = _accessor(j, binbuf, a["TEXCOORD_0"]).astype(np.float32)
    return out


class GlbWriter:
    def __init__(self, generator="attunement asset_pipeline"):
        self.j = {"asset": {"version": "2.0", "generator": generator}, "scene": 0, "scenes": [{"nodes": []}],
                  "nodes": [], "meshes": [], "accessors": [], "bufferViews": [], "buffers": [],
                  "materials": [], "textures": [], "images": [], "samplers": [], "skins": [], "animations": []}
        self.bin = bytearray()

    # -- raw data ---------------------------------------------------------
    def _view(self, data: bytes, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        bv = {"buffer": 0, "byteOffset": len(self.bin), "byteLength": len(data)}
        if target:
            bv["target"] = target
        self.bin.extend(data)
        self.j["bufferViews"].append(bv)
        return len(self.j["bufferViews"]) - 1

    def accessor(self, arr, ctype, atype, target=None, minmax=False, normalized=False):
        arr = np.ascontiguousarray(arr)
        dt = {FLOAT: np.float32, UINT: np.uint32, USHORT: np.uint16, UBYTE: np.uint8}[ctype]
        arr = arr.astype(dt)
        acc = {"bufferView": self._view(arr.tobytes(), target), "componentType": ctype,
               "count": int(arr.shape[0]), "type": atype}
        if normalized:
            acc["normalized"] = True
        if minmax:
            flat = arr.reshape(arr.shape[0], -1)
            acc["min"] = flat.min(0).tolist()
            acc["max"] = flat.max(0).tolist()
        self.j["accessors"].append(acc)
        return len(self.j["accessors"]) - 1

    # -- scene ------------------------------------------------------------
    def node(self, name, parent=None, t=None, r=None, s=None, **extra):
        n = {"name": name}
        if t is not None and np.any(np.abs(np.asarray(t)) > 0):
            n["translation"] = [float(v) for v in t]
        if r is not None and not np.allclose(r, [0, 0, 0, 1]):
            n["rotation"] = [float(v) for v in r]
        if s is not None and not np.allclose(s, [1, 1, 1]):
            n["scale"] = [float(v) for v in s]
        n.update(extra)
        self.j["nodes"].append(n)
        i = len(self.j["nodes"]) - 1
        if parent is None:
            self.j["scenes"][0]["nodes"].append(i)
        else:
            self.j["nodes"][parent].setdefault("children", []).append(i)
        return i

    def image(self, png_bytes: bytes, name):
        self.j["images"].append({"name": name, "mimeType": "image/png", "bufferView": self._view(png_bytes)})
        if not self.j["samplers"]:
            self.j["samplers"].append({"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497})
        self.j["textures"].append({"source": len(self.j["images"]) - 1, "sampler": 0, "name": name})
        return len(self.j["textures"]) - 1

    def material(self, name, *, base=None, orm=None, normal=None, emissive=None, emissive_factor=(0, 0, 0),
                 base_factor=(1, 1, 1, 1), metallic=1.0, roughness=1.0, double_sided=False):
        pbr = {"baseColorFactor": list(base_factor), "metallicFactor": metallic, "roughnessFactor": roughness}
        if base is not None:
            pbr["baseColorTexture"] = {"index": base}
        if orm is not None:
            pbr["metallicRoughnessTexture"] = {"index": orm}
        m = {"name": name, "pbrMetallicRoughness": pbr}
        if orm is not None:
            m["occlusionTexture"] = {"index": orm}
        if normal is not None:
            m["normalTexture"] = {"index": normal}
        if emissive is not None:
            m["emissiveTexture"] = {"index": emissive}
            m["emissiveFactor"] = list(emissive_factor)
        if double_sided:
            m["doubleSided"] = True
        self.j["materials"].append(m)
        return len(self.j["materials"]) - 1

    def mesh(self, name, positions, indices, *, normals=None, uvs=None, joints=None, weights=None, material=None):
        attrs = {"POSITION": self.accessor(positions, FLOAT, "VEC3", ARRAY_BUFFER, minmax=True)}
        if normals is not None:
            n = np.asarray(normals, np.float32)
            n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
            attrs["NORMAL"] = self.accessor(n, FLOAT, "VEC3", ARRAY_BUFFER)
        if uvs is not None:
            attrs["TEXCOORD_0"] = self.accessor(uvs, FLOAT, "VEC2", ARRAY_BUFFER)
        if joints is not None:
            attrs["JOINTS_0"] = self.accessor(joints, USHORT if np.max(joints) > 255 else UBYTE, "VEC4", ARRAY_BUFFER)
            w = np.asarray(weights, np.float32)
            w = w / np.maximum(w.sum(1, keepdims=True), 1e-12)
            attrs["WEIGHTS_0"] = self.accessor(w, FLOAT, "VEC4", ARRAY_BUFFER)
        idx = np.asarray(indices).reshape(-1)
        ctype = UINT if idx.max() > 65535 else USHORT
        prim = {"attributes": attrs, "indices": self.accessor(idx, ctype, "SCALAR", ELEMENT_ARRAY_BUFFER), "mode": 4}
        if material is not None:
            prim["material"] = material
        self.j["meshes"].append({"name": name, "primitives": [prim]})
        return len(self.j["meshes"]) - 1

    def skin(self, name, joints, inverse_bind, skeleton=None):
        # glTF matrices are column-major: flatten each matrix transposed
        ibm = np.asarray(inverse_bind, np.float32).reshape(-1, 4, 4).transpose(0, 2, 1).reshape(-1, 16)
        s = {"name": name, "joints": list(joints), "inverseBindMatrices": self.accessor(ibm, FLOAT, "MAT4")}
        if skeleton is not None:
            s["skeleton"] = skeleton
        self.j["skins"].append(s)
        return len(self.j["skins"]) - 1

    def animation(self, name, channels):
        """channels: [(node, path, times, values, interpolation)]"""
        samplers, chans = [], []
        for node, path, times, values, interp in channels:
            t = self.accessor(np.asarray(times, np.float32).reshape(-1, 1), FLOAT, "SCALAR", minmax=True)
            comp = {"translation": "VEC3", "rotation": "VEC4", "scale": "VEC3"}[path]
            v = self.accessor(np.asarray(values, np.float32).reshape(len(times), -1), FLOAT, comp)
            samplers.append({"input": t, "output": v, "interpolation": interp})
            chans.append({"sampler": len(samplers) - 1, "target": {"node": node, "path": path}})
        self.j["animations"].append({"name": name, "samplers": samplers, "channels": chans})

    def write(self, path):
        j = {k: v for k, v in self.j.items() if v != []}
        while len(self.bin) % 4:
            self.bin.append(0)
        j["buffers"] = [{"byteLength": len(self.bin)}]
        js = json.dumps(j, separators=(",", ":")).encode()
        js += b" " * ((4 - len(js) % 4) % 4)
        total = 12 + 8 + len(js) + 8 + len(self.bin)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as f:
            f.write(struct.pack("<III", 0x46546C67, 2, total))
            f.write(struct.pack("<II", len(js), 0x4E4F534A))
            f.write(js)
            f.write(struct.pack("<II", len(self.bin), 0x004E4942))
            f.write(bytes(self.bin))
        return total


def png_bytes(rgb, path_hint=None):
    import cv2

    a = np.clip(np.asarray(rgb), 0, 1)
    ok, buf = cv2.imencode(".png", (a * 255 + 0.5).astype(np.uint8)[..., ::-1])
    if not ok:
        raise RuntimeError("png encode failed")
    return buf.tobytes()
