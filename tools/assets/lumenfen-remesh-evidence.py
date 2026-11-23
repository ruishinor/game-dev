#!/usr/bin/env python3
"""Render the *exported* Lumenfen GLB donors in Blender/Cycles (CPU only).

Renders are inspection evidence: useful for spotting material loss, texture
mismatches, bad bounds, distorted silhouettes, and inconsistent transforms.
They do not replace actual player-camera screenshots or desktop/TV profiling.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

TARGETS = (
    "rootglass_oak", "cage_bloom", "stone_guild",
    "tidal_boardwalk", "weir_mechanism",
)


def stage_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 12
    scene.render.resolution_x = 800
    scene.render.resolution_y = 600
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"
    scene.world = bpy.data.worlds.new("Lumenfen - neutral inspection light")
    scene.world.use_nodes = True
    world_bg = scene.world.node_tree.nodes.get("Background")
    world_bg.inputs["Color"].default_value = (0.19, 0.24, 0.25, 1)
    world_bg.inputs["Strength"].default_value = 0.65
    return scene


def world_bounds(meshes):
    bpy.context.view_layer.update()
    corners = [o.matrix_world @ Vector(p) for o in meshes for p in o.bound_box]
    if not corners:
        raise ValueError("Expected rendered donor mesh")
    return (Vector([min(p[i] for p in corners) for i in range(3)]),
            Vector([max(p[i] for p in corners) for i in range(3)]))


def point_camera(camera, point):
    direction = Vector(point) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_light(name, position, strength, size):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = strength
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = position
    point_camera(obj, (0, 0, 0))
    return obj


def render_donor(output, asset, result):
    scene = stage_scene()
    source = output / (asset + "_refined.glb")
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    low, high = world_bounds(meshes)
    center = (low + high) / 2
    size = high - low
    largest = max(size.length, 1.0)
    camera_data = bpy.data.cameras.new("orthographic-review-camera")
    camera = bpy.data.objects.new("orthographic-review-camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = max(size.x, size.y, size.z) * 1.65
    camera_data.lens = 40
    key = add_light(asset + "_key", center + Vector((largest, -largest, largest)),
                    750 * max(1, largest * 0.15), largest * .7)
    fill = add_light(asset + "_fill", center + Vector((-largest, largest, largest * .65)),
                     420 * max(1, largest * .15), largest * .8)
    point_camera(key, center)
    point_camera(fill, center)

    # World-space Z is up after Blender's glTF Y-up import conversion.
    # These are genuine front/side views in the engine's Blender authoring
    # space, avoiding a hard-coded camera position for differently sized donors.
    for label, direction in (
        ("front", (1.0, -1.3, 0.58)),
        ("side", (-1.4, 0.1, 0.45)),
    ):
        camera.location = center + Vector(direction).normalized() * largest * 2.7
        point_camera(camera, center)
        filename = f"{asset}_{label}.png"
        scene.render.filepath = str(output / "evidence" / filename)
        bpy.ops.render.render(write_still=True)
        saved = Path(scene.render.filepath)
        if not saved.is_file() or saved.stat().st_size < 2000:
            raise RuntimeError("Blender produced no review image: " + filename)
        result.append({"asset": asset, "view": label, "file": "evidence/" + filename,
                       "bytes": saved.stat().st_size,
                       "bounds": [[round(float(x), 3) for x in low],
                                  [round(float(x), 3) for x in high]]})


def main(output):
    output.mkdir(parents=True, exist_ok=True)
    (output / "evidence").mkdir(parents=True, exist_ok=True)
    report = json.loads((output / "remesh-report.json").read_text(encoding="utf8"))
    if [a["id"] for a in report["assets"]] != list(TARGETS):
        raise ValueError("Expected five remeshed static donor assets")
    result = []
    for name in TARGETS:
        render_donor(output, name, result)
        print(f"Rendered {name}: front and side", flush=True)
    (output / "evidence" / "evidence.json").write_text(
        json.dumps({"source": "actual exported GLBs", "views": result}, indent=2) + "\n",
        encoding="utf8"
    )


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: python tools/assets/lumenfen-remesh-evidence.py <remesh-output-dir>")
    main(Path(sys.argv[1]).resolve())
