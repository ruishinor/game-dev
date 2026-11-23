#!/usr/bin/env python3
"""Rebuild selected STATIC Lumenfen archive donors into new GLB topology.

Requires Python 3.13 + bpy 5.3. Source composition and original GLBs are read
only. This is an offline geometry/material authoring step, not client runtime.
The original eight-donor composite is left intact for provenance comparison.
"""
from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


# Animate/skinned animals and the rift ground-mesh study are intentionally not
# voxelized: topology replacement would destroy armature weights/morphs.
TARGETS = (
    "rootglass_oak",
    "cage_bloom",
    "stone_guild",
    "tidal_boardwalk",
    "weir_mechanism",
)
ORGANIC = {"rootglass_oak", "cage_bloom"}
MAX_TOTAL_TRIANGLES = 360_000
MAX_TRIANGLES_PER_DONOR = 120_000


def descendants(root):
    items = []
    def walk(item):
        for child in item.children:
            items.append(child)
            walk(child)
    walk(root)
    return items


def select_only(items):
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    for item in items:
        item.hide_set(False)
        item.select_set(True)
    if items:
        bpy.context.view_layer.objects.active = items[0]


def triangle_count(meshes):
    return sum(sum(max(0, len(poly.vertices) - 2) for poly in ob.data.polygons)
               for ob in meshes if ob.type == "MESH")


def bounds_relative(root, items):
    inverse = root.matrix_world.inverted()
    pts = [inverse @ (o.matrix_world @ Vector(c))
           for o in items if o.type == "MESH" for c in o.bound_box]
    if not pts:
        raise ValueError(f"No mesh geometry for {root.name}")
    return ([min(v[i] for v in pts) for i in range(3)],
            [max(v[i] for v in pts) for i in range(3)])


def material(name, base, roughness, metal=0.0, emissive=None):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*base, 1.0)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*base, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metal
    if emissive:
        shader.inputs["Emission Color"].default_value = (*emissive, 1.0)
        shader.inputs["Emission Strength"].default_value = 0.25
    return mat


def parent_detail(obj, root, name, mat):
    obj.name = "lumenfen:refined:" + name
    obj.parent = root
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = len(polygon.vertices) >= 4
    return obj


def rod(root, name, a, b, radius, mat, segments=12):
    start, end = Vector(a), Vector(b)
    axis = end - start
    if axis.length <= 0.001:
        return None
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=segments, radius=radius, depth=axis.length, location=(0, 0, 0)
    )
    obj = bpy.context.object
    parent_detail(obj, root, name, mat)
    obj.location = (start + end) * 0.5
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(axis)
    return obj


def torus(root, name, where, major, minor, mat, axis="Z"):
    bpy.ops.mesh.primitive_torus_add(
        major_segments=32, minor_segments=8, location=(0, 0, 0),
        major_radius=major, minor_radius=minor
    )
    obj = parent_detail(bpy.context.object, root, name, mat)
    obj.location = where
    if axis == "X":
        obj.rotation_euler[1] = math.pi / 2
    elif axis == "Y":
        obj.rotation_euler[0] = math.pi / 2
    return obj


def refine_meshes(root, target):
    geometry = [o for o in descendants(root) if o.type == "MESH"]
    if not geometry:
        raise ValueError(f"{target} contains no donor geometry")
    initial = triangle_count(geometry)
    changed = 0
    operations = {"subdivided": 0, "bevelled": 0, "skipped_skinned": 0}
    for obj in geometry:
        if (obj.find_armature() or obj.data.shape_keys or
                any(m.type == "ARMATURE" for m in obj.modifiers)):
            operations["skipped_skinned"] += 1
            continue
        n = len(obj.data.polygons)
        if n < 8 or n > 4500:
            continue
        select_only([obj])
        edge = [abs(float(x)) for x in obj.dimensions if abs(float(x)) > 0.001]
        scale = min(edge) if edge else 0.1
        if target in ORGANIC:
            # Genuine new surface topology: Catmull-Clark subdivision, followed
            # by fine, bounded surface irregularity. UVs and source materials
            # interpolate with the remesh rather than being discarded.
            if initial * 4 > MAX_TRIANGLES_PER_DONOR and n > 450:
                continue
            sub = obj.modifiers.new("lumenfen_organic_retopology", "SUBSURF")
            sub.subdivision_type = "CATMULL_CLARK"
            sub.levels = 1
            sub.render_levels = 1
            bpy.ops.object.modifier_apply(modifier=sub.name)
            if n > 28 and scale > 0.03:
                cloud = bpy.data.textures.new("lumenfen_growth_" + target, type="CLOUDS")
                cloud.noise_scale = max(0.08, scale * 0.22)
                deform = obj.modifiers.new("lumenfen_bark_surface", "DISPLACE")
                deform.texture = cloud
                deform.strength = min(0.023, scale * 0.012)
                deform.mid_level = 0.5
                bpy.ops.object.modifier_apply(modifier=deform.name)
            for poly in obj.data.polygons:
                poly.use_smooth = True
            operations["subdivided"] += 1
            changed += 1
        else:
            # Worked planks, frame joints, fittings: physically bevel the mesh
            # rather than merely changing flat-shaded normals.
            if scale < 0.012:
                continue
            bevel = obj.modifiers.new("lumenfen_worked_edges", "BEVEL")
            bevel.width = max(0.003, min(0.045, scale * 0.034))
            bevel.segments = 3
            bevel.limit_method = "ANGLE"
            bevel.angle_limit = 0.28
            before = triangle_count([obj])
            try:
                bpy.ops.object.modifier_apply(modifier=bevel.name)
            except RuntimeError:
                obj.modifiers.remove(bevel)
                continue
            if triangle_count([obj]) > before:
                changed += 1
                operations["bevelled"] += 1
    return initial, changed, operations


def add_design_details(root, target, box):
    lower, upper = box
    width = max(0.2, upper[0] - lower[0])
    height = max(0.2, upper[1] - lower[1])
    depth = max(0.2, upper[2] - lower[2])
    cx, cy, cz = [(lower[i] + upper[i]) * 0.5 for i in range(3)]
    base_y = lower[1]
    bark = material(target + "_grown_wood", (.16, .28, .215), .87)
    bronze = material(target + "_wet_bronze", (.39, .31, .19), .42, .58)
    glass = material(target + "_rootglass", (.10, .45, .37), .22, .08, (.12, .29, .23))
    count = 0
    if target == "rootglass_oak":
        # Spiralling xylem support and embedded glass filaments: preserve the
        # donor oak silhouette while giving its trunk depth and mechanical age.
        radius = max(0.06, min(width, depth) * 0.015)
        for i in range(8):
            a = i * math.tau / 8
            x, z = cx + math.cos(a) * radius * 7, cz + math.sin(a) * radius * 7
            rod(root, "oak_buttress", (x, base_y + height * .04, z),
                (cx + (x - cx) * .35, base_y + height * .34, cz + (z - cz) * .35),
                radius * 1.65, bark)
            rod(root, "oak_glass_channel", (x, base_y + height * .28, z),
                (cx + (x - cx) * 1.8, base_y + height * .79, cz + (z - cz) * 1.8),
                radius * .38, glass)
            count += 2
    elif target == "cage_bloom":
        radius = min(width, depth) * .27
        for i in range(10):
            a = i * math.tau / 10
            x, z = cx + math.cos(a) * radius, cz + math.sin(a) * radius
            rod(root, "cage_growth_rib", (x, base_y + height * .15, z),
                (cx + (x - cx) * .52, base_y + height * .92, cz + (z - cz) * .52),
                max(.014, radius * .06), bark)
            torus(root, "cage_spore_socket",
                  (x, base_y + height * .68, z),
                  max(.045, radius * .16), max(.008, radius * .026), glass)
            count += 2
    elif target == "stone_guild":
        for side in (-1, 1):
            for i in range(5):
                x = cx + (i - 2) * width * .16
                rod(root, "observatory_roof_rib",
                    (x, base_y + height * .57, cz - side * depth * .42),
                    (x, base_y + height * .9, cz),
                    max(.019, width * .008), bark)
                count += 1
        torus(root, "survey_rotation_gear",
              (cx, base_y + height * .72, cz), width * .11,
              max(.014, width * .008), bronze, "X")
        count += 1
    elif target == "tidal_boardwalk":
        for i in range(5):
            x = lower[0] + width * (.13 + i * .18)
            for side in (-1, 1):
                z = cz + side * depth * .44
                rod(root, "boardwalk_fastener",
                    (x, base_y + height * .69, z),
                    (x, base_y + height * .78, z),
                    max(.008, width * .01), bronze)
                count += 1
        for side in (-1, 1):
            rod(root, "boardwalk_growth_brace",
                (cx + side * width * .38, base_y + height * .07, cz),
                (cx + side * width * .2, base_y + height * .62, cz),
                max(.025, width * .018), bark)
            count += 1
    elif target == "weir_mechanism":
        for i in range(6):
            y = base_y + height * (.12 + i * .14)
            torus(root, "bucket_bearing_coupling",
                  (cx, y, cz), max(.11, min(width, depth) * .37),
                  max(.012, min(width, depth) * .03), bronze, "X")
            count += 1
        for side in (-1, 1):
            rod(root, "weir_tension_axle",
                (cx + side * width * .28, base_y + height * .14, cz),
                (cx + side * width * .36, base_y + height * .85, cz),
                max(.015, width * .024), bark)
            count += 1
    return count


def main(composite, output):
    output.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(composite))
    bpy.context.view_layer.update()
    original = {o.name: o for o in bpy.data.objects if o.name in TARGETS}
    if len(original) != len(TARGETS):
        raise RuntimeError(f"GLB donor roots mismatch: found {list(original)}")
    records = []
    total = 0
    for target in TARGETS:
        holder = original[target]
        before_items = [o for o in descendants(holder) if o.type == "MESH"]
        before = triangle_count(before_items)
        bound = bounds_relative(holder, before_items)
        before_tri, changed, ops = refine_meshes(holder, target)
        assert before_tri == before
        details = add_design_details(holder, target, bound)
        if not (changed > 0 and details >= 6):
            raise RuntimeError(f"No real topology/detail changes on {target}: {ops}")
        bpy.context.view_layer.update()
        after_items = [o for o in descendants(holder) if o.type == "MESH"]
        after = triangle_count(after_items)
        if after <= before or after > MAX_TRIANGLES_PER_DONOR:
            raise RuntimeError(f"Unsafe remesh triangle count for {target}: {before} -> {after}")
        total += after
        if total > MAX_TOTAL_TRIANGLES:
            raise RuntimeError(f"Aggregate triangle budget exceeded: {total}")
        all_items = [holder, *descendants(holder)]
        select_only(all_items)
        filename = target + "_refined.glb"
        bpy.ops.export_scene.gltf(
            filepath=str(output / filename), export_format="GLB",
            use_selection=True, export_animations=False,
            export_materials="EXPORT", export_normals=True, export_yup=True,
        )
        payload = (output / filename).read_bytes()
        if payload[:4] != b"glTF" or len(payload) < 1000:
            raise RuntimeError(f"Damaged export: {filename}")
        records.append({
            "id": target, "file": filename,
            "originalTriangles": before, "refinedTriangles": after,
            "changedDonorMeshes": changed, "authoredDetailPieces": details,
            "operations": ops,
            "bytes": len(payload),
            "sha256": hashlib.sha256(payload).hexdigest(),
        })
        print(f"REMESH {target}: triangles {before} -> {after}; "
              f"meshes reworked {changed}, new pieces {details}, {len(payload)} bytes",
              flush=True)
    report = {
        "kind": "actual-blender-static-donor-remesh",
        "sourceComposite": composite.name,
        "sourceSha256": hashlib.sha256(composite.read_bytes()).hexdigest(),
        "assetCount": len(records), "totalTriangles": total,
        "noRigOrAnimationRetopology": True,
        "publishedToGame": False,
        "assets": records,
    }
    (output / "remesh-report.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf8"
    )
    return report


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: python tools/assets/lumenfen-remesh.py <input-composite.glb> <output-directory>")
    main(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
