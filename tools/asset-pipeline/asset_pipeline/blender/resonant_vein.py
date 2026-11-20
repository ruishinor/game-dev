"""Resonant shard vein: a gatherable outcrop in the Severance Expanse.

A weathered basalt outcrop (overlapping sharp convex hulls with eroded tops and
a ring of half-buried scree) split open by a cluster of resonance crystals:
hexagonal prisms with faceted tips, leaning out of the split at varied angles
and sizes, plus small loose shards. The rock uses the Phase Scar bake (palette,
fields, cracks, edges, AO, detail bump -> one atlas). The crystals are a
separate child object, RV_Crystal, whose material the runtime replaces with a
resonance shader; its UV v runs base -> tip and u carries a per-crystal seed.
Blender axes: -y front, z up; origin on the ground at the cluster centre.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import bpy  # noqa: I001
import bmesh
import numpy as np
from mathutils import Vector, Matrix

from asset_pipeline.blender import severance_gate as sg
from asset_pipeline.blender import outpost_shelter as osh
from asset_pipeline.blender import phase_scar as ps
from asset_pipeline.blender.common import finish, payload

rng = np.random.default_rng(3301)


def outcrop(b_names):
    parts = []
    spec = [  # x, y, z, size (x, y, z), seed
        (0.0, 0.25, 0.25, (1.7, 1.3, 1.2), 11), (-0.75, -0.1, 0.18, (1.1, 1.0, 0.8), 12), (0.8, 0.05, 0.2, (1.2, 1.1, 0.95), 13),
        (0.15, 0.85, 0.3, (1.3, 0.9, 1.4), 14), (-0.5, 0.75, 0.1, (0.9, 0.8, 0.7), 15),
    ]
    for i, (x, y, z, size, seed) in enumerate(spec):
        size = tuple(c * 1.3 for c in size)
        o = sg.convex_rock(f"_rock{i}", size, seed, flat=0.25, sharp=True)
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=1, use_grid_fill=True)
        for v in bm.verts:  # erode: push surface by layered noise, flatten under ground
            n = ps.fbm((v.co.x * 2.2 + seed, v.co.y * 2.2, v.co.z * 2.2), 4, seed) - 0.5
            v.co += v.co.normalized() * n * 0.12 * max(size)
        bmesh.ops.translate(bm, verts=bm.verts, vec=(x * 1.2, y * 1.2, z * 1.2))
        layer = bm.faces.layers.int.new("pal")
        for f in bm.faces:
            f[layer] = b_names.index("basalt" if i % 2 == 0 else "stone")
        bm.to_mesh(o.data)
        bm.free()
        parts.append(o)
    for i in range(16):  # scree ring
        a = rng.uniform(0, 2 * math.pi)
        r = rng.uniform(1.0, 1.65)
        s = rng.uniform(0.12, 0.3)
        o = sg.convex_rock(f"_scree{i}", (s * 1.3, s, s * 0.7), 500 + i, sharp=True)
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(rng.uniform(0, 6.28), 3, "Z"))
        bmesh.ops.translate(bm, verts=bm.verts, vec=(math.cos(a) * r, math.sin(a) * r * 0.9 + 0.2, s * 0.15))
        layer = bm.faces.layers.int.new("pal")
        for f in bm.faces:
            f[layer] = b_names.index("scorch" if i % 4 == 0 else "basalt")
        bm.to_mesh(o.data)
        bm.free()
        parts.append(o)
    return parts


def crystal(bm, uv, base, axis, length, radius, seed):
    """Hexagonal prism with a faceted, slightly off-centre tip. UV v: 0 base -> 1 tip; u: seed."""
    axis = Vector(axis).normalized()
    u_ = axis.cross(Vector((0, 0, 1)))
    if u_.length < 1e-3:
        u_ = Vector((1, 0, 0))
    u_.normalize()
    v_ = axis.cross(u_).normalized()
    sides = 6
    shoulder = length * rng.uniform(0.72, 0.84)
    tip = Vector(base) + axis * length + (u_ * rng.uniform(-0.15, 0.15) + v_ * rng.uniform(-0.15, 0.15)) * radius
    rings = []
    for h, k in ((-0.25, 1.0), (shoulder * 0.5, 1.04), (shoulder, 0.96)):
        ring = []
        for j in range(sides):
            a = j / sides * 2 * math.pi + seed
            jit = 1 + rng.uniform(-0.06, 0.06)
            ring.append(bm.verts.new(Vector(base) + axis * h + (u_ * math.cos(a) + v_ * math.sin(a)) * radius * k * jit))
        rings.append((ring, (h + 0.25) / (length + 0.25)))
    tv = bm.verts.new(tip)
    faces = []
    for (r0, t0), (r1, t1) in zip(rings, rings[1:]):
        for j in range(sides):
            k = (j + 1) % sides
            f = bm.faces.new((r0[j], r0[k], r1[k], r1[j]))
            faces.append((f, [t0, t0, t1, t1]))
    last, tl = rings[-1]
    for j in range(sides):
        k = (j + 1) % sides
        f = bm.faces.new((last[j], last[k], tv))
        faces.append((f, [tl, tl, 1.0]))
    s = (seed % 1.0)
    for f, vs in faces:
        for loop, v in zip(f.loops, vs):
            loop[uv].uv = (s, v)


def crystals():
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    spec = []
    # the main cluster rising from the split, fanning outward
    for i in range(9):
        a = i / 9 * 2 * math.pi + rng.uniform(-0.3, 0.3)
        lean = rng.uniform(0.15, 0.55) if i else 0.05
        L = rng.uniform(0.9, 1.6) if i else 2.05
        R = L * rng.uniform(0.11, 0.15)
        base = (math.cos(a) * 0.22, 0.4 + math.sin(a) * 0.18, 0.75)
        axis = (math.cos(a) * math.sin(lean), math.sin(a) * math.sin(lean), math.cos(lean))
        spec.append((base, axis, L, R))
    # side growths out of the flanking rocks
    for (x, y, z, n) in ((-0.8, -0.05, 0.45, 3), (0.85, 0.1, 0.5, 3), (0.2, 0.9, 0.7, 2)):
        for i in range(n):
            a = rng.uniform(0, 2 * math.pi)
            lean = rng.uniform(0.35, 0.85)
            L = rng.uniform(0.45, 0.95)
            spec.append(((x + math.cos(a) * 0.12, y + math.sin(a) * 0.12, z), (math.cos(a) * math.sin(lean), math.sin(a) * math.sin(lean), math.cos(lean)), L, L * 0.13))
    # loose shards on the ground
    for i in range(7):
        a = rng.uniform(0, 2 * math.pi)
        r = rng.uniform(0.9, 1.5)
        L = rng.uniform(0.18, 0.35)
        spec.append(((math.cos(a) * r, math.sin(a) * r + 0.2, 0.05), (math.cos(a), math.sin(a), 0.35), L, L * 0.2))
    for i, (base, axis, L, R) in enumerate(spec):
        crystal(bm, uv, base, axis, L, R, (i * 0.618034) % 1.0 + 0.001)
    return sg.bm_to_obj("RV_Crystal", bm)


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
    sc.name = "ResonantVein"
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.world = bpy.data.worlds.new("w")
    b = ps.PB()
    parts = outcrop(b.names)
    for o in parts:
        ps.palette_attrs(o, b.names)
    o = sg.join(parts, "ResonantVein")
    sg.shade(o, 40)
    cr = crystals()
    sg.shade(cr, 20)
    size = int(p.get("bake", 1024))
    quick = bool(p.get("quick"))
    sg.unwrap(o, 0.003)
    base, _ = sg.bake_image(o, osh.attr_material("_base", "Base"), "EMIT", size, 1, "_base")
    props, _ = sg.bake_image(o, osh.attr_material("_props", "Props"), "EMIT", size, 1, "_props")
    fields, _ = sg.bake_image(o, sg.field_material("_fields", "fields"), "EMIT", size, 1, "_fields")
    cracks, _ = sg.bake_image(o, sg.field_material("_cracks", "cracks"), "EMIT", size, 1, "_cracks")
    edges, _ = sg.bake_image(o, sg.field_material("_edges", "edges"), "EMIT", size, 4 if quick else 10, "_edges")
    sc.world.light_settings.distance = 0.6
    ao, _ = sg.bake_image(o, sg.field_material("_ao", "fields"), "AO", size, 8 if quick else 32, "_ao")
    edges[..., 0] = sg.blur(edges[..., 0], 1)
    nrm, _ = sg.bake_image(o, ps.detail_bump_material("_bump"), "NORMAL", int(p.get("normal", 1024)), 1, "_normal")
    heat = np.zeros_like(fields)
    albedo, rough, occ, metal = ps.composite(base, props, fields, cracks, edges, ao, heat)
    maps = {"albedo": work / "vein_albedo.png", "orm": work / "vein_orm.png", "normal": work / "vein_normal.png"}
    sg.save_png(maps["albedo"], albedo, srgb=True)
    sg.save_png(maps["orm"], np.stack([occ, rough, metal], -1))
    sg.save_png(maps["normal"], nrm)
    mat = sg.final_stone_material("RV_Rock", maps)
    o.data.materials.clear()
    o.data.materials.append(mat)
    cr.data.materials.clear()
    cr.data.materials.append(sg.emissive_material("RV_Crystal", (0.55, 0.85, 1.0), 2.0, base=(0.1, 0.15, 0.25)))
    cr.parent = o
    for x in list(sc.collection.objects):
        if x not in (o, cr):
            sc.collection.objects.unlink(x)
    if o.data.attributes.get("pal"):
        o.data.attributes.remove(o.data.attributes["pal"])
    for a in ("Base", "Props"):
        if o.data.color_attributes.get(a):
            o.data.color_attributes.remove(o.data.color_attributes[a])
    sg.triangulate_all()
    metrics = {"tris": sg.tri_count(o), "crystal_tris": sg.tri_count(cr)}
    (work / "vein-metrics.json").write_text(json.dumps(metrics, indent=1))
    bpy.ops.wm.save_as_mainfile(filepath=str(work / "resonant_vein.blend"))
    glb = work / "resonant_vein_raw.glb"
    sg.export_glb(glb)
    finish(p, {"glb": str(glb), "metrics": metrics})


if __name__ == "__main__":
    main()
