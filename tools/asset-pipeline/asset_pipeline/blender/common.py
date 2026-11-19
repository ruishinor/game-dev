"""Helpers shared by the Blender (bpy) job scripts.

Every job is run as `python -m asset_pipeline.blender.<job> '<json payload>'`
through workspace.run_blender, in its own process.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np


def payload() -> dict:
    return json.loads(sys.argv[1])


def _plain(o):
    if isinstance(o, np.generic):
        return o.item()
    if isinstance(o, np.ndarray):
        return o.tolist()
    return str(o)


def finish(p: dict, result: dict) -> None:
    Path(p["result"]).write_text(json.dumps(result, indent=1, default=_plain))


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        bpy.ops.preferences.addon_enable(module="cycles")
    except Exception:
        pass
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"
    return sc


def setup_cycles(sc, width, height, samples=32, denoise=True, transparent=False):
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = denoise
    sc.cycles.use_adaptive_sampling = True
    sc.render.resolution_x = width
    sc.render.resolution_y = height
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = transparent
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.render.threads_mode = "AUTO"


def world_color(sc, rgb, strength=1.0):
    w = bpy.data.worlds.new("world")
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (*rgb, 1)
    bg.inputs[1].default_value = strength
    return w


def add_camera(sc, cam_json, name=None, clip_end=100.0):
    """Create a Blender camera from an OpenCV-convention camera dict."""
    K = np.array(cam_json["K"], float)
    R = np.array(cam_json["R"], float)
    t = np.array(cam_json["t"], float)
    w, h = cam_json["width"], cam_json["height"]
    data = bpy.data.cameras.new(name or cam_json["name"])
    data.sensor_fit = "HORIZONTAL"
    data.sensor_width = 36.0
    if cam_json.get("ortho"):
        data.type = "ORTHO"
        data.ortho_scale = w / K[0, 0]
    data.lens = K[0, 0] / w * 36.0
    data.shift_x = -(K[0, 2] - w / 2.0) / w
    data.shift_y = (K[1, 2] - h / 2.0) / w
    data.clip_start = 0.01
    data.clip_end = clip_end
    obj = bpy.data.objects.new(name or cam_json["name"], data)
    sc.collection.objects.link(obj)
    flip = np.diag([1.0, -1.0, -1.0])
    Rbw = (flip @ R).T
    M = np.eye(4)
    M[:3, :3] = Rbw
    M[:3, 3] = -R.T @ t
    from mathutils import Matrix

    obj.matrix_world = Matrix(M.tolist())
    return obj


def look_at_matrix(eye, target, up=(0, 0, 1)):
    """4x4 Blender camera->world matrix looking from eye to target."""
    eye, target, up = map(lambda v: np.array(v, float), (eye, target, up))
    f = target - eye
    f /= np.linalg.norm(f)
    r = np.cross(f, up)
    if np.linalg.norm(r) < 1e-6:
        r = np.cross(f, (0, 1, 0))
    r /= np.linalg.norm(r)
    u = np.cross(r, f)
    M = np.eye(4)
    M[:3, 0], M[:3, 1], M[:3, 2], M[:3, 3] = r, u, -f, eye
    return M


def ortho_camera(sc, name, eye, target, scale, up=(0, 0, 1)):
    from mathutils import Matrix

    data = bpy.data.cameras.new(name)
    data.type = "ORTHO"
    data.ortho_scale = scale
    data.clip_end = 200
    obj = bpy.data.objects.new(name, data)
    sc.collection.objects.link(obj)
    obj.matrix_world = Matrix(look_at_matrix(eye, target, up).tolist())
    return obj


def persp_camera(sc, name, eye, target, lens=50.0, up=(0, 0, 1)):
    from mathutils import Matrix

    data = bpy.data.cameras.new(name)
    data.lens = lens
    data.sensor_width = 36.0
    data.clip_start = 0.01
    data.clip_end = 200
    obj = bpy.data.objects.new(name, data)
    sc.collection.objects.link(obj)
    obj.matrix_world = Matrix(look_at_matrix(eye, target, up).tolist())
    return obj


def render_to(sc, cam_obj, path):
    sc.camera = cam_obj
    sc.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def mesh_arrays(obj, world=True):
    """Triangulated vertex (N,3) and face (M,3) arrays of an evaluated mesh object."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = ev.to_mesh()
    me.calc_loop_triangles()
    V = np.empty(len(me.vertices) * 3, np.float64)
    me.vertices.foreach_get("co", V)
    V = V.reshape(-1, 3)
    F = np.empty(len(me.loop_triangles) * 3, np.int64)
    me.loop_triangles.foreach_get("vertices", F)
    F = F.reshape(-1, 3)
    if world:
        M = np.array(obj.matrix_world)
        V = V @ M[:3, :3].T + M[:3, 3]
    ev.to_mesh_clear()
    return V, F


def write_ply(path, V, F, colors=None):
    """Minimal binary little-endian PLY writer (float32 xyz, uchar rgb optional, int32 faces)."""
    V = np.asarray(V, np.float32)
    F = np.asarray(F, np.int32)
    with open(path, "wb") as fh:
        hdr = ["ply", "format binary_little_endian 1.0", f"element vertex {len(V)}", "property float x", "property float y", "property float z"]
        if colors is not None:
            hdr += ["property uchar red", "property uchar green", "property uchar blue"]
        hdr += [f"element face {len(F)}", "property list uchar int vertex_indices", "end_header"]
        fh.write(("\n".join(hdr) + "\n").encode())
        if colors is None:
            fh.write(V.tobytes())
        else:
            dt = np.dtype([("p", "<f4", 3), ("c", "u1", 3)])
            arr = np.empty(len(V), dt)
            arr["p"] = V
            arr["c"] = np.asarray(colors, np.uint8)
            fh.write(arr.tobytes())
        dt = np.dtype([("n", "u1"), ("i", "<i4", 3)])
        arr = np.empty(len(F), dt)
        arr["n"] = 3
        arr["i"] = F
        fh.write(arr.tobytes())


def principled(name, color=(0.5, 0.5, 0.5), roughness=0.6, metallic=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = roughness
    b.inputs["Metallic"].default_value = metallic
    return m


def apply_all_modifiers(obj):
    bpy.context.view_layer.objects.active = obj
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def deg(x):
    return math.radians(x)
