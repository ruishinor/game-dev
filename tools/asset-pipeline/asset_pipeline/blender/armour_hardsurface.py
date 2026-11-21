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
from asset_pipeline.blender.severance_gate import (blur, delete, fix_normals, join, mesh_obj, node, prism, save_png, smoothstep,
                                                    srgb_to_lin)
from asset_pipeline.blender.severance_gate import boolean as boolean_exact

G2B = lambda P: np.c_[P[:, 0], -P[:, 2], P[:, 1]]  # glTF (y up) -> Blender (z up)
B2G = lambda P: np.c_[P[:, 0], P[:, 2], -P[:, 1]]


def v3(p):
    p = np.asarray(p, float)
    return Vector((p[0], -p[2], p[1]))


def boolean(target, cutter, op="DIFFERENCE"):
    """Carve with Blender's Manifold solver. The Exact solver deletes whole
    plates for some thin solids and groove cutters (measured: the collar ring,
    flank and back plates kept under 1 % of their area); Manifold carves them
    correctly and matches Exact where both work. Exact stays the fallback."""
    before = len(target.data.polygons)
    m = target.modifiers.new("bool", "BOOLEAN")
    m.operation = op
    m.solver = "MANIFOLD"
    m.object = cutter
    bpy.context.view_layer.objects.active = target
    try:
        bpy.ops.object.modifier_apply(modifier=m.name)
    except RuntimeError:
        target.modifiers.remove(m)
        return boolean_exact(target, cutter, op)
    if before and not target.data.polygons:
        raise RuntimeError(f"boolean emptied {target.name}")


def weld(o, dist=2e-5):
    """Merge coincident vertices (sheets copied from the body's shells keep
    their UV-seam splits): an open seam would solidify into walls that the
    decimator cannot collapse."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    bm.to_mesh(o.data)
    bm.free()


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
    # a closed loop (last point repeats the first) becomes a ring with no end
    # caps: an open strip around a loop would overlap itself at the seam, and
    # the exact boolean then deletes the plate it should only engrave
    closed = len(P) > 3 and np.linalg.norm(P[0] - P[-1]) < 1e-6
    if closed:
        P, N = P[:-1], N[:-1]
        T = np.roll(P, -1, axis=0) - np.roll(P, 1, axis=0)
    else:
        T = np.gradient(P, axis=0)
    T /= np.maximum(np.linalg.norm(T, axis=1, keepdims=True), 1e-9)
    P = P.copy()
    if not closed:
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
        for i in range(n if closed else n - 1):
            j = (i + 1) % n
            faces.append((r * n + i, r * n + j, r2 * n + j, r2 * n + i))
    if not closed:
        faces.append(tuple(r * n for r in range(4))[::-1])
        faces.append(tuple(r * n + n - 1 for r in range(4)))
    o = mesh_obj(name, G2B(verts), faces)
    fix_normals(o)
    return o


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


def glow_ribbon(pts, nrm, flow, dst, step=0.022, lift=0.0026, base=0.003):
    """A soft glow ribbon over a channel, for the runtime glow shader: a
    narrow strip on the plate surface whose NORMAL holds the unit side vector
    (+S on one edge, -S on the other), so the shader can widen it with camera
    distance in bind space before skinning. UV.x = flow, UV.y across. The
    polyline is resampled coarser than the inlay (glow needs no detail)."""
    P, N, F = np.asarray(pts, float), np.asarray(nrm, float), np.asarray(flow, float)
    if len(P) < 2:
        return
    keep, acc = [0], 0.0
    for i in range(1, len(P) - 1):
        acc += np.linalg.norm(P[i] - P[i - 1])
        a, b = P[i] - P[keep[-1]], P[i + 1] - P[i]
        turn = np.dot(a, b) / max(np.linalg.norm(a) * np.linalg.norm(b), 1e-12)
        if acc >= step or turn < 0.9:
            keep.append(i)
            acc = 0.0
    keep.append(len(P) - 1)
    P, N, F = P[keep], N[keep], F[keep]
    T = np.gradient(P, axis=0)
    T /= np.maximum(np.linalg.norm(T, axis=1, keepdims=True), 1e-9)
    S = np.cross(N, T)
    S /= np.maximum(np.linalg.norm(S, axis=1, keepdims=True), 1e-9)
    C = P + N * lift
    i0, n = len(dst["V"]), len(P)
    dst["V"] += list(C - S * base) + list(C + S * base)
    dst["N"] += list(-S) + list(S)
    dst["UV"] += [(f, 0.0) for f in F] + [(f, 1.0) for f in F]
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


def _slab(name, x0, x1, z0, z1, y0, y1):
    c = mesh_obj(name, [(x0, -z0, y0), (x1, -z0, y0), (x1, -z1, y0), (x0, -z1, y0), (x0, -z0, y1), (x1, -z0, y1), (x1, -z1, y1), (x0, -z1, y1)],
                 [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)])
    fix_normals(c)
    return c


def sole_obj(name, spec, segments_cut):
    """Anchor sole: the footprint outline extruded, chamfered, with deep lug
    cuts across the tread and (optionally) a recessed heel block under the arch."""
    out = np.asarray(spec["outline"], float)
    y0, y1 = spec["y0"], spec["y1"]
    lo = [Vector((x, -z, y0)) for x, z in out]
    hi = [Vector((x, -z, y1)) for x, z in out]
    o = prism(name, hi, lo)
    xs, zs = out[:, 0], out[:, 1]
    depth = spec.get("lug_depth", 0.004)
    for k, z in enumerate(np.linspace(zs.min() + 0.03, zs.max() - 0.03, spec.get("lugs", segments_cut))):
        c = _slab(f"_tread{k}", xs.min() - 0.02, xs.max() + 0.02, z - 0.0035, z + 0.0035, y0 - 0.01, y0 + depth)
        boolean(o, c)
        delete([c])
    if spec.get("arch"):
        z0, z1, h = spec["arch"]
        c = _slab("_arch", xs.min() - 0.02, xs.max() + 0.02, z0, z1, y0 - 0.01, y0 + h)
        boolean(o, c)
        delete([c])
    return o


def build_piece(meta, arr, fx, details=None, glow=None):
    """One designed piece -> a finished solid object (or None)."""
    name = meta["name"]
    if meta.get("sole"):
        o = sole_obj(name, meta["sole"], 7)
        # the anchor channel around the sole's side, mid-height
        out = np.asarray(meta["sole"]["outline"], float)
        ym = (meta["sole"]["y0"] + meta["sole"]["y1"]) / 2
        c = out.mean(0)
        ring = np.r_[out, out[:1]]
        dense = np.concatenate([np.linspace(ring[i], ring[i + 1], 6, endpoint=False) for i in range(len(ring) - 1)] + [ring[-1:]])
        if meta["sole"].get("channel_front") is not None:  # the bumper strip wraps the toe only
            front = dense[:, 1] > meta["sole"]["channel_front"]
            k0 = int(np.argmin(front))  # roll so the run of front points is contiguous
            dense = np.roll(dense[:-1], -k0, axis=0)
            dense = dense[dense[:, 1] > meta["sole"]["channel_front"]]
        P = np.c_[dense[:, 0], np.full(len(dense), ym), dense[:, 1]]
        N = np.c_[dense[:, 0] - c[0], np.zeros(len(dense)), dense[:, 1] - c[1]]
        N /= np.linalg.norm(N, axis=1, keepdims=True)
        cut = strip_prism("_solecut", P, N, 0.005, 0.003)
        boolean(o, cut)
        delete([cut])
        L = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]
        inlay(P, N, list(0.45 + 0.5 * L / L[-1]), 0.005, 0.003, fx)
        if glow is not None:
            glow_ribbon(P, N, list(0.45 + 0.5 * L / L[-1]), glow, lift=0.001)
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
    weld(o)
    if meta.get("thickness", 0) > 0:
        solidify(o, meta["thickness"])
    for k, h in enumerate(meta.get("holes", [])):
        c = hole_prism(f"_h{k}", h["pts"], h["nrm"], meta["thickness"] + 0.02)
        boolean(o, c)
        delete([c])
    for k, g in enumerate(meta.get("grooves", [])):
        c = strip_prism(f"_g{k}", g["pts"], g["nrm"], g["width"], g["depth"])
        boolean(o, c)
        delete([c])
        if g["inlay"]:
            inlay(g["pts"], g["nrm"], g["flow"], g["width"], g["depth"], fx)
            if glow is not None:
                glow_ribbon(g["pts"], g["nrm"], g["flow"], glow)
    # dissolve first: decimating after the bevel scrambles its hardened custom
    # normals (the crumpled shading on small curved plates)
    planar(o, 1.5)
    bevel(o, meta.get("bevel", 0.0), meta.get("bevel_segments", 1))
    bolts = [bolt_obj(f"{name}_bolt{k}", b["p"], b["n"], b["r"], b["h"]) for k, b in enumerate(meta.get("bolts", []))]
    if details is not None:  # bolts only feed the bakes of the low mesh
        details.extend(bolts)
        return o
    return join([o] + bolts, name)


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


def composite(fields, edges, ao, mid, specs, mats):
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
        c = c * (1 - wear[:, None]) + edge[None] * wear[:, None]
        scratch = (1 - smoothstep(0.0, 0.025, scr[sel])) * s.get("scratch", 0.25) * smoothstep(0.45, 0.65, midn[sel])
        c = c + (edge[None] - c) * scratch[:, None] * 0.6
        soot = np.clip((1 - cav[sel]) * 0.8 + (1 - occl[sel]) * 0.55, 0, 0.75) * s.get("soot", 1.0)
        c = c * (1 - soot[:, None])
        base[sel] = c
        r = s["roughness"] + 0.08 * (fine[sel] - 0.5) + 0.06 * (midn[sel] - 0.5) - s.get("edge_polish", 0.16) * wear + 0.14 * soot
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
    if p.get("groups"):
        return main_groups(p)
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
        objs, names, mats = [], [], []
        for k, m in enumerate(pieces):
            V, F = npz[m["name"] + "_V"], npz[m["name"] + "_F"]
            arr = (V, F)
            if m.get("multi"):  # multi-part: split back into parts by connectivity of F
                arr = split_parts(V, F)
            fx_before = len(fx["V"])
            o = build_piece(m, arr, fx)
            if o is None:
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
        base, rough, metal = composite(fields, edges, ao, mid, specs, mats)
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
        np.savez(out / f"{item}.npz", **arrays)
        report["sets"][item] = {"pieces": names, "images": files, "npz": f"{item}.npz", "triangles": int(len(I_)),
                                "fx_triangles": int(len(fx["F"])), "materials": mats}
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


def unwrap(o, margin=0.003, angle=70, pack=True):
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
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=margin, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    if pack:
        bpy.ops.uv.pack_islands(margin=margin, rotate=True, shape_method="CONCAVE")
    bpy.ops.object.mode_set(mode="OBJECT")



# ---------------------------------------------------------------- game-ready modules: budget, high -> low, shared atlases, LODs
#
# Each atlas group (upper body: cuirass, arms, gauntlets; lower body: legs,
# greaves, boots) is built at full detail (the "high"), then every module is
# decimated to its triangle budget with the emissive channels' groove
# geometry protected (the "low", LOD0). The modules of a group are unwrapped
# together into one atlas, and every map is baked from the high onto the low
# (selected to active): material id, wear/cavity fields, AO against the body,
# a tangent-space normal map that carries the bevels, bolts, ribs and stitch
# lines the low no longer has, and an emissive mask of the channels for the
# distance LODs. LOD1 and LOD2 are decimated from LOD0 and share its UVs and
# textures. Tangents (MikkTSpace, as baked) are exported with every LOD.


def strip_inner(o, bvh, cos_limit=-0.55):
    """Delete the faces that face the body (plate undersides, inner shells of
    liners): never seen, they only cost triangles and confuse the bakes."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.normal_update()
    gone = []
    for f in bm.faces:
        c = f.calc_center_median()
        loc, _, _, d = bvh.find_nearest(c)
        if loc is None or d > 0.08:
            continue
        v = c - loc
        if v.length < 1e-6:
            continue
        # facing the body *and* looking straight at it a short way off (the
        # body is hollow under its shells, so the nearest point alone can lie
        # on the far side and would condemn outer faces)
        if f.normal.dot(v.normalized()) < cos_limit and bvh.ray_cast(c + f.normal * 1e-4, f.normal, 0.12)[0] is not None:
            gone.append(f)
    bmesh.ops.delete(bm, geom=gone, context="FACES")
    bm.to_mesh(o.data)
    bm.free()
    o.data.update()


def allocate(have, total, floor=16):
    """Share a triangle budget over pieces (water-filling on have^0.7): small
    pieces keep what they have, large ones share the rest."""
    n = len(have)
    out = [0] * n
    left, todo = total, list(range(n))
    while todo:
        w = {i: max(1.0, have[i]) ** 0.7 for i in todo}
        W = sum(w.values())
        done = [i for i in todo if have[i] <= max(floor, left * w[i] / W)]
        if not done:
            for i in todo:
                out[i] = max(min(have[i], floor), int(left * w[i] / W))
            break
        for i in done:
            out[i] = have[i]
            left -= have[i]
        todo = [i for i in todo if i not in done]
    return out


def pack(o, margin=0.003):
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(margin=margin, rotate=True, shape_method="CONCAVE")
    bpy.ops.object.mode_set(mode="OBJECT")


def tri_count(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def copy_obj(o, name):
    c = o.copy()
    c.data = o.data.copy()
    c.name = name
    bpy.context.scene.collection.objects.link(c)
    return c


def decimate(o, target, protect=None):
    """Collapse-decimate `o` to about `target` triangles. `protect`: vertex
    indices kept (the groove walls and floors under the inlays); if the
    protected result is still over budget, a second, unprotected pass meets it."""
    have = tri_count(o)
    if have <= target:
        return have
    bpy.context.view_layer.objects.active = o
    if protect is not None and len(protect):
        vg = o.vertex_groups.new(name="protect")
        vg.add([int(i) for i in protect], 1.0, "REPLACE")
    m = o.modifiers.new("dec", "DECIMATE")
    m.decimate_type = "COLLAPSE"
    m.ratio = max(0.01, target / have)
    m.use_collapse_triangulate = True
    if protect is not None and len(protect):
        m.vertex_group = "protect"
        m.invert_vertex_group = True
        m.vertex_group_factor = 1.0
    bpy.ops.object.modifier_apply(modifier=m.name)
    have = tri_count(o)
    if have > target * 1.02:
        m = o.modifiers.new("dec2", "DECIMATE")
        m.decimate_type = "COLLAPSE"
        m.ratio = target / have
        m.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=m.name)
    for vg in list(o.vertex_groups):
        o.vertex_groups.remove(vg)
    return tri_count(o)


def groove_vertices(o, pts_list, radius):
    """Indices of vertices within `radius` of any groove centreline sample."""
    from mathutils.kdtree import KDTree

    pts = [q for pts in pts_list for q in pts]
    if not pts:
        return []
    kd = KDTree(len(pts))
    for i, q in enumerate(pts):
        kd.insert(Vector(q), i)
    kd.balance()
    keep = []
    for v in o.data.vertices:
        if kd.find(v.co)[2] <= radius:
            keep.append(v.index)
    return keep


def densify(P, step=0.0012):
    P = np.asarray(P, float)
    out = [P[0]]
    for a, b in zip(P[:-1], P[1:]):
        n = max(1, int(np.ceil(np.linalg.norm(b - a) / step)))
        out += [a + (b - a) * (k / n) for k in range(1, n + 1)]
    return np.array(out)


def set_ray_visibility(o, on):
    for k in ("visible_diffuse", "visible_glossy", "visible_transmission", "visible_volume_scatter", "visible_shadow"):
        setattr(o, k, on)


def bake_s2a(target, sources, mat, kind, size, samples, name, extrusion=0.005, ray=0.012):
    """Bake `mat` evaluated on `sources` onto `target`'s UVs (selected to active)."""
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=True)
    img.colorspace_settings.name = "Non-Color"
    saved = {o.name: [s_.material for s_ in o.material_slots] for o in sources}
    if mat is not None:
        for o in sources:
            if not o.material_slots:
                o.data.materials.append(mat)
            for s_ in o.material_slots:
                s_.material = mat
    tm = bpy.data.materials.get("_bake_target") or bpy.data.materials.new("_bake_target")
    tm.use_nodes = True
    target.data.materials.clear()
    target.data.materials.append(tm)
    nt = tm.node_tree
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.nodes.active = tex
    sc = bpy.context.scene
    sc.cycles.samples = samples
    bpy.ops.object.select_all(action="DESELECT")
    for o in sources:
        o.select_set(True)
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    b = sc.render.bake
    b.margin = 6
    b.margin_type = "EXTEND"
    b.use_selected_to_active = True
    b.cage_extrusion = extrusion
    b.max_ray_distance = ray
    if kind == "NORMAL":
        b.normal_space = "TANGENT"
    set_ray_visibility(target, False)
    bpy.ops.object.bake(type=kind)
    set_ray_visibility(target, True)
    arr = np.array(img.pixels[:], dtype=np.float32).reshape(size, size, 4)[..., :3].copy()
    nt.nodes.remove(tex)
    for o in sources:
        for s_, m0 in zip(o.material_slots, saved[o.name]):
            s_.material = m0
    b.use_selected_to_active = False
    return arr


def channel_emit_material():
    m = bpy.data.materials.get("_channel_emit") or bpy.data.materials.new("_channel_emit")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = node(nt, "ShaderNodeOutputMaterial", (600, 0))
    em = node(nt, "ShaderNodeEmission", (300, 0))
    tc = node(nt, "ShaderNodeTexCoord", (-600, 0))
    sep = node(nt, "ShaderNodeSeparateXYZ", (-400, 0))
    nt.links.new(tc.outputs["UV"], sep.inputs[0])
    # brightest along the channel's centre (UV.y = 0.5), fading to the edges
    sub = node(nt, "ShaderNodeMath", (-200, 0))
    sub.operation = "SUBTRACT"
    nt.links.new(sep.outputs["Y"], sub.inputs[0])
    sub.inputs[1].default_value = 0.5
    ab = node(nt, "ShaderNodeMath", (0, 0))
    ab.operation = "ABSOLUTE"
    nt.links.new(sub.outputs[0], ab.inputs[0])
    lin = node(nt, "ShaderNodeMapRange", (150, 0))
    lin.inputs["From Min"].default_value = 0.0
    lin.inputs["From Max"].default_value = 0.5
    lin.inputs["To Min"].default_value = 1.0
    lin.inputs["To Max"].default_value = 0.45
    nt.links.new(ab.outputs[0], lin.inputs["Value"])
    nt.links.new(lin.outputs[0], em.inputs["Strength"])
    em.inputs["Color"].default_value = (1, 1, 1, 1)
    nt.links.new(em.outputs[0], out.inputs[0])
    return m


def black_material():
    def build(nt, dst):
        dst.default_value = (0.0, 0.0, 0.0, 1.0)
    return emit_material("_black", build)


def mesh_arrays_t(o):
    """Like mesh_arrays, plus MikkTSpace tangents (xyz, w = bitangent sign)."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg)
    me = ev.to_mesh()
    me.calc_loop_triangles()
    me.calc_tangents(uvmap=me.uv_layers.active.name)
    uvl = me.uv_layers.active.data
    co = np.array([v.co[:] for v in me.vertices])
    corner_n = np.array([cn.vector[:] for cn in me.corner_normals])
    pid = me.attributes.get("piece")
    fp = np.array([pid.data[i].value for i in range(len(me.polygons))]) if pid else np.zeros(len(me.polygons), int)
    key, P, N, UV, TG, PI, idx = {}, [], [], [], [], [], []
    for tri in me.loop_triangles:
        for li in tri.loops:
            lp = me.loops[li]
            vi = lp.vertex_index
            uv = uvl[li].uv
            n = corner_n[li]
            t = lp.tangent
            k = (vi, round(uv[0], 5), round(uv[1], 5), round(n[0], 3), round(n[1], 3), round(n[2], 3), round(t[0], 2), round(t[1], 2), round(t[2], 2),
                 lp.bitangent_sign)
            if k not in key:
                key[k] = len(P)
                P.append(co[vi])
                N.append(n)
                UV.append((uv[0], 1 - uv[1]))
                TG.append((t[0], t[1], t[2], lp.bitangent_sign))
                PI.append(fp[tri.polygon_index])
            idx.append(key[k])
    ev.to_mesh_clear()
    TG = np.array(TG, float)
    # glTF frame: xyz like positions; the UV v flip mirrors the bitangent
    TG = np.c_[B2G(TG[:, :3]), -TG[:, 3]]
    return B2G(np.array(P)), B2G(np.array(N)), np.array(UV), TG, np.array(idx).reshape(-1, 3), np.array(PI)


def split_by_item(arrs, piece_item, items):
    """Group arrays (P, N, UV, T, I, PI) -> {item: arrays} by the piece id of each face."""
    P, N, UV, TG, I, PI = arrs
    out = {}
    face_item = np.array([piece_item[PI[f[0]]] for f in I])
    for it in items:
        sel = I[face_item == it]
        if not len(sel):
            continue
        used = np.unique(sel)
        rm = -np.ones(len(P), int)
        rm[used] = np.arange(len(used))
        out[it] = (P[used], N[used], UV[used], TG[used], rm[sel], PI[used])
    return out


def snap_strips(fx, lo, lift=0.0004, reach=0.004):
    """Lift inlay (or glow) vertices that the decimated low surface now covers onto it."""
    from mathutils.bvhtree import BVHTree

    if not fx["V"]:
        return 0
    dg = bpy.context.evaluated_depsgraph_get()
    bvh = BVHTree.FromObject(lo, dg)
    moved = 0
    for i, q in enumerate(fx["V"]):
        p = v3(q)
        loc, nrm, _, d = bvh.find_nearest(p)
        if loc is None or d > reach:
            continue
        if (p - loc).dot(nrm) < lift * 0.75:
            fx["V"][i] = B2G(np.array([loc + nrm * lift]))[0]
            moved += 1
    return moved


def main_groups(p):
    sc = reset_scene()
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    out = Path(p["out"])
    out.mkdir(parents=True, exist_ok=True)
    meta = json.loads(Path(p["pieces_json"]).read_text())
    npz = np.load(p["pieces_npz"])
    specs = p["materials"]
    budget = p["budget"]
    lods = p.get("lods", [0.5, 0.25])
    body = np.load(p["body_npz"])
    occ = mesh_obj("_body", G2B(body["V"]), [tuple(f) for f in body["F"]])
    from mathutils.bvhtree import BVHTree
    body_bvh = BVHTree.FromPolygons([Vector(v) for v in G2B(body["V"])], [tuple(map(int, f)) for f in body["F"]])
    report = {"sets": {}, "groups": {}}
    damaged = []
    report["damaged_pieces"] = damaged
    by_item = {}
    for m in meta:
        by_item.setdefault(m["set"], []).append(m)
    for group, items in p["groups"].items():
        items = [it for it in items if it in by_item]
        fx = {"V": [], "N": [], "UV": [], "F": [], "piece": []}
        glow = {"V": [], "N": [], "UV": [], "F": [], "piece": []}
        names, mats, piece_item = [], [], []
        hi_objs, lo_objs, info = [], [], {}
        for item in items:
            mains, details, lows, lgro = [], [], [], []
            fx_f0 = len(fx["F"])
            glow_f0 = len(glow["F"])
            for m in by_item[item]:
                V, F = npz[m["name"] + "_V"], npz[m["name"] + "_F"]
                arr = split_parts(V, F) if m.get("multi") else (V, F)
                fx_before = len(fx["V"])
                glow_before = len(glow["V"])
                det = []
                o = build_piece(m, arr, fx, det, glow)
                if o is None:
                    continue
                if not m.get("multi") and len(V):
                    # a solidified sheet has at least twice its design area; much
                    # less means a boolean ate the plate
                    tri = np.asarray(V, float)[np.asarray(F)]
                    a0 = float(np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1).sum() / 2)
                    a1 = sum(pp.area for pp in o.data.polygons)
                    if a1 < 1.5 * a0:
                        damaged.append({"piece": m["name"], "design_area_cm2": round(a0 * 1e4, 1), "built_area_cm2": round(a1 * 1e4, 1)})
                if m["mat"] not in mats:
                    mats.append(m["mat"])
                for x in [o] + det:
                    set_piece_attr(x, len(names))
                    x.data.materials.clear()
                    x.data.materials.append(bpy.data.materials.get(m["mat"]) or bpy.data.materials.new(m["mat"]))
                    a = x.data.attributes.new("matid", "INT", "FACE")
                    a.data.foreach_set("value", [mats.index(m["mat"]) + 1] * len(x.data.polygons))
                fx["piece"] += [len(names)] * (len(fx["V"]) - fx_before)
                glow["piece"] += [len(names)] * (len(glow["V"]) - glow_before)
                names.append(m["name"])
                piece_item.append(item)
                # the low piece: the faces nobody sees (against the body) go,
                # each piece gets its own clean UV islands before decimation
                lo = copy_obj(o, m["name"] + "_lo")
                strip_inner(lo, body_bvh)
                if not lo.data.polygons:
                    delete([lo])
                else:
                    unwrap(lo, margin=0.004, angle=60, pack=False)
                    lows.append(lo)
                    lgro.append([G2B(densify(g["pts"])) for g in m.get("grooves", []) if g["inlay"]])
                mains.append(o)
                details += det
            hi = join(mains, item)
            smooth_by_angle(hi, 24)
            hi_tris = tri_count(hi) + sum(tri_count(x) for x in details)
            # the module budget covers its channel strips too, shared over its pieces
            fx_tris = len(fx["F"]) - fx_f0 + len(glow["F"]) - glow_f0  # channel strips and their glow ribbons
            have = [tri_count(x) for x in lows]
            alloc = allocate(have, int(budget.get(item, hi_tris)) - fx_tris)
            for x, want, gro in zip(lows, alloc, lgro):
                decimate(x, want, groove_vertices(x, gro, 0.0042) if gro else None)
            lo = join(lows, item + "_lo")
            target = int(budget.get(item, hi_tris)) - fx_tris
            if tri_count(lo) > target:  # per-piece floors can overshoot slightly: trim the module as a whole
                decimate(lo, target)
            lo_tris = tri_count(lo)
            hi_objs.append(hi)
            if details:
                d = join(details, item + "_detail")
                smooth_by_angle(d, 40)
                hi_objs.append(d)
            lo_objs.append(lo)
            info[item] = {"high_triangles": hi_tris, "triangles": lo_tris, "budget": int(budget.get(item, hi_tris))}
        lo_g = join(lo_objs, group)
        bpy.ops.object.select_all(action="DESELECT")
        lo_g.select_set(True)
        bpy.context.view_layer.objects.active = lo_g
        # the bakes and the exported tangents use the same triangles
        tm_ = lo_g.modifiers.new("tri", "TRIANGULATE")
        tm_.quad_method = "BEAUTY"
        tm_.ngon_method = "BEAUTY"
        bpy.ops.object.modifier_apply(modifier=tm_.name)
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
        smooth_by_angle(lo_g, 32)
        size = int(p["texture"].get(group, 2048))
        pack(lo_g, margin=0.003)
        smp = p["samples"]
        id_mat = emit_material("_id", lambda nt, dst: matid_chain(nt, dst))
        mid = dilate_ids(np.rint(bake_s2a(lo_g, hi_objs, id_mat, "EMIT", size, 1, f"{group}_id")[..., 0] * 16).astype(int))
        fields = bake_s2a(lo_g, hi_objs, fields_material(), "EMIT", size, 1, f"{group}_fields")
        edges = bake_s2a(lo_g, hi_objs, edges_material(), "EMIT", size, smp, f"{group}_edges")
        ao = bake_s2a(lo_g, hi_objs, emit_material("_ao", lambda nt, dst: ao_chain(nt, dst)), "EMIT", size, smp, f"{group}_ao")
        nrm = bake_s2a(lo_g, hi_objs, detail_normal_material(), "NORMAL", size, smp, f"{group}_normal")
        # emissive mask of the channels (for the distance LODs): inlays glow, plates are black
        emask = None
        if fx["V"]:
            fv = np.asarray(fx["V"], float)
            fxo_bake = mesh_obj(f"{group}__fxbake", G2B(fv), [tuple(f) for f in fx["F"]])
            me = fxo_bake.data
            uvl = me.uv_layers.new(name="UVMap")
            fuv = np.asarray(fx["UV"], float)
            for poly in me.polygons:
                for li in poly.loop_indices:
                    uvl.data[li].uv = fuv[me.loops[li].vertex_index]
            fxo_bake.data.materials.append(channel_emit_material())
            blk = black_material()
            saved = {o.name: [s_.material for s_ in o.material_slots] for o in hi_objs}
            for o in hi_objs:
                for s_ in o.material_slots:
                    s_.material = blk
            emask = bake_s2a(lo_g, [fxo_bake] + hi_objs, None, "EMIT", size, 4, f"{group}_emit", extrusion=0.006, ray=0.016)[..., 0]
            for o in hi_objs:
                for s_, m0 in zip(o.material_slots, saved[o.name]):
                    s_.material = m0
            delete([fxo_bake])
        base, rough, metal = composite(fields, edges, ao, mid, specs, mats)
        files = {"basecolor": f"{group}_basecolor.png", "roughness": f"{group}_roughness.png", "metallic": f"{group}_metallic.png", "normal": f"{group}_normal.png"}
        save_png(out / files["basecolor"], base, srgb=True)
        save_png(out / files["roughness"], np.repeat(rough[..., None], 3, 2))
        save_png(out / files["metallic"], np.repeat(metal[..., None], 3, 2))
        save_png(out / files["normal"], nrm)
        if emask is not None:
            em = np.clip(emask, 0, 1)[..., None] * np.array([1.0, 0.0129, 0.0129], np.float32)  # #FF1E1E (linear)
            files["emissive"] = f"{group}_emissive.png"
            save_png(out / files["emissive"], em, srgb=True)
        moved = snap_strips(fx, lo_g)
        snap_strips(glow, lo_g, lift=0.0022, reach=0.006)
        arrays = {it: {} for it in items}
        lod_tris = {}
        split = split_by_item(mesh_arrays_t(lo_g), piece_item, items)
        for it, (P_, N_, UV_, T_, I_, PI_) in split.items():
            arrays[it].update({"P": P_, "N": N_, "UV": UV_, "T": T_, "I": I_, "piece": PI_})
            lod_tris[it] = [int(len(I_))]
        # distance LODs per module (each keeps its share), sharing LOD0's UVs
        levels = []
        for it in items:
            ids = {k for k, pi in enumerate(piece_item) if pi == it}
            for k, r in enumerate(lods, 1):
                c = copy_obj(lo_g, f"{it}_lod{k}")
                bm = bmesh.new()
                bm.from_mesh(c.data)
                lay = bm.faces.layers.int.get("piece")
                bmesh.ops.delete(bm, geom=[f for f in bm.faces if f[lay] not in ids], context="FACES")
                bm.to_mesh(c.data)
                bm.free()
                decimate(c, int(lod_tris[it][0] * r))
                P_, N_, UV_, T_, I_, PI_ = split_by_item(mesh_arrays_t(c), piece_item, [it])[it]
                arrays[it].update({f"L{k}_P": P_, f"L{k}_N": N_, f"L{k}_UV": UV_, f"L{k}_T": T_, f"L{k}_I": I_, f"L{k}_piece": PI_})
                lod_tris[it].append(int(len(I_)))
                levels.append(("", c))
        fxv = np.asarray(fx["V"], float) if fx["V"] else None
        for it in items:
            if fxv is not None:
                fp = np.asarray(fx["piece"])
                fF = np.asarray(fx["F"], int)
                keep = np.array([piece_item[fp[f[0]]] == it for f in fF])
                if keep.any():
                    sel = fF[keep]
                    used = np.unique(sel)
                    rm = -np.ones(len(fxv), int)
                    rm[used] = np.arange(len(used))
                    fnn = np.asarray(fx["N"], float)[used]
                    arrays[it].update(FX_P=fxv[used], FX_N=fnn / np.linalg.norm(fnn, axis=1, keepdims=True), FX_UV=np.asarray(fx["UV"], float)[used],
                                      FX_I=rm[sel], FX_piece=fp[used])
            if glow["V"]:
                gv = np.asarray(glow["V"], float)
                gp = np.asarray(glow["piece"])
                gF = np.asarray(glow["F"], int)
                keep = np.array([piece_item[gp[f[0]]] == it for f in gF])
                if keep.any():
                    sel = gF[keep]
                    used = np.unique(sel)
                    rm = -np.ones(len(gv), int)
                    rm[used] = np.arange(len(used))
                    gn = np.asarray(glow["N"], float)[used]
                    arrays[it].update(GLOW_P=gv[used], GLOW_N=gn / np.linalg.norm(gn, axis=1, keepdims=True), GLOW_UV=np.asarray(glow["UV"], float)[used],
                                      GLOW_I=rm[sel], GLOW_piece=gp[used])
            np.savez(out / f"{it}.npz", **arrays[it])
            item_pieces = [n for n, pi in zip(names, piece_item)]  # global piece ids within the group
            report["sets"][it] = {"pieces": item_pieces, "images": files, "npz": f"{it}.npz", "group": group, "triangles": lod_tris[it][0],
                                  "lod_triangles": lod_tris[it], "fx_triangles": int(len(arrays[it].get("FX_I", []))), "glow_triangles": int(len(arrays[it].get("GLOW_I", []))),
                                  "materials": mats, **info[it]}
        report["groups"][group] = {"items": items, "texture": size, "images": files, "strips_snapped": moved,
                                   "triangles": int(sum(lod_tris[it][0] for it in items if it in lod_tris))}
        for _, o in levels:
            delete([o])
        for o in hi_objs:
            o.hide_render = True
            o.hide_set(True)
    delete([occ])
    blend = p.get("blend_name", "armour_source.blend")
    bpy.ops.wm.save_as_mainfile(filepath=str(out / blend), compress=True)
    report["blend"] = blend
    finish(p, report)


if __name__ == "__main__":
    main()
