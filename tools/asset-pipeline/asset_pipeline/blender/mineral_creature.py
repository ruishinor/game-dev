"""Build a mineral creature in Blender from measured reference constraints.

Input: constraints.json from the `measure` stage (top-view outline, plate
polygons segmented along the painted fractures, crystal footprints, moss
patches, leg emergence points, lineup-derived scale and heights, and a
reference colour palette). Output: an editable .blend in which every object
records its part class and the bone it will follow.

Where each part comes from:
  plates         top-view fracture polygons (reference-derived layout), slab
                 thickness, tilt and surface relief are authored
  outline/strata top-view outline at the lineup-measured heights; layering authored
  underside/keel lineup underside height; chunk shapes procedural (convex hulls)
  crystals       top-view footprint positions and sizes; heights scaled to the
                 lineup crystal height; facets and terminations procedural
  moss           top-view moss patches
  legs           top-view emergence points and directions; joint heights from
                 the side views; segment design from the detail studies
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import bpy  # noqa: I001
import bmesh
import numpy as np
from mathutils import Matrix, Vector, noise

from asset_pipeline.blender.common import finish, payload, reset_scene

RNG = np.random.default_rng(11)


# ----------------------------------------------------------------------------- frame
class Frame:
    """Top-view pixels <-> world metres. Front (image top) -> -Y; creature right (image right) -> -X."""

    def __init__(self, top, img_w, img_h):
        self.c = np.array(top["centre_px"])
        self.la = np.array(top["long_axis_px"])
        self.sa = np.array(top["side_axis_px"])
        self.mpp = top["metres_per_px"]
        self.w, self.h = img_w, img_h

    def to_world(self, pt):
        d = np.asarray(pt, float) - self.c
        return np.array([-(d @ self.sa) * self.mpp, -(d @ self.la) * self.mpp])

    def to_uv(self, xy):
        xy = np.atleast_2d(xy)
        ds = -xy[:, 0] / self.mpp
        dl = -xy[:, 1] / self.mpp
        px = self.c + ds[:, None] * self.sa + dl[:, None] * self.la
        return np.stack([px[:, 0] / self.w, 1 - px[:, 1] / self.h], 1)


def poly_area(P):
    x, y = P[:, 0], P[:, 1]
    return 0.5 * (x @ np.roll(y, -1) - y @ np.roll(x, -1))


def ccw(P):
    return P if poly_area(P) > 0 else P[::-1]


def resample_closed(P, n):
    Q = np.vstack([P, P[:1]])
    seg = np.linalg.norm(np.diff(Q, axis=0), axis=1)
    t = np.concatenate([[0], np.cumsum(seg)])
    s = np.linspace(0, t[-1], n, endpoint=False)
    return np.stack([np.interp(s, t, Q[:, 0]), np.interp(s, t, Q[:, 1])], 1)


def fbm(p, octaves=4):
    return noise.fractal(Vector(p), 1.0, 2.0, octaves, noise_basis="PERLIN_ORIGINAL")


# ----------------------------------------------------------------------------- mesh helpers
COLL = None


def make_obj(name, verts, faces, mat, part, bone, smooth=False):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(map(float, v)) for v in verts], [], [tuple(map(int, f)) for f in faces])
    me.validate(clean_customdata=False)
    me.update()
    obj = bpy.data.objects.new(name, me)
    COLL.objects.link(obj)
    if mat:
        me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = smooth
    obj["part_class"] = part
    obj["bone"] = bone
    return obj


def hull_obj(name, pts, mat, part, bone):
    from scipy.spatial import ConvexHull

    pts = np.asarray(pts, float)
    h = ConvexHull(pts)
    used = np.unique(h.simplices)
    remap = -np.ones(len(pts), int)
    remap[used] = np.arange(len(used))
    faces = []
    cen = pts[used].mean(0)
    for s, eq in zip(h.simplices, h.equations):
        f = remap[s]
        a, b, c = pts[s]
        if np.dot(np.cross(b - a, c - a), eq[:3]) < 0:
            f = f[::-1]
        faces.append(f)
    obj = make_obj(name, pts[used], faces, mat, part, bone)
    # merge coplanar triangles into facets so it reads as fractured stone, not a mesh blob
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(2), verts=bm.verts, edges=bm.edges)
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def rock_points(center, axes, half, rng, n=16, jitter=0.25):
    """Random points on a jittered box: convex hulls of these read as angular, fractured rock."""
    P = []
    for _ in range(n):
        u = rng.uniform(-1, 1, 3)
        k = rng.integers(0, 3)
        u[k] = np.sign(u[k] or 1)  # push to a box face
        u *= 1 + rng.uniform(-jitter, jitter * 0.5, 3)
        P.append(center + axes @ (u * half))
    return np.array(P)


def block_points(center, axes, half, rng, jitter=0.12, extra=4):
    corners = np.array([[x, y, z] for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)], float)
    corners *= 1 + rng.uniform(-jitter, jitter, corners.shape)
    pts = [center + axes @ (c * half) for c in corners]
    for _ in range(extra):  # a few chipped corners
        c = corners[rng.integers(0, 8)] * rng.uniform(0.75, 0.95, 3)
        pts.append(center + axes @ (c * half))
    return np.array(pts)


def displace_obj(obj, amp, scale, seed, cuts=2, up_only=False, sharp=0.0):
    """Subdivide and displace along normals with fractal noise (surface relief)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    if cuts:
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    bm.normal_update()
    off = Vector((seed * 3.17, seed * 1.31, seed * 2.03))
    for v in bm.verts:
        if up_only and v.normal.z < 0.3:
            continue
        p = v.co * scale + off
        d = fbm(p) * amp
        if sharp:
            d += sharp * amp * (1 - abs(noise.noise(p * 2.3)))
        v.co += v.normal * d
    bm.to_mesh(obj.data)
    bm.free()


def set_uv_topproj(obj, frame):
    """UV layer 'topproj': orthographic projection of the top reference view (source colour)."""
    me = obj.data
    uvl = me.uv_layers.new(name="topproj")
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    M = np.array(obj.matrix_world)
    co = co @ M[:3, :3].T + M[:3, 3]
    uv = frame.to_uv(co[:, :2])
    li = np.empty(len(me.loops), np.int64)
    me.loops.foreach_get("vertex_index", li)
    uvl.data.foreach_set("uv", uv[li].ravel())


# ----------------------------------------------------------------------------- materials
def lin(pal, key, fallback):
    return tuple(pal[key]["linear"]) if key in pal else fallback


def mat_stone(name, pal, top_img, ochre_amt, base_key="stone_side"):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    N, L = nt.nodes, nt.links
    bsdf = N["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.88
    tc = N.new("ShaderNodeTexCoord")
    n1 = N.new("ShaderNodeTexNoise")
    n1.inputs["Scale"].default_value = 3.5
    n1.inputs["Detail"].default_value = 10
    n1.inputs["Roughness"].default_value = 0.62
    L.new(tc.outputs["Object"], n1.inputs["Vector"])
    ramp = N.new("ShaderNodeValToRGB")
    # Albedo comes from the reference's lit mid-tone only. Its darkest quartile
    # ("stone_shadow") is shading painted into the illustration, not material
    # colour, so it is not used as albedo; runtime lighting creates the shade.
    mid = lin(pal, base_key, (0.11, 0.105, 0.097))
    ramp.color_ramp.elements[0].color = (*[c * 0.6 for c in mid], 1)
    ramp.color_ramp.elements[0].position = 0.3
    ramp.color_ramp.elements[1].color = (*[min(1, c * 1.2) for c in mid], 1)
    ramp.color_ramp.elements[1].position = 0.7
    L.new(n1.outputs["Fac"], ramp.inputs["Fac"])
    # ochre mineral streaks: stretched noise (vertical) thresholded
    mp = N.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (6.0, 6.0, 0.9)
    L.new(tc.outputs["Object"], mp.inputs["Vector"])
    n2 = N.new("ShaderNodeTexNoise")
    n2.inputs["Scale"].default_value = 2.2
    n2.inputs["Detail"].default_value = 6
    L.new(mp.outputs["Vector"], n2.inputs["Vector"])
    oc = N.new("ShaderNodeMapRange")
    oc.inputs["From Min"].default_value = 0.70 - 0.05 * ochre_amt
    oc.inputs["From Max"].default_value = 0.78 - 0.05 * ochre_amt
    oc.inputs["To Max"].default_value = 0.75
    L.new(n2.outputs["Fac"], oc.inputs["Value"])
    mo = N.new("ShaderNodeMix")
    mo.data_type = "RGBA"
    L.new(oc.outputs["Result"], mo.inputs["Factor"])
    L.new(ramp.outputs["Color"], mo.inputs["A"])
    mo.inputs["B"].default_value = (*lin(pal, "ochre", (0.21, 0.14, 0.07)), 1)
    color_out = mo.outputs["Result"]
    if top_img is not None:
        # source colour on up-facing surfaces from the top reference view
        uvm = N.new("ShaderNodeUVMap")
        uvm.uv_map = "topproj"
        ti = N.new("ShaderNodeTexImage")
        ti.image = top_img
        ti.extension = "EXTEND"
        L.new(uvm.outputs["UV"], ti.inputs["Vector"])
        geo = N.new("ShaderNodeNewGeometry")
        sep = N.new("ShaderNodeSeparateXYZ")
        L.new(geo.outputs["Normal"], sep.inputs["Vector"])
        up = N.new("ShaderNodeMapRange")
        up.inputs["From Min"].default_value = 0.35
        up.inputs["From Max"].default_value = 0.75
        L.new(sep.outputs["Z"], up.inputs["Value"])
        mt = N.new("ShaderNodeMix")
        mt.data_type = "RGBA"
        L.new(up.outputs["Result"], mt.inputs["Factor"])
        L.new(color_out, mt.inputs["A"])
        L.new(ti.outputs["Color"], mt.inputs["B"])
        color_out = mt.outputs["Result"]
    # cavity darkening: occluded crevices collect grime (bakes into the albedo atlas)
    ao = N.new("ShaderNodeAmbientOcclusion")
    ao.inputs["Distance"].default_value = 0.18
    ao.only_local = True
    cav = N.new("ShaderNodeMapRange")
    cav.inputs["To Min"].default_value = 0.42
    L.new(ao.outputs["AO"], cav.inputs["Value"])
    mc = N.new("ShaderNodeMix")
    mc.data_type = "RGBA"
    mc.blend_type = "MULTIPLY"
    mc.inputs["Factor"].default_value = 1.0
    L.new(color_out, mc.inputs["A"])
    L.new(cav.outputs["Result"], mc.inputs["B"])
    color_out = mc.outputs["Result"]
    L.new(color_out, bsdf.inputs["Base Color"])
    # micro relief
    bump = N.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.8
    bump.inputs["Distance"].default_value = 0.015
    n3 = N.new("ShaderNodeTexNoise")
    n3.inputs["Scale"].default_value = 28
    n3.inputs["Detail"].default_value = 8
    L.new(tc.outputs["Object"], n3.inputs["Vector"])
    L.new(n3.outputs["Fac"], bump.inputs["Height"])
    L.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def mat_crystal(color):
    """Milky quartz: measured base colour, vertical striations, clouded base, varying gloss."""
    m = bpy.data.materials.new("crystal")
    m.use_nodes = True
    nt = m.node_tree
    N, L = nt.nodes, nt.links
    b = N["Principled BSDF"]
    b.inputs["Coat Weight"].default_value = 0.35
    tc = N.new("ShaderNodeTexCoord")
    mp = N.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (14.0, 14.0, 1.2)  # stretched along the growth axis
    L.new(tc.outputs["Object"], mp.inputs["Vector"])
    n = N.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = 3.0
    n.inputs["Detail"].default_value = 8
    L.new(mp.outputs["Vector"], n.inputs["Vector"])
    r = N.new("ShaderNodeValToRGB")
    r.color_ramp.elements[0].color = (*[c * 0.72 for c in color], 1)
    r.color_ramp.elements[1].color = (*[min(1, c * 1.12) for c in color], 1)
    L.new(n.outputs["Fac"], r.inputs["Fac"])
    L.new(r.outputs["Color"], b.inputs["Base Color"])
    rg = N.new("ShaderNodeMapRange")
    rg.inputs["To Min"].default_value = 0.18
    rg.inputs["To Max"].default_value = 0.5
    L.new(n.outputs["Fac"], rg.inputs["Value"])
    L.new(rg.outputs["Result"], b.inputs["Roughness"])
    bump = N.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.25
    bump.inputs["Distance"].default_value = 0.004
    L.new(n.outputs["Fac"], bump.inputs["Height"])
    L.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def mat_simple(name, color, rough, metallic=0.0, variation=0.15, scale=12.0, coat=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    N, L = nt.nodes, nt.links
    b = N["Principled BSDF"]
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metallic
    if coat:
        b.inputs["Coat Weight"].default_value = coat
    tc = N.new("ShaderNodeTexCoord")
    n = N.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = 6
    L.new(tc.outputs["Object"], n.inputs["Vector"])
    r = N.new("ShaderNodeValToRGB")
    r.color_ramp.elements[0].color = (*[c * (1 - variation) for c in color], 1)
    r.color_ramp.elements[1].color = (*[min(1, c * (1 + variation)) for c in color], 1)
    L.new(n.outputs["Fac"], r.inputs["Fac"])
    L.new(r.outputs["Color"], b.inputs["Base Color"])
    return m


# ----------------------------------------------------------------------------- build
def build(p):
    global COLL
    C = json.loads(Path(p["constraints"]).read_text())
    top, lineup, pal = C["top"], C["lineup"], C["palette"]
    reset_scene()
    COLL = bpy.data.collections.new(p.get("name", "Stillpoint"))
    bpy.context.scene.collection.children.link(COLL)
    import cv2  # only for the reference image size

    top_png = p["top_image"]
    th, tw = cv2.imread(top_png).shape[:2]
    F = Frame(top, tw, th)
    top_img = bpy.data.images.load(top_png)
    top_img.name = "ref_top_view"

    H_dorsal = lineup["dorsal_height_m"]
    # The lineup sketch is ~42 px tall: its "solid" rows include the upper legs.
    # The textured views place the body's general underside higher; the build
    # takes that from the configured ratio (see asset.json build.underside_ratio).
    H_under = p.get("underside_ratio", 0.55) * H_dorsal
    H_cry = lineup["crystal_above_dorsal_m"] * C.get("crystal_height_scale", 1.0)
    outline = ccw(np.array([F.to_world(q) for q in top["outline_px"]]))
    cen = outline.mean(0)
    half_l = top["length_px"] * F.mpp / 2
    half_w = top["width_px"] * F.mpp / 2

    def rn(xy):
        d = (np.asarray(xy) - cen) / np.array([half_w, half_l])
        return float(np.clip(np.linalg.norm(d), 0, 1.3))

    def z_top(xy):
        r = rn(xy)
        return H_dorsal + 0.04 - 0.20 * r ** 2 + 0.03 * fbm((xy[0] * 0.8, xy[1] * 0.8, 0.5))

    M_plate = mat_stone("stone_plate", pal, top_img, ochre_amt=0.0, base_key="plate_top")
    M_strata = mat_stone("stone_strata", pal, top_img, ochre_amt=1.1)
    M_under = mat_stone("stone_underside", pal, None, ochre_amt=1.0, base_key="stone_side")
    M_leg = mat_stone("stone_limb", pal, None, ochre_amt=1.4)
    cry = pal.get("crystal", {}).get("linear", [0.35, 0.33, 0.30])
    M_cry = mat_crystal([min(1, c * 1.15) for c in cry])
    mo = pal.get("moss", {}).get("linear", [0.07, 0.065, 0.025])
    M_moss = mat_simple("moss", [mo[0] * 1.1, mo[1] * 1.45, mo[2] * 0.8], 0.95, variation=0.45, scale=60)
    M_joint = mat_simple("joint_coupling", [0.035, 0.032, 0.028], 0.55, variation=0.25, scale=20)
    M_ring = mat_simple("joint_ochre", lin(pal, "ochre", (0.21, 0.14, 0.07)), 0.5, variation=0.2)
    counts = {}

    def count(k):
        counts[k] = counts.get(k, 0) + 1

    # ---- dorsal plates: one slab per measured fracture polygon
    for i, pl in enumerate(top["plates"]):
        P = ccw(np.array([F.to_world(q) for q in pl["polygon_px"]]))
        if len(P) < 3 or abs(poly_area(P)) < 0.004:
            continue
        # densify straight fracture edges (keeps corners), then chip them slightly
        P = resample_closed(P, max(10, min(36, len(P) * 4)))
        P = P + RNG.normal(0, 0.006, P.shape)
        c = P.mean(0)
        r_mean = np.linalg.norm(P - c, axis=1).mean()
        edge = rn(c) > 0.62
        gap = 0.005 + 0.004 * RNG.random()
        Pt = c + (P - c) * max(0.5, 1 - gap / max(r_mean, 1e-3))
        if edge:  # shingle: outer plates overhang outward and droop
            out = (c - cen) / (np.linalg.norm(c - cen) + 1e-6)
            Pt = c + (Pt - c) * 1.05 + out * 0.10  # overhang and overlap the neighbours
        thick = (0.07 if not edge else 0.15) + 0.03 * RNG.random()
        tilt = RNG.normal(0, 0.018, 2)
        zc = z_top(c) + RNG.normal(0, 0.006)
        top_z = [zc + (q - c) @ tilt - (0.20 * max(0, rn(q) - 0.6) if edge else 0) for q in Pt]
        Pb = c + (Pt - c) * 0.97
        n = len(Pt)
        verts = [(*q, z) for q, z in zip(Pt, top_z)] + [(*q, z - thick) for q, z in zip(Pb, top_z)]
        faces = [list(range(n)), list(range(2 * n - 1, n - 1, -1))] + [[k, (k + 1) % n, n + (k + 1) % n, n + k] for k in range(n)]
        o = make_obj(f"plate_{i:02d}", verts, faces, M_plate, "dorsal plate", "body")
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.006, segments=1, affect="EDGES", clamp_overlap=True)
        bm.to_mesh(o.data)
        bm.free()
        displace_obj(o, 0.016, 3.0, i, cuts=2, sharp=0.9)
        set_uv_topproj(o, F)
        count("plates")

    # ---- dorsal bed: a continuous surface just under the plates, so the gaps
    # between plates read as thin dark fractures rather than trenches
    from scipy.spatial import Delaunay
    from matplotlib.path import Path as MPath

    rim = resample_closed(cen + (outline - cen) * 0.99, 90)
    gx, gy = np.meshgrid(np.arange(-half_w, half_w, 0.09), np.arange(-half_l, half_l, 0.09))
    grid_pts = np.stack([gx.ravel(), gy.ravel()], 1) + cen
    inner = MPath(rim)
    grid_pts = grid_pts[inner.contains_points(grid_pts) & (np.array([rn(q) for q in grid_pts]) < 0.95)]
    bed_xy = np.vstack([rim, grid_pts])
    tri = Delaunay(bed_xy)
    keep = [t for t in tri.simplices if inner.contains_point(bed_xy[t].mean(0))]
    bed_v = [(*q, z_top(q) - 0.035) for q in bed_xy]
    bed = make_obj("dorsal_bed", bed_v, [list(t) for t in keep], M_strata, "dorsal bed", "body", smooth=True)
    bm = bmesh.new()
    bm.from_mesh(bed.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bm.faces and bm.faces[0].normal.z < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(bed.data)
    bm.free()
    set_uv_topproj(bed, F)
    count("bed")

    # ---- layered strata under the plate brim, following the measured outline
    ring = resample_closed(outline, 72)
    zedge = H_dorsal + 0.04 - 0.20
    span_z = zedge - (H_under + 0.20)
    layers = [(1.03, 0.10, 0.10 + 0.34 * span_z, 0.05), (0.92, 0.08 + 0.30 * span_z, 0.10 + 0.66 * span_z, 0.07), (0.78, 0.08 + 0.60 * span_z, 0.10 + 0.95 * span_z, 0.10)]
    for li, (sc, d0, d1, inset) in enumerate(layers):
        k = 0
        idx = 0
        while idx < len(ring):
            span = int(RNG.integers(4, 7))
            seg = ring[[(idx + j) % len(ring) for j in range(span + 1)]]
            outer = cen + (seg - cen) * sc
            inner = cen + (seg - cen) * (sc - 0.22)
            zt = zedge - d0 + RNG.normal(0, 0.03)
            zb = zedge - d1 + RNG.normal(0, 0.04)
            pts = []
            for q in outer:
                pts.append((*(q + RNG.normal(0, 0.03, 2)), zt + RNG.normal(0, 0.03)))
                pts.append((*(q + RNG.normal(0, 0.04, 2) - (q - cen) / np.linalg.norm(q - cen) * inset), zb + RNG.normal(0, 0.03)))
            for q in inner:
                pts.append((*q, zt))
                pts.append((*q, zb))
            o = hull_obj(f"strata_{li}_{k:02d}", np.array(pts), M_strata, "layered stratum", "body")
            displace_obj(o, 0.02, 4.0, 100 + li * 50 + k, cuts=1)
            set_uv_topproj(o, F)
            count("strata")
            k += 1
            idx += span

    # ---- body core (mostly hidden; closes gaps between strata and underside)
    core = []
    for q in resample_closed(outline, 40):
        for sc_, z in [(0.86, zedge - 0.05), (0.72, H_under + 0.35), (0.45, H_under + 0.12)]:
            core.append((*(cen + (q - cen) * sc_), z))
    hull_obj("body_core", np.array(core), M_under, "body core", "body")
    count("core")

    # ---- underside: hanging angular chunks + central keel
    gx = np.arange(-half_w * 0.75, half_w * 0.76, 0.34)
    gy = np.arange(-half_l * 0.75, half_l * 0.76, 0.36)
    from matplotlib.path import Path as MPath

    inside = MPath(cen + (outline - cen) * 0.64)
    k = 0
    for x in gx:
        for y in gy:
            q = np.array([x, y]) + cen + RNG.normal(0, 0.06, 2)
            if not inside.contains_point(q):
                continue
            r = rn(q)
            bottom = H_under + 0.10 + 0.32 * r + RNG.normal(0, 0.05)
            topz = H_under + 0.58
            half = np.array([0.15 + 0.06 * RNG.random(), 0.15 + 0.06 * RNG.random(), (topz - bottom) / 2])
            ang = RNG.uniform(0, math.pi)
            axes = np.array([[math.cos(ang), -math.sin(ang), 0], [math.sin(ang), math.cos(ang), 0], [0, 0, 1]])
            pts = rock_points(np.array([q[0], q[1], (topz + bottom) / 2]), axes, half, RNG, n=14)
            pts = np.vstack([pts, [[q[0] + RNG.normal(0, 0.04), q[1] + RNG.normal(0, 0.04), bottom - 0.06]]])
            o = hull_obj(f"underside_{k:02d}", pts, M_under, "underside mass", "body")
            displace_obj(o, 0.015, 5.0, 300 + k, cuts=1)
            count("underside")
            k += 1
    keel_c = cen + np.array([0, -0.12 * half_l])
    pts = rock_points(np.array([keel_c[0], keel_c[1], H_under + 0.25]), np.eye(3), np.array([0.24, 0.32, 0.22]), RNG, n=18)
    pts = np.vstack([pts, [[keel_c[0], keel_c[1] - 0.05, H_under - 0.22]]])
    hull_obj("keel", pts, M_under, "central keel", "body")
    count("keel")

    # ---- crystals from the top-view footprints
    crys = list(top["crystals"])
    rmax = max(c_["radius_px"] for c_ in crys)
    # authored satellites: the references show principal crystals packed with
    # smaller ones at their base; the top view cannot resolve those
    for big in [c_ for c_ in crys if c_["radius_px"] / rmax > 0.6][:12]:
        for k in range(int(RNG.integers(3, 6))):
            a = RNG.uniform(0, 2 * math.pi)
            d = big["radius_px"] * RNG.uniform(1.3, 2.1)
            crys.append({"centre_px": [big["centre_px"][0] + d * math.cos(a), big["centre_px"][1] + d * math.sin(a)], "radius_px": big["radius_px"] * RNG.uniform(0.32, 0.5),
                         "elongation": 1.0, "major_axis": [1.0, 0.0], "satellite": True})
    ccen = np.mean([F.to_world(c_["centre_px"]) for c_ in crys[:12]], 0)
    for i, c_ in enumerate(crys):
        q = F.to_world(c_["centre_px"])
        rw = c_["radius_px"] * F.mpp * (1.45 if c_["radius_px"] / rmax > 0.6 else 1.0)
        rel = c_["radius_px"] / rmax
        h = H_cry * rel ** 2.2 if rel > 0.45 else max(1.3 * rw, H_cry * 0.18 * rel)
        nodule = rel <= 0.45
        if c_.get("satellite"):
            h, nodule = H_cry * RNG.uniform(0.14, 0.34), False
        sides = int(RNG.choice([6, 6, 6, 5, 7]))
        maj = np.array(c_["major_axis"])
        maj_w = F.to_world(F.c + maj) - F.to_world(F.c)
        ang0 = math.atan2(maj_w[1], maj_w[0]) if np.linalg.norm(maj_w) > 0 else 0
        el = min(1.6, max(1.0, c_["elongation"]))
        z0 = z_top(q) - 0.07
        ring_b, ring_t = [], []
        for s_ in range(sides):
            a = 2 * math.pi * s_ / sides + RNG.normal(0, 0.12)
            rr = rw * (0.85 + 0.3 * RNG.random())
            v = np.array([math.cos(a) * rr * el, math.sin(a) * rr])
            v = np.array([v[0] * math.cos(ang0) - v[1] * math.sin(ang0), v[0] * math.sin(ang0) + v[1] * math.cos(ang0)])
            ring_b.append(v)
            ring_t.append(v * (0.9 + 0.08 * RNG.random()))
        body_h = h * (0.55 if nodule else 0.72 + 0.1 * RNG.random())
        verts = [(*b, 0.0) for b in ring_b] + [(*t, body_h + RNG.normal(0, 0.02 * h)) for t in ring_t]
        apex_off = RNG.normal(0, 0.18, 2) * rw
        apex = (apex_off[0], apex_off[1], h)
        faces = [list(range(sides - 1, -1, -1))] + [[j, (j + 1) % sides, sides + (j + 1) % sides, sides + j] for j in range(sides)]
        if RNG.random() < 0.3 and not nodule:  # ridge termination (two apices) for irregularity
            a2 = (apex[0] + rw * 0.35, apex[1] - rw * 0.2, h * 0.9)
            verts += [apex, a2]
            ia, ib = 2 * sides, 2 * sides + 1
            half_s = sides // 2
            for j in range(sides):
                faces.append([sides + j, sides + (j + 1) % sides, ia if j < half_s else ib])
            faces.append([sides + half_s, ib, ia])
            faces.append([sides, ia, ib])
        else:
            verts.append(apex)
            ia = 2 * sides
            for j in range(sides):
                faces.append([sides + j, sides + (j + 1) % sides, ia])
        o = make_obj(f"crystal_{i:02d}", verts, faces, M_cry, "satellite crystal (authored)" if c_.get("satellite") else "dorsal crystal" if not nodule else "crystal nodule",
                     "body")
        # lean away from the cluster centre, plus a little randomness
        away = q - ccen
        lean = math.radians(4 + 9 * RNG.random())
        axis = Vector((-away[1], away[0], 0)).normalized() if np.linalg.norm(away) > 1e-3 else Vector((1, 0, 0))
        o.matrix_world = Matrix.Translation((q[0], q[1], z0)) @ Matrix.Rotation(-lean, 4, axis) @ Matrix.Rotation(RNG.uniform(-0.2, 0.2), 4, "Z")
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if not nodule and RNG.random() < 0.4:  # some crystals get a stepped / broken facet near the tip
            for _ in range(1):
                nrm = Vector((RNG.normal(0, 0.6), RNG.normal(0, 0.6), 1.0)).normalized()
                co = Vector((RNG.normal(0, 0.3) * rw, RNG.normal(0, 0.3) * rw, h * RNG.uniform(0.86, 0.95)))
                geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
                res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=nrm, clear_outer=True)
                edges = [e for e in res["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]
                if edges:
                    bmesh.ops.holes_fill(bm, edges=edges, sides=0)
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=min(0.006, rw * 0.06), segments=1, affect="EDGES", clamp_overlap=True)
        bm.to_mesh(o.data)
        bm.free()
        count("crystals")

    # ---- moss patches from the top view
    for i, mp in enumerate(top.get("moss_patches", [])):
        q = F.to_world(mp["centre_px"])
        rad = max(0.05, math.sqrt(mp["area_px"] / math.pi) * F.mpp * 1.1)
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
        for v in bm.verts:
            v.co.x *= rad * (1 + 0.3 * fbm(v.co * 2 + Vector((i, 0, 0))))
            v.co.y *= rad * (1 + 0.3 * fbm(v.co * 2 + Vector((0, i, 0))))
            v.co.z *= 0.03 + 0.05 * abs(fbm(v.co * 9 + Vector((i, i, 0))))
        me = bpy.data.meshes.new(f"moss_{i:02d}")
        bm.to_mesh(me)
        bm.free()
        o = bpy.data.objects.new(f"moss_{i:02d}", me)
        COLL.objects.link(o)
        me.materials.append(M_moss)
        o.location = (q[0], q[1], z_top(q) + 0.01)
        o["part_class"] = "moss"
        o["bone"] = "body"
        count("moss")

    # ---- legs
    legs_out = []
    names = []
    for lg in top["legs"]:
        P = F.to_world(lg["proximal"])
        D = F.to_world(lg["distal"])
        side = "L" if P[0] > cen[0] else "R"  # creature left = +X
        end = "F" if P[1] < cen[1] else "B"  # front = -Y
        names.append(end + side)
        out = (D - P) / np.linalg.norm(D - P)
        reach = np.linalg.norm(D - P)  # measured: how far the limb projects beyond the outline (top view)
        hip = np.array([*(P - out * 0.30), H_under + 0.30])
        # the top view's limb protrusion is the upper leg and knee seen from above;
        # every side view puts the feet roughly below the knees
        knee = np.array([*(P + out * reach * 0.60), 0.36 * H_dorsal])
        foot = np.array([*(P + out * reach * 0.66), 0.0])
        legs_out.append({"name": end + side, "hip": hip.tolist(), "knee": knee.tolist(), "foot": foot.tolist()})
        build_leg(end + side, hip, knee, foot, M_leg, M_joint, M_ring, M_cry, front=(end == "F"))
        count("legs")
    # object origins at their geometry; bake world transforms into meshes for clean export
    bpy.ops.object.select_all(action="DESELECT")
    for o in COLL.objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = COLL.objects[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.context.scene["creature_legs"] = json.dumps(legs_out)
    bpy.context.scene["build_source"] = "asset_pipeline.blender.mineral_creature from constraints.json"
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=p["out_blend"])
    tris = 0
    for o in COLL.objects:
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
    finish(p, {"objects": len(COLL.objects), "triangles": tris, "counts": counts, "legs": legs_out,
               "dims_m": [float(v) for v in bounds_dims()]})


def bounds_dims():
    lo = np.full(3, 1e9)
    hi = -lo
    for o in COLL.objects:
        for v in o.data.vertices:
            w = np.array(o.matrix_world @ v.co)
            lo = np.minimum(lo, w)
            hi = np.maximum(hi, w)
    return list(lo) + list(hi)


def seg_frame(a, b):
    ax = (b - a) / np.linalg.norm(b - a)
    ref = np.array([0, 0, 1.0]) if abs(ax[2]) < 0.9 else np.array([1.0, 0, 0])
    n1 = np.cross(ax, ref)
    n1 /= np.linalg.norm(n1)
    n2 = np.cross(ax, n1)
    return ax, n1, n2


def build_leg(tag, hip, knee, foot, M_leg, M_joint, M_ring, M_cry, front):
    import zlib

    rng = np.random.default_rng(zlib.crc32(tag.encode()))
    # joint discs: rotation axis is horizontal, perpendicular to the leg plane
    ax_u, n1, n2 = seg_frame(hip, knee)
    plane_n = np.cross(ax_u, np.array([0, 0, 1.0]))
    plane_n /= np.linalg.norm(plane_n)
    for jn, c, r, bone in [("hip", hip, 0.17, f"leg_{tag}_upper"), ("knee", knee, 0.13, f"leg_{tag}_lower")]:
        disc(f"leg_{tag}_{jn}_joint", c, plane_n, r, 0.16, M_joint, M_ring, bone)
    # upper segment: dark coupling core + overlapping angular cladding slabs
    core_seg(f"leg_{tag}_upper_core", hip, knee, 0.12, M_joint, f"leg_{tag}_upper")
    L = np.linalg.norm(knee - hip)
    axes = np.stack([n1, n2, ax_u], 1)
    for k in range(5):
        t = 0.12 + 0.76 * k / 4 + rng.normal(0, 0.04)
        ang = rng.uniform(0, 2 * math.pi) if k else math.pi / 2
        radial = (math.cos(ang) * n1 + math.sin(ang) * n2) * 0.07
        c = hip + (knee - hip) * t + radial
        half = np.array([0.17 + 0.04 * rng.random(), 0.14 + 0.04 * rng.random(), L * (0.22 + 0.08 * rng.random())])
        o = hull_obj(f"leg_{tag}_upper_slab{k}", rock_points(c, axes, half, rng, n=14, jitter=0.3), M_leg, "limb cladding", f"leg_{tag}_upper")
        displace_obj(o, 0.012, 6.0, 500 + k, cuts=1)
    # lower segment: stacked blocks tapering to a pointed foot (detail study)
    ax_l, m1, m2 = seg_frame(knee, foot)
    axes = np.stack([m1, m2, ax_l], 1)
    core_seg(f"leg_{tag}_lower_core", knee, foot + ax_l * -0.25, 0.10, M_joint, f"leg_{tag}_lower")
    Ll = np.linalg.norm(foot - knee)
    nb = 3  # elongated stacked blocks (detail study), slightly overlapping
    for k in range(nb):
        t0, t1 = 0.04 + 0.74 * k / nb, 0.04 + 0.74 * (k + 1) / nb + 0.02
        c = knee + (foot - knee) * (t0 + t1) / 2
        w = 0.17 - 0.025 * k
        half = np.array([w + 0.02 * rng.random(), w * 0.85, Ll * (t1 - t0) / 2])
        c = c + (m1 * rng.normal(0, 0.02) + m2 * rng.normal(0, 0.02))
        spin = rng.normal(0, 0.15)
        R = np.array([[math.cos(spin), -math.sin(spin), 0], [math.sin(spin), math.cos(spin), 0], [0, 0, 1]])
        o = hull_obj(f"leg_{tag}_lower_block{k}", block_points(c, axes @ R, half, rng), M_leg, "limb block", f"leg_{tag}_lower")
        displace_obj(o, 0.01, 7.0, 600 + k, cuts=1)
    # tapered foot
    tb = knee + (foot - knee) * 0.79
    pts = rock_points(tb, axes, np.array([0.13, 0.12, 0.06]), rng, n=10, jitter=0.2)
    pts = np.vstack([pts, foot + rng.normal(0, 0.012, 3) * np.array([1, 1, 0]), foot + m1 * 0.03 + ax_l * -0.02])
    hull_obj(f"leg_{tag}_foot", pts, M_leg, "tapered foot", f"leg_{tag}_lower")
    if front:  # crystal growing from the front shoulders (lookbook and concept views)
        base = hip + (knee - hip) * 0.15 + np.array([0, 0, 0.14])
        h = 0.45
        verts, faces = [], []
        sides = 6
        rr = 0.075
        for s_ in range(sides):
            a = 2 * math.pi * s_ / sides
            verts.append(base + rr * (math.cos(a) * n1 + math.sin(a) * plane_n))
        up = np.array([0, 0, 1.0]) * 0.9 + (-ax_u) * 0.1
        up /= np.linalg.norm(up)
        for s_ in range(sides):
            verts.append(verts[s_] + up * h * 0.75)
        verts.append(base + up * h)
        faces = [list(range(sides - 1, -1, -1))] + [[j, (j + 1) % sides, sides + (j + 1) % sides, sides + j] for j in range(sides)] + [
            [sides + j, sides + (j + 1) % sides, 2 * sides] for j in range(sides)]
        o = make_obj(f"leg_{tag}_shoulder_crystal", verts, faces, M_cry, "shoulder crystal", f"leg_{tag}_upper")
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(o.data)
        bm.free()


def core_seg(name, a, b, r, mat, bone):
    ax, n1, n2 = seg_frame(a, b)
    sides = 8
    verts = []
    for end in (a, b):
        for s in range(sides):
            ang = 2 * math.pi * s / sides
            verts.append(end + r * (math.cos(ang) * n1 + math.sin(ang) * n2))
    faces = [list(range(sides - 1, -1, -1)), list(range(sides, 2 * sides))] + [[j, (j + 1) % sides, sides + (j + 1) % sides, sides + j] for j in range(sides)]
    o = make_obj(name, verts, faces, mat, "flexible coupling core", bone, smooth=True)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()


def disc(name, c, axis, r, depth, M_joint, M_ring, bone):
    """Bearing-like joint disc with concentric rings (detail study)."""
    axis = np.asarray(axis) / np.linalg.norm(axis)
    rot = Vector((0, 0, 1)).rotation_difference(Vector(axis)).to_matrix().to_4x4()
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=r, radius2=r, depth=depth)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    COLL.objects.link(o)
    me.materials.append(M_joint)
    o.matrix_world = Matrix.Translation(Vector(c)) @ rot
    o["part_class"] = "joint disc"
    o["bone"] = bone
    for k, (rr, mr) in enumerate([(r * 0.72, r * 0.05)]):
        for sgn in (1, -1):
            bpy.ops.mesh.primitive_torus_add(major_radius=rr, minor_radius=mr, major_segments=24, minor_segments=6)
            t = bpy.context.object
            for cl in t.users_collection:
                cl.objects.unlink(t)
            COLL.objects.link(t)
            t.name = f"{name}_ring{k}{'a' if sgn > 0 else 'b'}"
            t.data.materials.append(M_ring)
            t.matrix_world = Matrix.Translation(Vector(c) + Vector(axis) * sgn * depth / 2) @ rot
            t["part_class"] = "joint ring"
            t["bone"] = bone


if __name__ == "__main__":
    build(payload())
