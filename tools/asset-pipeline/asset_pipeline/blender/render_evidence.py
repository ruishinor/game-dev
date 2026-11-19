"""Evidence renders of an actual Blender asset (never concept imagery).

payload:
  blend        source .blend (or a .glb, imported)
  out          output directory
  modes        any of: lit, clay, wire, parts
  views        names from VIEWS, or {"name": .., "az": deg, "el": deg, "dist_k": .., "target": [x,y,z], "lens": mm}
  turntable    {"frames": N, "el": deg, "mode": "lit"}   (PNG frames; ffmpeg assembles later)
  cameras      optional OpenCV-convention cameras to render from (reference-fit views)
  pose         optional action name + frame for articulation renders
"""
from __future__ import annotations

import colorsys
import math
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

from asset_pipeline.blender.common import add_camera, finish, look_at_matrix, payload, setup_cycles, world_color

VIEWS = {
    "front": (0, 8), "back": (180, 8), "left": (90, 8), "right": (-90, 8),
    "three_quarter": (35, 24), "three_quarter_rear": (215, 24), "elevated": (-40, 38), "top": (0, 89.5), "underside": (20, -35),
}


def scene_bounds(objs):
    lo = np.full(3, 1e9)
    hi = -lo
    for o in objs:
        for c in o.bound_box:
            w = np.array(o.matrix_world @ Vector(c))
            lo, hi = np.minimum(lo, w), np.maximum(hi, w)
    return lo, hi


def lights(sc, centre, size):
    for name, d, e, s in [("key", (1.0, -1.2, 1.4), 1400, 3), ("fill", (-1.4, -0.4, 0.7), 420, 4), ("rim", (0.3, 1.6, 1.0), 650, 3)]:
        L = bpy.data.lights.new(name, "AREA")
        L.energy = e * (size / 3.0) ** 2
        L.size = s * size / 3
        o = bpy.data.objects.new(name, L)
        sc.collection.objects.link(o)
        pos = centre + np.array(d) * size * 1.6
        o.matrix_world = Matrix(look_at_matrix(pos, centre).tolist())


def ground(sc, z, size):
    bpy.ops.mesh.primitive_plane_add(size=size * 8, location=(0, 0, z))
    g = bpy.context.object
    g.name = "_ground"
    m = bpy.data.materials.new("_ground")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.32, 0.31, 0.29, 1)
    b.inputs["Roughness"].default_value = 0.95
    g.data.materials.append(m)
    return g


def clay_material():
    m = bpy.data.materials.new("_clay")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.55, 0.53, 0.5, 1)
    b.inputs["Roughness"].default_value = 0.7
    return m


def flat_material(name, rgb):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = 0.6
    return m


def set_mode(objs, mode, saved):
    for o in objs:
        if o.name not in saved:
            saved[o.name] = [s.material for s in o.material_slots]
        for m in list(o.modifiers):
            if m.name == "_wire":
                o.modifiers.remove(m)
    if mode == "lit":
        for o in objs:
            for s, m in zip(o.material_slots, saved[o.name]):
                s.material = m
        return
    if mode in ("clay", "wire"):
        clay = bpy.data.materials.get("_clay") or clay_material()
        for o in objs:
            for s in o.material_slots:
                s.material = clay
        if mode == "wire":
            dark = bpy.data.materials.get("_wire") or flat_material("_wire", (0.01, 0.01, 0.012))
            for o in objs:
                if len(o.material_slots) < 2:
                    o.data.materials.append(dark)
                o.material_slots[-1].material = dark
                w = o.modifiers.new("_wire", "WIREFRAME")
                w.thickness = 0.006
                w.use_replace = False
                w.material_offset = len(o.material_slots) - 1
        return
    if mode == "parts":
        classes = sorted({o.get("part_class", o.name.split("_")[0]) for o in objs})
        mats = {}
        for i, c in enumerate(classes):
            rgb = colorsys.hsv_to_rgb((i * 0.618) % 1, 0.65, 0.85)
            mats[c] = bpy.data.materials.get("_part_" + c) or flat_material("_part_" + c, rgb)
        for o in objs:
            for s in o.material_slots:
                s.material = mats[o.get("part_class", o.name.split("_")[0])]
        return classes


def main():
    p = payload()
    src = p["blend"]
    if src.endswith(".blend"):
        bpy.ops.wm.open_mainfile(filepath=src)
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=src)
    try:
        bpy.ops.preferences.addon_enable(module="cycles")
    except Exception:
        pass
    sc = bpy.context.scene
    objs = [o for o in sc.objects if o.type == "MESH" and not o.name.startswith("_")]
    if p.get("pose"):
        arm = next((o for o in sc.objects if o.type == "ARMATURE"), None)
        act = bpy.data.actions.get(p["pose"]["action"])
        if arm and act:
            arm.animation_data_create()
            arm.animation_data.action = act
            sc.frame_set(int(p["pose"]["frame"]))
    lo, hi = scene_bounds(objs)
    centre = (lo + hi) / 2
    size = float(np.linalg.norm(hi - lo))
    W, H = p.get("width", 960), p.get("height", 720)
    setup_cycles(sc, W, H, samples=p.get("samples", 48), denoise=True)
    world_color(sc, (0.42, 0.44, 0.47), p.get("world", 0.55))
    lights(sc, centre, size)
    if p.get("ground", True):
        ground(sc, lo[2] - 0.002, size)
    out = Path(p["out"])
    out.mkdir(parents=True, exist_ok=True)
    saved = {}
    written = []
    classes = None
    cam_data = bpy.data.cameras.new("evcam")
    cam = bpy.data.objects.new("evcam", cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    for mode in p.get("modes", ["lit"]):
        c = set_mode(objs, mode, saved)
        classes = c or classes
        for v in p.get("views", []):
            if isinstance(v, str):
                name, (az, el) = v, VIEWS[v]
                v = {"name": name, "az": az, "el": el}
            tgt = np.array(v.get("target", centre))
            dist = v.get("dist_k", 1.25) * size
            cam_data.lens = v.get("lens", 50)
            a, e = math.radians(v["az"]), math.radians(v["el"])
            # az 0 looks at the creature's front (front faces -Y)
            eye = tgt + dist * np.array([-math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)])
            up = (0, 1, 0) if abs(v["el"]) > 85 else (0, 0, 1)
            cam.matrix_world = Matrix(look_at_matrix(eye, tgt, up).tolist())
            f = out / f"{mode}_{v['name']}.png"
            sc.render.filepath = str(f)
            bpy.ops.render.render(write_still=True)
            written.append(str(f))
        for cj in p.get("cameras", []):
            co = add_camera(sc, cj)
            sc.camera = co
            sc.render.resolution_x, sc.render.resolution_y = cj["width"], cj["height"]
            f = out / f"{mode}_cam_{cj['name']}.png"
            sc.render.filepath = str(f)
            bpy.ops.render.render(write_still=True)
            written.append(str(f))
            sc.render.resolution_x, sc.render.resolution_y = W, H
            sc.camera = cam
        tt = p.get("turntable")
        if tt and tt.get("mode", "lit") == mode:
            (out / f"turntable_{mode}").mkdir(exist_ok=True)
            for k in range(tt["frames"]):
                az = 360.0 * k / tt["frames"]
                a, e = math.radians(az), math.radians(tt.get("el", 15))
                eye = centre + 1.3 * size * np.array([-math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)])
                cam_data.lens = 50
                cam.matrix_world = Matrix(look_at_matrix(eye, centre).tolist())
                sc.render.filepath = str(out / f"turntable_{mode}" / f"f{k:03d}.png")
                bpy.ops.render.render(write_still=True)
            written.append(str(out / f"turntable_{mode}"))
    finish(p, {"written": written, "bounds": [lo.tolist(), hi.tolist()], "part_classes": classes})


if __name__ == "__main__":
    main()
