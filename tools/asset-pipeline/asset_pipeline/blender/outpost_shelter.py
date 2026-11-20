"""Expedition Outpost shelter: a long, low faceted armour shell on a triangulated
tube lattice, after the owner's shelter blueprint (art-source/outpost-shelter,
git-ignored). Khaki armour plates, slate upper flanks, orange side panels with
chevron bracing, a dark red roof panel, an open front under a hood, a closed
stepped rear with a vent, lattice sled frames fore and aft, rocks at the base.

Same method as the Severance Gate: authored geometry, one unique atlas, Cycles
bakes (material ids, fields, AO, fine bump) composited with numpy into albedo,
ORM and tangent normals, GLB export. Blender axes: x across, -y is the open
front, z up. Origin at the footprint centre on the ground.
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

L_FRONT, L_REAR = -6.4, 6.2       # shell stations along y (front hood, rear)
W, H, SKIRT = 4.6, 3.86, 0.9       # half-width, ridge height, skirt height
# half profile (x, z) from the skirt up to the ridge
PROFILE = [(W, SKIRT), (W * 0.85, 2.15), (W * 0.57, 3.45), (W * 0.22, 3.82), (0.0, H)]
# stations: y, width scale, height scale
STATIONS = [(-7.3, 0.94, 1.0), (-6.4, 1.0, 1.0), (-3.2, 1.0, 1.0), (0.0, 1.0, 1.02), (3.2, 1.0, 1.0), (5.4, 0.96, 0.97), (6.9, 0.7, 0.72)]
PAL = {  # sRGB base colour, roughness, metallic
    "khaki": (0x9a8762, 0.72, 0.25), "slate": (0x48525d, 0.55, 0.55), "orange": (0xd66f28, 0.58, 0.2),
    "red": (0x6a2c24, 0.78, 0.15), "truss": (0x8c7b48, 0.42, 0.78), "dark": (0x1f2023, 0.85, 0.3),
    "rock": (0x5a5048, 0.95, 0.0), "frame": (0x6f6245, 0.5, 0.6),
}
rng = np.random.default_rng(4242)


def lin(hexc):
    c = [((hexc >> s) & 255) / 255 for s in (16, 8, 0)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


class Builder:
    """Accumulates geometry with a palette id per face."""

    def __init__(self):
        self.bm = bmesh.new()
        self.ids = self.bm.faces.layers.int.new("pal")
        self.names = list(PAL)

    def face(self, pts, key):
        vs = [self.bm.verts.new(p) for p in pts]
        f = self.bm.faces.new(vs)
        f[self.ids] = self.names.index(key)
        return f

    def plate(self, quad, key, thick=0.07, inset=0.05, lift=0.0):
        """A thick panel inset from its quad (seams between neighbours)."""
        q = [Vector(p) for p in quad]
        c = sum(q, Vector()) / len(q)
        n = (q[1] - q[0]).cross(q[3] - q[0]).normalized()
        if n.dot(c - Vector((0, c.y, 0))) < 0:      # point outward from the shell axis
            n = -n
        top = [p + (c - p).normalized() * inset + n * (thick + lift) for p in q]
        bot = [p + (c - p).normalized() * inset + n * lift for p in q]
        self.face(top, key)
        self.face(list(reversed(bot)), "dark")
        for i in range(len(q)):
            j = (i + 1) % len(q)
            self.face([bot[i], bot[j], top[j], top[i]], key)

    def tube(self, a, b, r=0.07, key="truss", sides=6):
        a, b = Vector(a), Vector(b)
        d = b - a
        if d.length < 1e-4:
            return
        axis = d.normalized()
        u = axis.cross(Vector((0, 0, 1)))
        if u.length < 1e-3:
            u = axis.cross(Vector((1, 0, 0)))
        u.normalize()
        v = axis.cross(u)
        ring0, ring1 = [], []
        for k in range(sides):
            ang = k / sides * 2 * math.pi
            off = (u * math.cos(ang) + v * math.sin(ang)) * r
            ring0.append(self.bm.verts.new(a + off))
            ring1.append(self.bm.verts.new(b + off))
        for k in range(sides):
            m = (k + 1) % sides
            f = self.bm.faces.new((ring0[k], ring0[m], ring1[m], ring1[k]))
            f[self.ids] = self.names.index(key)

    def box(self, c, h, key, rot=0.0):
        cx, cy, cz = c
        pts = []
        for sx, sy, sz in [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1), (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]:
            x, y = sx * h[0], sy * h[1]
            pts.append((cx + x * math.cos(rot) - y * math.sin(rot), cy + x * math.sin(rot) + y * math.cos(rot), cz + sz * h[2]))
        for f in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]:
            self.face([pts[i] for i in f], key)


def section(st):
    """Full cross-section points (left to right) at a station."""
    y, sw, sh = st
    half = [(x * sw, z * sh) for x, z in PROFILE]
    pts = [(-x, y, z) for x, z in half] + [(x, y, z) for x, z in reversed(half[:-1])]
    return pts


def build(b: Builder):
    secs = [section(s) for s in STATIONS]
    nprof = len(PROFILE)
    # ---- shell plates between stations
    for i in range(len(STATIONS) - 1):
        a, c = secs[i], secs[i + 1]
        for j in range(len(a) - 1):
            band = min(j, len(a) - 2 - j)              # 0 = skirt band ... nprof-2 = top
            mid = 1 <= i <= len(STATIONS) - 3
            key = {0: "orange" if 1 <= i <= 4 else "slate", 1: "slate" if i in (0, 5) or j % 2 else "khaki", 2: "khaki", 3: "khaki"}[band]
            quad = [a[j], a[j + 1], c[j + 1], c[j]]
            b.plate(quad, key)
            if key == "orange":
                # chevron bracing over the orange panels
                p = [Vector(q) for q in quad]
                n = (p[1] - p[0]).cross(p[3] - p[0]).normalized()
                if n.dot(Vector((p[0].x, 0, 0))) < 0:
                    n = -n
                lift = n * 0.11
                top = (p[1] + p[2]) / 2 + lift
                b.tube(p[0] + lift + (p[3] - p[0]) * 0.08, top, 0.045, "frame", 4)
                b.tube(p[3] + lift + (p[0] - p[3]) * 0.08, top, 0.045, "frame", 4)
                b.tube((p[0] + p[3]) / 2 + lift, top, 0.04, "frame", 4)
            if band == nprof - 2 and 2 <= i <= 3 and j < len(a) // 2:
                # the dark red roof panel straddles the ridge on the middle stations
                r0 = [Vector(q) for q in quad]
                cc = sum(r0, Vector()) / 4
                shrink = [cc + (q - cc) * 0.72 for q in r0]
                b.plate([tuple(q) for q in shrink], "red", thick=0.05, inset=0.02, lift=0.07)
    # ---- hood lip at the front and stepped rear cap
    front = secs[0]
    for j in range(len(front) - 1):
        p, q = Vector(front[j]), Vector(front[j + 1])
        b.plate([tuple(p), tuple(q), tuple(q + Vector((0, 0, -0.35))), tuple(p + Vector((0, 0, -0.35)))], "slate", thick=0.06, inset=0.0)
    # a slanted rear plate closes the tapered tail; it reaches down to the skirt
    rear = [Vector(p) for p in secs[-1]]
    base_l, base_r = Vector((-W * 0.7, rear[0].y - 0.5, SKIRT)), Vector((W * 0.7, rear[0].y - 0.5, SKIRT))
    b.face([tuple(base_l)] + [tuple(p) for p in reversed(rear)] + [tuple(base_r)], "slate")
    for j in range(0, len(rear) - 1, 2):     # raised khaki strakes on the tail
        p, q = rear[j], rear[j + 1]
        b.tube(p + Vector((0, 0.08, 0)), q + Vector((0, 0.08, 0)), 0.05, "frame", 4)
    # rear wall down to the ground, with a vent
    y_r = STATIONS[-2][0] + 0.6
    b.box((0, y_r, SKIRT * 0.55), (W * 0.9, 0.12, SKIRT * 0.55), "slate")
    for k in range(5):
        b.box((0, 6.55, 1.45 + k * 0.2), (0.95, 0.05, 0.05), "dark")
    b.box((0, 6.42, 1.85), (1.1, 0.08, 0.6), "frame")
    # ---- interior: deck, ribs, back partition
    b.box((0, 0, 0.12), (W - 0.4, (L_REAR - L_FRONT) / 2 - 0.2, 0.06), "dark")
    for st in STATIONS[1:-1]:
        sec = section((st[0], st[1] * 0.93, st[2] * 0.95))
        for j in range(len(sec) - 1):
            b.tube(sec[j], sec[j + 1], 0.09, "truss")
    b.box((0, 5.1, SKIRT + 1.2), (W * 0.62, 0.08, 1.2), "dark")
    # ---- lattice: side trusses under the skirt and the sled frames fore and aft
    for s in (-1, 1):
        x0 = s * (W + 0.05)
        ys = np.linspace(-6.4, 6.2, 11)
        for k in range(len(ys)):
            b.tube((x0, ys[k], 0.1), (x0 * 0.98, ys[k], SKIRT), 0.07)
            if k + 1 < len(ys):
                b.tube((x0, ys[k], 0.1), (x0, ys[k + 1], 0.1), 0.08)
                b.tube((x0 * 0.98, ys[k], SKIRT), (x0 * 0.98, ys[k + 1], SKIRT), 0.07)
                lo, hi = ((ys[k], 0.1), (ys[k + 1], SKIRT)) if k % 2 == 0 else ((ys[k], SKIRT), (ys[k + 1], 0.1))
                b.tube((x0, lo[0], lo[1]), (x0, hi[0], hi[1]), 0.055)
        # front sled: a triangulated lattice triangle rising from the ground to the hood
        tri = [(-8.6, 0.08), (-6.2, 0.08), (-7.3, 3.7)]
        pts = []
        for u in range(5):
            for v in range(5 - u):
                a, c = u / 4, v / 4
                y = tri[0][0] + (tri[1][0] - tri[0][0]) * a + (tri[2][0] - tri[0][0]) * c
                z = tri[0][1] + (tri[1][1] - tri[0][1]) * a + (tri[2][1] - tri[0][1]) * c
                jitter = 0.12 if 0 < u < 4 and 0 < v < 4 - u else 0
                pts.append(((u, v), (s * (W * 0.92 + rng.normal(0, 0.02)), y + rng.normal(0, jitter), z + rng.normal(0, jitter))))
        idx = dict(pts)
        for (u, v), p in pts:
            for du, dv in ((1, 0), (0, 1), (-1, 1)):
                q = idx.get((u + du, v + dv))
                if q:
                    b.tube(p, q, 0.06)
        # rear sled
        for k, (y0, z0, y1, z1) in enumerate([(6.2, 0.1, 7.9, 0.1), (7.9, 0.1, 6.9, 2.6), (6.9, 2.6, 6.2, 0.95), (7.0, 0.1, 6.55, 1.8)]):
            b.tube((s * W * 0.82, y0, z0), (s * W * 0.82, y1, z1), 0.065)
    # cross members at the sled tips
    b.tube((-W * 0.92, -8.6, 0.08), (W * 0.92, -8.6, 0.08), 0.08)
    b.tube((-W * 0.82, 7.9, 0.1), (W * 0.82, 7.9, 0.1), 0.08)
    # front hood lamp housings (emissive inserts are a separate object)
    for s in (-1, 1):
        b.box((s * 2.0, -6.6, 3.45), (0.5, 0.12, 0.09), "frame")


def rocks():
    out = []
    for k in range(14):
        a = rng.uniform(0, 2 * math.pi)
        side = 1 if rng.random() < 0.5 else -1
        x, y = side * (W + rng.uniform(0.2, 1.3)), rng.uniform(-6.5, 6.5)
        if k % 5 == 0:
            x, y = rng.uniform(-W, W), 7.6 + rng.uniform(0, 0.8)
        o = sg.convex_rock(f"_rock{k}", tuple(rng.uniform([0.4, 0.35, 0.25], [1.0, 0.8, 0.55])), int(rng.integers(1e9)), flat=0.4)
        o.location = (x, y, 0.08)
        o.rotation_euler = (0, 0, a)
        sg.apply_transform(o)
        out.append(o)
    return out


def palette_to_attrs(o, names):
    """Per-corner colour attributes from the palette id: base colour and (rough, metal)."""
    me = o.data
    ids = me.attributes.get("pal")
    base = me.color_attributes.new("Base", "FLOAT_COLOR", "CORNER")
    props = me.color_attributes.new("Props", "FLOAT_COLOR", "CORNER")
    pid = np.zeros(len(me.polygons), np.int32)
    if ids:
        ids.data.foreach_get("value", pid)
    else:
        pid[:] = names.index("rock")
    cols = np.array([[*lin(PAL[n][0]), 1] for n in names], np.float32)
    prs = np.array([[PAL[n][1], PAL[n][2], 0, 1] for n in names], np.float32)
    loop_poly = np.zeros(len(me.loops), np.int32)
    for p in me.polygons:
        loop_poly[p.loop_start:p.loop_start + p.loop_total] = p.index
    base.data.foreach_set("color", cols[pid[loop_poly]].ravel())
    props.data.foreach_set("color", prs[pid[loop_poly]].ravel())


def attr_material(name, attr):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    a = nt.nodes.new("ShaderNodeAttribute")
    a.attribute_name = attr
    nt.links.new(a.outputs["Color"], em.inputs["Color"])
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return m


def fields_material(name):
    """R: world-normal z, G: height / 5, B: large noise, (packed for the composite)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    sepp = nt.nodes.new("ShaderNodeSeparateXYZ")
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 0.9
    nz.inputs["Detail"].default_value = 6
    div = nt.nodes.new("ShaderNodeMath")
    div.operation = "DIVIDE"
    div.inputs[1].default_value = 5.0
    comb = nt.nodes.new("ShaderNodeCombineColor")
    nt.links.new(geo.outputs["Normal"], sep.inputs[0])
    nt.links.new(geo.outputs["Position"], sepp.inputs[0])
    nt.links.new(geo.outputs["Position"], nz.inputs["Vector"])
    nt.links.new(sepp.outputs["Z"], div.inputs[0])
    nt.links.new(sep.outputs["Z"], comb.inputs[0])
    nt.links.new(div.outputs[0], comb.inputs[1])
    nt.links.new(nz.outputs["Fac"], comb.inputs[2])
    nt.links.new(comb.outputs["Color"], em.inputs["Color"])
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return m


def bump_material(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 26.0
    nz.inputs["Detail"].default_value = 8
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.22
    bump.inputs["Distance"].default_value = 0.01
    nt.links.new(nz.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def composite(base, props, fields, ao, edges):
    nz, hz, noise = fields[..., 0], np.clip(fields[..., 1], 0, 1.2), fields[..., 2]
    occ = np.clip(ao[..., 0], 0, 1)
    dust = sg.smoothstep(0.35, 0.9, nz) * sg.smoothstep(0.42, 0.62, noise)
    dust_col = np.array(lin(0xa48e6c), np.float32)
    grime = (1 - sg.smoothstep(0.0, 0.25, hz)) * 0.35
    albedo = base * (0.84 + 0.32 * noise[..., None])
    albedo = albedo * (1 - 0.35 * (1 - occ[..., None])) * (1 - grime[..., None])
    albedo = albedo + (dust_col - albedo) * (dust[..., None] * 0.38)
    wear = np.clip(edges[..., 0], 0, 1) * 0.5
    albedo = albedo + (np.array(lin(0xc8b894), np.float32) - albedo) * (wear[..., None] * 0.35)
    rough = np.clip(props[..., 0] + 0.16 * (noise - 0.5) + dust * 0.15 - wear * 0.1, 0.2, 1)
    metal = np.clip(props[..., 1] - dust * 0.3, 0, 1)
    return np.clip(albedo, 0, 1), rough, occ, metal


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
    sc.name = "Shelter"
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.world = bpy.data.worlds.new("w")
    b = Builder()
    build(b)
    shell = sg.bm_to_obj("Shelter", b.bm)
    rk = sg.join(rocks(), "Shelter_Rocks")
    palette_to_attrs(shell, b.names)
    palette_to_attrs(rk, b.names)
    o = sg.join([shell, rk], "Shelter")
    sg.shade(o, 30)
    # emissive inserts: hood lamps (warm), interior strip (teal), rear vent glow (amber)
    lamps = []
    for s in (-1, 1):
        lamps.append(sg.chamfer_box(f"_lamp{s}", (s * 2.0, -6.62, 3.35), (0.42, 0.04, 0.035), 0.01))
    lamp = sg.join(lamps, "Shelter_Lamps")
    strip = sg.chamfer_box("Shelter_Strip", (0, -1.5, 3.55), (0.06, 4.6, 0.03), 0.01)
    vent = sg.chamfer_box("Shelter_Vent", (0, 6.48, 1.85), (0.9, 0.02, 0.5), 0.01)
    size = int(p.get("bake", 2048))
    sg.unwrap(o, 0.0025)
    quick = bool(p.get("quick"))
    base, _ = sg.bake_image(o, attr_material("_base", "Base"), "EMIT", size, 1, "_base")
    props, _ = sg.bake_image(o, attr_material("_props", "Props"), "EMIT", size, 1, "_props")
    fields, _ = sg.bake_image(o, fields_material("_fields"), "EMIT", size, 1, "_fields")
    edges, _ = sg.bake_image(o, sg.field_material("_edges", "edges"), "EMIT", size, 4 if quick else 10, "_edges")
    sc.world.light_settings.distance = 1.4
    ao, _ = sg.bake_image(o, fields_material("_ao"), "AO", size, 8 if quick else 32, "_ao")
    nrm, _ = sg.bake_image(o, bump_material("_bump"), "NORMAL", int(p.get("normal", 2048)), 1, "_normal")
    albedo, rough, occ, metal = composite(base, props, fields, ao, edges)
    maps = {"albedo": work / "shelter_albedo.png", "orm": work / "shelter_orm.png", "normal": work / "shelter_normal.png"}
    sg.save_png(maps["albedo"], albedo, srgb=True)
    sg.save_png(maps["orm"], np.stack([occ, rough, metal], -1))
    sg.save_png(maps["normal"], nrm)
    mat = sg.final_stone_material("SH_Shelter", maps)
    o.data.materials.clear()
    o.data.materials.append(mat)
    for ob, mname, col, strength in [(lamp, "SH_Lamp", (1.0, 0.72, 0.42), 6.0), (strip, "SH_Strip", (0.3, 0.9, 0.85), 3.0), (vent, "SH_Vent", (1.0, 0.45, 0.12), 2.0)]:
        ob.data.materials.clear()
        ob.data.materials.append(sg.emissive_material(mname, col, strength))
        ob.data.uv_layers.new(name="UVMap")
    for c in (lamp, strip, vent):
        c.parent = o
    for x in list(sc.collection.objects):
        if x not in (o, lamp, strip, vent):
            sc.collection.objects.unlink(x)
    # drop the bake-only attributes
    for a in ("pal",):
        if o.data.attributes.get(a):
            o.data.attributes.remove(o.data.attributes[a])
    for a in ("Base", "Props"):
        if o.data.color_attributes.get(a):
            o.data.color_attributes.remove(o.data.color_attributes[a])
    metrics = {"tris": sg.tri_count(o), "length": 8.0 + 8.6, "width": 2 * W, "height": H,
               "footprint": {"x": [-W - 1.4, W + 1.4], "y": [-8.6, 8.0]}}
    (work / "shelter-metrics.json").write_text(json.dumps(metrics, indent=1))
    sg.triangulate_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(work / "outpost_shelter.blend"))
    glb = work / "outpost_shelter_raw.glb"
    sg.export_glb(glb)
    finish(p, {"glb": str(glb), "metrics": metrics})


if __name__ == "__main__":
    main()
