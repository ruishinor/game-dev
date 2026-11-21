"""Lattice Sanctum architecture kit, in the Severance Gate's material language:
weathered carved stone, bronze binding and teal resonance channels.

Pieces (each a named node at its own origin, ground at z = 0, -y front):
  SA_Deck     the 13.6 m platform: a stepped curb ring of chamfered stones,
              concentric courses of radial-cut flagstones with recessed joints,
              a raised rosette under the beacon, a bronze inlay ring and spokes
  SA_Pylon    a 5.4 m lattice pylon: octagonal stepped plinth, a tapered stone
              shaft bound by bronze ribs and bands, a corbelled capital
  SA_Arch     a road gateway: two carved piers (posts at x = +-2.05), a lintel
              with a keystone and a bronze lattice tympanum
  SA_Beacon   the beacon spire: a stepped round plinth and a tapered lattice
              obelisk of stone and bronze (~9 m; the beacon's core floats above)
  SA_Span     a 4 m bronze lattice girder along +y (scaled to each span)
Emissive inserts (children the runtime drives): SA_Channel (deck ring and
spokes, pylon and spire channels), SA_Lamp (arch lintel strip, pylon nodes).

Method: palette id per face, one shared atlas (palette, fields, cracks, edges,
AO, detail bump) baked across the pieces, then split back into pieces.
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

SPAL = {  # sRGB, roughness, metallic, stone flag
    "stone": (0x5b5852, 0.9, 0.0, 1), "dark": (0x3a3835, 0.93, 0.0, 1), "pale": (0x7c766b, 0.88, 0.0, 1),
    "bronze": (0x8a6a3e, 0.38, 0.88, 0), "iron": (0x2c2f31, 0.6, 0.6, 0), "teal": (0x1f4a4c, 0.4, 0.5, 0),
}
PIECES = ["SA_Deck", "SA_Pylon", "SA_Arch", "SA_Beacon", "SA_Span", "SA_HallWall", "SA_HallPillar", "SA_HallLintel", "SA_HallCanopy"]
TOP = 0.47
rng = np.random.default_rng(1306)
I3 = (Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))


class SB(ps.PB):
    def __init__(self):
        super().__init__()
        self.names = list(SPAL)
        self.piece = self.bm.faces.layers.int.new("piece")
        self.cur = 0
        self.off = Vector()
        self.glow = []      # (piece, kind, bmesh-builder fn) emissive inserts, built separately

    def face(self, pts, key):
        f = super().face([Vector(p) + self.off for p in pts], key)
        f[self.piece] = self.cur
        return f

    def begin(self, i):
        self.cur = i
        self.off = Vector((i * 40.0, 0, 0))

    def ob(self, c, frame, h, key, chamfer=0.03):
        mark = len(self.bm.faces)
        ps.oriented_box(self, Vector(c) + self.off, frame, h, key, chamfer)
        self.bm.faces.ensure_lookup_table()
        for f in self.bm.faces[mark:]:
            f[self.piece] = self.cur

    def tube(self, a, b, r=0.07, key="bronze", sides=8):
        mark = len(self.bm.faces)
        super().tube(Vector(a) + self.off, Vector(b) + self.off, r, key, sides)
        self.bm.faces.ensure_lookup_table()
        for f in self.bm.faces[mark:]:
            f[self.piece] = self.cur

    def ring(self, r0, r1, z0, z1, key, seg=64, a0=0.0, a1=2 * math.pi, jitter=0.0):
        """Annular sector solid between radii r0..r1 and heights z0..z1."""
        n = seg
        for k in range(n):
            t0, t1 = a0 + (a1 - a0) * k / n, a0 + (a1 - a0) * (k + 1) / n
            p = lambda r, t, z: (math.cos(t) * r, math.sin(t) * r, z)
            dz = rng.uniform(-jitter, jitter) if jitter else 0.0
            self.face([p(r0, t0, z1 + dz), p(r1, t0, z1 + dz), p(r1, t1, z1 + dz), p(r0, t1, z1 + dz)], key)
            self.face([p(r1, t0, z0), p(r1, t1, z0), p(r1, t1, z1 + dz), p(r1, t0, z1 + dz)], key)
            self.face([p(r0, t1, z0), p(r0, t0, z0), p(r0, t0, z1 + dz), p(r0, t1, z1 + dz)], key)

    def cyl(self, c, r, h, key, sides=16, r2=None):
        r2 = r if r2 is None else r2
        x, y, z = c
        bot = [(x + math.cos(a) * r, y + math.sin(a) * r, z) for a in np.linspace(0, 2 * math.pi, sides + 1)[:-1]]
        top = [(x + math.cos(a) * r2, y + math.sin(a) * r2, z + h) for a in np.linspace(0, 2 * math.pi, sides + 1)[:-1]]
        self.face(list(reversed(bot)), key)
        self.face(top, key)
        for i in range(sides):
            j = (i + 1) % sides
            self.face([bot[i], bot[j], top[j], top[i]], key)


def stone_block(b, c, frame, h, key="stone", wear=0.02):
    """A chamfered block with slight per-block size/height variation (hand-cut)."""
    hh = (h[0] * rng.uniform(0.97, 1.0), h[1] * rng.uniform(0.97, 1.0), h[2] * rng.uniform(0.98, 1.02))
    b.ob(c, frame, hh, key, chamfer=min(0.05, min(hh) * 0.3) + wear)


def deck(b, glow):
    R = 13.6
    # stepped curb: two courses of chamfered curb stones round the rim
    for course, (r0, r1, z0, z1) in enumerate(((R - 0.1, R + 0.75, -0.35, 0.12), (R - 0.55, R + 0.12, 0.12, TOP))):
        n = 56 if course == 0 else 60
        for k in range(n):
            t = (k + 0.5) / n * 2 * math.pi + (0.026 if course else 0)
            rm, w = (r0 + r1) / 2, 2 * math.pi * ((r0 + r1) / 2) / n
            u, v = Vector((-math.sin(t), math.cos(t), 0)), Vector((math.cos(t), math.sin(t), 0))
            stone_block(b, (math.cos(t) * rm, math.sin(t) * rm, (z0 + z1) / 2), (u, v, I3[2]), (w / 2 - 0.02, (r1 - r0) / 2, (z1 - z0) / 2), "dark" if course == 0 else "stone")
    # mortar bed under the flags: joints read as recessed grout, not voids
    b.ring(0.02, R - 0.5, 0.0, TOP - 0.045, "dark", seg=96)
    # flagstone courses: radial-cut slabs with recessed joints
    rings = [(3.9, 6.2, 18), (6.2, 8.8, 26), (8.8, 11.2, 34), (11.2, R - 0.6, 42)]
    for r0, r1, n in rings:
        for k in range(n):
            g = 0.0125 / ((r0 + r1) / 2)
            t0, t1 = k / n * 2 * math.pi + g, (k + 1) / n * 2 * math.pi - g
            key = "pale" if (k + n) % 7 == 0 else "stone"
            jz = rng.uniform(-0.008, 0.008)
            b.ring(r0 + 0.03, r1 - 0.03, 0.0, TOP + jz, key, seg=3, a0=t0, a1=t1)
        b.ring(r0 - 0.03, r0 + 0.03, 0.0, TOP - 0.03, "dark", seg=n * 3)      # recessed course joint
    # central rosette under the beacon: three raised concentric tiers
    for r0, r1, z, key in ((0.0, 3.9, TOP + 0.06, "pale"), (2.4, 3.9, TOP + 0.12, "stone")):
        b.ring(max(r0, 0.01), r1, 0.0, z, key, seg=48)
    # bronze inlay ring and six spokes (the glowing channel is a separate insert)
    b.ring(12.55, 12.95, TOP - 0.01, TOP + 0.008, "bronze", seg=96)
    glow.append(("ring", 12.68, 12.82, TOP + 0.012))
    for k in range(6):
        t = k / 6 * 2 * math.pi + math.pi / 6
        u, v = Vector((-math.sin(t), math.cos(t), 0)), Vector((math.cos(t), math.sin(t), 0))
        mid = 8.2
        b.ob((math.cos(t) * mid, math.sin(t) * mid, TOP + 0.002), (u, v, I3[2]), (0.11, 4.3, 0.012), "bronze", 0.005)
        glow.append(("spoke", t, mid, 4.2))


def pylon(b, glow):
    # octagonal stepped plinth
    b.cyl((0, 0, 0), 1.05, 0.32, "dark", 8)
    b.cyl((0, 0, 0.32), 0.86, 0.2, "stone", 8)
    # shaft: tapered stone with four bronze ribs and three bands
    b.cyl((0, 0, 0.52), 0.6, 4.2, "stone", 8, 0.46)
    for k in range(4):
        a = k / 4 * 2 * math.pi + math.pi / 8
        d = Vector((math.cos(a), math.sin(a), 0))
        b.tube(tuple(d * 0.62 + Vector((0, 0, 0.55))), tuple(d * 0.48 + Vector((0, 0, 4.7))), 0.06, "bronze", 6)
        glow.append(("slit", a, 0.58, 0.9, 4.2))
    for z, r in ((1.4, 0.6), (2.9, 0.55), (4.3, 0.5)):
        b.cyl((0, 0, z), r + 0.04, 0.12, "bronze", 16)
    # corbelled capital and cap stone (the lattice spans land here at ~5.2 m)
    b.cyl((0, 0, 4.72), 0.5, 0.18, "stone", 8, 0.72)
    b.cyl((0, 0, 4.9), 0.74, 0.28, "pale", 8)
    b.cyl((0, 0, 5.18), 0.62, 0.12, "bronze", 8)
    glow.append(("node", 5.32))


def arch(b, glow):
    # piers centred on the collider posts (x = +-2.05, r 0.45); clear opening ~3.1 m
    for s in (-1, 1):
        x = s * 2.05
        stone_block(b, (x, 0, 0.18), I3, (0.62, 0.62, 0.18), "dark")
        for i in range(5):  # coursed pier stones
            z = 0.36 + i * 0.78 + 0.39
            stone_block(b, (x + rng.uniform(-0.01, 0.01), 0, z), I3, (0.48, 0.5, 0.38), "pale" if i == 2 else "stone")
        b.ob((x - s * 0.5, -0.52, 2.2), I3, (0.03, 0.03, 1.9), "bronze", 0.01)     # bronze corner strips
        b.ob((x + s * 0.5, -0.52, 2.2), I3, (0.03, 0.03, 1.9), "bronze", 0.01)
    # impost blocks, voussoir lintel and keystone
    for s in (-1, 1):
        stone_block(b, (s * 2.05, 0, 4.35), I3, (0.6, 0.58, 0.14), "stone")
    for i in range(7):
        x = -2.1 + i * 0.7
        stone_block(b, (x, 0, 4.78), I3, (0.33, 0.52, 0.3), "stone" if i != 3 else "pale")
    stone_block(b, (0, -0.05, 4.95), I3, (0.32, 0.56, 0.48), "pale")              # keystone
    # bronze lattice tympanum strip under the lintel and the lamp channel
    for i in range(9):
        x = -1.6 + i * 0.4
        b.ob((x, -0.02, 4.38), (I3[0], I3[1], I3[2]), (0.02, 0.04, 0.1), "bronze", 0.005)
    b.ob((0, 0, 4.48), I3, (1.65, 0.05, 0.02), "bronze", 0.006)
    glow.append(("lintel",))


def beacon(b, glow):
    b.cyl((0, 0, 0), 2.25, 0.25, "dark", 24)
    b.cyl((0, 0, 0.25), 1.8, 0.25, "stone", 24)
    b.cyl((0, 0, 0.5), 1.35, 0.3, "pale", 24)
    # tapered stone obelisk core bound by a bronze lattice of eight ribs
    b.cyl((0, 0, 0.8), 0.78, 8.4, "stone", 8, 0.34)
    for k in range(8):
        a = k / 8 * 2 * math.pi
        d = Vector((math.cos(a), math.sin(a), 0))
        b.tube(tuple(d * 1.05 + Vector((0, 0, 0.8))), tuple(d * 0.42 + Vector((0, 0, 9.0))), 0.055, "bronze", 6)
        glow.append(("slit", a + math.pi / 8, 0.7, 1.2, 7.8))
    for z, r in ((2.4, 0.98), (4.2, 0.85), (6.0, 0.7), (7.8, 0.56)):
        b.cyl((0, 0, z), r, 0.1, "bronze", 24)
    b.cyl((0, 0, 9.2), 0.45, 0.25, "bronze", 12, 0.2)


def span(b, glow):
    L = 4.0
    for sx in (-1, 1):
        for sz in (-1, 1):
            b.tube((sx * 0.14, -L / 2, sz * 0.14), (sx * 0.14, L / 2, sz * 0.14), 0.035, "bronze", 6)
    for i in range(9):
        y0 = -L / 2 + i * L / 8
        for sx in (-1, 1):
            b.tube((sx * 0.14, y0, -0.14), (sx * 0.14, y0 + L / 8, 0.14), 0.016, "iron", 4)
        b.tube((-0.14, y0, 0.14), (0.14, y0, 0.14), 0.014, "iron", 4)


# ----------------------------------------------------------------------------- arrival hall
def hall_wall(b, glow):
    """Side enclosure along Blender y (three z): 4.24 m long, 3.35 m high, 0.36 m thick."""
    L, H, T = 4.24, 3.35, 0.36
    stone_block(b, (0, 0, 0.16), I3, (T / 2 + 0.06, L / 2 + 0.06, 0.16), "dark")
    courses = [(0.32, 0.9), (1.22, 0.86), (2.08, 0.72)]
    for ci, (z0, hh) in enumerate(courses):
        n = 4 if ci % 2 == 0 else 5
        for k in range(n):
            w = L / n
            y = -L / 2 + (k + 0.5) * w + (0.0 if ci % 2 == 0 else 0.0)
            stone_block(b, (0, y, z0 + hh / 2), I3, (T / 2, w / 2 - 0.015, hh / 2 - 0.012), "pale" if (k + ci) % 5 == 0 else "stone")
    stone_block(b, (0, 0, 2.95), I3, (T / 2 + 0.05, L / 2 + 0.04, 0.15), "stone")      # coping
    b.ob((0, 0, 3.2), I3, (T / 2 + 0.02, L / 2, 0.1), "bronze", 0.02)                  # bronze crest
    for s_ in (-1, 1):
        for x in (-T / 2 - 0.03, T / 2 + 0.03):
            b.ob((x, s_ * (L / 2 - 0.25), 1.6), I3, (0.03, 0.07, 1.45), "bronze", 0.008)  # pilasters
    glow.append(("wallslit", T / 2 + 0.035, L))


def hall_pillar(b, glow):
    b.cyl((0, 0, 0), 0.48, 0.22, "dark", 12)
    b.cyl((0, 0, 0.22), 0.4, 0.12, "bronze", 16)
    b.cyl((0, 0, 0.34), 0.34, 3.0, "stone", 16, 0.3)
    for k in range(8):  # shallow flutes as bronze ribs
        a = k / 8 * 2 * math.pi
        d = Vector((math.cos(a), math.sin(a), 0))
        b.tube(tuple(d * 0.335 + Vector((0, 0, 0.5))), tuple(d * 0.3 + Vector((0, 0, 3.2))), 0.018, "bronze", 4)
    b.cyl((0, 0, 3.34), 0.3, 0.14, "bronze", 16, 0.42)
    b.cyl((0, 0, 3.48), 0.46, 0.32, "pale", 8)
    glow.append(("pillarband", 1.9))


def hall_lintel(b, glow):
    """Threshold architrave across x (8.25 m) resting on the columns (top ~3.9 m)."""
    for i in range(11):
        x = -3.75 + i * 0.75
        stone_block(b, (x, 0, 3.72), I3, (0.37, 0.34, 0.17), "pale" if i == 5 else "stone")
    b.ob((0, 0, 3.5), I3, (3.7, 0.36, 0.05), "bronze", 0.012)
    for x in (-3.38, 3.38):
        stone_block(b, (x, 0, 3.39), I3, (0.36, 0.27, 0.22), "stone")
    glow.append(("lintel_strip",))


def hall_canopy(b, glow):
    """Bronze lattice canopy over the hall (x +-4, z 5.8..10 -> local +-2.1), at 4.24 m."""
    for y in (-2.1, 2.1):
        b.ob((0, y, 4.24), I3, (4.0, 0.16, 0.13), "bronze", 0.02)
    for x in (-3.8, 3.8):
        b.ob((x, 0, 4.24), I3, (0.14, 2.3, 0.14), "bronze", 0.02)
    for i in range(-3, 4):
        b.ob((i * 1.0, 0, 4.4), I3, (0.05, 2.25, 0.05), "iron", 0.008)
    for x in np.linspace(-3.6, 3.6, 13):  # diagonal lattice ties
        b.tube((x, -2.05, 4.32), (x + 0.3, 2.05, 4.32), 0.012, "bronze", 4)


def palette_attrs(o, names):
    me = o.data
    pid = np.zeros(len(me.polygons), np.int32)
    me.attributes["pal"].data.foreach_get("value", pid)
    base = me.color_attributes.new("Base", "FLOAT_COLOR", "CORNER")
    props = me.color_attributes.new("Props", "FLOAT_COLOR", "CORNER")
    cols = np.array([[*osh.lin(SPAL[n][0]), 1] for n in names], np.float32)
    prs = np.array([[SPAL[n][1], SPAL[n][2], SPAL[n][3], 1] for n in names], np.float32)
    loop_poly = np.zeros(len(me.loops), np.int32)
    for p in me.polygons:
        loop_poly[p.loop_start:p.loop_start + p.loop_total] = p.index
    base.data.foreach_set("color", cols[pid[loop_poly]].ravel())
    props.data.foreach_set("color", prs[pid[loop_poly]].ravel())


def glow_objects(glows):
    """Emissive inserts per piece: channel (deck/pylon/spire) and lamp (arch, pylon node)."""
    out = {}
    for piece, items in glows.items():
        ch, lp = bmesh.new(), bmesh.new()
        def box(bm, c, frame, h):
            tmp = ps.PB()
            ps.oriented_box(tmp, Vector(c), frame, h, "steel", 0.004)
            vm = {}
            for v in tmp.bm.verts:
                vm[v] = bm.verts.new(v.co)
            for f in tmp.bm.faces:
                bm.faces.new([vm[x] for x in f.verts])
            tmp.bm.free()
        for it in items:
            kind = it[0]
            if kind == "ring":
                _, r0, r1, z = it
                n = 96
                vs = []
                for k in range(n):
                    t = k / n * 2 * math.pi
                    vs.append((ch.verts.new((math.cos(t) * r0, math.sin(t) * r0, z)), ch.verts.new((math.cos(t) * r1, math.sin(t) * r1, z))))
                for k in range(n):
                    a, b2 = vs[k], vs[(k + 1) % n]
                    ch.faces.new((a[0], a[1], b2[1], b2[0]))
            elif kind == "spoke":
                _, t, mid, half = it
                u, v = Vector((-math.sin(t), math.cos(t), 0)), Vector((math.cos(t), math.sin(t), 0))
                box(ch, (math.cos(t) * mid, math.sin(t) * mid, TOP + 0.016), (u, v, I3[2]), (0.035, half, 0.004))
            elif kind == "slit":
                _, a, rr, z0, z1 = it
                d = Vector((math.cos(a), math.sin(a), 0))
                box(ch, tuple(d * (rr - 0.04) + Vector((0, 0, (z0 + z1) / 2))), (d.cross(I3[2]), d, I3[2]), (0.03, 0.02, (z1 - z0) / 2))
            elif kind == "node":
                _, z = it
                box(lp, (0, 0, z), I3, (0.22, 0.22, 0.05))
            elif kind == "lintel":
                box(lp, (0, -0.06, 4.44), I3, (1.55, 0.02, 0.012))
            elif kind == "wallslit":
                _, x, L = it
                for sx in (-1, 1):
                    box(ch, (sx * x, 0, 2.84), I3, (0.006, L / 2 - 0.3, 0.02))
            elif kind == "pillarband":
                _, z = it
                n = 24
                vs = []
                for k in range(n):
                    t = k / n * 2 * math.pi
                    vs.append((ch.verts.new((math.cos(t) * 0.337, math.sin(t) * 0.337, z - 0.03)), ch.verts.new((math.cos(t) * 0.337, math.sin(t) * 0.337, z + 0.03))))
                for k in range(n):
                    a_, b2 = vs[k], vs[(k + 1) % n]
                    ch.faces.new((a_[0], b2[0], b2[1], a_[1]))
            elif kind == "lintel_strip":
                box(lp, (0, -0.37, 3.5), I3, (3.4, 0.008, 0.02))
        out[piece] = (sg.bm_to_obj(f"_ch{piece}", ch) if ch.faces else None, sg.bm_to_obj(f"_lp{piece}", lp) if lp.faces else None)
    return out


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
    sc.name = "SanctumArch"
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.world = bpy.data.worlds.new("w")
    b = SB()
    glows = {}
    for i, fn in enumerate([deck, pylon, arch, beacon, span, hall_wall, hall_pillar, hall_lintel, hall_canopy]):
        b.begin(i)
        g = []
        fn(b, g)
        glows[PIECES[i]] = g
    kit = sg.bm_to_obj("Kit", b.bm)
    palette_attrs(kit, b.names)
    sg.shade(kit, 32)
    size = int(p.get("bake", 2048))
    quick = bool(p.get("quick"))
    sg.unwrap(kit, 0.0015)
    base, _ = sg.bake_image(kit, osh.attr_material("_base", "Base"), "EMIT", size, 1, "_base")
    props, _ = sg.bake_image(kit, osh.attr_material("_props", "Props"), "EMIT", size, 1, "_props")
    fields, _ = sg.bake_image(kit, sg.field_material("_fields", "fields"), "EMIT", size, 1, "_fields")
    cracks, _ = sg.bake_image(kit, sg.field_material("_cracks", "cracks"), "EMIT", size, 1, "_cracks")
    edges, _ = sg.bake_image(kit, sg.field_material("_edges", "edges"), "EMIT", size, 4 if quick else 10, "_edges")
    sc.world.light_settings.distance = 0.8
    ao, _ = sg.bake_image(kit, sg.field_material("_ao", "fields"), "AO", size, 8 if quick else 32, "_ao")
    edges[..., 0] = sg.blur(edges[..., 0], 1)
    nrm, _ = sg.bake_image(kit, ps.detail_bump_material("_bump"), "NORMAL", int(p.get("normal", 2048)), 1, "_normal")
    albedo, rough, occ, metal = ps.composite(base, props, fields, cracks, edges, ao, np.zeros_like(fields))
    # The shared composite saturates its palette scale (1.35) for every tone here;
    # re-scale stone texels by the palette's own luminance so curb, flags and
    # piers keep distinct, darker values under the Sanctum's bright sky light.
    stone = np.clip(props[..., 2], 0, 1)[..., None]
    lum = base.mean(-1, keepdims=True)
    f = np.clip(lum / 0.16, 0.42, 1.15) / 1.35
    albedo = albedo * (1 - stone) + albedo * f * stone
    maps = {"albedo": work / "sarch_albedo.png", "orm": work / "sarch_orm.png", "normal": work / "sarch_normal.png"}
    sg.save_png(maps["albedo"], albedo, srgb=True)
    sg.save_png(maps["orm"], np.stack([occ, rough, metal], -1))
    sg.save_png(maps["normal"], nrm)
    mat = sg.final_stone_material("SA_Body", maps)
    me = kit.data
    pc = np.zeros(len(me.polygons), np.int32)
    me.attributes["piece"].data.foreach_get("value", pc)
    kit.data.materials.clear()
    for i in range(len(PIECES)):
        kit.data.materials.append(bpy.data.materials.new(f"_slot{i}"))
    me.polygons.foreach_set("material_index", pc)
    bpy.ops.object.select_all(action="DESELECT")
    kit.select_set(True)
    bpy.context.view_layer.objects.active = kit
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="MATERIAL")
    bpy.ops.object.mode_set(mode="OBJECT")
    parts = {}
    for o in [x for x in sc.collection.objects if x.type == "MESH" and x.data.materials and x.data.materials[0].name.startswith("_slot")]:
        i = int(o.data.materials[0].name[5:])
        o.data.materials.clear()
        o.data.materials.append(mat)
        o.name = PIECES[i]
        o.data.name = PIECES[i]
        o.data.transform(Matrix.Translation((-i * 40.0, 0, 0)))
        parts[PIECES[i]] = o
    ch_mat = sg.emissive_material("SA_Channel", (0.45, 0.95, 1.0), 4.0, base=(0.02, 0.05, 0.06))
    lp_mat = sg.emissive_material("SA_Lamp", (1.0, 0.82, 0.55), 5.0)
    keep = set(parts.values())
    for piece, (ch, lp) in glow_objects(glows).items():
        for ob, m, suffix in ((ch, ch_mat, "Channel"), (lp, lp_mat, "Lamp")):
            if ob is None:
                continue
            ob.data.materials.clear()
            ob.data.materials.append(m)
            ob.data.uv_layers.new(name="UVMap")
            ob.name = f"{piece}_{suffix}"
            ob.parent = parts[piece]
            keep.add(ob)
    for x in list(sc.collection.objects):
        if x not in keep:
            sc.collection.objects.unlink(x)
    for o in parts.values():
        for a in ("pal", "piece"):
            if o.data.attributes.get(a):
                o.data.attributes.remove(o.data.attributes[a])
        for a in ("Base", "Props"):
            if o.data.color_attributes.get(a):
                o.data.color_attributes.remove(o.data.color_attributes[a])
    sg.triangulate_all()
    metrics = {k: sg.tri_count(v) for k, v in parts.items()}
    (work / "sarch-metrics.json").write_text(json.dumps(metrics, indent=1))
    bpy.ops.wm.save_as_mainfile(filepath=str(work / "sanctum_arch.blend"))
    glb = work / "sanctum_arch_raw.glb"
    sg.export_glb(glb)
    finish(p, {"glb": str(glb), "metrics": metrics})


if __name__ == "__main__":
    main()
