"""Cycles renders of the exported armour GLB: inventory icons and worn evidence.

Reuses render_evidence's lighting and the shared Cycles setup (the same
renderer as the Stillpoint and Halo Construct routes). The GLB rendered is
the exact runtime export (Meshopt undone by js/decompress.mjs for Blender).

payload (op "icons"):  glb, out, items, size, samples, view {az, el}
payload (op "worn"):   glb, body (plain body GLB), out, prefix, items, samples,
                       width, height, poses [null | {action, time}]
"""
from __future__ import annotations

import math
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix

from asset_pipeline.blender.common import finish, look_at_matrix, payload, setup_cycles, world_color
from asset_pipeline.blender.render_evidence import ground, lights, scene_bounds

MANNEQUIN_KEEP = ("body", "head", "hands", "shell_shorts", "shell_shoes")


def fresh():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        bpy.ops.preferences.addon_enable(module="cycles")
    except Exception:
        pass
    return bpy.context.scene


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    return [o for o in bpy.data.objects if o not in before]


def base_name(o):
    return o.name.split(".")[0]


def camera(sc, target, dist, az, el, lens=50):
    cd = bpy.data.cameras.new("cam")
    cd.lens = lens
    cam = bpy.data.objects.new("cam", cd)
    sc.collection.objects.link(cam)
    sc.camera = cam
    a, e = math.radians(az), math.radians(el)
    eye = target + dist * np.array([-math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)])
    cam.matrix_world = Matrix(look_at_matrix(eye, target).tolist())
    return cam


def studio(sc, centre, size, strength=0.7):
    world_color(sc, (0.40, 0.42, 0.45), strength)
    lights(sc, centre, size)


def op_icons(p):
    out = Path(p["out"])
    icons = {}
    for item in p["items"]:
        sc = fresh()
        objs = import_glb(p["glb"])
        keep = [o for o in objs if o.type == "MESH" and base_name(o) == item]
        for o in objs:
            if o.type == "MESH" and o not in keep:
                bpy.data.objects.remove(o, do_unlink=True)
        bpy.context.view_layer.update()
        lo, hi = scene_bounds(keep)
        centre = (lo + hi) / 2
        size = float(np.linalg.norm(hi - lo))
        setup_cycles(sc, p["size"], p["size"], samples=p["samples"], denoise=True, transparent=True)
        studio(sc, centre, max(size, 0.6) * 1.4, 0.9)
        v = p["view"]
        # frame the silhouette: distance from the bounding radius and lens
        lens = 60
        fov = 2 * math.atan(18 / lens)
        dist = (size / 2) / math.tan(fov / 2) * 1.02
        camera(sc, centre, dist, v["az"], v["el"], lens)
        f = out / f"{item}_hero.png"
        sc.render.filepath = str(f)
        bpy.ops.render.render(write_still=True)
        icons[item] = str(f)
    finish(p, {"icons": icons})


def mannequin_material():
    m = bpy.data.materials.new("_mannequin")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.42, 0.43, 0.44, 1)
    b.inputs["Roughness"].default_value = 0.7
    return m


def op_worn(p):
    out = Path(p["out"])
    written = []
    for k, pose in enumerate(p["poses"]):
        sc = fresh()
        mm = mannequin_material()
        groups = []
        n = len(p["items"])
        for i, item in enumerate(p["items"]):
            dx = (i - (n - 1) / 2) * 0.95
            body = import_glb(p["body"])
            arm_b = next(o for o in body if o.type == "ARMATURE")
            for o in body:
                if o.type == "MESH":
                    if base_name(o) in MANNEQUIN_KEEP:
                        o.data.materials.clear()
                        o.data.materials.append(mm)
                    else:
                        bpy.data.objects.remove(o, do_unlink=True)
            armour = import_glb(p["glb"])
            arm_a = next(o for o in armour if o.type == "ARMATURE")
            for o in armour:
                if o.type == "MESH" and base_name(o) != item:
                    bpy.data.objects.remove(o, do_unlink=True)
            for a in (arm_b, arm_a):
                top = a
                while top.parent:
                    top = top.parent
                top.location.x += dx
            if pose:
                act = bpy.data.actions.get(pose["action"]) or next(x for x in bpy.data.actions if x.name.startswith(pose["action"]))
                for a in (arm_b, arm_a):
                    a.animation_data_create()
                    a.animation_data.action = act
                sc.frame_set(int(round(pose["time"] * sc.render.fps)) + int(act.frame_range[0]))
            groups.append(item)
        bpy.context.view_layer.update()
        meshes = [o for o in bpy.data.objects if o.type == "MESH"]
        lo, hi = scene_bounds(meshes)
        centre = (lo + hi) / 2
        size = float(np.linalg.norm(hi - lo))
        setup_cycles(sc, p["width"], p["height"], samples=p["samples"], denoise=True)
        studio(sc, centre, max(size, 2.0), 0.55)
        ground(sc, float(lo[2]), max(size, 2.0))
        tag = "bind" if not pose else pose["action"].lower()
        for view, az in (("front", 0), ("back", 180), ("three_quarter", 35)):
            if pose and view == "back":
                continue
            cam = camera(sc, np.array([centre[0], centre[1], lo[2] + (hi[2] - lo[2]) * 0.62]), size * 0.95, az, 8, 50)
            f = out / f"{p['prefix']}_{tag}_{view}.png"
            sc.render.filepath = str(f)
            bpy.ops.render.render(write_still=True)
            written.append(str(f))
            bpy.data.objects.remove(cam, do_unlink=True)
    finish(p, {"renders": written})


def main():
    p = payload()
    {"icons": op_icons, "worn": op_worn}[p["op"]](p)


if __name__ == "__main__":
    main()
