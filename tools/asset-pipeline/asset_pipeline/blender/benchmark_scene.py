"""Experiment A ground truth: build a deterministic test object and render it.

The object is deliberately awkward for reconstruction: asymmetric, with a
through-arch (negative space), concave creases where parts overlap, a thin
spike, a faceted crystal cluster and several textured materials with
distinct markings. Outputs are written to two separate directories:

  <out>/capture/       images + camera files: the only reconstruction inputs
  <out>/ground_truth/  the mesh and .blend: read only by evaluation
"""
from __future__ import annotations

import math
from pathlib import Path

import bpy  # noqa: I001  (bpy must be imported before bmesh)
import bmesh
import numpy as np
from mathutils import Matrix

from asset_pipeline.blender.common import (apply_all_modifiers, finish, look_at_matrix, mesh_arrays, payload, reset_scene, setup_cycles,
                                           world_color, write_ply)
from asset_pipeline.cameras import Camera, save_cameras


def textured_material(name, c1, c2, mark, scale, mark_scale, roughness=0.65):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    N = nt.nodes
    L = nt.links
    bsdf = N["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = roughness
    tc = N.new("ShaderNodeTexCoord")
    noise = N.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 8.0
    L.new(tc.outputs["Object"], noise.inputs["Vector"])
    ramp = N.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*c1, 1)
    ramp.color_ramp.elements[1].color = (*c2, 1)
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[1].position = 0.65
    L.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    vor = N.new("ShaderNodeTexVoronoi")
    vor.feature = "DISTANCE_TO_EDGE"
    vor.inputs["Scale"].default_value = mark_scale
    L.new(tc.outputs["Object"], vor.inputs["Vector"])
    edge = N.new("ShaderNodeMath")
    edge.operation = "LESS_THAN"
    edge.inputs[1].default_value = 0.04
    L.new(vor.outputs["Distance"], edge.inputs[0])
    mix = N.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    L.new(edge.outputs[0], mix.inputs["Factor"])
    L.new(ramp.outputs["Color"], mix.inputs["A"])
    mix.inputs["B"].default_value = (*mark, 1)
    fine = N.new("ShaderNodeTexNoise")
    fine.inputs["Scale"].default_value = scale * 9.0
    fine.inputs["Detail"].default_value = 4.0
    L.new(tc.outputs["Object"], fine.inputs["Vector"])
    fr = N.new("ShaderNodeMapRange")
    fr.inputs["From Min"].default_value = 0.3
    fr.inputs["From Max"].default_value = 0.7
    fr.inputs["To Min"].default_value = 0.55
    fr.inputs["To Max"].default_value = 1.15
    L.new(fine.outputs["Fac"], fr.inputs["Value"])
    mul = N.new("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    mul.inputs["Factor"].default_value = 1.0
    L.new(mix.outputs["Result"], mul.inputs["A"])
    L.new(fr.outputs["Result"], mul.inputs["B"])
    L.new(mul.outputs["Result"], bsdf.inputs["Base Color"])
    return m


def displace(obj, strength, size, seed_offset):
    tex = bpy.data.textures.new(obj.name + "_disp", "CLOUDS")
    tex.noise_scale = size
    tex.noise_depth = 3
    mod = obj.modifiers.new("disp", "DISPLACE")
    mod.texture = tex
    mod.strength = strength
    mod.texture_coords = "OBJECT"
    empty = bpy.data.objects.new(obj.name + "_dispcoords", None)
    bpy.context.scene.collection.objects.link(empty)
    empty.location = (seed_offset, -seed_offset * 0.7, seed_offset * 0.3)
    mod.texture_coords_object = empty


def build_object(sc):
    parts = []
    # 1. Base boulder: displaced, flattened icosphere.
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=6, radius=0.55, location=(0, 0, 0.3))
    base = bpy.context.object
    base.name = "base"
    base.scale = (1.3, 0.85, 0.55)
    displace(base, 0.14, 0.35, 1.7)
    base.data.materials.append(textured_material("rock", (0.42, 0.36, 0.30), (0.62, 0.58, 0.50), (0.75, 0.12, 0.08), 6.0, 5.0))
    parts.append(base)
    # 2. Arch: half torus standing on the base, creating a through-hole.
    bpy.ops.mesh.primitive_torus_add(major_radius=0.30, minor_radius=0.065, major_segments=64, minor_segments=20, location=(0.42, 0.05, 0.42),
                                     rotation=(math.radians(90), 0, math.radians(20)))
    arch = bpy.context.object
    arch.name = "arch"
    bm = bmesh.new()
    bm.from_mesh(arch.data)
    # remove the lower half (local y < -0.02 after the 90 deg x rotation maps local y to world z)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y < -0.02], context="VERTS")
    bmesh.ops.holes_fill(bm, edges=bm.edges, sides=0)
    bm.to_mesh(arch.data)
    bm.free()
    arch.data.materials.append(textured_material("ochre", (0.70, 0.48, 0.16), (0.88, 0.70, 0.30), (0.10, 0.10, 0.35), 12.0, 9.0))
    parts.append(arch)
    # 3. Leaning slab intersecting the base.
    bpy.ops.mesh.primitive_cube_add(size=1, location=(-0.50, -0.05, 0.55), rotation=(math.radians(8), math.radians(-24), math.radians(12)))
    slab = bpy.context.object
    slab.name = "slab"
    slab.scale = (0.12, 0.42, 0.62)
    bev = slab.modifiers.new("bevel", "BEVEL")
    bev.width = 0.02
    bev.segments = 2
    slab.data.materials.append(textured_material("slate", (0.22, 0.28, 0.38), (0.45, 0.52, 0.62), (0.95, 0.92, 0.80), 9.0, 7.0))
    parts.append(slab)
    # 4. Thin spike.
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.035, radius2=0.004, depth=0.55, location=(-0.08, 0.26, 0.78),
                                    rotation=(math.radians(-14), math.radians(9), 0))
    spike = bpy.context.object
    spike.name = "spike"
    spike.data.materials.append(textured_material("oxide", (0.40, 0.08, 0.06), (0.62, 0.20, 0.12), (0.9, 0.9, 0.2), 20.0, 30.0))
    parts.append(spike)
    # 5. Crystal cluster: three pointed hexagonal prisms of different size.
    crys_mat = textured_material("crystal", (0.62, 0.78, 0.82), (0.85, 0.93, 0.95), (0.20, 0.30, 0.55), 14.0, 11.0, roughness=0.4)
    for i, (x, y, r, h, rx, ry) in enumerate([(0.05, -0.22, 0.07, 0.42, 6, -10), (0.17, -0.30, 0.05, 0.30, -14, 4), (-0.06, -0.33, 0.045, 0.24, 18, 12)]):
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=r, depth=h, location=(x, y, 0.55 + h / 2), rotation=(math.radians(rx), math.radians(ry), i * 0.4))
        c = bpy.context.object
        c.name = f"crystal_{i}"
        bm = bmesh.new()
        bm.from_mesh(c.data)
        top = [f for f in bm.faces if f.normal.z > 0.9][0]
        res = bmesh.ops.extrude_discrete_faces(bm, faces=[top])
        nf = res["faces"][0]
        bmesh.ops.translate(bm, vec=(0, 0, r * 1.6), verts=nf.verts)
        bmesh.ops.scale(bm, vec=(0.05, 0.05, 1), space=Matrix.Translation(-nf.calc_center_median()), verts=nf.verts)
        bm.to_mesh(c.data)
        bm.free()
        c.data.materials.append(crys_mat)
        parts.append(c)
    for o in parts:
        apply_all_modifiers(o)
    return parts


def main():
    p = payload()
    out = Path(p["out"])
    cap = out / "capture"
    gt = out / "ground_truth"
    (cap / "images").mkdir(parents=True, exist_ok=True)
    gt.mkdir(parents=True, exist_ok=True)
    sc = reset_scene()
    W, H = p.get("width", 800), p.get("height", 600)
    setup_cycles(sc, W, H, samples=p.get("samples", 24))
    world_color(sc, (0.16, 0.17, 0.19), 0.6)
    parts = build_object(sc)
    # Fixed studio lights: the object is lit identically from every camera.
    for name, loc, energy, size in [("key", (2.5, -2.0, 3.5), 260, 2.5), ("fill", (-3.0, 1.5, 2.5), 110, 3.0), ("rim", (0.5, 3.0, 1.5), 80, 2.0)]:
        L = bpy.data.lights.new(name, "AREA")
        L.energy = energy
        L.size = size
        lo = bpy.data.objects.new(name, L)
        sc.collection.objects.link(lo)
        lo.matrix_world = Matrix(look_at_matrix(loc, (0, 0, 0.4)).tolist())
    # Ground truth mesh (world coordinates).
    Vs, Fs, off = [], [], 0
    for o in parts:
        V, F = mesh_arrays(o)
        Vs.append(V)
        Fs.append(F + off)
        off += len(V)
    V, F = np.concatenate(Vs), np.concatenate(Fs)
    write_ply(gt / "ground_truth.ply", V, F)
    # Camera rings around the object.
    target = np.array([0.0, 0.0, 0.45])
    rings = p.get("rings", [[12, 24, 0.0], [38, 24, 7.5], [66, 8, 22.5]])
    radius, lens = p.get("radius", 2.4), p.get("lens", 35.0)
    cams, ring_of = [], []
    data = bpy.data.cameras.new("cam")
    data.lens, data.sensor_width = lens, 36.0
    cam = bpy.data.objects.new("cam", data)
    sc.collection.objects.link(cam)
    idx = 0
    for ri, (elev, n, phase) in enumerate(rings):
        for k in range(n):
            az = math.radians(phase + 360.0 * k / n)
            e = math.radians(elev)
            eye = target + radius * np.array([math.cos(e) * math.cos(az), math.cos(e) * math.sin(az), math.sin(e)])
            M = look_at_matrix(eye, target)
            cam.matrix_world = Matrix(M.tolist())
            name = f"view_{idx:03d}"
            cams.append(Camera.from_blender_matrix(name, W, H, lens, 36.0, M))
            ring_of.append(ri)
            sc.camera = cam
            sc.render.filepath = str(cap / "images" / f"{name}.png")
            bpy.ops.render.render(write_still=True)
            idx += 1
    save_cameras(cap / "cameras_known.json", cams, {"rings": rings, "ring_of": ring_of})
    bpy.ops.wm.save_as_mainfile(filepath=str(gt / "ground_truth.blend"))
    ext = V.max(0) - V.min(0)
    finish(p, {"views": len(cams), "gt_vertices": len(V), "gt_triangles": len(F), "gt_extent": ext.tolist(), "gt_min": V.min(0).tolist(), "gt_max": V.max(0).tolist()})


if __name__ == "__main__":
    main()
