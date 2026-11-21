"""Salvage yard kit (Severance Expanse enemy camp): rogue sentinels strip and
re-forge machine scrap here.

Pieces (each a named node at its own origin, base on the ground, -y front):
  CK_Wall     a palisade bay of overlapping riveted scrap plates on driven
              I-beam posts with cross-bracing and a ragged top edge
  CK_Forge    a scrap-fed forge: a riveted firebox on a slag-crusted plinth,
              a tapering chimney, a charging chute, tongs rack, quench tank
  CK_LeanTo   a workshop lean-to: salvaged truss frame, corrugated roof plates,
              a hanging tarp, a workbench with a vice and parts
  CK_Gantry   a hoist gantry over a half-stripped sentinel carcass
  CK_Mast     a signal mast of stacked truss sections with a dish and lamps
  CK_Crates   a stack of strapped ammunition/parts crates
  CK_Pile     a scrap heap: plates, pipes, a wheel, broken limbs
Emissive inserts (children the runtime drives): CK_Coals (forge mouth and
chimney glow), CK_Lamp (mast and lean-to lamps).

Method as the outpost shelter / Phase Scar: palette id per face, one shared
atlas baked across all pieces (palette, fields, cracks, edges, AO, detail
bump), then split back into pieces.
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

CPAL = {  # sRGB, roughness, metallic, stone flag
    "rust": (0x6e4029, 0.82, 0.45, 0), "plate": (0x5a5852, 0.6, 0.7, 0), "dark": (0x1f2124, 0.7, 0.55, 0),
    "brass": (0x93764a, 0.38, 0.88, 0), "hazard": (0xb8862c, 0.62, 0.3, 0), "tarp": (0x4f5a3c, 0.9, 0.0, 0),
    "wood": (0x5a4632, 0.85, 0.0, 0), "slag": (0x2b2622, 0.92, 0.1, 1), "stone": (0x5d5a54, 0.93, 0.0, 1),
    "cable": (0x17181a, 0.55, 0.1, 0), "teal": (0x2f6f6c, 0.45, 0.6, 0),
}
rng = np.random.default_rng(5150)
PIECES = ["CK_Wall", "CK_Forge", "CK_LeanTo", "CK_Gantry", "CK_Mast", "CK_Crates", "CK_Pile"]


class CB(ps.PB):
    def __init__(self):
        super().__init__()
        self.names = list(CPAL)
        self.piece = self.bm.faces.layers.int.new("piece")
        self.cur = 0
        self.off = Vector()

    def face(self, pts, key):
        f = super().face([Vector(p) + self.off for p in pts], key)
        f[self.piece] = self.cur
        return f

    def begin(self, i):
        self.cur = i
        self.off = Vector((i * 14.0, 0, 0))      # pieces built apart on a line, split after the bake

    def ob(self, c, frame, h, key, chamfer=0.02):
        """oriented_box through this builder (honours the piece offset)."""
        mark = len(self.bm.faces)
        ps.oriented_box(self, Vector(c) + self.off, frame, h, key, chamfer)
        self.bm.faces.ensure_lookup_table()
        for f in self.bm.faces[mark:]:
            f[self.piece] = self.cur

    def tube(self, a, b, r=0.07, key="plate", sides=8):
        mark = len(self.bm.faces)
        super().tube(Vector(a) + self.off, Vector(b) + self.off, r, key, sides)
        self.bm.faces.ensure_lookup_table()
        for f in self.bm.faces[mark:]:
            f[self.piece] = self.cur


I3 = (Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))


def rot_frame(yaw=0.0, pitch=0.0, roll=0.0):
    M = Matrix.Rotation(yaw, 3, "Z") @ Matrix.Rotation(pitch, 3, "X") @ Matrix.Rotation(roll, 3, "Y")
    return (M @ I3[0], M @ I3[1], M @ I3[2])


def plate(b, c, w, h, yaw, lean, key, t=0.035):
    """A thin scrap plate with rivet rows, leaning slightly."""
    fr = rot_frame(yaw, lean, rng.uniform(-0.05, 0.05))
    b.ob(c, fr, (w / 2, t, h / 2), key, 0.01)
    for s in (-1, 1):
        for k in range(max(2, int(w / 0.35))):
            x = -w / 2 + 0.12 + k * (w - 0.24) / max(1, int(w / 0.35) - 1)
            b.ob(Vector(c) + fr[0] * x + fr[2] * s * (h / 2 - 0.08) - fr[1] * t, fr, (0.018, 0.012, 0.018), "dark", 0.004)


def wall(b):
    """3.2 m bay: two I-beam posts, overlapping plates in two courses, bracing, a ragged top."""
    L, H = 3.2, 2.5
    for s in (-1, 1):
        x = s * L / 2
        for dx in (-0.07, 0.07):  # I-beam flanges
            b.ob((x + dx, 0, H / 2 + 0.1), I3, (0.012, 0.09, H / 2 + 0.25), "dark", 0.004)
        b.ob((x, 0, H / 2 + 0.1), I3, (0.07, 0.012, H / 2 + 0.25), "dark", 0.004)
        b.ob((x, 0, 0.1), I3, (0.22, 0.22, 0.12), "slag", 0.03)
    k = 0
    for z0, n in ((0.15, 3), (1.25, 3)):
        for i in range(n):
            w = L / n + 0.28
            x = -L / 2 + (i + 0.5) * L / n + rng.uniform(-0.06, 0.06)
            hgt = 1.2 + rng.uniform(-0.05, 0.25) if z0 > 1 else 1.15
            key = ["rust", "plate", "rust", "hazard" if k == 4 else "plate"][k % 4]
            plate(b, (x, -0.06 - 0.03 * (i % 2), z0 + hgt / 2), w, hgt, rng.uniform(-0.04, 0.04), rng.uniform(-0.05, 0.03), key)
            k += 1
    # ragged top: offcuts and spikes
    for i in range(6):
        x = -L / 2 + 0.3 + i * (L - 0.6) / 5
        hh = rng.uniform(0.15, 0.45)
        b.ob((x, -0.06, 2.45 + hh / 2), rot_frame(0, 0, rng.uniform(-0.3, 0.3)), (0.08, 0.02, hh / 2), "rust", 0.006)
    # rear bracing
    b.tube((-L / 2, 0.15, 0.3), (L / 2, 0.15, 2.2), 0.045, "dark", 6)
    b.tube((-L / 2, 0.15, 2.2), (L / 2, 0.15, 0.3), 0.045, "dark", 6)
    for s in (-1, 1):
        b.tube((s * L / 2, 0.1, 1.9), (s * L / 2, 0.95, 0.0), 0.06, "rust", 6)


def forge(b):
    # slag plinth
    b.cyl((0, 0, 0), 1.45, 0.35, "slag", 10, 1.35)
    b.cyl((0, 0, 0.35), 1.15, 0.12, "stone", 10)
    # firebox: riveted box with a mouth
    b.ob((0, 0.1, 0.95), I3, (0.75, 0.62, 0.5), "rust", 0.05)
    b.ob((0, 0.1, 1.48), I3, (0.82, 0.68, 0.06), "dark", 0.02)
    for s in (-1, 1):
        b.ob((s * 0.78, 0.1, 0.95), I3, (0.04, 0.66, 0.54), "dark", 0.01)
        for z in (0.6, 0.95, 1.3):
            b.ob((s * 0.8, -0.35, z), I3, (0.02, 0.02, 0.02), "brass", 0.004)
    b.ob((0, -0.53, 0.82), I3, (0.38, 0.03, 0.22), "dark", 0.01)  # mouth frame (coals behind)
    # chimney: tapering stack with bands
    b.cyl((0.2, 0.35, 1.54), 0.36, 2.6, "rust", 10, 0.24)
    for z in (2.0, 2.9, 3.7):
        r = 0.36 - (z - 1.54) / 2.6 * 0.12
        b.cyl((0.2, 0.35, z), r + 0.03, 0.08, "dark", 10)
    b.cyl((0.2, 0.35, 4.14), 0.34, 0.1, "dark", 10, 0.3)
    # charging chute and bellows
    b.ob((-0.95, 0.05, 1.25), rot_frame(0, 0, -0.6), (0.18, 0.3, 0.5), "plate", 0.02)
    b.cyl((0.95, -0.1, 0.47), 0.32, 0.5, "dark", 10)
    b.ob((0.95, -0.1, 1.05), I3, (0.36, 0.36, 0.06), "wood", 0.02)
    # quench tank and tongs rack
    b.cyl((-1.05, -0.95, 0.0), 0.42, 0.62, "plate", 12)
    b.cyl((-1.05, -0.95, 0.55), 0.38, 0.03, "teal", 12)
    for i in range(3):
        b.tube((1.2 + i * 0.12, -0.9, 0.0), (1.25 + i * 0.12, -0.92, 1.1), 0.02, "dark", 5)


def lean_to(b):
    W, D, H0, H1 = 4.4, 2.6, 2.1, 3.0
    posts = [(-W / 2, -D / 2, H0), (W / 2, -D / 2, H0), (-W / 2, D / 2, H1), (W / 2, D / 2, H1)]
    for x, y, h in posts:
        b.tube((x, y, 0), (x, y, h), 0.08, "dark", 8)
        b.ob((x, y, 0.08), I3, (0.18, 0.18, 0.08), "slag", 0.02)
    for y, h in ((-D / 2, H0), (D / 2, H1)):
        b.tube((-W / 2, y, h), (W / 2, y, h), 0.07, "rust", 8)
    for x in np.linspace(-W / 2, W / 2, 4):
        b.tube((x, -D / 2, H0), (x, D / 2, H1), 0.05, "dark", 6)
        b.tube((x, -D / 2, H0 * 0.55), (x, D / 2, H1 * 0.55), 0.03, "dark", 5)
    pitch = math.atan2(H1 - H0, D)
    for i in range(5):  # corrugated roof plates, overlapping
        x = -W / 2 + 0.45 + i * (W - 0.9) / 4
        plate(b, (x, 0, (H0 + H1) / 2 + 0.08), 1.1, D + 0.4, 0, -(math.pi / 2 - pitch), "rust" if i % 2 else "plate")
    # tarp hanging from the back beam
    b.ob((0.8, D / 2 + 0.03, H1 * 0.55), rot_frame(0, 0.05, 0), (1.3, 0.015, H1 * 0.45), "tarp", 0.01)
    # workbench with a vice and parts
    b.ob((-0.6, 0.4, 0.9), I3, (1.2, 0.45, 0.05), "wood", 0.02)
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.tube((-0.6 + sx * 1.1, 0.4 + sy * 0.38, 0), (-0.6 + sx * 1.1, 0.4 + sy * 0.38, 0.86), 0.035, "dark", 5)
    b.ob((-1.4, 0.2, 1.05), I3, (0.12, 0.09, 0.1), "dark", 0.01)
    for i in range(4):
        b.cyl((-0.4 + i * 0.25, 0.45, 0.95), 0.06 + 0.02 * (i % 2), 0.12, "brass" if i % 2 else "plate", 8)


def gantry(b):
    H, S = 3.6, 2.2
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.tube((sx * S, sy * 0.9, 0), (sx * S * 0.92, sy * 0.75, H), 0.08, "hazard" if sy < 0 else "dark", 8)
        b.tube((sx * S * 0.92, -0.75, H), (sx * S * 0.92, 0.75, H), 0.07, "dark", 8)
        b.tube((sx * S, -0.9, 0.6), (sx * S * 0.95, 0.9, 2.6), 0.035, "dark", 5)
    b.ob((0, 0, H + 0.1), I3, (S, 0.12, 0.1), "hazard", 0.02)
    # hoist and chain
    b.ob((0.3, 0, H - 0.15), I3, (0.25, 0.22, 0.16), "dark", 0.03)
    for i in range(10):
        b.ob((0.3, 0, H - 0.4 - i * 0.12), rot_frame(0, 0, (i % 2) * 1.57), (0.035, 0.012, 0.06), "dark", 0.004)
    b.tube((0.3, 0, H - 1.65), (0.3, 0, H - 1.9), 0.06, "brass", 6)
    # half-stripped sentinel carcass: torso shell, exposed ribs, a severed limb
    b.ob((0.2, 0, 1.1), rot_frame(0.3, 0.25, 0.1), (0.55, 0.42, 0.6), "plate", 0.08)
    for i in range(4):
        b.tube((-0.25 + i * 0.18, -0.35, 0.6), (-0.15 + i * 0.18, -0.45, 1.5), 0.03, "brass", 5)
    b.ob((0.2, -0.05, 1.85), rot_frame(0.3, 0, 0), (0.28, 0.25, 0.22), "teal", 0.05)
    b.tube((-1.2, 0.6, 0.12), (-0.2, 0.9, 0.2), 0.12, "plate", 8)
    b.ob((-1.35, 0.55, 0.15), I3, (0.18, 0.15, 0.15), "dark", 0.03)


def mast(b):
    H = 9.0
    for i in range(3):  # stacked tapering truss sections
        z0, z1 = i * 3.0, (i + 1) * 3.0
        r0, r1 = 0.55 - i * 0.12, 0.55 - (i + 1) * 0.12
        pts0 = [(math.cos(a) * r0, math.sin(a) * r0, z0) for a in (0.0, 2.094, 4.189)]
        pts1 = [(math.cos(a) * r1, math.sin(a) * r1, z1) for a in (0.0, 2.094, 4.189)]
        for k in range(3):
            b.tube(pts0[k], pts1[k], 0.045, "rust", 6)
            b.tube(pts0[k], pts1[(k + 1) % 3], 0.02, "dark", 4)
            b.tube(pts1[k], pts1[(k + 1) % 3], 0.025, "dark", 4)
    b.cyl((0, 0, 0), 0.75, 0.3, "slag", 8)
    # dish and lamp cage
    b.ob((0.35, 0, H - 0.6), rot_frame(0, 0, 0.5), (0.04, 0.55, 0.55), "plate", 0.02)
    b.tube((0, 0, H - 0.6), (0.35, 0, H - 0.6), 0.04, "dark", 6)
    b.tube((0, 0, H - 0.2), (0, 0, H + 0.8), 0.03, "dark", 5)
    # tattered pennant
    b.ob((0.0, -0.35, H + 0.45), rot_frame(0, 0, 0.1), (0.02, 0.32, 0.18), "hazard", 0.006)


def crates(b):
    spec = [(0, 0, 0, 1.0), (1.05, 0.1, 0, 0.9), (0.4, 0.05, 1.0, 0.85), (-0.2, 1.0, 0, 0.8)]
    for x, y, z, s in spec:
        yaw = rng.uniform(-0.3, 0.3)
        fr = rot_frame(yaw)
        b.ob((x, y, z + s / 2), fr, (s / 2, s * 0.42, s / 2), "teal" if s < 0.9 else "plate", 0.03)
        for zz in (0.25, 0.75):
            b.ob(Vector((x, y, z + s * zz)), fr, (s / 2 + 0.012, s * 0.42 + 0.012, 0.03), "dark", 0.006)
        b.ob(Vector((x, y, z + s / 2)) - fr[1] * (s * 0.43), fr, (s * 0.18, 0.008, s * 0.08), "hazard", 0.003)


def pile(b):
    for i in range(9):
        a = rng.uniform(0, 2 * math.pi)
        r = rng.uniform(0, 1.0)
        c = (math.cos(a) * r, math.sin(a) * r, 0.15 + rng.uniform(0, 0.5))
        b.ob(c, rot_frame(rng.uniform(0, 6.28), rng.uniform(-0.8, 0.8), rng.uniform(-0.6, 0.6)), (rng.uniform(0.3, 0.6), 0.02, rng.uniform(0.2, 0.45)), ["rust", "plate", "rust", "hazard"][i % 4], 0.006)
    for i in range(4):
        a = rng.uniform(0, 2 * math.pi)
        b.tube((math.cos(a) * 0.9, math.sin(a) * 0.9, 0.08), (math.cos(a + 1) * 0.3, math.sin(a + 1) * 0.3, 0.6), 0.06, "dark", 8)
    b.cyl((0.6, -0.5, 0.0), 0.45, 0.16, "dark", 14)   # a wheel lying flat
    b.cyl((0.6, -0.5, 0.16), 0.18, 0.06, "brass", 10)
    b.cyl((0, 0, 0), 1.25, 0.12, "slag", 9, 1.0)


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


CB.cyl = cyl


def palette_attrs(o, names):
    me = o.data
    pid = np.zeros(len(me.polygons), np.int32)
    me.attributes["pal"].data.foreach_get("value", pid)
    base = me.color_attributes.new("Base", "FLOAT_COLOR", "CORNER")
    props = me.color_attributes.new("Props", "FLOAT_COLOR", "CORNER")
    cols = np.array([[*osh.lin(CPAL[n][0]), 1] for n in names], np.float32)
    prs = np.array([[CPAL[n][1], CPAL[n][2], CPAL[n][3], 1] for n in names], np.float32)
    loop_poly = np.zeros(len(me.loops), np.int32)
    for p in me.polygons:
        loop_poly[p.loop_start:p.loop_start + p.loop_total] = p.index
    base.data.foreach_set("color", cols[pid[loop_poly]].ravel())
    props.data.foreach_set("color", prs[pid[loop_poly]].ravel())


def emissive_bits():
    """Coals (forge mouth + chimney lip) and lamps (mast top, lean-to), at piece offsets."""
    coals = []
    o = sg.chamfer_box("_mouth", (1 * 14.0, -0.5, 0.82), (0.34, 0.02, 0.18), 0.01)
    coals.append(o)
    o = sg.chamfer_box("_lip", (1 * 14.0 + 0.2, 0.35, 4.2), (0.22, 0.22, 0.02), 0.01)
    coals.append(o)
    lamps = [sg.chamfer_box("_mlamp", (4 * 14.0, 0, 8.4 + 0.6), (0.08, 0.08, 0.1), 0.01),
             sg.chamfer_box("_llamp", (2 * 14.0 + 1.6, -1.2, 1.9), (0.1, 0.06, 0.06), 0.01)]
    return sg.join(coals, "CK_Coals"), sg.join(lamps, "CK_Lamp")


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
    sc.name = "SalvageCamp"
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.world = bpy.data.worlds.new("w")
    b = CB()
    for i, fn in enumerate([wall, forge, lean_to, gantry, mast, crates, pile]):
        b.begin(i)
        fn(b)
    kit = sg.bm_to_obj("Kit", b.bm)
    palette_attrs(kit, b.names)
    sg.shade(kit, 35)
    size = int(p.get("bake", 2048))
    quick = bool(p.get("quick"))
    sg.unwrap(kit, 0.002)
    base, _ = sg.bake_image(kit, osh.attr_material("_base", "Base"), "EMIT", size, 1, "_base")
    props, _ = sg.bake_image(kit, osh.attr_material("_props", "Props"), "EMIT", size, 1, "_props")
    fields, _ = sg.bake_image(kit, sg.field_material("_fields", "fields"), "EMIT", size, 1, "_fields")
    cracks, _ = sg.bake_image(kit, sg.field_material("_cracks", "cracks"), "EMIT", size, 1, "_cracks")
    edges, _ = sg.bake_image(kit, sg.field_material("_edges", "edges"), "EMIT", size, 4 if quick else 10, "_edges")
    sc.world.light_settings.distance = 0.7
    ao, _ = sg.bake_image(kit, sg.field_material("_ao", "fields"), "AO", size, 8 if quick else 32, "_ao")
    edges[..., 0] = sg.blur(edges[..., 0], 1)
    nrm, _ = sg.bake_image(kit, ps.detail_bump_material("_bump"), "NORMAL", int(p.get("normal", 2048)), 1, "_normal")
    heat = np.zeros_like(fields)
    albedo, rough, occ, metal = ps.composite(base, props, fields, cracks, edges, ao, heat)
    maps = {"albedo": work / "camp_albedo.png", "orm": work / "camp_orm.png", "normal": work / "camp_normal.png"}
    sg.save_png(maps["albedo"], albedo, srgb=True)
    sg.save_png(maps["orm"], np.stack([occ, rough, metal], -1))
    sg.save_png(maps["normal"], nrm)
    mat = sg.final_stone_material("CK_Body", maps)
    # split the baked kit back into pieces at their own origins
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
        o.data.transform(Matrix.Translation((-i * 14.0, 0, 0)))
        parts[PIECES[i]] = o
    coals, lamp = emissive_bits()
    for ob, mname, col, strength, host in [(coals, "CK_Coals", (1.0, 0.42, 0.1), 6.0, "CK_Forge"), (lamp, "CK_Lamp", (1.0, 0.75, 0.45), 5.0, None)]:
        ob.data.materials.clear()
        ob.data.materials.append(sg.emissive_material(mname, col, strength))
        ob.data.uv_layers.new(name="UVMap")
    # coals belong to the forge; the two lamps split to the mast and the lean-to
    coals.data.transform(Matrix.Translation((-14.0, 0, 0)))
    coals.parent = parts["CK_Forge"]
    bm = bmesh.new()
    bm.from_mesh(lamp.data)
    mast_lamp = [f for f in bm.faces if f.calc_center_median().x > 50]
    lean_lamp = [f for f in bm.faces if f.calc_center_median().x <= 50]
    bm.free()
    lamp_m = lamp.copy(); lamp_m.data = lamp.data.copy(); sc.collection.objects.link(lamp_m)
    for ob, keep_mast, host, off in ((lamp_m, True, "CK_Mast", 4), (lamp, False, "CK_LeanTo", 2)):
        bm = bmesh.new(); bm.from_mesh(ob.data)
        kill = [f for f in bm.faces if (f.calc_center_median().x > 50) != keep_mast]
        bmesh.ops.delete(bm, geom=kill, context="FACES")
        bmesh.ops.translate(bm, verts=bm.verts, vec=(-off * 14.0, 0, 0))
        bm.to_mesh(ob.data); bm.free()
        ob.name = "CK_Lamp_" + host[3:]
        ob.parent = parts[host]
    for x in list(sc.collection.objects):
        if x not in parts.values() and x not in (coals, lamp, lamp_m):
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
    (work / "camp-metrics.json").write_text(json.dumps(metrics, indent=1))
    bpy.ops.wm.save_as_mainfile(filepath=str(work / "salvage_camp.blend"))
    glb = work / "salvage_camp_raw.glb"
    sg.export_glb(glb)
    finish(p, {"glb": str(glb), "metrics": metrics})


if __name__ == "__main__":
    main()
