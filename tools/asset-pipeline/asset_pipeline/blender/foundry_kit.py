"""Silent Foundry architecture kit: wall bays, fabrication presses, culture vat
frames, the resonator base, pylons, chamber door frames and ceiling trusses.

Same method as the Severance Gate and the outpost shelter: authored geometry
with a palette id per face, one shared atlas for every piece, Cycles bakes
(palette, fields, edges, AO, fine bump) composited with numpy into albedo, ORM
and tangent normals. Emissive inserts (lamps, press slits, door strips) are
separate child objects so the runtime can drive them. Each piece sits at the
origin (base at z = 0); Blender -y faces the room. Scene "Kit".
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import bpy  # noqa: I001
import numpy as np
from mathutils import Vector

from asset_pipeline.blender import severance_gate as sg
from asset_pipeline.blender import outpost_shelter as osh
from asset_pipeline.blender.common import finish, payload

FPAL = {
    "steel": (0x4a4f54, 0.48, 0.82), "dark": (0x1e1f22, 0.8, 0.45), "ochre": (0x9a6532, 0.7, 0.35), "slate": (0x3e4650, 0.6, 0.6),
    "rust": (0x6b3a22, 0.86, 0.3), "hazard": (0xc8962a, 0.6, 0.3), "brass": (0x8c7448, 0.38, 0.88), "concrete": (0x5c5853, 0.92, 0.0),
}
rng = np.random.default_rng(1913)


class FB(osh.Builder):
    def __init__(self):
        super().__init__()
        self.names = list(FPAL)

    def cyl(self, c, r, h, key, sides=16, r2=None):
        """Closed vertical cylinder / frustum from c (base centre) up h."""
        r2 = r if r2 is None else r2
        x, y, z = c
        bot = [(x + math.cos(a) * r, y + math.sin(a) * r, z) for a in np.linspace(0, 2 * math.pi, sides + 1)[:-1]]
        top = [(x + math.cos(a) * r2, y + math.sin(a) * r2, z + h) for a in np.linspace(0, 2 * math.pi, sides + 1)[:-1]]
        self.face(list(reversed(bot)), key)
        self.face(top, key)
        for i in range(sides):
            j = (i + 1) % sides
            self.face([bot[i], bot[j], top[j], top[i]], key)


def wall_bay(b):
    W2, H = 5.0, 15.0
    b.box((0, 0.3, H / 2), (W2, 0.3, H / 2), "concrete")
    for s in (-1, 1):
        x = s * (W2 - 0.4)
        b.box((x, -0.25, 0.6), (0.6, 0.75, 0.6), "steel")                 # plinth
        b.box((x, -0.2, H / 2), (0.42, 0.55, H / 2), "steel")              # pillar
        b.box((x, -0.35, H - 0.5), (0.55, 0.7, 0.5), "steel")              # capital
        for z in (2.2, 5.6, 9.4, 12.6):
            b.box((x, -0.78, z), (0.3, 0.05, 0.08), "hazard")
    for z0, z1, key in ((1.4, 6.6, "ochre"), (7.0, 12.4, "slate")):
        b.box((0, -0.06, (z0 + z1) / 2), (W2 - 1.1, 0.08, (z1 - z0) / 2), key)
        for zz in (z0, z1):
            b.tube((-W2 + 1.0, -0.14, zz), (W2 - 1.0, -0.14, zz), 0.06, "steel", 6)
        for xx in (-W2 + 1.0, 0.0, W2 - 1.0):
            b.tube((xx, -0.14, z0), (xx, -0.14, z1), 0.05, "steel", 6)
        b.tube((-W2 + 1.0, -0.12, z0), (0.0, -0.12, z1), 0.04, "steel", 4)
        b.tube((W2 - 1.0, -0.12, z0), (0.0, -0.12, z1), 0.04, "steel", 4)
    for z, r in ((3.2, 0.16), (3.6, 0.1)):
        b.tube((-W2, -0.55, z), (W2, -0.55, z), r, "brass", 10)
    for x in (-2.5, 2.5):
        b.box((x, -0.35, 3.4), (0.08, 0.3, 0.4), "steel")
    # gantry ledge with a rail
    b.box((0, -0.9, 9.0), (W2, 0.75, 0.07), "dark")
    for x in np.linspace(-W2, W2, 6):
        b.tube((x, -1.6, 9.0), (x, -1.6, 10.05), 0.035, "steel", 5)
        b.box((x, -0.9, 8.85), (0.05, 0.75, 0.1), "steel")
    b.tube((-W2, -1.6, 10.05), (W2, -1.6, 10.05), 0.04, "steel", 6)
    b.tube((-W2, -1.6, 9.55), (W2, -1.6, 9.55), 0.03, "steel", 5)


def press(b):
    hw, hd, H = 2.6, 3.2, 5.5
    b.box((0, 0, 0.45), (hw, hd, 0.45), "steel")
    b.box((0, 0, 1.0), (hw - 0.3, hd - 0.3, 0.12), "dark")
    for s in (-1, 1):
        b.box((0, s * (hd - 0.45), H / 2), (hw - 0.2, 0.42, H / 2), "ochre")
        b.box((0, s * (hd - 0.45), H - 0.3), (hw, 0.5, 0.3), "steel")
        for z in (1.6, 2.6, 3.6):
            b.box((-hw + 0.25, s * (hd - 0.45), z), (0.06, 0.44, 0.05), "dark")
    b.box((0, 0, H - 0.2), (hw - 0.2, hd - 0.4, 0.4), "steel")
    b.cyl((0, 0, 2.2), 0.55, H - 2.6, "brass", 16)
    b.box((0, 0, 2.0), (hw - 0.5, hd - 1.0, 0.25), "steel")                 # die plate
    b.box((0, 0, 1.25), (hw - 0.6, hd - 1.1, 0.15), "rust")                # bed
    for k in range(4):
        b.tube((hw - 0.1, -hd + 0.6 + k * 0.4, 0.9), (hw - 0.1, -hd + 0.6 + k * 0.4, H - 0.5), 0.05, "dark", 6)
    b.box((0, 0, H + 0.6), (0.6, 0.6, 0.6), "dark")                        # motor housing
    for s in (-1, 1):
        b.box((s * 0.65, 0, H + 0.6), (0.06, 0.62, 0.5), "hazard")


def vat_frame(b):
    r, H = 2.3, 4.5
    b.cyl((0, 0, 0), r, 0.5, "steel", 24)
    b.cyl((0, 0, 0.5), r * 0.94, 0.08, "dark", 24)
    b.cyl((0, 0, H + 0.05), r, 0.45, "steel", 24)
    b.cyl((0, 0, H + 0.5), r * 0.55, 0.4, "slate", 12, r * 0.4)
    for k in range(6):
        a = k / 6 * 2 * math.pi
        p0 = (math.cos(a) * r * 0.98, math.sin(a) * r * 0.98, 0.5)
        p1 = (math.cos(a) * r * 0.98, math.sin(a) * r * 0.98, H + 0.05)
        b.tube(p0, p1, 0.09, "steel", 6)
    for k in range(3):
        a = k / 3 * 2 * math.pi + 0.5
        p = (math.cos(a) * r * 0.5, math.sin(a) * r * 0.5, H + 0.9)
        b.tube(p, (p[0] * 1.6, p[1] * 1.6, H + 1.6), 0.12, "brass", 8)
    for s in (-1, 1):
        b.tube((s * r, 0, 0.3), (s * (r + 0.9), 0, 0.3), 0.18, "brass", 10)
        b.box((s * (r + 0.5), 0, 0.3), (0.14, 0.3, 0.3), "steel")


def resonator_base(b):
    b.cyl((0, 0, 0), 4.2, 0.5, "steel", 8)
    b.cyl((0, 0, 0.5), 3.4, 0.45, "slate", 8)
    b.cyl((0, 0, 0.95), 2.4, 0.4, "steel", 8)
    for k in range(4):
        a = k / 4 * 2 * math.pi + math.pi / 4
        d = Vector((math.cos(a), math.sin(a), 0))
        b.box(tuple(d * 4.9 + Vector((0, 0, 0.35))), (0.5, 0.5, 0.35), "steel", rot=a)
        b.tube(tuple(d * 2.4 + Vector((0, 0, 1.2))), tuple(d * 4.9 + Vector((0, 0, 0.7))), 0.16, "brass", 10)
        b.box(tuple(d * 3.8 + Vector((0, 0, 0.52))), (0.9, 0.12, 0.03), "hazard", rot=a)


def pylon(b):
    b.cyl((0, 0, 0), 1.25, 0.5, "steel", 6)
    b.cyl((0, 0, 0.5), 0.95, 6.0, "slate", 6, 0.6)
    for k in range(3):
        a = k / 3 * 2 * math.pi
        d = Vector((math.cos(a), math.sin(a), 0))
        b.box(tuple(d * 0.95 + Vector((0, 0, 3.0))), (0.08, 0.35, 2.4), "steel", rot=a + math.pi / 2)
    for k in range(4):
        a = k / 4 * 2 * math.pi
        p = (math.cos(a) * 0.55, math.sin(a) * 0.55, 6.5)
        b.tube(p, (math.cos(a) * 0.95, math.sin(a) * 0.95, 7.4), 0.07, "brass", 6)
    b.cyl((0, 0, 6.5), 0.65, 0.18, "steel", 6)


def door_frame(b):
    door, H = 3.6, 7.6
    for s in (-1, 1):
        x = s * (door + 0.7)
        b.box((x, 0, H / 2), (0.7, 1.15, H / 2), "steel")
        b.box((x, -1.2, H / 2), (0.55, 0.06, H / 2 - 0.3), "ochre")
        for k in range(8):
            b.box((x - s * 0.71, -0.4, 0.4 + k * 0.5), (0.02, 0.5, 0.2), "hazard" if k % 2 else "dark")
    b.box((0, 0, H + 0.7), (door + 1.4, 1.2, 0.7), "steel")
    b.box((0, -1.25, H + 0.7), (door + 1.0, 0.06, 0.45), "slate")
    for k in range(-3, 4):
        b.box((k * 1.0, -1.32, H + 0.7), (0.08, 0.03, 0.4), "hazard", rot=0.0)
    for s in (-1, 1):
        b.tube((s * (door + 0.2), -0.9, 0.2), (s * (door + 0.2), -0.9, H - 0.2), 0.12, "brass", 8)


def truss(b):
    L, Hh = 12.0, 1.4
    for z in (0.0, Hh):
        for yy in (-0.5, 0.5):
            b.tube((-L / 2, yy, z), (L / 2, yy, z), 0.1, "steel", 6)
    xs = np.linspace(-L / 2, L / 2, 9)
    for i, x in enumerate(xs):
        for yy in (-0.5, 0.5):
            b.tube((x, yy, 0), (x, yy, Hh), 0.06, "steel", 5)
            if i + 1 < len(xs):
                z0, z1 = (0, Hh) if i % 2 == 0 else (Hh, 0)
                b.tube((x, yy, z0), (xs[i + 1], yy, z1), 0.05, "steel", 5)
        b.tube((x, -0.5, Hh), (x, 0.5, Hh), 0.05, "steel", 5)


PIECES = {"Wall_Bay": wall_bay, "Press": press, "Vat_Frame": vat_frame, "Resonator_Base": resonator_base, "Pylon": pylon, "Door_Frame": door_frame, "Truss": truss}
EMISSIVE = {  # piece -> list of (centre, half-size, material name)
    "Wall_Bay": [((s * 4.6, -0.82, z), (0.12, 0.03, 0.25), "FK_Lamp") for s in (-1, 1) for z in (6.8, 13.4)],
    "Press": [((0, -3.2 + 0.04, 1.7), (1.9, 0.03, 0.12), "FK_Hot"), ((0, 3.2 - 0.04, 1.7), (1.9, 0.03, 0.12), "FK_Hot")],
    "Door_Frame": [((0, -1.33, 8.95), (3.4, 0.03, 0.06), "FK_Strip")],
    "Pylon": [((0, 0, 6.72), (0.45, 0.45, 0.05), "FK_Strip")],
}


def palette_to_attrs(o, names):
    me = o.data
    ids = me.attributes.get("pal")
    base = me.color_attributes.new("Base", "FLOAT_COLOR", "CORNER")
    props = me.color_attributes.new("Props", "FLOAT_COLOR", "CORNER")
    pid = np.zeros(len(me.polygons), np.int32)
    if ids:
        ids.data.foreach_get("value", pid)
    cols = np.array([[*osh.lin(FPAL[n][0]), 1] for n in names], np.float32)
    prs = np.array([[FPAL[n][1], FPAL[n][2], 0, 1] for n in names], np.float32)
    loop_poly = np.zeros(len(me.loops), np.int32)
    for p in me.polygons:
        loop_poly[p.loop_start:p.loop_start + p.loop_total] = p.index
    base.data.foreach_set("color", cols[pid[loop_poly]].ravel())
    props.data.foreach_set("color", prs[pid[loop_poly]].ravel())


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
    pieces = []
    for name, fn in PIECES.items():
        b = FB()
        fn(b)
        o = sg.bm_to_obj(name, b.bm)
        palette_to_attrs(o, b.names)
        sg.shade(o, 30)
        pieces.append(o)
    # one atlas for every piece
    copies = []
    for o in pieces:
        c = o.copy()
        c.data = o.data.copy()
        sc.collection.objects.link(c)
        copies.append(c)
    atlas = sg.join(copies, "_atlas")
    sg.unwrap(atlas, 0.002)
    size = int(p.get("bake", 2048))
    quick = bool(p.get("quick"))
    base, _ = sg.bake_image(atlas, osh.attr_material("_base", "Base"), "EMIT", size, 1, "_base")
    props, _ = sg.bake_image(atlas, osh.attr_material("_props", "Props"), "EMIT", size, 1, "_props")
    fields, _ = sg.bake_image(atlas, osh.fields_material("_fields"), "EMIT", size, 1, "_fields")
    edges, _ = sg.bake_image(atlas, sg.field_material("_edges", "edges"), "EMIT", size, 4 if quick else 10, "_edges")
    sc.world.light_settings.distance = 1.2
    ao, _ = sg.bake_image(atlas, osh.fields_material("_ao"), "AO", size, 8 if quick else 28, "_ao")
    nrm, _ = sg.bake_image(atlas, osh.bump_material("_bump"), "NORMAL", int(p.get("normal", 2048)), 1, "_normal")
    albedo, rough, occ, metal = osh.composite(base, props, fields, ao, edges)
    maps = {"albedo": work / "foundry_albedo.png", "orm": work / "foundry_orm.png", "normal": work / "foundry_normal.png"}
    sg.save_png(maps["albedo"], albedo, srgb=True)
    sg.save_png(maps["orm"], np.stack([occ, rough, metal], -1))
    sg.save_png(maps["normal"], nrm)
    uv0 = np.empty(len(atlas.data.loops) * 2, np.float32)
    atlas.data.uv_layers["UVMap"].data.foreach_get("uv", uv0)
    uv1 = np.empty(len(atlas.data.loops) * 2, np.float32)
    atlas.data.uv_layers["UVDetail"].data.foreach_get("uv", uv1)
    start = 0
    mat = sg.final_stone_material("FK_Foundry", maps)
    for o in pieces:
        nl = len(o.data.loops)
        while o.data.uv_layers:
            o.data.uv_layers.remove(o.data.uv_layers[0])
        o.data.uv_layers.new(name="UVMap").data.foreach_set("uv", uv0[start * 2:(start + nl) * 2])
        o.data.uv_layers.new(name="UVDetail").data.foreach_set("uv", uv1[start * 2:(start + nl) * 2])
        start += nl
        o.data.materials.clear()
        o.data.materials.append(mat)
        for a in ("pal",):
            if o.data.attributes.get(a):
                o.data.attributes.remove(o.data.attributes[a])
        for a in ("Base", "Props"):
            if o.data.color_attributes.get(a):
                o.data.color_attributes.remove(o.data.color_attributes[a])
    sg.delete([atlas])
    emissive_mats = {"FK_Lamp": sg.emissive_material("FK_Lamp", (1.0, 0.62, 0.3), 5.0), "FK_Hot": sg.emissive_material("FK_Hot", (1.0, 0.38, 0.08), 6.0),
                     "FK_Strip": sg.emissive_material("FK_Strip", (0.32, 0.9, 0.85), 3.0)}
    keep = list(pieces)
    for o in pieces:
        parts = []
        for k, (c, h, mname) in enumerate(EMISSIVE.get(o.name, [])):
            e = sg.chamfer_box(f"_{o.name}_e{k}", c, h, 0.01)
            e.data.materials.clear()
            e.data.materials.append(emissive_mats[mname])
            parts.append(e)
        if parts:
            e = sg.join(parts, o.name + "_Glow")
            e.data.uv_layers.new(name="UVMap")
            e.parent = o
            keep.append(e)
    for x in list(sc.collection.objects):
        if x not in keep:
            sc.collection.objects.unlink(x)
    metrics = {o.name: sg.tri_count(o) for o in keep}
    (work / "foundry-metrics.json").write_text(json.dumps(metrics, indent=1))
    sg.triangulate_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(work / "foundry_kit.blend"))
    glb = work / "foundry_kit_raw.glb"
    sg.export_glb(glb)
    finish(p, {"glb": str(glb), "metrics": metrics})


if __name__ == "__main__":
    main()
