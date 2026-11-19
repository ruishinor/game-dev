"""Evidence renders of the exported Severance Gate GLB (the runtime file, never concept art).

payload:
  glb      exported (optimised or raw) GLB; meshopt files must be decoded first
  out      output directory
  views    list of names from VIEWS (default: all)
  scenes   which glTF scenes to show side by side for the LOD sheet (default Near only)
  samples  Cycles samples (default 24)

Lighting is a neutral overcast studio (key sun, sky fill), not the in-game look; the
emissive materials keep their exported strengths. A 1.75 m reference figure stands at
the foot of the stairs in the scale views.
"""
from __future__ import annotations

import math
from pathlib import Path

import bpy  # noqa: I001
import numpy as np
from mathutils import Matrix, Vector

from asset_pipeline.blender.common import finish, look_at_matrix, payload, setup_cycles

# name: (mode, camera type, eye, target, lens or ortho scale)
VIEWS = {
    "front": ("lit", "ORTHO", (0, -90, 14.2), (0, 0, 14.2), 33),
    "rear": ("lit", "ORTHO", (0, 90, 14.2), (0, 0, 14.2), 33),
    "side": ("lit", "ORTHO", (90, 0, 14.2), (0, 0, 14.2), 33),
    "top": ("lit", "ORTHO", (0, 0.01, 90), (0, 0, 0), 34),
    "three_quarter": ("lit", "PERSP", (31, -48, 17), (0, -3, 11), 30),
    "three_quarter_rear": ("lit", "PERSP", (-33, 44, 19), (0, 0, 12), 30),
    "approach": ("lit", "PERSP", (2.5, -34, 2.2), (0, -6, 9.5), 24),
    "player_scale": ("lit", "PERSP", (9, -26, 3.0), (0, -12, 4), 28),
    "close_runes": ("lit", "PERSP", (5.5, -16, 21), (3.0, -4.6, 19.5), 42),
    "close_arch": ("lit", "PERSP", (1.6, -14.5, 7.5), (0, -6.5, 9), 26),
    "close_passage": ("lit", "PERSP", (0.3, -9.4, 6.4), (0, 1.5, 8.6), 20),
    "close_stairs": ("lit", "PERSP", (6.5, -18.5, 3.2), (1.5, -11, 1.8), 30),
    "close_base": ("lit", "PERSP", (-14, -15, 2.0), (-8.5, -8.5, 1.8), 30),
    "close_crown": ("lit", "PERSP", (9, -14, 31), (0, -1, 26), 35),
    "clay_three_quarter": ("clay", "PERSP", (31, -48, 17), (0, -3, 11), 30),
    "wire_front": ("wire", "ORTHO", (0, -90, 14.2), (0, 0, 14.2), 33),
    "wire_three_quarter": ("wire", "PERSP", (31, -48, 17), (0, -3, 11), 30),
}


def clay(name, rgb):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = 0.75
    return m


def human(sc):
    """A neutral 1.75 m mannequin silhouette for scale."""
    m = clay("_figure", (0.62, 0.2, 0.12))
    parts = []
    bpy.ops.mesh.primitive_cylinder_add(radius=0.19, depth=1.0, location=(0, 0, 0.5 + 0.45))
    parts.append(bpy.context.object)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.12, location=(0, 0, 1.63))
    parts.append(bpy.context.object)
    for x in (-0.09, 0.09):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.075, depth=0.9, location=(x, 0, 0.45))
        parts.append(bpy.context.object)
    for o in parts:
        o.data.materials.append(m)
        o.name = "_figure"
    return parts


def main():
    p = payload()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        bpy.ops.preferences.addon_enable(module="cycles")
    except Exception:
        pass
    bpy.ops.import_scene.gltf(filepath=p["glb"])
    sc = bpy.context.scene
    keep = set(p.get("scene_prefixes", [""]))
    for o in list(sc.objects):
        n = o.name
        if n.startswith(("Mid_", "Far_", "Ruin_")) and not any(n.startswith(k) for k in keep if k):
            bpy.data.objects.remove(o, do_unlink=True)
    setup_cycles(sc, p.get("width", 1200), p.get("height", 900), samples=p.get("samples", 24), denoise=True)
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    w = bpy.data.worlds.new("w")
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.36, 0.38, 0.44, 1)
    bg.inputs[1].default_value = 0.55
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.2
    sun.data.angle = math.radians(4)
    sc.collection.objects.link(sun)
    sun.matrix_world = Matrix(look_at_matrix((-30, -45, 60), (0, 0, 0)).tolist())
    # ground
    bpy.ops.mesh.primitive_plane_add(size=160, location=(0, 0, -0.01))
    g = bpy.context.object
    g.name = "_ground"
    g.data.materials.append(clay("_groundmat", (0.16, 0.15, 0.14)))
    figure = human(sc)
    for o in figure:
        o.location.y -= 18.6
    meshes = [o for o in sc.objects if o.type == "MESH" and not o.name.startswith("_")]
    saved = {o.name: [s.material for s in o.material_slots] for o in meshes}
    clay_m = clay("_clay", (0.55, 0.53, 0.5))
    wire_m = clay("_wire", (0.02, 0.02, 0.025))
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.clip_end = 600
    out = Path(p["out"])
    out.mkdir(parents=True, exist_ok=True)
    written = []
    names = p.get("views") or list(VIEWS)
    for name in names:
        mode, kind, eye, tgt, lens = VIEWS[name]
        for o in meshes:
            for m in list(o.modifiers):
                o.modifiers.remove(m)
            for i, s in enumerate(o.material_slots):
                s.material = saved[o.name][i] if mode == "lit" else clay_m
            if mode == "wire":
                if len(o.material_slots) < 2:
                    o.data.materials.append(wire_m)
                mod = o.modifiers.new("_wire", "WIREFRAME")
                mod.thickness = 0.018
                mod.use_even_offset = False
                mod.use_replace = False
                mod.material_offset = len(o.material_slots) - 1
        cam.data.type = kind
        if kind == "ORTHO":
            cam.data.ortho_scale = lens
        else:
            cam.data.lens = lens
        up = (0, 1, 0) if name == "top" else (0, 0, 1)
        cam.matrix_world = Matrix(look_at_matrix(eye, tgt, up).tolist())
        for o in figure:
            o.hide_render = name not in ("player_scale", "approach", "front", "three_quarter", "clay_three_quarter", "close_stairs")
        f = out / f"{name}.png"
        sc.render.filepath = str(f)
        bpy.ops.render.render(write_still=True)
        written.append(str(f))
    tris = 0
    for o in meshes:
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
    finish(p, {"renders": written, "triangles_rendered": tris})


if __name__ == "__main__":
    main()
