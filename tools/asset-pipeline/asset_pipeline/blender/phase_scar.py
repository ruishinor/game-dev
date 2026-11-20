"""Phase Scar foundation: a sculpted rupture in the ground with an interference
instrument built around it. Used by the Reach Phase Scar and both return rifts
(Expanse, Foundry); the runtime adds the membrane and field effects.

Design: the ground has been torn open along a lens-shaped slit. Voronoi slabs of
basalt are heaved up and tilted away from the slit (highest at its lips, flush
with the ground at the 2.45 m footprint), with noise-eroded tops and molten seams
between them. Upheaval shards of split stone lean out at the sides and back. Two
asymmetric interference vanes (segmented armour plates on a spine, brass collars,
fins, cable runs, anchor blocks and hydraulic braces) arch over the slit and end
in emitter heads aimed at the membrane.

Method as the Severance Gate / outpost shelter: authored geometry with a palette
id per face, one unique atlas, Cycles bakes (palette, props, fields, cracks,
edges, AO, detail bump) composited with numpy into albedo, ORM and tangent
normals. Emissive inserts are separate child objects the runtime drives by
phase: PS_Seam (seams/chasm), PS_Lens (emitter lenses), PS_Rail (vane rails).
Blender axes: x across, -y is the front (glTF +z), z up; origin on the ground at
the slit centre.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import bpy  # noqa: I001
import bmesh
import numpy as np
from mathutils import Vector, Matrix
from scipy.spatial import Voronoi

from asset_pipeline.blender import severance_gate as sg
from asset_pipeline.blender import outpost_shelter as osh
from asset_pipeline.blender.common import finish, payload

R = 2.42                     # footprint radius (collision is 2.45)
SLIT_HALF = 1.32             # slit half-length along x
SINK = -0.42                 # slab bottoms sit below the ground
PAL = {  # sRGB base colour, roughness, metallic, stone flag
    "basalt": (0x4a4f50, 0.9, 0.0, 1), "stone": (0x63665f, 0.93, 0.0, 1), "scorch": (0x231f1f, 0.86, 0.0, 1),
    "steel": (0x5f6668, 0.42, 0.85, 0), "dark": (0x1c2023, 0.68, 0.55, 0), "brass": (0x93764a, 0.36, 0.9, 0),
    "cable": (0x17181a, 0.55, 0.1, 0), "ceramic": (0xb4ae9e, 0.48, 0.05, 0),
}
rng = np.random.default_rng(2045)


def lin(hexc):
    return osh.lin(hexc)


# ----------------------------------------------------------------------------- noise
def _hash(ix, iy, iz, s):
    h = np.sin(ix * 127.1 + iy * 311.7 + iz * 74.7 + s * 19.19) * 43758.5453
    return h - np.floor(h)


def vnoise(p, s=0):
    p = np.asarray(p, np.float64)
    i = np.floor(p)
    f = p - i
    u = f * f * (3 - 2 * f)
    out = 0.0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (u[0] if dx else 1 - u[0]) * (u[1] if dy else 1 - u[1]) * (u[2] if dz else 1 - u[2])
                out += w * _hash(i[0] + dx, i[1] + dy, i[2] + dz, s)
    return out


def fbm(p, octaves=4, s=0):
    a, f, t = 0.5, 1.0, 0.0
    for k in range(octaves):
        t += a * vnoise(np.asarray(p) * f, s + k * 7)
        a *= 0.5
        f *= 2.03
    return t


# ----------------------------------------------------------------------------- builder
class PB(osh.Builder):
    def __init__(self):
        super().__init__()
        self.names = list(PAL)

    def prism(self, poly, z0, z1, key, side_key=None, top_fn=None, cuts=3):
        """Closed prism over a convex polygon. The top is a fan grid (cuts rings)
        displaced by top_fn(x, y) -> dz, for an eroded, sculpted surface."""
        side_key = side_key or key
        c = np.mean(poly, axis=0)
        n = len(poly)
        rings = []
        for r in range(cuts + 1):
            t = 1 - r / (cuts + 1)
            ring = []
            for (x, y) in poly:
                px, py = c[0] + (x - c[0]) * t, c[1] + (y - c[1]) * t
                dz = top_fn(px, py) if top_fn else 0.0
                ring.append(self.bm.verts.new((px, py, z1 + dz)))
            rings.append(ring)
        cz = z1 + (top_fn(c[0], c[1]) if top_fn else 0.0)
        cv = self.bm.verts.new((c[0], c[1], cz))
        for r in range(cuts):
            for i in range(n):
                j = (i + 1) % n
                f = self.bm.faces.new((rings[r][i], rings[r][j], rings[r + 1][j], rings[r + 1][i]))
                f[self.ids] = self.names.index(key)
        for i in range(n):
            j = (i + 1) % n
            f = self.bm.faces.new((rings[-1][i], rings[-1][j], cv))
            f[self.ids] = self.names.index(key)
        # sides: outer ring down to z0 with a mid ring (lets the tilt bend them)
        bot = [self.bm.verts.new((x, y, z0)) for (x, y) in poly]
        mid = [self.bm.verts.new((x + rng.normal(0, 0.012), y + rng.normal(0, 0.012), (z0 + z1) * 0.5)) for (x, y) in poly]
        for i in range(n):
            j = (i + 1) % n
            for a, b in ((mid, rings[0]), (bot, mid)):
                f = self.bm.faces.new((a[j], a[i], b[i], b[j]))
                f[self.ids] = self.names.index(side_key)
        return rings, bot, mid, cv

    def verts_since(self, mark):
        return [v for v in self.bm.verts if v.index >= mark or v.index < 0]


def convex_clip(poly, clip):
    """Sutherland-Hodgman: clip polygon by a convex CCW polygon."""
    out = list(poly)
    for i in range(len(clip)):
        a, b = np.array(clip[i]), np.array(clip[(i + 1) % len(clip)])
        inp, out = out, []
        if not inp:
            break
        def inside(p):
            return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0
        def inter(p, q):
            p, q = np.array(p), np.array(q)
            d1, d2 = q - p, b - a
            den = d1[0] * d2[1] - d1[1] * d2[0]
            t = ((a[0] - p[0]) * d2[1] - (a[1] - p[1]) * d2[0]) / den
            return tuple(p + t * d1)
        s = inp[-1]
        for e in inp:
            if inside(e):
                if not inside(s):
                    out.append(inter(s, e))
                out.append(e)
            elif inside(s):
                out.append(inter(s, e))
            s = e
    return out


def half_plane(y0, side):
    """A big convex quad for y*side >= y0."""
    if side > 0:
        return [(-9, y0), (9, y0), (9, 9), (-9, 9)]
    return [(-9, -9), (9, -9), (9, -y0), (-9, -y0)]


def slit_half_width(x):
    t = min(1.0, abs(x) / SLIT_HALF)
    return 0.30 * math.sqrt(max(0.0, 1 - t * t)) + 0.04


def heave(x, y):
    """Upheaval height of the ground at (x, y): highest at the slit lips."""
    ex = max(0.0, abs(x) - SLIT_HALF * 0.6)
    d = math.hypot(ex, max(0.0, abs(y) - slit_half_width(x)))
    r = math.hypot(x, y)
    edge = sg.smoothstep(R, R - 0.55, r)
    return float((0.05 + 0.95 * math.exp(-d * 1.25)) * edge)


def build_ground(b):
    """Voronoi slabs heaved and tilted away from the slit, with eroded tops."""
    pts = []
    while len(pts) < 46:
        p = rng.uniform(-R, R, 2)
        if np.hypot(*p) < R + 0.15:
            pts.append(p)
    # denser cells along the lips
    for k in range(14):
        x = rng.uniform(-SLIT_HALF, SLIT_HALF)
        s = 1 if k % 2 else -1
        pts.append(np.array([x, s * (slit_half_width(x) + rng.uniform(0.18, 0.4))]))
    ring = [(math.cos(a) * 6, math.sin(a) * 6) for a in np.linspace(0, 2 * math.pi, 13)[:-1]]
    vor = Voronoi(np.vstack([pts, ring]))
    disc = [(math.cos(a) * R, math.sin(a) * R) for a in np.linspace(0, 2 * math.pi, 41)[:-1]]
    slabs = 0
    for pi_, reg_i in enumerate(vor.point_region[:len(pts)]):
        reg = vor.regions[reg_i]
        if -1 in reg or not reg:
            continue
        poly = [tuple(vor.vertices[v]) for v in reg]
        # CCW
        a2 = sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))
        if a2 < 0:
            poly = poly[::-1]
        poly = convex_clip(poly, disc)
        site = pts[pi_]
        side = 1 if site[1] >= 0 else -1
        if abs(site[0]) < SLIT_HALF + 0.25:
            poly = convex_clip(poly, half_plane(slit_half_width(site[0]) + rng.uniform(0.0, 0.06), side))
        if len(poly) < 3:
            continue
        c = np.mean(poly, axis=0)
        # shrink for seams
        gap = rng.uniform(0.035, 0.075)
        poly = [tuple(c + (np.array(p) - c) * max(0.5, 1 - gap / max(0.05, np.linalg.norm(np.array(p) - c)))) for p in poly]
        h = heave(*c)
        key = "basalt" if rng.random() < 0.7 else "stone"
        seed = int(rng.integers(0, 999))
        top = lambda x, y, s=seed: 0.14 * (fbm((x * 2.1, y * 2.1, s * 0.1), 4, s) - 0.5) + 0.05 * (fbm((x * 8, y * 8, 1.7), 3, s + 3) - 0.5)
        mark = len(b.bm.verts)
        b.prism(poly, SINK - 0.25 * min(1.0, h), 0.0, key, side_key="scorch" if h > 0.3 else "stone", top_fn=top, cuts=4)
        b.bm.verts.ensure_lookup_table()
        vs = b.bm.verts[mark:]
        # tilt: rotate about an axis along the slit direction, lifting the slit-side edge
        lip = Vector((c[0], side * slit_half_width(c[0]), 0))
        away = Vector((0, side, 0)) if abs(c[0]) < SLIT_HALF else Vector((c[0], c[1], 0)).normalized()
        ang = (0.05 + 0.9 * min(1.0, h / 0.95) ** 1.3) * rng.uniform(0.7, 1.1)
        axis = away.cross(Vector((0, 0, 1))).normalized()
        M = Matrix.Rotation(-ang, 4, axis)
        piv = Vector((c[0], c[1], 0))
        for v in vs:
            p = v.co - piv
            p = M @ p
            v.co = p + piv + Vector((0, 0, h))
        slabs += 1
    return slabs


def rubble(b):
    """Broken chunks along the lips and in the outer gaps."""
    out = []
    for i in range(34):
        if i < 20:
            x = rng.uniform(-SLIT_HALF - 0.3, SLIT_HALF + 0.3)
            y = (1 if i % 2 else -1) * (slit_half_width(x) + rng.uniform(0.35, 0.9))
        else:
            a = rng.uniform(0, 2 * math.pi)
            r = rng.uniform(1.3, R - 0.15)
            x, y = math.cos(a) * r, math.sin(a) * r
        s = rng.uniform(0.09, 0.26)
        o = sg.convex_rock(f"_rub{i}", (s * 1.3, s, s * 0.8), 900 + i, sharp=True)
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(rng.uniform(0, 6.28), 3, "Z") @ Matrix.Rotation(rng.uniform(-0.6, 0.6), 3, "X"))
        bmesh.ops.translate(bm, verts=bm.verts, vec=(x, y, heave(x, y) * 0.7 + s * 0.25))
        layer = bm.faces.layers.int.new("pal")
        for f in bm.faces:
            f[layer] = b.names.index("stone" if i % 3 == 0 else "basalt")
        bm.to_mesh(o.data)
        bm.free()
        out.append(o)
    return out


def shards(b):
    """Split-stone upheaval shards (sharp convex hulls) leaning out from the slit."""
    out = []
    spec = [  # x, y, height, lean (rad, positive = away from slit), size
        (-1.95, 0.55, 2.3, 0.32, 0.46), (-2.05, -0.35, 1.25, 0.42, 0.36), (1.9, 0.75, 2.9, 0.26, 0.5),
        (2.08, -0.25, 1.5, 0.48, 0.34), (-0.9, 1.45, 1.55, 0.5, 0.38), (0.75, 1.55, 1.9, 0.44, 0.4),
        (-1.45, -1.25, 0.7, 0.6, 0.3), (1.55, -1.15, 0.85, 0.62, 0.3), (0.15, 1.85, 1.1, 0.55, 0.34),
    ]
    for i, (x, y, h, lean, s) in enumerate(spec):
        o = sg.convex_rock(f"_shard{i}", (s, s * 0.8, h * 1.15), 700 + i, sharp=True)
        bm = bmesh.new()
        bm.from_mesh(o.data)
        for v in bm.verts:   # taper toward a split crown
            t = (v.co.z + h * 0.575) / (h * 1.15)
            v.co.x *= 1.0 - 0.45 * t
            v.co.y *= 1.0 - 0.3 * t
            v.co.z += h * 0.575 - 0.25
        d = Vector((x, y, 0)).normalized()
        axis = d.cross(Vector((0, 0, 1))).normalized()
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(-lean, 3, axis))
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(rng.uniform(0, 6.28), 3, "Z"))
        bmesh.ops.translate(bm, verts=bm.verts, vec=(x, y, heave(x, y) * 0.6))
        layer = bm.faces.layers.int.new("pal")
        for f in bm.faces:
            f[layer] = b.names.index("basalt" if i % 3 else "stone")
        bm.to_mesh(o.data)
        bm.free()
        out.append(o)
    return out


# ----------------------------------------------------------------------------- instrument
def curve_pts(ctrl, n):
    from mathutils.geometry import interpolate_bezier  # noqa: F401
    P = [Vector(p) for p in ctrl]
    pts = []
    for k in range(n + 1):
        t = k / n
        # Catmull-Rom through the control points
        seg = min(len(P) - 2, int(t * (len(P) - 1)))
        u = t * (len(P) - 1) - seg
        p0, p1, p2, p3 = P[max(0, seg - 1)], P[seg], P[seg + 1], P[min(len(P) - 1, seg + 2)]
        u2, u3 = u * u, u * u * u
        pts.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3))
    return pts


def oriented_box(b, c, frame, h, key, chamfer=0.025):
    """A chamfered box with half-extents h in a local frame (u, v, w) at c."""
    u, v, w = frame
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    for vt in bm.verts:
        vt.co = Vector((vt.co.x * h[0], vt.co.y * h[1], vt.co.z * h[2]))
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(chamfer, min(h) * 0.45), segments=1, affect="EDGES", profile=0.5)
    M = Matrix((u, v, w)).transposed()
    vmap = {}
    for vt in bm.verts:
        vmap[vt] = b.bm.verts.new(Vector(c) + M @ vt.co)
    for f in bm.faces:
        nf = b.bm.faces.new([vmap[x] for x in f.verts])
        nf[b.ids] = b.names.index(key)
    bm.free()


def sweep_tube(name, pts, r, key, names, res=10):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = r
    cu.bevel_resolution = 2
    cu.use_fill_caps = True
    sp = cu.splines.new("POLY")
    sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        sp.points[i].co = (p.x, p.y, p.z, 1)
    ob = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.ops.object.convert(target="MESH")
    ob = bpy.context.view_layer.objects.active
    me = ob.data
    a = me.attributes.new("pal", "INT", "FACE")
    a.data.foreach_set("value", [names.index(key)] * len(me.polygons))
    return ob


def swept(b, pts, frames, prof, key, cap=True):
    """Continuous sweep of a closed 2D profile [(u, v)] along pts with per-point
    frames (out, dep) and scale; rings are joined into one smooth hull."""
    rings = []
    for p, (o, d, s) in zip(pts, frames):
        rings.append([b.bm.verts.new(p + o * (u * s[0]) + d * (v * s[1])) for (u, v) in prof])
    n = len(prof)
    for r in range(len(rings) - 1):
        for i in range(n):
            j = (i + 1) % n
            f = b.bm.faces.new((rings[r][i], rings[r][j], rings[r + 1][j], rings[r + 1][i]))
            f[b.ids] = b.names.index(key)
    if cap:
        for ring, rev in ((rings[0], True), (rings[-1], False)):
            f = b.bm.faces.new(list(reversed(ring)) if rev else ring)
            f[b.ids] = b.names.index(key)


def chamfer_profile(w, d, c):
    """Rectangle (half-sizes 1x1 scaled later) with chamfered corners, CCW."""
    return [(1, -1 + c), (1, 1 - c), (1 - c, 1), (-1 + c, 1), (-1, 1 - c), (-1, -1 + c), (-1 + c, -1), (1 - c, -1)]


def vane(b, sign, ctrl, segs, extras):
    """One interference vane: a continuous tapered spine swept along ctrl, flared
    into its anchor; overlapping armour shingles on the outer face; brass collars;
    a recessed, segmented inner rail (emissive, returned) and an emitter head."""
    n = segs * 6
    pts = curve_pts(ctrl, n)
    frames, F = [], []
    for k, p in enumerate(pts):
        t = (pts[min(n, k + 1)] - pts[max(0, k - 1)]).normalized()
        out = Vector((sign, 0, 0))
        out = (out - t * out.dot(t)).normalized()
        dep = t.cross(out).normalized()
        if dep.y < 0:            # depth axis always points to the back (+y)
            dep = -dep
        u = k / n
        flare = 1.0 + 0.9 * max(0.0, 1 - u / 0.12) ** 2
        F.append((out, dep, t))
        frames.append((out, dep, (0.13 * (1 - 0.42 * u) * flare, 0.2 * (1 - 0.35 * u) * flare)))
    swept(b, pts, frames, chamfer_profile(1, 1, 0.35), "dark")
    rails, lenses = [], []
    # shingles: armour plates overlapping downward like scales, on the outer/back faces
    step = 4
    for k in range(2, n - 2, step):
        out, dep, t = F[k]
        sx, sy = frames[k][2]
        L = (pts[min(n, k + step + 1)] - pts[k]).length
        c = pts[k] + t * L * 0.45 + out * (sx * 0.8)
        tilt = Matrix.Rotation(sign * 0.12, 3, dep)
        fr = (tilt @ out, dep, tilt @ t)
        oriented_box(b, c, fr, (0.05, sy * 1.18, L * 0.56), "steel", 0.018)
        oriented_box(b, c + fr[0] * 0.045 - fr[2] * L * 0.38, fr, (0.025, sy * 1.05, 0.03), "brass", 0.008)
        # side cheek plates (front and back) with a lip
        for s in (-1, 1):
            oriented_box(b, pts[k] + t * L * 0.5 + dep * s * (sy * 1.02), (out, dep, t), (sx * 0.78, 0.022, L * 0.44), "steel", 0.01)
        # bolts on the front cheek
        for q in (0.2, 0.8):
            oriented_box(b, pts[k] + t * L * q + dep * -(sy * 1.06) + out * sx * 0.45, (out, dep, t), (0.022, 0.016, 0.022), "brass", 0.005)
    # brass collars every other shingle
    for k in range(0, n - 1, step * 2):
        out, dep, t = F[k]
        sx, sy = frames[k][2]
        oriented_box(b, pts[k], (out, dep, t), (sx * 1.18, sy * 1.18, 0.035), "brass", 0.012)
    # recessed rail on the inner face: segmented between collars
    for k in range(1, n - 3, step):
        out, dep, t = F[k]
        sx, sy = frames[k][2]
        L = (pts[min(n, k + step)] - pts[k]).length
        c = pts[k] + t * L * 0.5 - out * (sx * 0.98)
        oriented_box(b, c, (out, dep, t), (0.03, sy * 0.42, L * 0.5), "cable", 0.006)   # groove
        rails.append((c - out * 0.012, (out, dep, t), (0.012, sy * 0.16, L * 0.4)))
    # emitter head: a forked claw aimed at the membrane centre
    tip = pts[-1]
    aim = (Vector((0, 0, 2.6)) - tip).normalized()
    side = aim.cross(Vector((0, 1, 0))).normalized()
    up = side.cross(aim).normalized()
    hf = (aim, up.cross(aim).normalized(), up)
    oriented_box(b, tip, hf, (0.2, 0.17, 0.16), "dark", 0.04)
    for s in (-1, 1):
        oriented_box(b, tip + aim * 0.24 + up * s * 0.11, hf, (0.22, 0.07, 0.03), "steel", 0.014)
        oriented_box(b, tip + aim * 0.44 + up * s * 0.085, hf, (0.04, 0.05, 0.022), "brass", 0.008)
    oriented_box(b, tip + aim * 0.08, hf, (0.1, 0.2, 0.1), "brass", 0.02)
    lenses.append((tip + aim * 0.2, hf, (0.03, 0.08, 0.055)))
    # anchor: a stepped block bedded into the slabs, with a hydraulic brace
    base = pts[0]
    I = (Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))
    oriented_box(b, base + Vector((sign * 0.12, 0.02, -0.12)), I, (0.46, 0.52, 0.36), "dark", 0.06)
    oriented_box(b, base + Vector((sign * 0.12, 0.02, 0.26)), I, (0.36, 0.42, 0.06), "steel", 0.03)
    for sx_ in (-1, 1):
        for sy_ in (-1, 1):
            oriented_box(b, base + Vector((sign * 0.12 + sx_ * 0.38, sy_ * 0.44, 0.12)), I, (0.035, 0.035, 0.05), "brass", 0.01)
    brace_a = base + Vector((sign * 0.55, 0.5, 0.05))
    brace_b = pts[int(n * 0.36)] + Vector((sign * 0.12, 0.2, 0))
    extras.append(("tube", [brace_a, brace_a.lerp(brace_b, 0.58)], 0.07, "steel"))
    extras.append(("tube", [brace_a.lerp(brace_b, 0.5), brace_b], 0.045, "brass"))
    # cable runs along the back
    for j, (dx, r) in enumerate(((0.06, 0.034), (-0.05, 0.026), (0.0, 0.02))):
        cp = [pts[k] + F[k][1] * (frames[k][2][1] + 0.05 + 0.045 * j) + F[k][0] * dx for k in range(0, n + 1, 6)]
        cp.insert(0, base + Vector((sign * (0.5 + 0.1 * j), 0.45 + 0.07 * j, -0.05)))
        extras.append(("cable", cp, r, "cable"))
    for k in range(6, n - 3, 12):   # cable clamps
        out, dep, t = F[k]
        sy = frames[k][2][1]
        oriented_box(b, pts[k] + dep * (sy + 0.1), (out, dep, t), (0.09, 0.09, 0.03), "ceramic", 0.012)
    return rails, lenses


def build_instrument(b):
    extras = []
    left = [(-1.78, 0.05, 0.25), (-1.72, 0.1, 1.3), (-1.42, 0.05, 2.75), (-0.98, -0.02, 4.05), (-0.62, 0.04, 4.72)]
    right = [(1.8, -0.05, 0.25), (1.66, 0.0, 1.55), (1.32, 0.08, 3.1), (0.82, 0.02, 4.42), (0.3, -0.02, 5.02)]
    rl, ll = vane(b, -1, left, 7, extras)
    rr, lr = vane(b, 1, right, 8, extras)
    return rl + rr, ll + lr, extras


def boxes_obj(name, specs):
    tmp = PB()
    for c, frame, h in specs:
        oriented_box(tmp, c, frame, h, "steel", 0.006)
    return sg.bm_to_obj(name, tmp.bm)


def seam_obj():
    """Emissive floor under the slab gaps and down the chasm (the visible glow)."""
    bm = bmesh.new()
    n = 28
    top, low = [], []
    for k in range(n + 1):
        x = -SLIT_HALF - 0.05 + (2 * SLIT_HALF + 0.1) * k / n
        w = slit_half_width(x) + 0.05
        top.append((bm.verts.new((x, -w, 0.05)), bm.verts.new((x, w, 0.05))))
        low.append(bm.verts.new((x, 0, -0.38)))
    for k in range(n):
        (a0, b0), (a1, b1) = top[k], top[k + 1]
        bm.faces.new((a0, a1, low[k + 1], low[k]))
        bm.faces.new((b1, b0, low[k], low[k + 1]))
    # wide under-slab glow disc, below the slab tops so only the gaps reveal it
    ring = [bm.verts.new((math.cos(a) * (R - 0.12), math.sin(a) * (R - 0.12), -0.06)) for a in np.linspace(0, 2 * math.pi, 33)[:-1]]
    c = bm.verts.new((0, 0, -0.02))
    for i in range(len(ring)):
        bm.faces.new((c, ring[i], ring[(i + 1) % len(ring)]))
    return sg.bm_to_obj("PS_Seam", bm)


def palette_attrs(o, names):
    me = o.data
    ids = me.attributes.get("pal")
    pid = np.zeros(len(me.polygons), np.int32)
    if ids:
        ids.data.foreach_get("value", pid)
    base = me.color_attributes.new("Base", "FLOAT_COLOR", "CORNER")
    props = me.color_attributes.new("Props", "FLOAT_COLOR", "CORNER")
    cols = np.array([[*lin(PAL[n][0]), 1] for n in names], np.float32)
    prs = np.array([[PAL[n][1], PAL[n][2], PAL[n][3], 1] for n in names], np.float32)
    loop_poly = np.zeros(len(me.loops), np.int32)
    for p in me.polygons:
        loop_poly[p.loop_start:p.loop_start + p.loop_total] = p.index
    base.data.foreach_set("color", cols[pid[loop_poly]].ravel())
    props.data.foreach_set("color", prs[pid[loop_poly]].ravel())


def detail_bump_material(name):
    """Stone: the gate's fracture/grain height; metal: fine machining + pitting.
    Mixed by the Props.b stone flag."""
    m = sg.bump_material(name)
    nt = m.node_tree
    bump = next(n for n in nt.nodes if n.type == "BUMP")
    stone_h = bump.inputs["Height"].links[0].from_socket
    attr = nt.nodes.new("ShaderNodeAttribute")
    attr.attribute_name = "Props"
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(attr.outputs["Color"], sep.inputs[0])
    tc = nt.nodes.new("ShaderNodeTexCoord")
    fine = nt.nodes.new("ShaderNodeTexNoise")
    fine.inputs["Scale"].default_value = 38.0
    fine.inputs["Detail"].default_value = 6.0
    nt.links.new(tc.outputs["Object"], fine.inputs["Vector"])
    pits = nt.nodes.new("ShaderNodeTexVoronoi")
    pits.inputs["Scale"].default_value = 22.0
    nt.links.new(tc.outputs["Object"], pits.inputs["Vector"])
    mh = nt.nodes.new("ShaderNodeMath")
    mh.operation = "MULTIPLY_ADD"
    nt.links.new(pits.outputs["Distance"], mh.inputs[0])
    mh.inputs[1].default_value = 0.25
    nt.links.new(fine.outputs["Fac"], mh.inputs[2])
    metal_h = nt.nodes.new("ShaderNodeMath")
    metal_h.operation = "MULTIPLY"
    metal_h.inputs[1].default_value = 0.18
    nt.links.new(mh.outputs[0], metal_h.inputs[0])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "FLOAT"
    nt.links.new(sep.outputs["Blue"], mix.inputs["Factor"])
    nt.links.new(metal_h.outputs[0], mix.inputs[2])
    nt.links.new(stone_h, mix.inputs[3])
    nt.links.new(mix.outputs[0], bump.inputs["Height"])
    return m


def composite(base, props, fields, cracks, edges, ao, heat):
    stone = np.clip(props[..., 2], 0, 1)[..., None]
    s_alb, s_rough, s_occ = sg.composite(fields, cracks, edges, ao, "base")
    # tint the gate's stone toward the palette value (basalt darker, stone lighter)
    lum = base.mean(-1, keepdims=True)
    s_alb = s_alb * np.clip(lum / 0.06, 0.55, 1.35)
    # metal: the outpost's dust/grime/wear on the palette colour
    ofields = np.stack([cracks[..., 2], edges[..., 1] * 6.0, fields[..., 1]], -1)
    m_alb, m_rough, m_occ, m_metal = osh.composite(base, props, ofields, ao, 1 - edges)
    # heat: scorching near the slit and soot streaks up the vanes' lower parts
    h = np.clip(heat[..., 0], 0, 1)[..., None]
    soot = np.array(lin(0x120f0e), np.float32)
    s_alb = s_alb * (1 - 0.55 * h) + soot * 0.55 * h
    m_alb = m_alb * (1 - 0.35 * h) + soot * 0.35 * h
    alb = s_alb * stone + m_alb * (1 - stone)
    rough = s_rough * stone[..., 0] + m_rough * (1 - stone[..., 0])
    occ = s_occ * stone[..., 0] + m_occ * (1 - stone[..., 0])
    metal = m_metal * (1 - stone[..., 0])
    return np.clip(alb, 0, 1), np.clip(rough, 0.15, 1), np.clip(occ, 0, 1), np.clip(metal, 0, 1)


def heat_material(name):
    """R: proximity to the slit (scorch mask) with noisy breakup."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Position"], sep.inputs[0])
    ay = nt.nodes.new("ShaderNodeMath")
    ay.operation = "ABSOLUTE"
    nt.links.new(sep.outputs["Y"], ay.inputs[0])
    ax = nt.nodes.new("ShaderNodeMath")
    ax.operation = "ABSOLUTE"
    nt.links.new(sep.outputs["X"], ax.inputs[0])
    sx = nt.nodes.new("ShaderNodeMath")
    sx.operation = "MULTIPLY"
    sx.inputs[1].default_value = 0.35
    nt.links.new(ax.outputs[0], sx.inputs[0])
    sz = nt.nodes.new("ShaderNodeMath")
    sz.operation = "MULTIPLY"
    sz.inputs[1].default_value = 0.22
    nt.links.new(sep.outputs["Z"], sz.inputs[0])
    d1 = nt.nodes.new("ShaderNodeMath")
    d1.operation = "ADD"
    nt.links.new(ay.outputs[0], d1.inputs[0])
    nt.links.new(sx.outputs[0], d1.inputs[1])
    d2 = nt.nodes.new("ShaderNodeMath")
    d2.operation = "ADD"
    nt.links.new(d1.outputs[0], d2.inputs[0])
    nt.links.new(sz.outputs[0], d2.inputs[1])
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 2.6
    nz.inputs["Detail"].default_value = 5.0
    nt.links.new(geo.outputs["Position"], nz.inputs["Vector"])
    mr = nt.nodes.new("ShaderNodeMath")
    mr.operation = "MULTIPLY_ADD"
    nt.links.new(nz.outputs["Fac"], mr.inputs[0])
    mr.inputs[1].default_value = 0.6
    nt.links.new(d2.outputs[0], mr.inputs[2])
    rng_ = nt.nodes.new("ShaderNodeMapRange")
    rng_.inputs["From Min"].default_value = 1.05
    rng_.inputs["From Max"].default_value = 0.35
    nt.links.new(mr.outputs[0], rng_.inputs["Value"])
    comb = nt.nodes.new("ShaderNodeCombineColor")
    nt.links.new(rng_.outputs[0], comb.inputs[0])
    nt.links.new(comb.outputs[0], em.inputs["Color"])
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    return m


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
    sc.name = "PhaseScar"
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.world = bpy.data.worlds.new("w")
    b = PB()
    slabs = build_ground(b)
    rails, lenses, extras = build_instrument(b)
    body = sg.bm_to_obj("PhaseScar", b.bm)
    parts = [body] + shards(b) + rubble(b)
    for i, (kind, pts, r, key) in enumerate(extras):
        if kind == "cable":
            pts = curve_pts([tuple(x) for x in pts], 24)
        parts.append(sweep_tube(f"_x{i}", pts, r, key, b.names))
    for o in parts:
        palette_attrs(o, b.names)
    o = sg.join(parts, "PhaseScar")
    sg.shade(o, 34)
    rail = boxes_obj("PS_Rail", rails)
    lens = boxes_obj("PS_Lens", lenses)
    seam = seam_obj()
    size = int(p.get("bake", 2048))
    quick = bool(p.get("quick"))
    sg.unwrap(o, 0.0025)
    base, _ = sg.bake_image(o, osh.attr_material("_base", "Base"), "EMIT", size, 1, "_base")
    props, _ = sg.bake_image(o, osh.attr_material("_props", "Props"), "EMIT", size, 1, "_props")
    fields, _ = sg.bake_image(o, sg.field_material("_fields", "fields"), "EMIT", size, 1, "_fields")
    cracks, _ = sg.bake_image(o, sg.field_material("_cracks", "cracks"), "EMIT", size, 1, "_cracks")
    edges, _ = sg.bake_image(o, sg.field_material("_edges", "edges"), "EMIT", size, 4 if quick else 10, "_edges")
    heat, _ = sg.bake_image(o, heat_material("_heat"), "EMIT", size, 1, "_heat")
    sc.world.light_settings.distance = 0.9
    ao, _ = sg.bake_image(o, sg.field_material("_ao", "fields"), "AO", size, 8 if quick else 32, "_ao")
    edges[..., 0] = sg.blur(edges[..., 0], 1)
    nrm, _ = sg.bake_image(o, detail_bump_material("_bump"), "NORMAL", int(p.get("normal", 2048)), 1, "_normal")
    albedo, rough, occ, metal = composite(base, props, fields, cracks, edges, ao, heat)
    maps = {"albedo": work / "scar_albedo.png", "orm": work / "scar_orm.png", "normal": work / "scar_normal.png"}
    sg.save_png(maps["albedo"], albedo, srgb=True)
    sg.save_png(maps["orm"], np.stack([occ, rough, metal], -1))
    sg.save_png(maps["normal"], nrm)
    mat = sg.final_stone_material("PS_Body", maps)
    o.data.materials.clear()
    o.data.materials.append(mat)
    for ob, mname, col, strength in [(rail, "PS_Rail", (0.55, 0.85, 1.0), 4.0), (lens, "PS_Lens", (0.8, 0.9, 1.0), 8.0), (seam, "PS_Seam", (0.75, 0.45, 1.0), 3.0)]:
        ob.data.materials.clear()
        ob.data.materials.append(sg.emissive_material(mname, col, strength))
        ob.data.uv_layers.new(name="UVMap")
        ob.parent = o
    for x in list(sc.collection.objects):
        if x not in (o, rail, lens, seam):
            sc.collection.objects.unlink(x)
    if o.data.attributes.get("pal"):
        o.data.attributes.remove(o.data.attributes["pal"])
    for a in ("Base", "Props"):
        if o.data.color_attributes.get(a):
            o.data.color_attributes.remove(o.data.color_attributes[a])
    sg.triangulate_all()
    metrics = {"tris": sg.tri_count(o), "rail_tris": sg.tri_count(rail), "lens_tris": sg.tri_count(lens), "seam_tris": sg.tri_count(seam),
               "slabs": slabs, "radius": R, "height": 5.15, "slit_half": SLIT_HALF}
    (work / "phase-scar-metrics.json").write_text(json.dumps(metrics, indent=1))
    bpy.ops.wm.save_as_mainfile(filepath=str(work / "phase_scar.blend"))
    glb = work / "phase_scar_raw.glb"
    sg.export_glb(glb)
    finish(p, {"glb": str(glb), "metrics": metrics})


if __name__ == "__main__":
    main()
