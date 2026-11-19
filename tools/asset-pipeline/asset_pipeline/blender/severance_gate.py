"""The Severance Gate: reference-constrained architectural build, bake and export.

One Blender process (run through workspace.run_blender):
  1. geometry   monolith body with real boolean-carved passage, nested arch orders,
                rune panels, carved channels, crown shaft and notches, chipped edges;
                segmented two-tier plinth, ceremonial stairs, cheek walls, landing lamps,
                interior rib arches, floor slabs, debris, levitating fragments and ruins
  2. emissive   rune glyph inlays, dim rear inscriptions, channel inlay strips and lamp
                slits as separate meshes whose UVs carry animation coordinates
  3. UVs        UV0 unique atlas per stone material, UV1 world-scale box projection
                (TEXCOORD_1, used by the runtime for tiling micro-detail)
  4. bake       Cycles bakes of procedural fields, geometric AO, convex-edge mask and
                bump-derived tangent normals; numpy composites albedo / ORM
  5. LOD        Near (default), Mid and Far glTF scenes plus a Ruins scene
  6. export     GLB + metrics JSON (dimensions shared with the gameplay footprint)

Blender frame: X right, -Y front (toward the approach), Z up, metres. The glTF
exporter turns this into +Y up with the front facing +Z.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import bpy  # noqa: I001  (bpy must load before bmesh)
import bmesh
import numpy as np
from mathutils import Matrix, Vector

from asset_pipeline.blender.common import finish, payload

# ----------------------------------------------------------------------------- dimensions
# Defaults are the measured front-elevation proportions (constraints.json) at a
# 28 m total height; the payload may override any of them.
D = dict(
    seed=1907,
    height=28.0,          # top of the crown
    floor=4.6,            # plinth top = landing = passage floor
    hw0=8.05, hw1=3.7,    # body half-width at the plinth / at the crown
    hd0=6.8, hd1=3.6,     # body half-depth at the plinth / at the crown
    chamfer0=0.55, chamfer1=0.32,
    lower=dict(x=9.05, y0=-8.9, y1=7.8, z1=3.3),
    upper=dict(x=8.5, y0=-8.4, y1=7.3),
    stairs=dict(hw=3.0, steps=23, tread=0.38, cheek=0.75),
    passage=dict(hw=2.2, spring=12.2, back=2.2, chamber_hw=2.75, chamber_front=0.2, chamber_spring=12.0),
    orders=[(2.38, 0.80), (2.56, 0.60), (2.74, 0.40), (2.92, 0.21)],
    ribs=dict(count=7, y0=-5.5, step=0.95, depth=0.42, inset0=0.26, shrink=0.045),
    panels_upper=dict(x=2.85, zc=21.55, hh=3.65, hw=0.82, tip=0.95),
    panels_lower=dict(x=4.15, zc=13.15, hh=3.55, hw=0.82, tip=0.95),
    crown=dict(shaft=1.5, shaft_z=19.5, notch=0.55, notch_z=24.6),
    portal=dict(y=1.35, zc=9.4, r=2.45),
)

STONE_BODY = "SG_Stone_Body"
STONE_BASE = "SG_Stone_Base"
RUNE = "SG_Rune"
RUNE_DIM = "SG_RuneDim"
CHANNEL = "SG_Channel"
LAMP = "SG_Lamp"

rng = np.random.default_rng(D["seed"])


# ----------------------------------------------------------------------------- basic mesh helpers
def link(obj, coll=None):
    (coll or bpy.context.scene.collection).objects.link(obj)
    return obj


def mesh_obj(name, verts, faces, coll=None, uvs=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(map(float, v)) for v in verts], [], [tuple(f) for f in faces])
    me.validate(clean_customdata=False)
    if uvs is not None:
        layer = me.uv_layers.new(name="UVMap")
        for poly in me.polygons:
            for li, vi in zip(poly.loop_indices, poly.vertices):
                layer.data[li].uv = uvs[vi]
    me.update()
    return link(bpy.data.objects.new(name, me), coll)


def bm_to_obj(name, bm, coll=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return link(bpy.data.objects.new(name, me), coll)


def prism(name, front, back, coll=None):
    """Closed prism between two loops of equal length (same winding)."""
    n = len(front)
    verts = list(front) + list(back)
    faces = [tuple(reversed(range(n))), tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    o = mesh_obj(name, verts, faces, coll)
    fix_normals(o)
    return o


def fix_normals(o):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()


def chamfer_box(name, c, h, chamfer=0.04, rot=(0, 0, 0), coll=None, jitter=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * h[0], v.co.y * h[1], v.co.z * h[2]))
    if chamfer > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(chamfer, min(h) * 0.45), segments=1, affect="EDGES", profile=0.5)
    if jitter:
        for v in bm.verts:
            v.co += Vector(rng.normal(0, jitter, 3))
    o = bm_to_obj(name, bm, coll)
    o.rotation_euler = rot
    o.location = c
    apply_transform(o)
    return o


def apply_transform(o):
    """Bake location/rotation/scale into the mesh (computed directly: matrix_world is
    stale until the depsgraph updates)."""
    M = Matrix.LocRotScale(Vector(o.location), o.rotation_euler.to_quaternion(), Vector(o.scale))
    o.data.transform(M)
    o.location = (0, 0, 0)
    o.rotation_euler = (0, 0, 0)
    o.scale = (1, 1, 1)


def boolean(target, cutter, op="DIFFERENCE", self_intersect=False):
    m = target.modifiers.new("bool", "BOOLEAN")
    m.operation = op
    m.solver = "EXACT"
    m.object = cutter
    m.use_self = self_intersect
    m.use_hole_tolerant = True
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=m.name)


def join(objs, name):
    objs = [o for o in objs if o is not None]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.data.name = name
    return o


def delete(objs):
    for o in objs:
        if o is not None and o.name in bpy.data.objects:
            bpy.data.objects.remove(o, do_unlink=True)


def convex_rock(name, size, seed, flat=0.0, coll=None, sharp=True):
    r = np.random.default_rng(seed)
    pts = r.normal(0, 1, (22, 3))
    pts /= np.linalg.norm(pts, axis=1)[:, None]
    pts *= r.uniform(0.72, 1.0, (22, 1))
    pts *= np.array(size) / 2
    if flat:
        pts[:, 2] = np.maximum(pts[:, 2], -size[2] / 2 * (1 - flat))
    bm = bmesh.new()
    for p in pts:
        bm.verts.new(p)
    bmesh.ops.convex_hull(bm, input=list(bm.verts))
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(7), verts=list(bm.verts), edges=list(bm.edges))
    if sharp:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(size) * 0.025, segments=1, affect="EDGES", profile=0.5)
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    return bm_to_obj(name, bm, coll)


# ----------------------------------------------------------------------------- body frame
def body_hw(z):
    t = (z - D["floor"]) / (D["height"] - D["floor"])
    return D["hw0"] + (D["hw1"] - D["hw0"]) * t


def body_hd(z):
    t = (z - D["floor"]) / (D["height"] - D["floor"])
    return D["hd0"] + (D["hd1"] - D["hd0"]) * t


SLOPE_D = (D["hd0"] - D["hd1"]) / (D["height"] - D["floor"])
SLOPE_W = (D["hw0"] - D["hw1"]) / (D["height"] - D["floor"])


class Face:
    """A planar face of the tapered body. 2D coordinates (u, z); u runs to the viewer's right."""

    def __init__(self, kind):
        self.kind = kind

    def normal(self):
        if self.kind == "front":
            n = Vector((0, -1, SLOPE_D))
        elif self.kind == "rear":
            n = Vector((0, 1, SLOPE_D))
        elif self.kind == "right":   # +X
            n = Vector((1, 0, SLOPE_W))
        else:                         # left, -X
            n = Vector((-1, 0, SLOPE_W))
        return n.normalized()

    def point(self, u, z, depth=0.0):
        """Surface point (pushed inward by depth along the face normal)."""
        if self.kind == "front":
            p = Vector((u, -body_hd(z), z))
        elif self.kind == "rear":
            p = Vector((-u, body_hd(z), z))
        elif self.kind == "right":
            p = Vector((body_hw(z), u, z))
        else:
            p = Vector((-body_hw(z), -u, z))
        return p - self.normal() * depth

    def tangent_u(self):
        if self.kind == "front":
            return Vector((1, 0, 0))
        if self.kind == "rear":
            return Vector((-1, 0, 0))
        if self.kind == "right":
            return Vector((0, 1, 0))
        return Vector((0, -1, 0))


FRONT, REAR, RIGHT, LEFT = Face("front"), Face("rear"), Face("right"), Face("left")


def face_prism(name, face, poly, depth, margin=0.6, coll=None):
    """Cutter: a 2D polygon on the face extruded from outside the face to `depth` inside."""
    front = [face.point(u, z, -margin) for u, z in poly]
    back = [face.point(u, z, depth) for u, z in poly]
    return prism(name, front, back, coll)


def arch_profile(hw, z0, spring, n=20):
    pts = [(-hw, z0)]
    for i in range(n + 1):
        a = math.pi - math.pi * i / n
        pts.append((hw * math.cos(a), spring + hw * math.sin(a)))
    pts.append((hw, z0))
    return pts


def stadium(hw, z0, z1, n=12):
    pts = []
    for i in range(n + 1):  # bottom arc, left to right
        a = math.pi + math.pi * i / n
        pts.append((hw * math.cos(a), z0 + hw + hw * math.sin(a)))
    for i in range(n + 1):  # top arc, right to left
        a = math.pi * i / n
        pts.append((hw * math.cos(a), z1 - hw + hw * math.sin(a)))
    return pts


def hexagon(xc, zc, hh, hw, tip, lean):
    """Elongated hexagonal panel leaning with the taper (lean = dx/dz)."""
    pts = [(0, hh), (hw, hh - tip), (hw, -hh + tip), (0, -hh), (-hw, -hh + tip), (-hw, hh - tip)]
    return [(xc + x + lean * z, zc + z) for x, z in pts]


def offset_poly(poly, d):
    """Offset a convex CCW-or-CW polygon outward by d (vertex normal approximation)."""
    P = np.array(poly, float)
    c = P.mean(axis=0)
    out = []
    n = len(P)
    for i in range(n):
        a, b, cc = P[i - 1], P[i], P[(i + 1) % n]
        e1 = b - a
        e2 = cc - b
        n1 = np.array([e1[1], -e1[0]])
        n2 = np.array([e2[1], -e2[0]])
        n1 /= np.linalg.norm(n1)
        n2 /= np.linalg.norm(n2)
        if np.dot(n1, b - c) < 0:
            n1, n2 = -n1, -n2
        m = n1 + n2
        m /= np.linalg.norm(m)
        k = d / max(0.35, np.dot(m, n1))
        out.append(tuple(b + m * k))
    return out


# ----------------------------------------------------------------------------- grooves and inlays
GROOVES = []        # (face, polyline[(u,z)], width, depth, inlay, closed)
INLAY = {"verts": [], "faces": [], "uvs": []}
INLAY_FAR = {"verts": [], "faces": [], "uvs": []}
PORTAL_MOUTH = Vector((0, -D["hd0"], 9.0))


def groove(face, pts, width=0.13, depth=0.12, inlay=True, closed=False):
    GROOVES.append((face, pts, width, depth, inlay, closed))


def strip(dst, a, b, n_out, half, flow0, flow1):
    """Quad strip from 3D a to b on a plane with outward normal n_out."""
    t = (b - a).normalized()
    s = n_out.cross(t).normalized() * half
    i = len(dst["verts"])
    dst["verts"] += [a - s, a + s, b + s, b - s]
    dst["faces"].append((i, i + 1, i + 2, i + 3))
    dst["uvs"] += [(flow0, 0.0), (flow0, 1.0), (flow1, 1.0), (flow1, 0.0)]


def flow_of(p):
    return min(0.999, (p - PORTAL_MOUTH).length / 42.0)


def groove_cutters(coll):
    boxes = []
    for gi, (face, pts, w, d, inlay, closed) in enumerate(GROOVES):
        seq = list(pts) + ([pts[0]] if closed else [])
        nrm = face.normal()
        for k in range(len(seq) - 1):
            (u0, z0), (u1, z1) = seq[k], seq[k + 1]
            a2, b2 = np.array([u0, z0]), np.array([u1, z1])
            L = np.linalg.norm(b2 - a2)
            if L < 1e-4:
                continue
            dir2 = (b2 - a2) / L
            ext = w * 0.5
            a2e, b2e = a2 - dir2 * ext, b2 + dir2 * ext
            pa, pb = face.point(*a2e, 0), face.point(*b2e, 0)
            t = (pb - pa).normalized()
            s = nrm.cross(t).normalized() * (w / 2)
            front = [pa - s + nrm * 0.4, pb - s + nrm * 0.4, pb + s + nrm * 0.4, pa + s + nrm * 0.4]
            back = [pa - s - nrm * d, pb - s - nrm * d, pb + s - nrm * d, pa + s - nrm * d]
            boxes.append(prism(f"_g{gi}_{k}", front, back, coll))
            if inlay:
                qa, qb = face.point(u0, z0, d - 0.012), face.point(u1, z1, d - 0.012)
                strip(INLAY, qa, qb, nrm, w * 0.27, flow_of(qa), flow_of(qb))
                fa, fb = face.point(u0, z0, -0.03), face.point(u1, z1, -0.03)
                strip(INLAY_FAR, fa, fb, nrm, 0.16, flow_of(fa), flow_of(fb))
    return boxes


# ----------------------------------------------------------------------------- the body
def body_solid(name, coll, inflate=0.0, z0=None, z1=None):
    z0 = D["floor"] - 0.05 if z0 is None else z0
    z1 = D["height"] if z1 is None else z1

    def loop(z):
        hw, hd = body_hw(z) + inflate, body_hd(z) + inflate
        t = (z - D["floor"]) / (D["height"] - D["floor"])
        c = D["chamfer0"] + (D["chamfer1"] - D["chamfer0"]) * t
        return [Vector(p) for p in [(-hw + c, -hd, z), (hw - c, -hd, z), (hw, -hd + c, z), (hw, hd - c, z),
                                    (hw - c, hd, z), (-hw + c, hd, z), (-hw, hd - c, z), (-hw, -hd + c, z)]]
    return prism(name, loop(z0), loop(z1), coll)


def build_body(coll, tmp):
    P = D["passage"]
    fl = D["floor"]
    body = body_solid("Body", coll)
    skirt = body_solid("Skirt", coll, inflate=0.2, z0=fl - 0.02, z1=fl + 0.95)
    cutters = []

    # passage: arch prism through the front, ending at the vortex chamber
    prof = arch_profile(P["hw"], fl - 0.3, P["spring"])
    cutters.append(prism("_passage", [Vector((u, -30, z)) for u, z in prof], [Vector((u, P["back"], z)) for u, z in prof], tmp))
    prof = arch_profile(P["chamber_hw"], fl - 0.3, P["chamber_spring"])
    cutters.append(prism("_chamber", [Vector((u, P["chamber_front"], z)) for u, z in prof], [Vector((u, P["back"], z)) for u, z in prof], tmp))
    # nested arch orders: the mouth of the passage steps outward in four recessed rings
    for i, (hw, depth) in enumerate(D["orders"]):
        cutters.append(face_prism(f"_order{i}", FRONT, arch_profile(hw, fl - 0.3, P["spring"]), depth, coll=tmp))
    for c in cutters:
        boolean(body, c)
        boolean(skirt, c)

    # central spine recess and the nested stadium niche above the entrance
    spine = [(-1.28, 15.6), (1.28, 15.6), (1.02, 28.6), (-1.02, 28.6)]
    boolean(body, face_prism("_spine", FRONT, spine, 0.22, coll=tmp))
    for i, (hw, depth) in enumerate([(0.98, 0.42), (0.78, 0.66), (0.58, 0.92), (0.36, 1.25)]):
        boolean(body, face_prism(f"_niche{i}", FRONT, stadium(hw, 19.3 + i * 0.32, 25.7 - i * 0.32), depth, coll=tmp))

    # rune panels: shallow lip, then the deep field the glyphs sit in
    panels = []
    for spec in (D["panels_upper"], D["panels_lower"]):
        for side in (-1, 1):
            xc = side * spec["x"]
            lean = -side * SLOPE_W * spec["x"] / body_hw(spec["zc"])
            panels.append(hexagon(xc, spec["zc"], spec["hh"], spec["hw"], spec["tip"], lean))
    lips = [face_prism(f"_lip{i}", FRONT, offset_poly(p, 0.17), 0.07, coll=tmp) for i, p in enumerate(panels)]
    deeps = [face_prism(f"_deep{i}", FRONT, p, 0.34, coll=tmp) for i, p in enumerate(panels)]
    boolean(body, join(lips, "_lips"), self_intersect=True)
    boolean(body, join(deeps, "_deeps"), self_intersect=True)

    # rear: tall recessed slot with nested rounded heads; shallow inscription fields
    for i, (hw, depth) in enumerate([(1.12, 0.32), (0.88, 0.62), (0.64, 0.95), (0.42, 1.3)]):
        boolean(body, face_prism(f"_slot{i}", REAR, stadium(hw, 5.0 + i * 0.12, 25.2 - i * 0.28), depth, coll=tmp))
    for side in (-1, 1):
        boolean(body, face_prism(f"_ins{side}", REAR, [(side * 2.25 - 0.36, 17.2), (side * 2.25 + 0.36, 17.2), (side * 2.12 + 0.34, 25.4), (side * 2.12 - 0.34, 25.4)], 0.06, coll=tmp))
    # sides: wide central channel splitting into a Y below the crown
    for face in (LEFT, RIGHT):
        boolean(body, face_prism(f"_ych{face.kind}", face, [(-0.3, 5.2), (0.3, 5.2), (0.3, 21.4), (-0.3, 21.4)], 0.36, coll=tmp))

    # crown: hollow shaft and four notches that reveal the energy inside
    C = D["crown"]
    s = C["shaft"]
    sh = prism("_shaft", [Vector(p) for p in [(-s, -s, C["shaft_z"]), (s, -s, C["shaft_z"]), (s, s, C["shaft_z"]), (-s, s, C["shaft_z"])]],
               [Vector(p) for p in [(-s * 1.1, -s * 1.1, 30), (s * 1.1, -s * 1.1, 30), (s * 1.1, s * 1.1, 30), (-s * 1.1, s * 1.1, 30)]], tmp)
    boolean(body, sh)
    n = C["notch"]
    notches = []
    for ang in (0, 90, 180, 270):
        o = prism(f"_notch{ang}", [Vector((-n, 0, C["notch_z"])), Vector((n, 0, C["notch_z"])), Vector((n, 0, 30)), Vector((-n, 0, 30))],
                  [Vector((-n, -12, C["notch_z"])), Vector((n, -12, C["notch_z"])), Vector((n, -12, 30)), Vector((-n, -12, 30))], tmp)
        o.rotation_euler = (0, 0, math.radians(ang))
        apply_transform(o)
        notches.append(o)
    boolean(body, join(notches, "_notches"), self_intersect=True)

    # carved channel network (front, rear, sides) with emissive inlays
    define_grooves(panels)
    gs = groove_cutters(tmp)
    if gs:
        boolean(body, join(gs, "_grooves"), self_intersect=True)

    # chipped arrises and deep corner fractures break the machined regularity
    chips = []
    for k in range(46):
        z = rng.uniform(D["floor"] + 0.6, D["height"] - 0.4)
        corner = rng.integers(4)
        sx = -1 if corner in (0, 3) else 1
        sy = -1 if corner in (0, 1) else 1
        p = Vector((sx * (body_hw(z) - 0.12), sy * (body_hd(z) - 0.12), z))
        size = rng.uniform(0.22, 0.6)
        r = convex_rock(f"_chip{k}", (size * 1.3, size, size * rng.uniform(0.8, 2.4)), int(rng.integers(1e9)), coll=tmp, sharp=False)
        r.location = p
        r.rotation_euler = tuple(rng.uniform(0, 3, 3))
        apply_transform(r)
        chips.append(r)
    for k in range(9):
        z = rng.uniform(D["floor"] + 2, D["height"] - 3)
        face = [FRONT, REAR, LEFT, RIGHT][rng.integers(4)]
        u0 = rng.uniform(-1, 1) * (body_hw(z) - 1.4 if face in (FRONT, REAR) else body_hd(z) - 1.4)
        pts = [(u0, z)]
        for _ in range(4):
            pts.append((pts[-1][0] + rng.uniform(-0.7, 0.7), pts[-1][1] - rng.uniform(0.6, 1.3)))
        for j in range(len(pts) - 1):
            pa, pb = face.point(*pts[j], 0), face.point(*pts[j + 1], 0)
            nrm = face.normal()
            t = (pb - pa).normalized()
            s2 = nrm.cross(t).normalized() * 0.022
            chips.append(prism(f"_crack{k}_{j}", [pa - s2 + nrm * 0.2, pb - s2 + nrm * 0.2, pb + s2 + nrm * 0.2, pa + s2 + nrm * 0.2],
                               [pa - nrm * 0.07, pb - nrm * 0.07, pb - nrm * 0.07 + s2 * 0.1, pa - nrm * 0.07 + s2 * 0.1], tmp))
    boolean(body, join(chips, "_chips"), self_intersect=True)
    return body, skirt, panels


def define_grooves(panels):
    fl = D["floor"]
    for p in panels:  # outline grooves around each rune panel
        groove(FRONT, offset_poly(p, 0.48), closed=True)
    for side in (-1, 1):
        s = side
        # spine edges, from above the arch up to the crown
        groove(FRONT, [(s * 1.5, 16.4), (s * 1.22, 27.4)])
        # entrance pilasters and the arch hood
        groove(FRONT, [(s * 3.3, fl + 0.9), (s * 3.3, 12.3), (s * 2.35, 15.7), (s * 1.5, 16.4)])
        # stepped chevrons on the lower flanks, down toward the plinth corners
        x0 = s * D["panels_lower"]["x"]
        for k, off in enumerate((0.0, 0.42, 0.84)):
            groove(FRONT, [(x0 + s * off, 9.1 - off * 0.6), (x0 + s * off, 7.6 - off * 0.6), (s * (body_hw(fl + 1.2) - 0.9 + off * 0.0 - k * 0.42), fl + 1.25 + k * 0.42)])
        # upper panels: a short channel from the lower tip down into the spine hood
        x1 = s * D["panels_upper"]["x"]
        groove(FRONT, [(x1 - s * 0.05, 17.4), (s * 1.95, 16.0)], inlay=True)
        # rear chevrons framing the slot
        for k, off in enumerate((1.55, 1.95)):
            groove(REAR, [(s * off, fl + 0.9), (s * off, 13.0 + k * 0.5), (s * (body_hw(9.0) - 0.8 - k * 0.42), 9.0 - k * 0.6)])
            groove(REAR, [(s * off, 14.2 + k * 0.5), (s * off, 23.6), (s * (off - 0.35), 26.6)], inlay=False)
    # layered arris ribs: a stepped band set in from every vertical edge
    for face in (FRONT, REAR):
        for s in (-1, 1):
            groove(face, [(s * (body_hw(fl + 1.1) - 0.62), fl + 1.1), (s * (body_hw(26.8) - 0.5), 26.8)], width=0.2, depth=0.1, inlay=False)
    for face in (LEFT, RIGHT):
        for s in (-1, 1):
            groove(face, [(s * (body_hd(fl + 1.1) - 0.62), fl + 1.1), (s * (body_hd(26.8) - 0.5), 26.8)], width=0.2, depth=0.1, inlay=False)
    for face in (LEFT, RIGHT):
        # Y-split above the side channel, block courses and framing chevrons
        groove(face, [(0.0, 21.4), (-1.75, 26.2)], width=0.2, depth=0.18)
        groove(face, [(0.0, 21.4), (1.75, 26.2)], width=0.2, depth=0.18)
        for z in (9.4, 14.1):
            groove(face, [(-body_hd(z) + 0.6, z), (-0.62, z)], width=0.09, depth=0.07, inlay=False)
            groove(face, [(0.62, z), (body_hd(z) - 0.6, z)], width=0.09, depth=0.07, inlay=False)
        for s in (-1, 1):
            groove(face, [(s * 0.75, fl + 1.0), (s * 0.75, 20.6), (s * 2.5, 25.4)], inlay=True)


# ----------------------------------------------------------------------------- interior, plinth, stairs
def build_ribs(coll):
    R, P, fl = D["ribs"], D["passage"], D["floor"]
    ribs = []
    for k in range(R["count"]):
        y = R["y0"] + k * R["step"]
        inset = R["inset0"] + 0.02 * k
        hw_out = P["hw"] + 0.12
        hw_in = P["hw"] - inset - R["shrink"] * k
        spring_in = P["spring"] - 0.15 - 0.12 * k
        outer = arch_profile(hw_out, fl, P["spring"], 18)
        inner = arch_profile(hw_in, fl, spring_in, 18)
        bm = bmesh.new()
        # ring between inner and outer arch, extruded along y
        def ring(yv):
            o = [bm.verts.new((u, yv, z)) for u, z in outer]
            i = [bm.verts.new((u, yv, z)) for u, z in inner]
            return o, i
        o0, i0 = ring(y - R["depth"] / 2)
        o1, i1 = ring(y + R["depth"] / 2)
        n = len(outer)
        for j in range(n - 1):
            bm.faces.new((o0[j], o0[j + 1], i0[j + 1], i0[j]))
            bm.faces.new((o1[j + 1], o1[j], i1[j], i1[j + 1]))
            bm.faces.new((i0[j], i0[j + 1], i1[j + 1], i1[j]))
            bm.faces.new((o0[j + 1], o0[j], o1[j], o1[j + 1]))
        bm.faces.new((o0[0], i0[0], i1[0], o1[0]))
        bm.faces.new((i0[-1], o0[-1], o1[-1], i1[-1]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bmesh.ops.bevel(bm, geom=[e for e in bm.edges if e.calc_face_angle(0) > 0.6], offset=0.035, segments=1, affect="EDGES")
        ribs.append(bm_to_obj(f"_rib{k}", bm, coll))
    # keystone blocks on the outer order
    for k, y in enumerate((-D["hd0"] + 0.35,)):
        ribs.append(chamfer_box("_keystone", (0, y, P["spring"] + D["orders"][-1][0] + 0.25), (0.42, 0.3, 0.55), 0.04, coll=coll))
    return join(ribs, "Ribs")


def build_floor(coll):
    fl, P = D["floor"], D["passage"]
    tiles = []
    y = -D["upper"]["y0"] * -1  # landing front edge (negative)
    y = D["upper"]["y0"]
    rows = []
    while y < P["back"] - 0.1:
        d = rng.uniform(0.9, 1.35)
        rows.append((y, min(P["back"] - 0.02, y + d)))
        y += d
    for y0, y1 in rows:
        hw = P["hw"] + 0.05 if y0 > -D["hd0"] - 0.2 else D["stairs"]["hw"] - 0.02
        cuts = sorted(rng.uniform(-hw + 0.6, hw - 0.6, 1).tolist())
        xs = [-hw] + cuts + [0.0 if abs(cuts[0]) > 0.6 else hw * 0.5] + [hw]
        xs = sorted(set(round(x, 3) for x in xs))
        for a, b in zip(xs[:-1], xs[1:]):
            if b - a < 0.25:
                continue
            tiles.append(chamfer_box("_tile", ((a + b) / 2, (y0 + y1) / 2, fl + 0.015 + rng.uniform(-0.006, 0.006)), ((b - a) / 2 - 0.012, (y1 - y0) / 2 - 0.012, 0.035), 0.012, coll=coll))
    return join(tiles, "FloorTiles")


def segmented_tier(coll, x, y0, y1, z0, z1, courses, front_gap, prefix, skip=None):
    blocks = []
    hz = (z1 - z0) / courses
    depth = 1.35
    for c in range(courses):
        zc0, zc1 = z0 + c * hz, z0 + (c + 1) * hz
        stagger = (c % 2) * 0.9
        # four sides: (start, end, fixed, axis, outward sign)
        sides = [("front", -x, x, y0, "x", -1), ("rear", -x, x, y1, "x", 1), ("left", y0 + depth, y1 - depth, -x, "y", -1), ("right", y0 + depth, y1 - depth, x, "y", 1)]
        for sname, a, b, fixed, axis, sgn in sides:
            t = a + stagger * (1 if sname != "rear" else 0.6)
            edges = [a]
            while t < b - 1.2:
                t += rng.uniform(1.7, 3.1)
                edges.append(min(t, b))
            if edges[-1] < b:
                edges.append(b)
            for e0, e1 in zip(edges[:-1], edges[1:]):
                if e1 - e0 < 0.3:
                    continue
                mid = (e0 + e1) / 2
                if sname == "front" and front_gap and abs(mid) < front_gap + (e1 - e0) / 2:
                    # split around the stair notch
                    pieces = [(e0, min(e1, -front_gap)), (max(e0, front_gap), e1)]
                else:
                    pieces = [(e0, e1)]
                for p0, p1 in pieces:
                    if p1 - p0 < 0.3:
                        continue
                    if skip and skip(sname, p0, p1, c):
                        continue
                    h = (p1 - p0) / 2 - 0.012
                    dz = rng.uniform(-0.03, 0.025)
                    if axis == "x":
                        cen = ((p0 + p1) / 2, fixed - sgn * depth / 2, (zc0 + zc1) / 2 + dz / 2)
                        half = (h, depth / 2 - 0.01, (zc1 - zc0) / 2 - 0.008 + dz / 2)
                    else:
                        cen = (fixed - sgn * depth / 2, (p0 + p1) / 2, (zc0 + zc1) / 2 + dz / 2)
                        half = (depth / 2 - 0.01, h, (zc1 - zc0) / 2 - 0.008 + dz / 2)
                    rot = (rng.normal(0, 0.003), rng.normal(0, 0.003), rng.normal(0, 0.004))
                    blocks.append(chamfer_box(f"_{prefix}", cen, half, rng.uniform(0.035, 0.075), rot, coll, jitter=0.006))
    # hidden core (closes the gaps; its top is the landing outside the blocks)
    blocks.append(chamfer_box(f"_{prefix}core", (0, (y0 + y1) / 2, (z0 + z1) / 2 - 0.004), (x - 0.6, (y1 - y0) / 2 - 0.6, (z1 - z0) / 2 - 0.004), 0.0, coll=coll))
    return blocks


def build_plinth(coll):
    L, U, fl, S = D["lower"], D["upper"], D["floor"], D["stairs"]
    notch = S["hw"] + S["cheek"]
    # a missing corner block on the lower tier, its pieces lying in front of it
    broken = lambda s, p0, p1, c: s == "front" and c == 1 and p0 < -6.9 and p1 > -8.6
    blocks = segmented_tier(coll, L["x"], L["y0"], L["y1"], 0.0, L["z1"], 2, notch, "low", broken)
    blocks += segmented_tier(coll, U["x"], U["y0"], U["y1"], L["z1"], fl, 1, S["hw"] + 0.02, "up")
    # landing behind the stairs, between the stair top and the body
    blocks.append(chamfer_box("_landing", (0, (U["y0"] - 0.5 + -D["hd0"]) / 2, fl - 0.7), (S["hw"] + 0.1, (-D["hd0"] - U["y0"] + 0.5) / 2, 0.7), 0.03, coll=coll))
    return blocks


def stair_front(k):
    S = D["stairs"]
    return D["upper"]["y0"] - (S["steps"] - k) * S["tread"]


def build_stairs(coll):
    S, fl = D["stairs"], D["floor"]
    rise = fl / S["steps"]
    parts = []
    for k in range(1, S["steps"] + 1):
        y0 = stair_front(k)
        y1 = D["upper"]["y0"] + 0.3
        z1 = rise * k
        # each step is its own slightly irregular stone, worn more at the centre
        parts.append(chamfer_box("_step", (rng.normal(0, 0.008), (y0 + y1) / 2, z1 - rise / 2 - 0.05), (S["hw"] - 0.015, (y1 - y0) / 2, rise / 2 + 0.05), rng.uniform(0.03, 0.055),
                                 (rng.normal(0, 0.002), rng.normal(0, 0.003), rng.normal(0, 0.002)), coll, jitter=0.004))
    # cheek walls follow the stair pitch with a capstone course
    y_start = stair_front(1) - 0.25
    y_end = D["upper"]["y0"] + 0.2
    for side in (-1, 1):
        x0, x1 = side * S["hw"], side * (S["hw"] + S["cheek"])
        lo, hi = sorted((x0, x1))
        prof = [(y_start, 0.0), (y_end, 0.0), (y_end, fl + 0.55), (y_start, 0.7)]
        o = prism("_cheek", [Vector((lo, y, z)) for y, z in prof], [Vector((hi, y, z)) for y, z in prof], coll)
        parts.append(o)
        n = 5
        for i in range(n):
            ya = y_start + (y_end - y_start) * i / n
            yb = y_start + (y_end - y_start) * (i + 1) / n
            za = 0.7 + (fl + 0.55 - 0.7) * (ya - y_start) / (y_end - y_start)
            zb = 0.7 + (fl + 0.55 - 0.7) * (yb - y_start) / (y_end - y_start)
            pitch = math.atan2(zb - za, yb - ya)
            cap = chamfer_box("_cap", ((lo + hi) / 2, (ya + yb) / 2, (za + zb) / 2 + 0.11), ((hi - lo) / 2 + 0.06, (yb - ya) / 2 / math.cos(pitch) - 0.015, 0.13), 0.04,
                              (pitch, 0, 0), coll, jitter=0.004)
            parts.append(cap)
    # lamp pedestals flanking the stair head
    lamps = []
    for side in (-1, 1):
        x = side * (S["hw"] + 1.35)
        parts.append(chamfer_box("_pedestal", (x, D["upper"]["y0"] + 0.55, fl + 0.32), (0.42, 0.42, 0.32), 0.05, coll=coll))
        for face_y in (-1,):
            lamps.append(chamfer_box("_lampslit", (x, D["upper"]["y0"] + 0.55 + face_y * 0.4, fl + 0.34), (0.22, 0.035, 0.07), 0.01, coll=coll))
        lamps.append(chamfer_box("_lamptop", (x, D["upper"]["y0"] + 0.55, fl + 0.645), (0.2, 0.2, 0.012), 0.004, coll=coll))
    return parts, lamps


# ----------------------------------------------------------------------------- glyphs
GLYPH_SEGMENTS = [((1, 0), (1, 3)), ((0, 3), (1, 2)), ((2, 3), (1, 2)), ((0, 0), (1, 1)), ((2, 0), (1, 1)),
                  ((0, 2), (2, 2)), ((0, 1), (1, 1)), ((1, 1), (2, 1)), ((0, 3), (2, 3)), ((0, 0), (0, 2)),
                  ((2, 1), (2, 3)), ((1, 2), (2, 1)), ((0, 1), (1, 0)), ((1, 3), (2, 2))]


def glyph_strokes(rgen):
    segs = [GLYPH_SEGMENTS[0]] if rgen.random() < 0.8 else [GLYPH_SEGMENTS[9]]
    choices = rgen.choice(np.arange(1, len(GLYPH_SEGMENTS)), size=rgen.integers(2, 5), replace=False)
    segs += [GLYPH_SEGMENTS[i] for i in choices]
    return segs


def glyph_column(dst, face, poly, depth, uband, rgen, cell_h=0.86, width=0.075, proud=0.02):
    """Fill a panel polygon (face coords) with a vertical run of glyphs."""
    P = np.array(poly)
    zmin, zmax = P[:, 1].min(), P[:, 1].max()
    ucen = P[:, 0].mean()
    lean = (P[0][0] - P[3][0]) / (P[0][1] - P[3][1]) if len(P) == 6 else 0.0
    zc = (zmin + zmax) / 2
    n = int((zmax - zmin - 1.3) // cell_h)
    z0 = zc - n * cell_h / 2
    nrm = face.normal()
    gw, gh = 0.46, 0.66
    for g in range(n):
        zg = z0 + g * cell_h + (cell_h - gh) / 2
        ug = ucen + lean * (zg + gh / 2 - zc) - gw / 2
        v = (g + 0.5) / n
        for (a, b) in glyph_strokes(rgen):
            pa = face.point(ug + a[0] * gw / 2, zg + a[1] * gh / 3, depth - proud)
            pb = face.point(ug + b[0] * gw / 2, zg + b[1] * gh / 3, depth - proud)
            t = (pb - pa)
            if t.length < 1e-4:
                continue
            t.normalize()
            pa -= t * width * 0.5
            pb += t * width * 0.5
            s = nrm.cross(t).normalized() * width / 2
            lift = nrm * proud
            i = len(dst["verts"])
            dst["verts"] += [pa - s, pa + s, pb + s, pb - s, pa - s + lift, pa + s + lift, pb + s + lift, pb - s + lift]
            for f in [(4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]:
                dst["faces"].append(tuple(i + q for q in f))
            dst["uvs"] += [(uband, v)] * 8


def from_dict(name, d, coll):
    if not d["verts"]:
        return None
    o = mesh_obj(name, d["verts"], d["faces"], coll, uvs=d["uvs"])
    fix_normals(o)
    return o


# ----------------------------------------------------------------------------- debris, fragments, ruins
def build_debris(coll):
    out = []
    spots = []
    L = D["lower"]
    for k in range(20):
        side = rng.integers(4)
        if side == 0:      # in front, beside the stairs
            x = rng.choice([-1, 1]) * rng.uniform(D["stairs"]["hw"] + 1.4, L["x"] + 2.5)
            y = rng.uniform(L["y0"] - 4.5, L["y0"] - 0.6)
        elif side == 1:
            x = rng.uniform(-L["x"] - 2, L["x"] + 2)
            y = L["y1"] + rng.uniform(0.8, 3.5)
        else:
            x = (1 if side == 2 else -1) * (L["x"] + rng.uniform(0.8, 3.8))
            y = rng.uniform(L["y0"], L["y1"])
        spots.append((x, y))
    # the broken corner block's pieces
    spots += [(-7.6, -10.2), (-8.6, -9.7), (-6.6, -10.9)]
    for k, (x, y) in enumerate(spots):
        big = k >= len(spots) - 3
        s = rng.uniform(0.9, 1.6) if big else rng.uniform(0.35, 1.25)
        r = convex_rock(f"_debris{k}", (s * rng.uniform(1.0, 1.7), s, s * rng.uniform(0.55, 1.0)), int(rng.integers(1e9)), flat=0.4, coll=coll)
        r.location = (x, y, s * 0.18)
        r.rotation_euler = (rng.normal(0, 0.25), rng.normal(0, 0.25), rng.uniform(0, 6.28))
        apply_transform(r)
        out.append(r)
    return out


def build_fragments(coll):
    frags = []
    rgen = np.random.default_rng(D["seed"] + 5)
    for k in range(10):
        a = k / 10 * 2 * math.pi + rgen.uniform(-0.2, 0.2)
        r = rgen.uniform(10.5, 13.5)
        z = rgen.uniform(13.5, 26.5)
        s = rgen.uniform(0.7, 2.2)
        o = convex_rock(f"Fragment_{k:02d}", (s * 0.8, s * 0.55, s * rgen.uniform(1.2, 2.0)), int(rgen.integers(1e9)), coll=coll)
        o.location = (math.cos(a) * r, math.sin(a) * r, z)   # node origin = rotation pivot
        o.rotation_euler = tuple(rgen.uniform(0, 6.28, 3))
        o["levitate"] = 1
        frags.append(o)
    return frags


def build_ruins(coll, tmp):
    ruins = []
    # broken pillar with a jagged break and an engraved channel
    p = prism("Ruin_Pillar_Broken", [Vector(v) for v in [(-0.7, -0.7, 0), (0.7, -0.7, 0), (0.7, 0.7, 0), (-0.7, 0.7, 0)]],
              [Vector(v) for v in [(-0.56, -0.56, 6.2), (0.56, -0.56, 6.2), (0.56, 0.56, 6.2), (-0.56, 0.56, 6.2)]], coll)
    cut = convex_rock("_break", (3.2, 3.2, 2.4), 77, coll=tmp, sharp=False)
    cut.location = (0.4, 0.2, 6.0)
    cut.rotation_euler = (0.5, 0.3, 0.2)
    apply_transform(cut)
    boolean(p, cut)
    g = prism("_pg", [Vector(v) for v in [(-0.09, -0.8, 0.6), (0.09, -0.8, 0.6), (0.09, -0.8, 5.5), (-0.09, -0.8, 5.5)]],
              [Vector(v) for v in [(-0.09, -0.55, 0.6), (0.09, -0.55, 0.6), (0.09, -0.5, 5.5), (-0.09, -0.5, 5.5)]], tmp)
    boolean(p, g)
    ruins.append(p)
    # stump
    s = chamfer_box("Ruin_Pillar_Stump", (0, 0, 0.9), (0.8, 0.8, 0.9), 0.06, coll=coll)
    cut = convex_rock("_break2", (2.6, 2.6, 1.4), 78, coll=tmp, sharp=False)
    cut.location = (-0.3, 0.1, 1.9)
    apply_transform(cut)
    boolean(s, cut)
    ruins.append(s)
    # toppled monolith: a tapered slab lying on its side, snapped at one end
    m = prism("Ruin_Monolith_Fallen", [Vector(v) for v in [(-4.6, -1.15, 0), (-4.6, 1.15, 0), (-4.6, 1.0, 1.5), (-4.6, -1.0, 1.5)]],
              [Vector(v) for v in [(4.4, -0.8, 0), (4.4, 0.8, 0), (4.4, 0.7, 1.1), (4.4, -0.7, 1.1)]], coll)
    cut = convex_rock("_snap", (2.2, 3.4, 3.4), 79, coll=tmp, sharp=False)
    cut.location = (4.6, 0, 0.6)
    apply_transform(cut)
    boolean(m, cut)
    for i, x in enumerate((-2.6, -0.6, 1.4)):
        boolean(m, prism(f"_mg{i}", [Vector((x, -1.3, 1.62)), Vector((x + 0.12, -1.3, 1.62)), Vector((x + 0.12, 1.3, 1.62)), Vector((x, 1.3, 1.62))],
                         [Vector((x, -1.3, 1.38)), Vector((x + 0.12, -1.3, 1.38)), Vector((x + 0.12, 1.3, 1.38)), Vector((x, 1.3, 1.38))], tmp))
    m.rotation_euler = (0.0, -0.04, 0.0)
    apply_transform(m)
    ruins.append(m)
    # broken arch: a pier and the springing of its arch
    prof_o = arch_profile(2.6, 0, 3.6, 16)
    prof_i = arch_profile(1.75, 0, 3.6, 16)
    bm = bmesh.new()
    half = len(prof_o) // 2 + 2
    o0 = [bm.verts.new((u, -0.55, z)) for u, z in prof_o[:half]]
    i0 = [bm.verts.new((u, -0.55, z)) for u, z in prof_i[:half]]
    o1 = [bm.verts.new((u, 0.55, z)) for u, z in prof_o[:half]]
    i1 = [bm.verts.new((u, 0.55, z)) for u, z in prof_i[:half]]
    for j in range(half - 1):
        bm.faces.new((o0[j], o0[j + 1], i0[j + 1], i0[j]))
        bm.faces.new((o1[j + 1], o1[j], i1[j], i1[j + 1]))
        bm.faces.new((i0[j], i0[j + 1], i1[j + 1], i1[j]))
        bm.faces.new((o0[j + 1], o0[j], o1[j], o1[j + 1]))
    bm.faces.new((o0[0], i0[0], i1[0], o1[0]))
    bm.faces.new((i0[-1], o0[-1], o1[-1], i1[-1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    a = bm_to_obj("Ruin_Arch_Fragment", bm, coll)
    a.location = (1.9, 0, 0)
    apply_transform(a)
    cut = convex_rock("_archbreak", (2.0, 2.0, 2.0), 80, coll=tmp, sharp=False)
    cut.location = (2.0, 0, 6.2)
    apply_transform(cut)
    boolean(a, cut)
    ruins.append(a)
    # paving slabs, tilted and partly buried
    slabs = []
    for k in range(7):
        sx, sy = rng.uniform(0.7, 1.4), rng.uniform(0.6, 1.2)
        slabs.append(chamfer_box("_slab", (rng.uniform(-2, 2), rng.uniform(-2, 2), 0.08), (sx, sy, 0.16), 0.04,
                                 (rng.normal(0, 0.06), rng.normal(0, 0.06), rng.uniform(0, 3.14)), coll, jitter=0.01))
    ruins.append(join(slabs, "Ruin_Paving"))
    # inscribed stele
    st = prism("Ruin_Stele", [Vector(v) for v in [(-0.5, -0.32, 0), (0.5, -0.32, 0), (0.5, 0.32, 0), (-0.5, 0.32, 0)]],
               [Vector(v) for v in [(-0.38, -0.25, 3.3), (0.38, -0.25, 3.3), (0.38, 0.25, 3.3), (-0.38, 0.25, 3.3)]], coll)
    boolean(st, prism("_stelefield", [Vector(v) for v in [(-0.28, -0.6, 0.6), (0.28, -0.6, 0.6), (0.22, -0.6, 2.9), (-0.22, -0.6, 2.9)]],
                      [Vector(v) for v in [(-0.28, -0.23, 0.6), (0.28, -0.23, 0.6), (0.22, -0.18, 2.9), (-0.22, -0.18, 2.9)]], tmp))
    ruins.append(st)
    for r in ruins:
        bpy.context.view_layer.objects.active = r
        r["ruin"] = 1
    return ruins


def stele_glyphs(coll):
    d = {"verts": [], "faces": [], "uvs": []}
    rgen = np.random.default_rng(31)
    for g in range(3):
        zg = 0.85 + g * 0.68
        for (a, b) in glyph_strokes(rgen):
            pa = Vector((-0.17 + a[0] * 0.17, -0.235, zg + a[1] * 0.17))
            pb = Vector((-0.17 + b[0] * 0.17, -0.235, zg + b[1] * 0.17))
            t = (pb - pa)
            if t.length < 1e-4:
                continue
            t.normalize()
            s = Vector((0, -1, 0)).cross(t).normalized() * 0.03
            i = len(d["verts"])
            d["verts"] += [pa - s, pa + s, pb + s, pb - s]
            d["faces"].append((i, i + 1, i + 2, i + 3))
            d["uvs"] += [(0.875, (g + 0.5) / 3)] * 4
    return from_dict("Ruin_Stele_Glyphs", d, coll)


# ----------------------------------------------------------------------------- materials and baking
def node(nt, kind, loc=(0, 0), **inputs):
    n = nt.nodes.new(kind)
    n.location = loc
    for k, v in inputs.items():
        n.inputs[k].default_value = v
    return n


def field_material(name, mode):
    """Emission-only material that outputs a procedural field, evaluated in object space."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = node(nt, "ShaderNodeOutputMaterial", (900, 0))
    em = node(nt, "ShaderNodeEmission", (700, 0))
    nt.links.new(em.outputs[0], out.inputs[0])
    tc = node(nt, "ShaderNodeTexCoord", (-900, 0))
    geo = node(nt, "ShaderNodeNewGeometry", (-900, -300))
    comb = node(nt, "ShaderNodeCombineColor", (500, 0))
    nt.links.new(comb.outputs[0], em.inputs[0])
    obj = tc.outputs["Object"]
    if mode == "fields":
        # R: large tonal noise, G: mid mottling, B: fine grain
        n1 = node(nt, "ShaderNodeTexNoise", (-500, 300), Scale=0.11, Detail=3.0, Roughness=0.55)
        n2 = node(nt, "ShaderNodeTexNoise", (-500, 0), Scale=0.75, Detail=6.0, Roughness=0.6)
        n3 = node(nt, "ShaderNodeTexNoise", (-500, -300), Scale=9.0, Detail=4.0, Roughness=0.7)
        for n_ in (n1, n2, n3):
            nt.links.new(obj, n_.inputs["Vector"])
        nt.links.new(n1.outputs["Fac"], comb.inputs[0])
        nt.links.new(n2.outputs["Fac"], comb.inputs[1])
        nt.links.new(n3.outputs["Fac"], comb.inputs[2])
    elif mode == "cracks":
        # R: plate fracture network, G: lichen noise, B: up-facing
        vor = node(nt, "ShaderNodeTexVoronoi", (-500, 300), Scale=0.42)
        vor.feature = "DISTANCE_TO_EDGE"
        warp = node(nt, "ShaderNodeTexNoise", (-900, 400), Scale=0.6, Detail=4.0)
        mix = node(nt, "ShaderNodeMix", (-700, 300))
        mix.data_type = "VECTOR"
        mix.inputs["Factor"].default_value = 0.3
        nt.links.new(obj, mix.inputs[4])
        nt.links.new(warp.outputs["Color"], mix.inputs[5])
        nt.links.new(obj, warp.inputs["Vector"])
        nt.links.new(mix.outputs[1], vor.inputs["Vector"])
        nt.links.new(vor.outputs["Distance"], comb.inputs[0])
        lich = node(nt, "ShaderNodeTexNoise", (-500, 0), Scale=3.2, Detail=5.0, Roughness=0.65)
        nt.links.new(obj, lich.inputs["Vector"])
        nt.links.new(lich.outputs["Fac"], comb.inputs[1])
        sep = node(nt, "ShaderNodeSeparateXYZ", (-500, -300))
        nt.links.new(geo.outputs["Normal"], sep.inputs[0])
        nt.links.new(sep.outputs["Z"], comb.inputs[2])
    elif mode == "edges":
        # R: convex-edge mask (AO 'inside'), G: height above ground / 30, B: fine chips voronoi
        ao = node(nt, "ShaderNodeAmbientOcclusion", (-500, 300))
        ao.inside = True
        ao.samples = 6
        ao.inputs["Distance"].default_value = 0.09
        nt.links.new(ao.outputs["AO"], comb.inputs[0])
        sep = node(nt, "ShaderNodeSeparateXYZ", (-500, 0))
        nt.links.new(geo.outputs["Position"], sep.inputs[0])
        div = node(nt, "ShaderNodeMath", (-300, 0))
        div.operation = "DIVIDE"
        div.inputs[1].default_value = 30.0
        nt.links.new(sep.outputs["Z"], div.inputs[0])
        nt.links.new(div.outputs[0], comb.inputs[1])
        vor = node(nt, "ShaderNodeTexVoronoi", (-500, -300), Scale=3.5)
        vor.feature = "DISTANCE_TO_EDGE"
        nt.links.new(obj, vor.inputs["Vector"])
        nt.links.new(vor.outputs["Distance"], comb.inputs[2])
    return m


def bump_material(name):
    """Principled material whose normal is the bump of the same procedural height used for colour."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    tc = node(nt, "ShaderNodeTexCoord", (-1100, 0))
    obj = tc.outputs["Object"]
    vor = node(nt, "ShaderNodeTexVoronoi", (-800, 300), Scale=0.42)
    vor.feature = "DISTANCE_TO_EDGE"
    warp = node(nt, "ShaderNodeTexNoise", (-1100, 400), Scale=0.6, Detail=4.0)
    mix = node(nt, "ShaderNodeMix", (-950, 300))
    mix.data_type = "VECTOR"
    mix.inputs["Factor"].default_value = 0.3
    nt.links.new(obj, mix.inputs[4])
    nt.links.new(obj, warp.inputs["Vector"])
    nt.links.new(warp.outputs["Color"], mix.inputs[5])
    nt.links.new(mix.outputs[1], vor.inputs["Vector"])
    crack = node(nt, "ShaderNodeMapRange", (-600, 300))
    crack.inputs["From Min"].default_value = 0.0
    crack.inputs["From Max"].default_value = 0.035
    nt.links.new(vor.outputs["Distance"], crack.inputs["Value"])
    grain = node(nt, "ShaderNodeTexNoise", (-800, 0), Scale=9.0, Detail=6.0, Roughness=0.72)
    nt.links.new(obj, grain.inputs["Vector"])
    pits = node(nt, "ShaderNodeTexVoronoi", (-800, -250), Scale=3.5)
    pits.feature = "DISTANCE_TO_EDGE"
    nt.links.new(obj, pits.inputs["Vector"])
    pitr = node(nt, "ShaderNodeMapRange", (-600, -250))
    pitr.inputs["From Max"].default_value = 0.06
    nt.links.new(pits.outputs["Distance"], pitr.inputs["Value"])
    mid = node(nt, "ShaderNodeTexNoise", (-800, -500), Scale=1.2, Detail=8.0, Roughness=0.62)
    nt.links.new(obj, mid.inputs["Vector"])
    # gate the fracture network with the same noise the albedo uses (partial cracks)
    gnoise = node(nt, "ShaderNodeTexNoise", (-800, 600), Scale=0.75, Detail=6.0, Roughness=0.6)
    nt.links.new(obj, gnoise.inputs["Vector"])
    gmap = node(nt, "ShaderNodeMapRange", (-600, 600))
    gmap.inputs["From Min"].default_value = 0.44
    gmap.inputs["From Max"].default_value = 0.6
    nt.links.new(gnoise.outputs["Fac"], gmap.inputs["Value"])
    inv = node(nt, "ShaderNodeMath", (-450, 450))
    inv.operation = "SUBTRACT"
    inv.inputs[0].default_value = 1.0
    nt.links.new(crack.outputs[0], inv.inputs[1])
    gated = node(nt, "ShaderNodeMath", (-350, 450))
    gated.operation = "MULTIPLY"
    nt.links.new(inv.outputs[0], gated.inputs[0])
    nt.links.new(gmap.outputs[0], gated.inputs[1])
    crackh = node(nt, "ShaderNodeMath", (-250, 450))
    crackh.operation = "SUBTRACT"
    crackh.inputs[0].default_value = 1.0
    nt.links.new(gated.outputs[0], crackh.inputs[1])
    # height = cracks (deep) + chip network (shallow) + grain + mid undulation
    h1 = node(nt, "ShaderNodeMath", (-400, 200))
    h1.operation = "MULTIPLY_ADD"
    nt.links.new(crackh.outputs[0], h1.inputs[0])
    h1.inputs[1].default_value = 1.0
    nt.links.new(grain.outputs["Fac"], h1.inputs[2])
    h2 = node(nt, "ShaderNodeMath", (-250, 100))
    h2.operation = "MULTIPLY_ADD"
    nt.links.new(pitr.outputs[0], h2.inputs[0])
    h2.inputs[1].default_value = 0.35
    nt.links.new(h1.outputs[0], h2.inputs[2])
    h3 = node(nt, "ShaderNodeMath", (-100, 0))
    h3.operation = "MULTIPLY_ADD"
    nt.links.new(mid.outputs["Fac"], h3.inputs[0])
    h3.inputs[1].default_value = 1.4
    nt.links.new(h2.outputs[0], h3.inputs[2])
    bump = node(nt, "ShaderNodeBump", (100, -200))
    bump.inputs["Strength"].default_value = 0.85
    bump.inputs["Distance"].default_value = 0.012
    nt.links.new(h3.outputs[0], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def unwrap(obj, margin=0.003):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    me = obj.data
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    me.uv_layers.new(name="UVMap")
    me.uv_layers.new(name="UVDetail")
    me.uv_layers.active_index = 0
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(58), island_margin=margin, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=margin, rotate=True, shape_method="CONCAVE")
    me.uv_layers.active_index = 1
    bpy.ops.uv.cube_project(cube_size=4.0, correct_aspect=True, scale_to_bounds=False)
    me.uv_layers.active_index = 0
    bpy.ops.object.mode_set(mode="OBJECT")
    me.uv_layers[0].active_render = True


def bake_image(obj, mat, bake_type, size, samples, name, colorspace="Non-Color", margin=10, **kw):
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=True)
    img.colorspace_settings.name = colorspace
    obj.data.materials.clear()
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
    sc.render.bake.margin = margin
    sc.render.bake.margin_type = "EXTEND"
    sc.render.bake.use_selected_to_active = False
    if bake_type == "NORMAL":
        sc.render.bake.normal_space = "TANGENT"
    bpy.ops.object.bake(type=bake_type, **kw)
    arr = np.array(img.pixels[:], dtype=np.float32).reshape(size, size, 4)[..., :3].copy()
    nt.nodes.remove(tex)
    return arr, img


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def blur(a, r):
    if r <= 0:
        return a
    k = np.exp(-0.5 * (np.arange(-2 * r, 2 * r + 1) / r) ** 2)
    k /= k.sum()
    out = a.copy()
    for axis in (0, 1):
        out = np.apply_along_axis(lambda m: np.convolve(m, k, mode="same"), axis, out)
    return out


def srgb_to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def composite(fields, cracks, edges, ao, variant):
    """Albedo (linear), roughness and AO from baked fields. Weathered dark-grey stone
    with cool/warm mineral variation, partial fractures, worn lighter arrises, ochre
    lichen on upward faces and grime pooling low and in recesses."""
    big, mid, fine = fields[..., 0], fields[..., 1], fields[..., 2]
    crack_d, lichen_n, up = cracks[..., 0], cracks[..., 1], cracks[..., 2]
    convex, height, chipd = edges[..., 0], edges[..., 1], edges[..., 2]
    occl = ao[..., 0]
    cool = srgb_to_lin(np.array([0.36, 0.37, 0.38]))
    warm = srgb_to_lin(np.array([0.41, 0.39, 0.355]))
    t = smoothstep(0.38, 0.66, big)[..., None]
    base = cool * (1 - t) + warm * t
    base = base * (0.8 + 0.55 * (mid[..., None] - 0.5) + 0.3 * (fine[..., None] - 0.5))
    # fractures: only where a second noise lets the fracture through, so the network
    # reads as individual cracks across plates rather than a uniform cell pattern
    gate = smoothstep(0.5, 0.62, mid * 0.6 + big * 0.4) * smoothstep(0.25, 0.6, fine)
    crack = (1 - smoothstep(0.0, 0.013, crack_d)) * gate
    halo = (1 - smoothstep(0.0, 0.045, crack_d)) * gate
    base = base * (1 - 0.08 * halo[..., None]) * (1 - 0.55 * crack[..., None])
    # worn arrises: convexity from the inside-AO bake (1 = flat, lower = convex edge)
    wear = smoothstep(0.93, 0.6, convex) * (0.55 + 0.45 * smoothstep(0.3, 0.7, fine))
    base = base * (1 + 0.42 * wear[..., None])
    pit = 1 - smoothstep(0.0, 0.05, chipd)
    base = base * (1 - 0.14 * pit[..., None])
    # lichen on faces turned upward, more of it lower on the structure
    lich = smoothstep(0.6, 0.73, lichen_n) * smoothstep(0.15, 0.65, up) * (0.45 + 0.55 * smoothstep(0.65, 0.05, height))
    lich += smoothstep(0.69, 0.76, lichen_n) * 0.3 * smoothstep(0.45, 0.0, height)
    lich = np.clip(lich, 0, 1) * (0.75 if variant == "base" else 0.55)
    lc = srgb_to_lin(np.array([0.5, 0.45, 0.22]))
    base = base * (1 - lich[..., None]) + lc * (0.75 + 0.5 * fine[..., None]) * lich[..., None]
    grime = (1 - occl) * 0.5 + smoothstep(0.08, 0.0, height) * 0.18
    base = base * (1 - np.clip(grime, 0, 0.55)[..., None])
    rough = 0.8 + 0.12 * (fine - 0.5) - 0.16 * wear + 0.1 * lich + 0.06 * crack
    rough = np.clip(rough, 0.45, 0.98)
    return np.clip(base, 0, 1), rough, np.clip(0.3 + 0.7 * occl, 0, 1)


def save_png(path, arr, srgb=False):
    a = np.clip(arr, 0, 1)
    if srgb:
        a = np.where(a <= 0.0031308, a * 12.92, 1.055 * np.power(a, 1 / 2.4) - 0.055)
    img = bpy.data.images.new(Path(path).stem, a.shape[1], a.shape[0], alpha=False)
    px = np.ones((a.shape[0], a.shape[1], 4), np.float32)
    px[..., :3] = a
    img.pixels = px.ravel()
    img.filepath_raw = str(path)
    img.file_format = "PNG"
    img.save()
    return img


def bake_stone(obj, label, size, nsize, work, quick=False):
    sc = bpy.context.scene
    s = 1 if quick else 1
    fields, _ = bake_image(obj, field_material(f"_f_{label}", "fields"), "EMIT", size, s, f"_fields_{label}")
    cracks, _ = bake_image(obj, field_material(f"_c_{label}", "cracks"), "EMIT", size, s, f"_cracks_{label}")
    edges, _ = bake_image(obj, field_material(f"_e_{label}", "edges"), "EMIT", size, 4 if quick else 10, f"_edges_{label}")
    sc.world.light_settings.distance = 1.6
    ao, _ = bake_image(obj, field_material(f"_a_{label}", "fields"), "AO", size, 8 if quick else 28, f"_ao_{label}")
    edges[..., 0] = blur(edges[..., 0], 1)
    np.savez_compressed(work / f"{label}_fields.npz", fields=fields.astype(np.float16), cracks=cracks.astype(np.float16), edges=edges.astype(np.float16), ao=ao.astype(np.float16))
    albedo, rough, occ = composite(fields, cracks, edges, ao, label)
    nrm, _ = bake_image(obj, bump_material(f"_n_{label}"), "NORMAL", nsize, 1, f"_normal_{label}")
    out = {}
    out["albedo"] = work / f"{label}_albedo.png"
    out["orm"] = work / f"{label}_orm.png"
    out["normal"] = work / f"{label}_normal.png"
    save_png(out["albedo"], albedo, srgb=True)
    orm = np.stack([occ, rough, np.zeros_like(rough)], -1)
    save_png(out["orm"], orm)
    save_png(out["normal"], nrm)
    return out


def final_stone_material(name, maps):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    def tex(path, cs, loc):
        n = nt.nodes.new("ShaderNodeTexImage")
        n.location = loc
        n.image = bpy.data.images.load(str(path))
        n.image.colorspace_settings.name = cs
        return n
    a = tex(maps["albedo"], "sRGB", (-700, 300))
    nt.links.new(a.outputs["Color"], b.inputs["Base Color"])
    orm = tex(maps["orm"], "Non-Color", (-700, 0))
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    sep.location = (-450, 0)
    nt.links.new(orm.outputs["Color"], sep.inputs[0])
    nt.links.new(sep.outputs["Green"], b.inputs["Roughness"])
    nt.links.new(sep.outputs["Blue"], b.inputs["Metallic"])
    # glTF occlusion: a glTF Material Output group with an Occlusion socket
    grp = gltf_settings_group()
    gn = nt.nodes.new("ShaderNodeGroup")
    gn.node_tree = grp
    gn.location = (200, -400)
    nt.links.new(sep.outputs["Red"], gn.inputs["Occlusion"])
    n = tex(maps["normal"], "Non-Color", (-700, -350))
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.location = (-300, -350)
    nt.links.new(n.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    return m


def gltf_settings_group():
    g = bpy.data.node_groups.get("glTF Material Output")
    if g:
        return g
    g = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
    g.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    g.interface.new_socket("Thickness", in_out="INPUT", socket_type="NodeSocketFloat")
    return g


def emissive_material(name, color, strength, base=(0.02, 0.02, 0.02)):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*base, 1)
    b.inputs["Emission Color"].default_value = (*color, 1)
    b.inputs["Emission Strength"].default_value = strength
    b.inputs["Roughness"].default_value = 0.6
    return m


# ----------------------------------------------------------------------------- LOD helpers
def tri_count(o):
    o.data.calc_loop_triangles()
    return len(o.data.loop_triangles)


def decimated_copy(o, name, ratio, coll):
    c = o.copy()
    c.data = o.data.copy()
    c.name = name
    c.data.name = name
    home = bpy.context.scene.collection
    home.objects.link(c)
    if ratio < 1:
        m = c.modifiers.new("dec", "DECIMATE")
        m.ratio = ratio
        m.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = c
        bpy.ops.object.modifier_apply(modifier="dec")
    home.objects.unlink(c)
    coll.objects.link(c)
    return c


def linked_copy(o, coll, name=None):
    c = o.copy()
    if name:
        c.name = name
    coll.objects.link(c)
    return c


def shade(o, angle=38):
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle), keep_sharp_edges=True)


def drop_bottom_faces(o, z=0.002):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    kill = [f for f in bm.faces if all(v.co.z < z for v in f.verts) and f.normal.z < -0.9]
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    bm.to_mesh(o.data)
    bm.free()


def triangulate_all():
    """Triangulate every exported mesh (n-gons from booleans cannot carry MikkTSpace tangents)."""
    for me in bpy.data.meshes:
        if not me.users:
            continue
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3], quad_method="BEAUTY", ngon_method="BEAUTY")
        bm.to_mesh(me)
        bm.free()


def export_glb(glb):
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", use_active_scene=False, export_apply=True,
                              export_tangents=True, export_extras=True, export_yup=True, export_image_format="AUTO",
                              export_texcoords=True, export_normals=True, export_materials="EXPORT", export_cameras=False,
                              export_lights=False, export_animations=False)


# ----------------------------------------------------------------------------- main
def main():
    p = payload()
    if p.get("recomposite"):
        # Re-run the colour/ORM composite from the saved bake fields (no re-bake).
        work = Path(p["work"])
        for label in ("body", "base"):
            f = np.load(work / f"{label}_fields.npz")
            albedo, rough, occ = composite(*(f[k].astype(np.float32) for k in ("fields", "cracks", "edges", "ao")), label)
            save_png(work / f"{label}_albedo.png", albedo, srgb=True)
            save_png(work / f"{label}_orm.png", np.stack([occ, rough, np.zeros_like(rough)], -1))
        finish(p, {"recomposited": True})
        return
    if p.get("export_only"):
        # Re-export a saved build (no rebuild, no re-bake).
        bpy.ops.wm.open_mainfile(filepath=p["export_only"])
        triangulate_all()
        glb = Path(p["work"]) / "severance_gate_raw.glb"
        export_glb(glb)
        finish(p, {"glb": str(glb)})
        return
    for k, v in (p.get("dims") or {}).items():
        D[k] = v
    work = Path(p["work"])
    work.mkdir(parents=True, exist_ok=True)
    quick = bool(p.get("quick"))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        bpy.ops.preferences.addon_enable(module="cycles")
    except Exception:
        pass
    near = bpy.context.scene
    near.name = "Near"
    near.render.engine = "CYCLES"
    near.cycles.device = "CPU"
    near.unit_settings.system = "METRIC"
    w = bpy.data.worlds.new("w")
    near.world = w
    tmp = bpy.data.collections.new("_tmp")
    near.collection.children.link(tmp)
    coll = near.collection

    body, skirt, panels = build_body(coll, tmp)
    ribs = build_ribs(coll)
    tiles = build_floor(coll)
    plinth = build_plinth(coll)
    stairs, lamps = build_stairs(coll)
    debris = build_debris(coll)
    frags = build_fragments(coll)

    # emissive inscriptions
    runes = {"verts": [], "faces": [], "uvs": []}
    rgen = np.random.default_rng(D["seed"] + 11)
    for i, poly in enumerate(panels):
        glyph_column(runes, FRONT, poly, 0.34, (i + 0.5) / 4 * 0.75, rgen)
    runes_o = from_dict("Runes", runes, coll)
    dim = {"verts": [], "faces": [], "uvs": []}
    for side in (-1, 1):
        poly = [(side * 2.25 - 0.36, 17.2), (side * 2.25 + 0.36, 17.2), (side * 2.12 + 0.34, 25.4), (side * 2.12 - 0.34, 25.4)]
        glyph_column(dim, REAR, poly, 0.06, 0.875, rgen, cell_h=0.95, width=0.06, proud=0.012)
    dim_o = from_dict("RunesDim", dim, coll)
    # floor channel down the passage centre (energy reaching toward the stairs)
    fl = D["floor"]
    for y0 in np.arange(-D["hd0"] - 0.9, D["passage"]["back"] - 0.6, 0.8):
        a, b = Vector((0, y0, fl + 0.052)), Vector((0, y0 + 0.62, fl + 0.052))
        strip(INLAY, a, b, Vector((0, 0, 1)), 0.05, flow_of(a), flow_of(b))
    channels_o = from_dict("Channels", INLAY, coll)
    channels_far = from_dict("ChannelsFar", INLAY_FAR, coll)
    lamps_o = join(lamps, "Lamps")

    # remove temporary cutters
    delete(list(tmp.objects))

    body_join = join([body, skirt, ribs, tiles], "Body")
    base_join = join(plinth + stairs + debris, "Base")
    drop_bottom_faces(base_join)
    for o in (body_join, base_join):
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
        bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=0.0005)
        bm.to_mesh(o.data)
        bm.free()
        shade(o)
    for f in frags:
        shade(f, 30)

    ruins_coll = bpy.data.collections.new("RuinsSrc")
    near.collection.children.link(ruins_coll)
    ruins = build_ruins(ruins_coll, tmp)
    stele_g = stele_glyphs(ruins_coll)
    delete(list(tmp.objects))
    for r in ruins:
        drop_bottom_faces(r)
        shade(r, 32)
    if p.get("geometry_only"):
        bpy.ops.wm.save_as_mainfile(filepath=str(work / "geometry.blend"))
        finish(p, {"blend": str(work / "geometry.blend"), "tris": {o.name: tri_count(o) for o in [body_join, base_join, runes_o, channels_o]}})
        return

    # UVs and bakes: body atlas, base atlas (plinth, stairs, debris, fragments, ruins)
    unwrap(body_join, 0.0025)
    # one atlas for everything else: bake on a temporary joined copy, then split back
    others = [base_join] + frags + ruins
    for o in others:
        o["_src"] = o.name
    size = int(p.get("bake", 2048))
    nsize = int(p.get("normal", 4096))
    maps_body = bake_stone(body_join, "body", size, nsize, work, quick)
    tmp_join = []
    # shared atlas: unwrap all together by joining copies, keeping a face->object map
    copies = []
    for o in others:
        c = o.copy()
        c.data = o.data.copy()
        c["_src"] = o.name
        coll.objects.link(c)
        apply_transform(c)
        # tag faces with the source index
        attr = c.data.attributes.new("_srcid", "INT", "FACE")
        idx = others.index(o)
        attr.data.foreach_set("value", [idx] * len(c.data.polygons))
        copies.append(c)
    atlas = join(copies, "_atlas")
    unwrap(atlas, 0.002)
    maps_base = bake_stone(atlas, "base", size, max(2048, nsize // 2), work, quick)
    # copy atlas UVs back to each original by matching face order (join preserves order)
    uv0 = atlas.data.uv_layers["UVMap"]
    uv1 = atlas.data.uv_layers["UVDetail"]
    src = np.empty(len(atlas.data.polygons), np.int32)
    atlas.data.attributes["_srcid"].data.foreach_get("value", src)
    loops_uv0 = np.empty(len(atlas.data.loops) * 2, np.float32)
    uv0.data.foreach_get("uv", loops_uv0)
    loops_uv1 = np.empty(len(atlas.data.loops) * 2, np.float32)
    uv1.data.foreach_get("uv", loops_uv1)
    loop_start = 0
    for i, o in enumerate(others):
        nl = len(o.data.loops)
        me = o.data
        while me.uv_layers:
            me.uv_layers.remove(me.uv_layers[0])
        a0 = me.uv_layers.new(name="UVMap")
        a1 = me.uv_layers.new(name="UVDetail")
        a0.data.foreach_set("uv", loops_uv0[loop_start * 2:(loop_start + nl) * 2])
        a1.data.foreach_set("uv", loops_uv1[loop_start * 2:(loop_start + nl) * 2])
        loop_start += nl
    assert loop_start == len(atlas.data.loops), "atlas loop split mismatch"
    delete([atlas])

    mat_body = final_stone_material(STONE_BODY, maps_body)
    mat_base = final_stone_material(STONE_BASE, maps_base)
    for o, m in [(body_join, mat_body)] + [(o, mat_base) for o in others]:
        o.data.materials.clear()
        o.data.materials.append(m)
    m_rune = emissive_material(RUNE, (1.0, 0.5, 0.15), 3.0, (0.25, 0.12, 0.04))
    m_dim = emissive_material(RUNE_DIM, (0.9, 0.42, 0.12), 0.25, (0.05, 0.045, 0.04))
    m_chan = emissive_material(CHANNEL, (1.0, 0.44, 0.1), 1.2, (0.12, 0.06, 0.02))
    m_lamp = emissive_material(LAMP, (1.0, 0.6, 0.28), 4.0, (0.3, 0.2, 0.1))
    for o, m in [(runes_o, m_rune), (dim_o, m_dim), (channels_o, m_chan), (channels_far, m_chan), (lamps_o, m_lamp), (stele_g, m_dim)]:
        if o:
            o.data.materials.clear()
            o.data.materials.append(m)

    # scenes ---------------------------------------------------------------
    near_objs = [body_join, base_join, runes_o, dim_o, channels_o, lamps_o] + frags
    for o in list(coll.objects):
        if o not in near_objs:
            coll.objects.unlink(o)
    near.collection.children.unlink(ruins_coll)
    if channels_far.name in coll.objects:
        coll.objects.unlink(channels_far)

    mid = bpy.data.scenes.new("Mid")
    mc = mid.collection
    mid_body = decimated_copy(body_join, "Mid_Body", float(p.get("mid_body", 0.38)), mc)
    mid_base = decimated_copy(base_join, "Mid_Base", float(p.get("mid_base", 0.45)), mc)
    for o in (runes_o, channels_o, lamps_o):
        linked_copy(o, mc, "Mid_" + o.name)
    for f in frags:
        linked_copy(f, mc, "Mid_" + f.name)

    far = bpy.data.scenes.new("Far")
    fc = far.collection
    far_body = decimated_copy(body_join, "Far_Body", float(p.get("far_body", 0.045)), fc)
    far_base = decimated_copy(base_join, "Far_Base", float(p.get("far_base", 0.07)), fc)
    far_runes = linked_copy(runes_o, fc, "Far_Runes")
    fc.objects.link(channels_far)
    channels_far.name = "Far_Channels"

    rs = bpy.data.scenes.new("Ruins")
    for r in ruins + [stele_g]:
        rs.collection.objects.link(r)

    # metrics shared with the gameplay footprint and the runtime
    S = D["stairs"]
    metrics = {
        "frame": "glTF: +Y up, front faces +Z (Blender -Y). Units metres.",
        "height": D["height"], "floor": D["floor"],
        "body": {"hw0": D["hw0"], "hw1": D["hw1"], "hd0": D["hd0"], "hd1": D["hd1"]},
        "plinth": {"lower": D["lower"], "upper": D["upper"]},
        "stairs": {"hw": S["hw"], "steps": S["steps"], "tread": S["tread"], "rise": D["floor"] / S["steps"], "front": stair_front(1), "top": D["upper"]["y0"], "cheek": S["cheek"]},
        "passage": {"hw": D["passage"]["hw"], "clear_height": D["passage"]["spring"] + D["passage"]["hw"] - D["floor"],
                    "min_rib_hw": D["passage"]["hw"] - D["ribs"]["inset0"] - 0.02 * (D["ribs"]["count"] - 1) - D["ribs"]["shrink"] * (D["ribs"]["count"] - 1),
                    "mouth": -D["hd0"], "back": D["passage"]["back"]},
        "portal": D["portal"], "crown": D["crown"],
        "fragments": [{"name": f.name, "pivot": list(f.location)} for f in frags],
        "triangles": {"near": sum(tri_count(o) for o in near_objs), "mid": sum(tri_count(o) for o in mc.all_objects),
                      "far": sum(tri_count(o) for o in fc.all_objects), "ruins": sum(tri_count(o) for o in rs.collection.all_objects)},
        "parts": {o.name: tri_count(o) for o in near_objs},
    }
    (work / "gate-metrics.json").write_text(json.dumps(metrics, indent=1, default=float))

    triangulate_all()
    blend = work / "severance_gate.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    glb = work / "severance_gate_raw.glb"
    export_glb(glb)
    finish(p, {"glb": str(glb), "blend": str(blend), "metrics": metrics, "maps": {"body": {k: str(v) for k, v in maps_body.items()}, "base": {k: str(v) for k, v in maps_base.items()}}})


if __name__ == "__main__":
    main()
