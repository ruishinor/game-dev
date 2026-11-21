"""Fast look at a design stage: every piece as flat-shaded geometry on the
body (no booleans, bakes or textures), coloured by material slot, from the
front, three-quarter and back. For iterating on shapes before a build.

payload: {pieces_npz, pieces_json, body_npz, out, colors: {slot: [r,g,b]}, size}
"""
import json
import math
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

from asset_pipeline.blender.common import payload, finish, reset_scene
from asset_pipeline.blender.armour_hardsurface import mesh_obj, G2B, fix_normals, split_parts


def mat(name, rgb, alpha=1.0, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = 0.45
    b.inputs["Alpha"].default_value = alpha
    if emit:
        b.inputs["Emission Color"].default_value = (*rgb, 1)
        b.inputs["Emission Strength"].default_value = emit
    return m


def main():
    p = payload()
    sc = reset_scene()
    sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "CYCLES"
    if sc.render.engine == "CYCLES":
        sc.cycles.samples = 8
        sc.cycles.device = "CPU"
    out = Path(p["out"])
    out.mkdir(parents=True, exist_ok=True)
    meta = json.loads(Path(p["pieces_json"]).read_text())
    npz = np.load(p["pieces_npz"])
    body = np.load(p["body_npz"])
    bo = mesh_obj("_body", G2B(body["V"]), [tuple(f) for f in body["F"]])
    bo.data.materials.append(mat("_skin", (0.35, 0.36, 0.38)))
    cols = p.get("colors", {})
    mats = {}
    for m in meta:
        V, F = npz[m["name"] + "_V"], npz[m["name"] + "_F"]
        slot = m["mat"].rsplit("_", 1)[-1]
        glass = m.get("layer") == "glass"
        key = slot + ("_glass" if glass else "")
        if key not in mats:
            mats[key] = mat(key, tuple(cols.get(slot, (0.6, 0.6, 0.6))), 0.45 if glass else 1.0)
        if len(V):
            o = mesh_obj(m["name"], G2B(V), [tuple(f) for f in F])
            fix_normals(o)
            if m.get("thickness", 0) > 0 and not m.get("multi"):
                sm = o.modifiers.new("s", "SOLIDIFY")
                sm.thickness = m["thickness"]
                sm.offset = -1
            o.data.materials.append(mats[key])
        for st in m.get("fx_strips", []):
            fo = mesh_obj(m["name"] + "_fx", G2B(np.asarray(st["V"])), [tuple(f) for f in st["F"]])
            fo.data.materials.append(mats.setdefault("_fx", mat("_fx", tuple(cols.get("fx", (1, 0.3, 0.1))), 1.0, 6.0)))
        for g in m.get("grooves", []):
            if g.get("inlay"):
                P = np.asarray(g["pts"])
                fo = mesh_obj(m["name"] + "_g", G2B(P), [])
                fo.data.edges.add(0)
    # lights and cameras
    world = bpy.data.worlds.new("w")
    sc.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.05, 0.055, 0.065, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    for loc, e in (((2.5, -3, 3.5), 900), ((-3, -1, 2), 400), ((0, 3, 2.5), 500)):
        ld = bpy.data.lights.new("l", "AREA")
        ld.energy = e
        ld.size = 2
        lo = bpy.data.objects.new("l", ld)
        sc.collection.objects.link(lo)
        lo.location = loc
        lo.rotation_euler = (Vector((0, 0, 1)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    cd = bpy.data.cameras.new("c")
    cd.lens = 50
    cam = bpy.data.objects.new("c", cd)
    sc.collection.objects.link(cam)
    sc.camera = cam
    sz = p.get("size", 640)
    sc.render.resolution_x, sc.render.resolution_y = int(sz * 0.8), sz
    sc.render.film_transparent = False
    frame = p.get("frame", (0.0, 0.07, 1.9))  # centre z, height (bodies: feet -0.8, head 0.95)
    renders = []
    for name, az in (("front", 0), ("three_quarter", 35), ("back", 180)):
        r = 3.6 * frame[2] / 1.9
        a = math.radians(az)
        target = Vector((frame[0], 0, frame[1]))
        cam.location = target + Vector((math.sin(a) * r, -math.cos(a) * r, 0.25))
        cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
        f = out / f"design_{name}.png"
        sc.render.filepath = str(f)
        bpy.ops.render.render(write_still=True)
        renders.append(str(f))
    finish(p, {"renders": renders})


if __name__ == "__main__":
    main()
