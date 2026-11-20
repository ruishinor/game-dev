"""Hard-surface armour builder (Blender as a Python module, CPU only).

Turns the authored plate sheets of a body-fitted-armour design into game
armour with the Severance Gate's methods:

* every plate sheet is solidified, its grooves and through-holes are carved
  with EXACT booleans, and its edges are chamfered (bevel, harden normals);
* bolts, slats and the anchor soles are modelled as small solids;
* every carved groove gets an emissive inlay strip whose UV.x is the flow
  distance from the set's energy source (the runtime animates pulses along
  it), UV.y runs across the channel;
* per item, all plates are joined, unwrapped and baked: AO against the body,
  a convex-edge field (Bevel-node normal against the true normal), cavity,
  three noise scales, a material-id map and a detail normal (rounded edges,
  brushed metal, micro scratches); a numpy composite gives base colour,
  roughness and metallic per material.

payload: work, out, pieces_npz, pieces_json, body_npz, materials{name: spec},
         texture{item: size}, samples, result
writes:  <item>.npz (P, N, UV, I, piece for the plates; FX_* for the inlays),
         <item>_{basecolor,roughness,metallic,normal}.png, armour_<key>_source.blend
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import bpy  # noqa: I001
import bmesh
import numpy as np
from mathutils import Vector

from asset_pipeline.blender.common import finish, payload, reset_scene
from asset_pipeline.blender.severance_gate import (blur, boolean, delete, fix_normals, join, mesh_obj, node, prism, save_png, smoothstep,
                                                    srgb_to_lin)

G2B = lambda P: np.c_[P[:, 0], -P[:, 2], P[:, 1]]  # glTF (y up) -> Blender (z up)
B2G = lambda P: np.c_[P[:, 0], P[:, 2], -P[:, 1]]


def v3(p):
    p = np.asarray(p, float)
    return Vector((p[0], -p[2], p[1]))


def solidify(o, thickness):
    m = o.modifiers.new("solid", "SOLIDIFY")
    m.thickness = thickness
    m.offset = 1.0
    m.use_rim = True
    m.use_even_offset = False
    m.use_quality_normals = True
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=m.name)


def bevel(o, width, segments, angle=32):
    if width <= 0 or segments <= 0:
        return
    m = o.modifiers.new("bevel", "BEVEL")
    m.width = width
    m.segments = segments
    m.limit_method = "ANGLE"
    m.angle_limit = math.radians(angle)
    m.profile = 0.6
    m.use_clamp_overlap = True
    m.harden_normals = True
    m.miter_outer = "MITER_ARC"
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=m.name)


def planar(o, angle=2.5):
    """Merge near-coplanar faces (sheet subdivisions, carved floors): the
    rounding lives in the baked normal, not in triangles."""
    m = o.modifiers.new("planar", "DECIMATE")
    m.decimate_type = "DISSOLVE"
    m.angle_limit = math.radians(angle)
    m.delimit = {"UV"} if o.data.uv_layers else set()
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=m.name)


def smooth_by_angle(o, angle=34):
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle), keep_sharp_edges=True)
    except Exception:
        bpy.ops.object.shade_smooth()


def strip_prism(name, pts, nrm, width, depth):
    """Cutter along a polyline on a surface: a swept box (above the top face to
    `depth` below it), extended past both ends by half the width."""
    P = np.asarray(pts, float)
    N = np.asarray(nrm, float)
    if len(P) > 3 and np.linalg.norm(P[0] - P[-1]) < 1e-6:
        return loop_prism(name, P[:-1], N[:-1], width, depth)
    T = np.gradient(P, axis=0)
    T /= np.maximum(np.linalg.norm(T, axis=1, keepdims=True), 1e-9)
    P = P.copy()
    P[0] -= T[0] * width * 0.5
    P[-1] += T[-1] * width * 0.5
    S = np.cross(N, T)
    S /= np.maximum(np.linalg.norm(S, axis=1, keepdims=True), 1e-9)
    h = width / 2
    rings = [P - S * h + N * 0.004, P + S * h + N * 0.004, P + S * h - N * depth, P - S * h - N * depth]
    n = len(P)
    verts = np.concatenate(rings)
    faces = []
    for r in range(4):
        r2 = (r + 1) % 4
        for i in range(n - 1):
            faces.append((r * n + i, r * n + i + 1, r2 * n + i + 1, r2 * n + i))
    faces.append(tuple(r * n for r in range(4))[::-1])
    faces.append(tuple(r * n + n - 1 for r in range(4)))
    o = mesh_obj(name, G2B(verts), faces)
    fix_normals(o)
    return o


def loop_prism(name, P, N, width, depth):
    """Closed groove cutter: a swept box around a loop with no ends (an
    open strip that overlaps itself where it closes breaks EXACT booleans)."""
    T = np.roll(P, -1, 0) - np.roll(P, 1, 0)
    T /= np.maximum(np.linalg.norm(T, axis=1, keepdims=True), 1e-9)
    S = np.cross(N, T)
    S /= np.maximum(np.linalg.norm(S, axis=1, keepdims=True), 1e-9)
    h = width / 2
    rings = [P - S * h + N * 0.004, P + S * h + N * 0.004, P + S * h - N * depth, P - S * h - N * depth]
    n = len(P)
    faces = []
    for r in range(4):
        r2 = (r + 1) % 4
        for i in range(n):
            j = (i + 1) % n
            faces.append((r * n + i, r * n + j, r2 * n + j, r2 * n + i))
    o = mesh_obj(name, G2B(np.concatenate(rings)), faces)
    fix_normals(o)
    return o


def safe_boolean(target, cutter, label=""):
    """EXACT difference, kept only if it leaves the piece intact (a failed
    boolean can empty a plate); otherwise the cut is skipped and logged."""
    before = len(target.data.vertices)
    m = target.modifiers.new("bool", "BOOLEAN")
    m.operation, m.solver, m.object = "DIFFERENCE", "EXACT", cutter
    m.use_self, m.use_hole_tolerant = False, True
    dg = bpy.context.evaluated_depsgraph_get()
    n = len(target.evaluated_get(dg).data.vertices)
    if n < max(8, before * 0.5):
        target.modifiers.remove(m)
        print(f"[armour_hardsurface] skipped a failed cut on {target.name} {label} ({before} -> {n} vertices)")
        return False
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=m.name)
    return True


def hole_prism(name, pts, nrm, depth=0.03):
    P, N = np.asarray(pts, float), np.asarray(nrm, float)
    return prism(name, [Vector(p) for p in G2B(P + N * depth)], [Vector(p) for p in G2B(P - N * depth)])


def inlay(pts, nrm, flow, width, depth, dst):
    """Emissive strip at the groove floor; UV.x = flow, UV.y across."""
    P, N = np.asarray(pts, float), np.asarray(nrm, float)
    T = np.gradient(P, axis=0)
    T /= np.maximum(np.linalg.norm(T, axis=1, keepdims=True), 1e-9)
    S = np.cross(N, T)
    S /= np.maximum(np.linalg.norm(S, axis=1, keepdims=True), 1e-9)
    floor = P - N * (depth - 0.0007)
    a, b = floor - S * width * 0.34, floor + S * width * 0.34
    i0 = len(dst["V"])
    n = len(P)
    dst["V"] += list(a) + list(b)
    dst["N"] += list(N) + list(N)
    dst["UV"] += [(f, 0.0) for f in flow] + [(f, 1.0) for f in flow]
    for i in range(n - 1):
        dst["F"] += [(i0 + i, i0 + n + i, i0 + i + 1), (i0 + i + 1, i0 + n + i, i0 + n + i + 1)]


def bolt_obj(name, p, n, r, h):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=r, radius2=r * 0.86, depth=h)
    bmesh.ops.bevel(bm, geom=[e for e in bm.edges if e.is_boundary or len(e.link_faces) == 2 and e.calc_face_angle(0) > 0.6],
                    offset=r * 0.18, segments=1, affect="EDGES")
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    nb = v3(n).normalized()
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(nb)
    o.location = v3(p) + nb * (h * 0.35)
    bpy.context.view_layer.update()
    o.data.transform(o.matrix_world)
    o.matrix_world = o.matrix_world.__class__.Identity(4)
    return o


def sole_obj(name, spec, segments_cut):
    """Anchor sole: the footprint outline extruded, chamfered, with tread cuts."""
    out = np.asarray(spec["outline"], float)
    y0, y1 = spec["y0"], spec["y1"]
    lo = [Vector((x, -z, y0)) for x, z in out]
    hi = [Vector((x, -z, y1)) for x, z in out]
    o = prism(name, hi, lo)
    xs, zs = out[:, 0], out[:, 1]
    for k, z in enumerate(np.linspace(zs.min() + 0.03, zs.max() - 0.03, segments_cut)):
        c = mesh_obj(f"_tread{k}", [(xs.min() - 0.02, -z - 0.003, y0 - 0.01), (xs.max() + 0.02, -z - 0.003, y0 - 0.01),
                                    (xs.max() + 0.02, -z + 0.003, y0 - 0.01), (xs.min() - 0.02, -z + 0.003, y0 - 0.01),
                                    (xs.min() - 0.02, -z - 0.003, y0 + 0.004), (xs.max() + 0.02, -z - 0.003, y0 + 0.004),
                                    (xs.max() + 0.02, -z + 0.003, y0 + 0.004), (xs.min() - 0.02, -z + 0.003, y0 + 0.004)],
                     [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)])
        fix_normals(c)
        boolean(o, c)
        delete([c])
    return o


def build_piece(meta, arr, fx):
    """One designed piece -> a finished solid object (or None)."""
    name = meta["name"]
    if meta.get("sole"):
        o = sole_obj(name, meta["sole"], meta["sole"].get("treads", 7))
        # the anchor channel around the sole's side, mid-height
        out = np.asarray(meta["sole"]["outline"], float)
        ym = (meta["sole"]["y0"] + meta["sole"]["y1"]) / 2
        c = out.mean(0)
        ring = np.r_[out, out[:1]]
        dense = np.concatenate([np.linspace(ring[i], ring[i + 1], 6, endpoint=False) for i in range(len(ring) - 1)] + [ring[-1:]])
        P = np.c_[dense[:, 0], np.full(len(dense), ym), dense[:, 1]]
        N = np.c_[dense[:, 0] - c[0], np.zeros(len(dense)), dense[:, 1] - c[1]]
        N /= np.linalg.norm(N, axis=1, keepdims=True)
        cut = strip_prism("_solecut", P, N, 0.005, 0.003)
        boolean(o, cut)
        delete([cut])
        L = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]
        if meta["sole"].get("channel", True):  # an emissive welt (Cinderlock, Vesperglass), or just the groove
            inlay(P, N, list(0.45 + 0.5 * L / L[-1]), 0.005, 0.003, fx)
        bevel(o, meta["bevel"], meta["bevel_segments"])
        return o
    if meta.get("multi") or isinstance(arr, list):
        objs = []
        for k, (V, F) in enumerate(arr):
            ob = mesh_obj(f"{name}_{k}", G2B(np.asarray(V)), [tuple(f) for f in np.asarray(F)])
            fix_normals(ob)
            bevel(ob, meta.get("bevel", 0.0), meta.get("bevel_segments", 1), 40)
            objs.append(ob)
        return join(objs, name) if objs else None
    V, F = arr
    if len(V) == 0:
        return None
    o = mesh_obj(name, G2B(V), [tuple(f) for f in F])
    if meta.get("thickness", 0) > 0:
        solidify(o, meta["thickness"])
    for k, h in enumerate(meta.get("holes", [])):
        c = hole_prism(f"_h{k}", h["pts"], h["nrm"], meta["thickness"] + 0.02)
        safe_boolean(o, c, f"hole {k}")
        delete([c])
    for k, g in enumerate(meta.get("grooves", [])):
        c = strip_prism(f"_g{k}", g["pts"], g["nrm"], g["width"], g["depth"])
        safe_boolean(o, c, f"groove {k}")
        delete([c])
        if g["inlay"]:
            inlay(g["pts"], g["nrm"], g["flow"], g["width"], g["depth"], fx)
    # dissolve first: decimating after the bevel scrambles its hardened custom
    # normals (the crumpled shading on small curved plates)
    if meta.get("planar", 1.5) > 0:  # faceted plates only; smooth curved plates would crumple
        planar(o, meta.get("planar", 1.5))
    bevel(o, meta.get("bevel", 0.0), meta.get("bevel_segments", 1))
    parts = [o]
    for k, b in enumerate(meta.get("bolts", [])):
        parts.append(bolt_obj(f"{name}_bolt{k}", b["p"], b["n"], b["r"], b["h"]))
    return join(parts, name)


# ---------------------------------------------------------------- materials and bakes


def emit_material(name, build):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = node(nt, "ShaderNodeOutputMaterial", (900, 0))
    em = node(nt, "ShaderNodeEmission", (700, 0))
    nt.links.new(em.outputs[0], out.inputs[0])
    build(nt, em.inputs[0])
    return m


def fields_material():
    def build(nt, dst):
        tc = node(nt, "ShaderNodeTexCoord", (-900, 0))
        comb = node(nt, "ShaderNodeCombineColor", (500, 0))
        for k, (sc, det) in enumerate(((4.0, 3.0), (28.0, 5.0), (160.0, 4.0))):
            n_ = node(nt, "ShaderNodeTexNoise", (-500, 300 - 300 * k), Scale=sc, Detail=det, Roughness=0.6)
            nt.links.new(tc.outputs["Object"], n_.inputs["Vector"])
            nt.links.new(n_.outputs["Fac"], comb.inputs[k])
        nt.links.new(comb.outputs[0], dst)
    return emit_material("_fields", build)


def pattern_material():
    """R: textile weave, G: organic cell edges, B: diagonal hazard bands (object space)."""
    def build(nt, dst):
        tc = node(nt, "ShaderNodeTexCoord", (-900, 0))
        comb = node(nt, "ShaderNodeCombineColor", (500, 0))
        wx = node(nt, "ShaderNodeTexWave", (-500, 300), Scale=260.0, Distortion=0.0)
        wx.wave_type, wx.bands_direction = "BANDS", "X"
        wy = node(nt, "ShaderNodeTexWave", (-500, 150), Scale=260.0, Distortion=0.0)
        wy.wave_type, wy.bands_direction = "BANDS", "Z"
        for w_ in (wx, wy):
            nt.links.new(tc.outputs["Object"], w_.inputs["Vector"])
        mul = node(nt, "ShaderNodeMath", (-250, 250))
        mul.operation = "MAXIMUM"
        nt.links.new(wx.outputs["Fac"], mul.inputs[0])
        nt.links.new(wy.outputs["Fac"], mul.inputs[1])
        cells = node(nt, "ShaderNodeTexVoronoi", (-500, -50), Scale=55.0)
        cells.feature = "DISTANCE_TO_EDGE"
        nt.links.new(tc.outputs["Object"], cells.inputs["Vector"])
        st = node(nt, "ShaderNodeTexWave", (-500, -250), Scale=4.5, Distortion=0.0)
        st.wave_type, st.bands_direction = "BANDS", "DIAGONAL"
        nt.links.new(tc.outputs["Object"], st.inputs["Vector"])
        nt.links.new(mul.outputs[0], comb.inputs[0])
        nt.links.new(cells.outputs["Distance"], comb.inputs[1])
        nt.links.new(st.outputs["Fac"], comb.inputs[2])
        nt.links.new(comb.outputs[0], dst)
    return emit_material("_pattern", build)


def edges_material():
    """R: convexity (1 - Bevel-normal . true normal, scaled), G: cavity (AO), B: scratches."""
    def build(nt, dst):
        geo = node(nt, "ShaderNodeNewGeometry", (-900, 0))
        bev = node(nt, "ShaderNodeBevel", (-900, 300))
        bev.samples = 8
        bev.inputs["Radius"].default_value = 0.0018
        dot = node(nt, "ShaderNodeVectorMath", (-600, 300))
        dot.operation = "DOT_PRODUCT"
        nt.links.new(bev.outputs[0], dot.inputs[0])
        nt.links.new(geo.outputs["Normal"], dot.inputs[1])
        inv = node(nt, "ShaderNodeMath", (-400, 300))
        inv.operation = "SUBTRACT"
        inv.inputs[0].default_value = 1.0
        nt.links.new(dot.outputs["Value"], inv.inputs[1])
        mul = node(nt, "ShaderNodeMath", (-250, 300))
        mul.operation = "MULTIPLY"
        mul.inputs[1].default_value = 6.0
        mul.use_clamp = True
        nt.links.new(inv.outputs[0], mul.inputs[0])
        ao = node(nt, "ShaderNodeAmbientOcclusion", (-600, 0))
        ao.samples = 8
        ao.only_local = True
        ao.inputs["Distance"].default_value = 0.012
        tc = node(nt, "ShaderNodeTexCoord", (-900, -300))
        wave = node(nt, "ShaderNodeTexVoronoi", (-600, -300), Scale=220.0)
        wave.feature = "DISTANCE_TO_EDGE"
        nt.links.new(tc.outputs["Object"], wave.inputs["Vector"])
        comb = node(nt, "ShaderNodeCombineColor", (300, 0))
        nt.links.new(mul.outputs[0], comb.inputs[0])
        nt.links.new(ao.outputs["AO"], comb.inputs[1])
        nt.links.new(wave.outputs["Distance"], comb.inputs[2])
        nt.links.new(comb.outputs[0], dst)
    return emit_material("_edges", build)


def detail_normal_material():
    """Shading normal = rounded edges (Bevel) + brushed streaks + fine scratches."""
    m = bpy.data.materials.new("_detail")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    tc = node(nt, "ShaderNodeTexCoord", (-1100, 0))
    bev = node(nt, "ShaderNodeBevel", (-300, 300))
    bev.samples = 8
    bev.inputs["Radius"].default_value = 0.0016
    mapn = node(nt, "ShaderNodeMapping", (-900, 0))
    mapn.inputs["Scale"].default_value = (1.0, 1.0, 26.0)  # streaks: stretched noise
    nt.links.new(tc.outputs["Object"], mapn.inputs["Vector"])
    brush = node(nt, "ShaderNodeTexNoise", (-700, 0), Scale=380.0, Detail=2.0, Roughness=0.5)
    nt.links.new(mapn.outputs[0], brush.inputs["Vector"])
    scr = node(nt, "ShaderNodeTexVoronoi", (-700, -300), Scale=90.0)
    scr.feature = "DISTANCE_TO_EDGE"
    nt.links.new(tc.outputs["Object"], scr.inputs["Vector"])
    sr = node(nt, "ShaderNodeMapRange", (-500, -300))
    sr.inputs["From Max"].default_value = 0.012
    nt.links.new(scr.outputs["Distance"], sr.inputs["Value"])
    h = node(nt, "ShaderNodeMath", (-300, -100))
    h.operation = "MULTIPLY_ADD"
    nt.links.new(brush.outputs["Fac"], h.inputs[0])
    h.inputs[1].default_value = 0.35
    nt.links.new(sr.outputs[0], h.inputs[2])
    bump = node(nt, "ShaderNodeBump", (-100, 0))
    bump.inputs["Strength"].default_value = 0.22
    bump.inputs["Distance"].default_value = 0.0004
    nt.links.new(h.outputs[0], bump.inputs["Height"])
    nt.links.new(bev.outputs[0], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def bake(obj, mat, kind, size, samples, name, colorspace="Non-Color"):
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=True)
    img.colorspace_settings.name = colorspace
    saved = [s.material for s in obj.material_slots]
    for s in obj.material_slots:
        s.material = mat
    if not obj.material_slots:
        obj.data.materials.append(mat)
    nt = mat.node_tree
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.nodes.active = tex
    sc = bpy.context.scene
    sc.cycles.samples = samples
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    sc.render.bake.margin = 6
    sc.render.bake.margin_type = "EXTEND"
    sc.render.bake.use_selected_to_active = False
    if kind == "NORMAL":
        sc.render.bake.normal_space = "TANGENT"
    bpy.ops.object.bake(type=kind)
    arr = np.array(img.pixels[:], dtype=np.float32).reshape(size, size, 4)[..., :3].copy()
    nt.nodes.remove(tex)
    for s, m0 in zip(obj.material_slots, saved):
        s.material = m0
    return arr


def composite(fields, edges, ao, mid, specs, mats, pattern=None):
    """Per-material base colour / roughness / metallic from the baked fields:
    near-black gunmetal plates with polished steel on worn convex edges,
    soot in cavities and against the body, faint brushed tonal variation."""
    big, midn, fine = fields[..., 0], fields[..., 1], fields[..., 2]
    convex, cav, scr = edges[..., 0], edges[..., 1], edges[..., 2]
    occl = ao[..., 0]
    H, W = mid.shape
    base = np.zeros((H, W, 3), np.float32)
    rough = np.zeros((H, W), np.float32)
    metal = np.zeros((H, W), np.float32)
    for k, name in enumerate(mats):
        s = specs[name]
        sel = mid == k + 1
        if not sel.any():
            continue
        col = np.asarray(s["base"], np.float32)
        edge = np.asarray(s.get("edge", s["base"]), np.float32)
        wear = smoothstep(0.08, 0.6, convex[sel]) * (0.55 + 0.45 * smoothstep(0.35, 0.7, fine[sel])) * s.get("wear", 0.6)
        tone = 1 + s.get("tone", 0.12) * ((big[sel] - 0.5) * 1.2 + (midn[sel] - 0.5) * 0.6)
        c = col[None] * tone[:, None]
        pat = s.get("pattern")
        rough_pat = 0.0
        if pat and pattern is not None:
            k = s.get("pattern_k", 0.5)
            if pat == "weave":  # textile: thread relief darkens the gaps
                wv = pattern[..., 0][sel]
                c = c * (1 - k * 0.35 * (1 - wv))[:, None]
                rough_pat = 0.06 * (1 - wv)
            elif pat == "cells":  # cultivated tissue: veins along cell edges
                vein = 1 - smoothstep(0.0, 0.07, pattern[..., 1][sel])
                c = c + (np.asarray(s.get("pattern_rgb", s["base"]), np.float32)[None] - c) * (vein * k)[:, None]
                rough_pat = -0.12 * vein * k
            elif pat == "stripes":  # hazard bands
                band = smoothstep(0.45, 0.55, pattern[..., 2][sel])
                c = c + (np.asarray(s.get("pattern_rgb", (0.6, 0.4, 0.05)), np.float32)[None] - c) * (band * k)[:, None]
        c = c * (1 - wear[:, None]) + edge[None] * wear[:, None]
        scratch = (1 - smoothstep(0.0, 0.025, scr[sel])) * s.get("scratch", 0.25) * smoothstep(0.45, 0.65, midn[sel])
        c = c + (edge[None] - c) * scratch[:, None] * 0.6
        soot = np.clip((1 - cav[sel]) * 0.8 + (1 - occl[sel]) * 0.55, 0, 0.75) * s.get("soot", 1.0)
        c = c * (1 - soot[:, None])
        base[sel] = c
        r = s["roughness"] + rough_pat + 0.08 * (fine[sel] - 0.5) + 0.06 * (midn[sel] - 0.5) - s.get("edge_polish", 0.16) * wear + 0.14 * soot
        rough[sel] = np.clip(r - 0.08 * scratch, 0.12, 0.98)
        metal[sel] = np.clip(s.get("metallic", 0.0) * (1 - 0.6 * soot) + 0.15 * wear * (s.get("metallic", 0) > 0), 0, 1)
    return np.clip(base, 0, 1), rough, metal


def mesh_arrays(o):
    """Triangulated mesh -> glTF-frame arrays with corner splits and a per-vertex piece id."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg)
    me = ev.to_mesh()
    me.calc_loop_triangles()
    uvl = me.uv_layers.active.data
    co = np.array([v.co[:] for v in me.vertices])
    corner_n = np.array([cn.vector[:] for cn in me.corner_normals])
    pid = me.attributes.get("piece")
    fp = np.array([pid.data[i].value for i in range(len(me.polygons))]) if pid else np.zeros(len(me.polygons), int)
    key, P, N, UV, PI, idx = {}, [], [], [], [], []
    for tri in me.loop_triangles:
        for li in tri.loops:
            vi = me.loops[li].vertex_index
            uv = uvl[li].uv
            n = corner_n[li]
            k = (vi, round(uv[0], 5), round(uv[1], 5), round(n[0], 3), round(n[1], 3), round(n[2], 3))
            if k not in key:
                key[k] = len(P)
                P.append(co[vi])
                N.append(n)
                UV.append((uv[0], 1 - uv[1]))
                PI.append(fp[tri.polygon_index])
            idx.append(key[k])
    ev.to_mesh_clear()
    return B2G(np.array(P)), B2G(np.array(N)), np.array(UV), np.array(idx).reshape(-1, 3), np.array(PI)


def set_piece_attr(o, k):
    a = o.data.attributes.new("piece", "INT", "FACE")
    a.data.foreach_set("value", [k] * len(o.data.polygons))


def main():
    p = payload()
    sc = reset_scene()
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    out = Path(p["out"])
    out.mkdir(parents=True, exist_ok=True)
    meta = json.loads(Path(p["pieces_json"]).read_text())
    npz = np.load(p["pieces_npz"])
    specs = p["materials"]
    body = np.load(p["body_npz"])
    occ = mesh_obj("_body", G2B(body["V"]), [tuple(f) for f in body["F"]])
    report = {"sets": {}}
    sets = {}
    for m in meta:
        sets.setdefault(m["set"], []).append(m)
    for item, pieces in sets.items():
        fx = {"V": [], "N": [], "UV": [], "F": []}
        objs, names, mats, glass = [], [], [], []
        for k, m in enumerate(pieces):
            V, F = npz[m["name"] + "_V"], npz[m["name"] + "_F"]
            arr = (V, F)
            if m.get("multi"):  # multi-part: split back into parts by connectivity of F
                arr = split_parts(V, F)
            fx_before = len(fx["V"])
            o = build_piece(m, arr, fx)
            for st in m.get("fx_strips", []):  # emissive tubes authored in the design (capillaries, conduits)
                i0 = len(fx["V"])
                fx["V"] += [tuple(v) for v in st["V"]]
                fx["N"] += [tuple(v) for v in st["N"]]
                fx["UV"] += [tuple(v) for v in st["UV"]]
                fx["F"] += [tuple(i0 + q for q in f) for f in st["F"]]
            if o is None:
                if len(fx["V"]) > fx_before:  # an FX-only piece keeps its own weight policy
                    fx.setdefault("piece", [])
                    fx["piece"] += [len(names)] * (len(fx["V"]) - fx_before)
                    names.append(m["name"])
                continue
            if m.get("layer") == "glass":  # translucent layer: its own mesh, no bakes
                set_piece_attr(o, len(names))
                glass.append(o)
                fx.setdefault("piece", [])
                fx["piece"] += [len(names)] * (len(fx["V"]) - fx_before)
                names.append(m["name"])
                continue
            set_piece_attr(o, len(names))
            if m["mat"] not in mats:
                mats.append(m["mat"])
            mat_idx = mats.index(m["mat"])
            o.data.materials.clear()
            o.data.materials.append(bpy.data.materials.get(m["mat"]) or bpy.data.materials.new(m["mat"]))
            o["mat_idx"] = mat_idx
            fx.setdefault("piece", [])
            fx["piece"] += [len(names)] * (len(fx["V"]) - fx_before)
            names.append(m["name"])
            objs.append(o)
        # material id as a face attribute, for the composite
        for o in objs:
            a = o.data.attributes.new("matid", "INT", "FACE")
            a.data.foreach_set("value", [o["mat_idx"] + 1] * len(o.data.polygons))  # 0 = bake margin
        main_o = join(objs, item)
        smooth_by_angle(main_o, 24)  # facet creases (30 deg at 12 sides) stay crisp
        size = int(p["texture"].get(item, 1024))
        unwrap(main_o)
        # bakes (the body occludes; other items are not in the scene)
        id_mat = emit_material("_id", lambda nt, dst: matid_chain(nt, dst))
        mid = np.rint(bake(main_o, id_mat, "EMIT", size, 1, f"{item}_id")[..., 0] * 16).astype(int)
        mid = dilate_ids(mid)
        fields = bake(main_o, fields_material(), "EMIT", size, 1, f"{item}_fields")
        edges = bake(main_o, edges_material(), "EMIT", size, p["samples"], f"{item}_edges")
        aomat = emit_material("_ao", lambda nt, dst: ao_chain(nt, dst))
        ao = bake(main_o, aomat, "EMIT", size, p["samples"], f"{item}_ao")
        nrm = bake(main_o, detail_normal_material(), "NORMAL", size, p["samples"], f"{item}_normal")
        pattern = bake(main_o, pattern_material(), "EMIT", size, 1, f"{item}_pattern") if any(specs[m_].get("pattern") for m_ in mats) else None
        base, rough, metal = composite(fields, edges, ao, mid, specs, mats, pattern)
        files = {"basecolor": f"{item}_basecolor.png", "roughness": f"{item}_roughness.png", "metallic": f"{item}_metallic.png", "normal": f"{item}_normal.png"}
        save_png(out / files["basecolor"], base, srgb=True)
        save_png(out / files["roughness"], np.repeat(rough[..., None], 3, 2))
        save_png(out / files["metallic"], np.repeat(metal[..., None], 3, 2))
        save_png(out / files["normal"], nrm)
        # final preview material (for the .blend)
        P_, N_, UV_, I_, PI_ = mesh_arrays(main_o)
        arrays = {"P": P_, "N": N_, "UV": UV_, "I": I_, "piece": PI_}
        if fx["V"]:
            fv = np.asarray(fx["V"], float)
            fnn = np.asarray(fx["N"], float)
            arrays.update(FX_P=fv, FX_N=fnn / np.linalg.norm(fnn, axis=1, keepdims=True), FX_UV=np.asarray(fx["UV"], float),
                          FX_I=np.asarray(fx["F"], int), FX_piece=np.asarray(fx["piece"], int))
            fxo = mesh_obj(f"{item}__fx", G2B(fv), [tuple(f) for f in fx["F"]])
            ch = bpy.data.materials.get("CL_Channel") or bpy.data.materials.new("CL_Channel")
            fxo.data.materials.append(ch)
        if glass:
            go = join(glass, f"{item}__glass")
            smooth_by_angle(go, 24)
            unwrap(go)
            GP, GN, GUV, GI, GPI = mesh_arrays(go)
            arrays.update(GL_P=GP, GL_N=GN, GL_UV=GUV, GL_I=GI, GL_piece=GPI)
        np.savez(out / f"{item}.npz", **arrays)
        report["sets"][item] = {"pieces": names, "images": files, "npz": f"{item}.npz", "triangles": int(len(I_)),
                                "fx_triangles": int(len(fx["F"])), "glass_triangles": int(len(arrays["GL_I"])) if glass else 0, "materials": mats}
    delete([occ])
    blend = p.get("blend_name", "armour_source.blend")
    bpy.ops.wm.save_as_mainfile(filepath=str(out / blend), compress=True)
    report["blend"] = blend
    finish(p, report)


def split_parts(V, F):
    """Connected components of a merged multi-part piece."""
    n = len(V)
    parent = np.arange(n)

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for f in F:
        a = find(f[0])
        for v in f[1:]:
            b = find(v)
            if a != b:
                parent[b] = a
    roots = np.array([find(i) for i in range(n)])
    parts = []
    for r in np.unique(roots):
        vi = np.nonzero(roots == r)[0]
        rm = -np.ones(n, int)
        rm[vi] = np.arange(len(vi))
        fi = F[np.isin(F[:, 0], vi)]
        parts.append((V[vi], rm[fi]))
    return parts


def matid_chain(nt, dst):
    attr = node(nt, "ShaderNodeAttribute", (-600, 0))
    attr.attribute_type = "GEOMETRY"
    attr.attribute_name = "matid"
    div = node(nt, "ShaderNodeMath", (-300, 0))
    div.operation = "DIVIDE"
    div.inputs[1].default_value = 16.0
    nt.links.new(attr.outputs["Fac"], div.inputs[0])
    nt.links.new(div.outputs[0], dst)


def ao_chain(nt, dst):
    ao = node(nt, "ShaderNodeAmbientOcclusion", (-600, 0))
    ao.samples = 12
    ao.inputs["Distance"].default_value = 0.06
    nt.links.new(ao.outputs["AO"], dst)


def dilate_ids(mid, iters=4):
    """Bake margins carry id 0; spread each island's id a few texels outward."""
    out = mid.copy()
    for _ in range(iters):
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh = np.roll(np.roll(out, dy, 0), dx, 1)
            out = np.where(out == 0, sh, out)
    return out


def unwrap(o, margin=0.003):
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    me = o.data
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    me.uv_layers.new(name="UVMap")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    # plates are gently curved: a wide angle keeps each face of a plate one island
    bpy.ops.uv.smart_project(angle_limit=math.radians(70), island_margin=margin, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=margin, rotate=True, shape_method="CONCAVE")
    bpy.ops.object.mode_set(mode="OBJECT")


if __name__ == "__main__":
    main()
