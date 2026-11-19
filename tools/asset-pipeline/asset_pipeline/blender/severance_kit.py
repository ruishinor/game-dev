"""Severance Expanse environment kit: the colossal ring, eroded spires, mineral
crystal clusters and boulders. Same method and materials as the Severance Gate
(severance_gate.py): authored geometry, unique atlas unwrap, Cycles bakes of the
procedural fields, numpy composite, tangent-space normals, GLB export.

Every piece sits at the origin on its own node (base at z = 0) so the runtime can
instance it. Scene "Kit".
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import bpy  # noqa: I001
import bmesh
import numpy as np
from mathutils import Vector

from asset_pipeline.blender import severance_gate as sg
from asset_pipeline.blender.common import finish, payload

rng = np.random.default_rng(2207)


def spire(name, height, r0, seed):
    """An eroded, stratified rock spire: stacked rings with ledges and lean."""
    r = np.random.default_rng(seed)
    sides, rings = 11, 22
    bm = bmesh.new()
    loops = []
    lean = Vector((r.normal(0, 0.06), r.normal(0, 0.06), 0))
    phase = r.uniform(0, 6.28, 3)
    for k in range(rings + 1):
        t = k / rings
        z = height * t
        base = r0 * (1.0 - 0.62 * t ** 1.15) * (1 + 0.12 * math.sin(t * 9 + phase[0]))
        ledge = 1 + 0.07 * (1 if (k % 4) in (0, 1) else -1)       # strata ledges
        ring = []
        for i in range(sides):
            a = i / sides * 2 * math.pi
            rr = base * ledge * (1 + 0.16 * math.sin(a * 3 + phase[1] + t * 4) + 0.08 * math.sin(a * 5 + phase[2]) + r.normal(0, 0.035))
            ring.append(bm.verts.new((math.cos(a) * rr + lean.x * z, math.sin(a) * rr + lean.y * z, z)))
        loops.append(ring)
    for k in range(rings):
        for i in range(sides):
            j = (i + 1) % sides
            bm.faces.new((loops[k][i], loops[k][j], loops[k + 1][j], loops[k + 1][i]))
    top = bm.verts.new((lean.x * height + r.normal(0, 0.2), lean.y * height, height + r0 * 0.35))
    for i in range(sides):
        bm.faces.new((loops[-1][i], loops[-1][(i + 1) % sides], top))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = sg.bm_to_obj(name, bm)
    return o


def crystal_cluster(name, seed, size):
    """Hexagonal mineral prisms rising from a rock base."""
    r = np.random.default_rng(seed)
    rock = sg.convex_rock(name + "_base", (size * 1.6, size * 1.3, size * 0.7), seed, flat=0.5)
    shards = []
    for k in range(r.integers(6, 10)):
        L = size * r.uniform(1.0, 2.8)
        rad = size * r.uniform(0.12, 0.26)
        bm = bmesh.new()
        ring0 = [bm.verts.new((math.cos(a) * rad, math.sin(a) * rad, 0)) for a in np.linspace(0, 2 * math.pi, 7)[:-1]]
        ring1 = [bm.verts.new((math.cos(a) * rad * 0.92, math.sin(a) * rad * 0.92, L * 0.78)) for a in np.linspace(0, 2 * math.pi, 7)[:-1]]
        tip = bm.verts.new((0, 0, L))
        for i in range(6):
            j = (i + 1) % 6
            bm.faces.new((ring0[i], ring0[j], ring1[j], ring1[i]))
            bm.faces.new((ring1[i], ring1[j], tip))
        bm.faces.new(list(reversed(ring0)))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        o = sg.bm_to_obj(f"_shard{k}", bm)
        tilt = r.uniform(0.05, 0.75)
        o.rotation_euler = (tilt * math.cos(k * 2.3), tilt * math.sin(k * 2.3), r.uniform(0, 6.28))
        o.location = (r.normal(0, size * 0.3), r.normal(0, size * 0.3), size * 0.1)
        sg.apply_transform(o)
        shards.append(o)
    return rock, sg.join(shards, name + "_shards")


def colossal_ring(name, radius, tube, gap0, gap1, sink=0.22):
    """Voussoir blocks of gate-builder stone on a vertical ring (x-z plane), sunk
    `sink` of its diameter into the ground and broken between gap0 and gap1
    (fractions of a turn from the top, clockwise seen from -y). Fallen voussoirs
    lie below the break. A channel of inlay runs on the inner face."""
    blocks = []
    n = 44
    inlay = {"verts": [], "faces": [], "uvs": []}
    cz0 = radius * (1 - 2 * sink)
    seg = 2 * math.pi * radius / n
    for k in range(n):
        f0, f1 = k / n, (k + 1) / n
        mid = (f0 + f1) / 2
        if gap0 <= mid <= gap1:
            continue
        a = math.pi / 2 - mid * 2 * math.pi
        cx, cz = math.cos(a) * radius, math.sin(a) * radius + cz0
        if cz < -tube * 0.6:
            continue
        b = sg.chamfer_box("_v", (cx, 0, cz), (tube * 0.62, tube * 0.95, seg / 2 - 0.06), 0.1, (0, -(a + math.pi / 2), 0), jitter=0.012)
        if rng.random() < 0.2:
            b.location = (rng.normal(0, 0.06), rng.normal(0, 0.14), rng.normal(0, 0.05))
            sg.apply_transform(b)
        blocks.append(b)
        if cz > 0.3:
            ri = radius - tube * 0.63
            p0 = Vector((math.cos(a + math.pi / n) * ri, 0, math.sin(a + math.pi / n) * ri + cz0))
            p1 = Vector((math.cos(a - math.pi / n) * ri, 0, math.sin(a - math.pi / n) * ri + cz0))
            sg.strip(inlay, p0, p1, (Vector((0, 0, cz0)) - (p0 + p1) / 2).normalized(), 0.09, mid, mid + 1 / n)
    # fallen voussoirs and rubble below the break
    fall = math.pi / 2 - (gap0 + gap1) * math.pi
    fx = math.cos(fall) * radius * 1.05
    for k in range(5):
        b = sg.chamfer_box(f"_fall{k}", (fx + rng.normal(0, 2.4), rng.normal(0, 2.6), tube * 0.45), (tube * 0.62, tube * 0.95, seg / 2 - 0.06), 0.1,
                           (rng.uniform(-0.5, 0.5), rng.uniform(1.0, 1.6) * (1 if k % 2 else -1), rng.uniform(0, 6.28)), jitter=0.02)
        b.location.z = -tube * 0.25
        sg.apply_transform(b)
        blocks.append(b)
    for k in range(9):
        d = sg.convex_rock(f"_rub{k}", tuple(rng.uniform(0.5, 1.3, 3)), int(rng.integers(1e9)), flat=0.4)
        d.location = (fx + rng.normal(0, 3.5), rng.normal(0, 3.5), 0.25)
        sg.apply_transform(d)
        blocks.append(d)
    body = sg.join(blocks, name)
    ch = sg.from_dict(name + "_Channel", inlay, None)
    return body, ch


def main():
    p = payload()
    work = Path(p["work"])
    work.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        bpy.ops.preferences.addon_enable(module="cycles")
    except Exception:
        pass
    sc = bpy.context.scene
    sc.name = "Kit"
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.world = bpy.data.worlds.new("w")
    stone, emissive, crystals = [], [], []
    ring, ring_ch = colossal_ring("Ring_Colossal", 16.0, 2.6, 0.06, 0.2)
    stone.append(ring)
    emissive.append(ring_ch)
    for i, (h, r0) in enumerate([(18, 3.6), (24, 4.0), (30, 4.6)]):
        stone.append(spire(f"Spire_{'ABC'[i]}", h, r0, 50 + i))
    for i, s in enumerate([1.0, 1.4, 1.9]):
        base, shards = crystal_cluster(f"Crystal_{'ABC'[i]}", 70 + i, s)
        base.name = f"Crystal_{'ABC'[i]}"
        stone.append(base)
        crystals.append(shards)
    for i in range(4):
        b = sg.convex_rock(f"Boulder_{'ABCD'[i]}", tuple(rng.uniform([2.2, 1.8, 1.4], [3.6, 3.0, 2.6])), 90 + i, flat=0.35)
        b.location.z = 0.6
        sg.apply_transform(b)
        stone.append(b)
    for o in stone + crystals:
        sg.drop_bottom_faces(o, 0.05)
        sg.shade(o, 34)
    # one stone atlas for every stone piece (same composite as the gate base)
    copies = []
    for idx, o in enumerate(stone):
        c = o.copy()
        c.data = o.data.copy()
        sc.collection.objects.link(c)
        copies.append(c)
    atlas = sg.join(copies, "_atlas")
    sg.unwrap(atlas, 0.002)
    size = int(p.get("bake", 2048))
    maps = sg.bake_stone(atlas, "kit", size, int(p.get("normal", 2048)), work, bool(p.get("quick")))
    uv0 = np.empty(len(atlas.data.loops) * 2, np.float32)
    atlas.data.uv_layers["UVMap"].data.foreach_get("uv", uv0)
    uv1 = np.empty(len(atlas.data.loops) * 2, np.float32)
    atlas.data.uv_layers["UVDetail"].data.foreach_get("uv", uv1)
    start = 0
    for o in stone:
        nl = len(o.data.loops)
        while o.data.uv_layers:
            o.data.uv_layers.remove(o.data.uv_layers[0])
        o.data.uv_layers.new(name="UVMap").data.foreach_set("uv", uv0[start * 2:(start + nl) * 2])
        o.data.uv_layers.new(name="UVDetail").data.foreach_set("uv", uv1[start * 2:(start + nl) * 2])
        start += nl
    sg.delete([atlas])
    mat = sg.final_stone_material("SG_Stone_Kit", maps)
    for o in stone:
        o.data.materials.clear()
        o.data.materials.append(mat)
    m_ch = sg.emissive_material(sg.CHANNEL, (1.0, 0.44, 0.1), 1.2, (0.12, 0.06, 0.02))
    for o in emissive:
        o.data.materials.clear()
        o.data.materials.append(m_ch)
    m_cr = sg.emissive_material("SG_Crystal", (1.0, 0.55, 0.18), 0.6, (0.32, 0.18, 0.08))
    for o in crystals:
        o.data.materials.clear()
        o.data.materials.append(m_cr)
        o.data.uv_layers.new(name="UVMap")
    # crystal shards ride on their base nodes
    for base, shards in zip([o for o in stone if o.name.startswith("Crystal_")], crystals):
        shards.parent = base
    for o in list(sc.collection.objects):
        if o not in stone + emissive + crystals:
            sc.collection.objects.unlink(o)
    ring_ch.parent = ring
    metrics = {o.name: sg.tri_count(o) for o in stone + emissive + crystals}
    (work / "kit-metrics.json").write_text(json.dumps(metrics, indent=1))
    sg.triangulate_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(work / "severance_kit.blend"))
    glb = work / "severance_kit_raw.glb"
    sg.export_glb(glb)
    finish(p, {"glb": str(glb), "metrics": metrics})


if __name__ == "__main__":
    main()
