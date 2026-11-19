"""Evidence renders of the rigged humanoid GLB, by variant and pose.

Reuses render_evidence's lighting, ground, camera and mode helpers; adds
variant visibility (which meshes an NPC role shows) and clip poses from the
actual exported animations.

payload:
  glb       rigged GLB (the export the game loads)
  out       output directory
  shots     [{"name", "variant": [mesh names], "pose": {"action", "time"} | null,
              "view": {az, el, dist_k, target?, lens?}, "mode": lit|clay|wire|parts, "offset_x": m}]
            Several entries with the same "group" are rendered together side by side.
"""
from __future__ import annotations

import math
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix

from asset_pipeline.blender.common import finish, look_at_matrix, payload, setup_cycles, world_color
from asset_pipeline.blender.render_evidence import ground, lights, scene_bounds, set_mode


def import_copy(glb, variant, pose, offset_x):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=glb)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == "ARMATURE")
    meshes = []
    for o in new:
        if o.type == "MESH":
            keep = any(o.name.split(".")[0] == v for v in variant)
            o.hide_render = not keep
            o.hide_set(not keep)
            if keep:
                meshes.append(o)
    top = [o for o in new if o.parent is None]
    for o in top:
        o.location.x += offset_x
    if pose:
        act = bpy.data.actions.get(pose["action"]) or next(a for a in bpy.data.actions if a.name.startswith(pose["action"]))
        arm.animation_data_create()
        arm.animation_data.action = act
        fps = bpy.context.scene.render.fps
        arm["_frame"] = int(round(pose.get("time", 0.0) * fps)) + int(act.frame_range[0])
    return arm, meshes


def main():
    p = payload()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        bpy.ops.preferences.addon_enable(module="cycles")
    except Exception:
        pass
    sc = bpy.context.scene
    out = Path(p["out"])
    out.mkdir(parents=True, exist_ok=True)
    groups = {}
    for s in p["shots"]:
        groups.setdefault(s.get("group", s["name"]), []).append(s)
    written = []
    W, H = p.get("width", 900), p.get("height", 1100)
    for gname, shots in groups.items():
        bpy.ops.wm.read_factory_settings(use_empty=True)
        sc = bpy.context.scene
        objs, arms = [], []
        for s in shots:
            arm, meshes = import_copy(p["glb"], s["variant"], s.get("pose"), s.get("offset_x", 0.0))
            objs += meshes
            arms.append(arm)
        for a in arms:
            if "_frame" in a:
                sc.frame_set(a["_frame"])
        bpy.context.view_layer.update()
        lo, hi = scene_bounds(objs)
        centre = (lo + hi) / 2
        size = float(np.linalg.norm(hi - lo))
        setup_cycles(sc, shots[0].get("width", W), shots[0].get("height", H), samples=p.get("samples", 24), denoise=True)
        world_color(sc, (0.42, 0.44, 0.47), p.get("world", 0.55))
        lights(sc, centre, max(size, 2.0))
        ground(sc, 0.0, max(size, 2.0))
        saved = {}
        set_mode(objs, shots[0].get("mode", "lit"), saved)
        cam_data = bpy.data.cameras.new("cam")
        cam = bpy.data.objects.new("cam", cam_data)
        sc.collection.objects.link(cam)
        sc.camera = cam
        v = shots[0]["view"]
        tgt = np.array(v.get("target", centre), float)
        dist = v.get("dist_k", 1.2) * max(size, 1.0)
        cam_data.lens = v.get("lens", 50)
        a, e = math.radians(v["az"]), math.radians(v["el"])
        eye = tgt + dist * np.array([-math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)])
        cam.matrix_world = Matrix(look_at_matrix(eye, tgt).tolist())
        f = out / f"{gname}.png"
        sc.render.filepath = str(f)
        bpy.ops.render.render(write_still=True)
        written.append(str(f))
    finish(p, {"renders": written})


if __name__ == "__main__":
    main()
