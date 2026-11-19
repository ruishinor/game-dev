"""Blender jobs on reconstructed meshes. Selected by payload["op"]:

unwrap   import a PLY, optionally decimate, Smart UV Project; write arrays (npz) + .blend
depth    ray-cast per-camera depth maps of a mesh (visibility for texture projection)
assemble apply a texture to an unwrapped mesh, save .blend, export GLB, render cameras
"""
from __future__ import annotations

import math
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from asset_pipeline.blender.common import add_camera, finish, payload, reset_scene, setup_cycles, world_color


def import_ply(path):
    bpy.ops.wm.ply_import(filepath=str(path))
    obj = bpy.context.selected_objects[0]
    return obj


def op_unwrap(p):
    reset_scene()
    obj = import_ply(p["mesh"])
    obj.name = p.get("name", "reconstruction")
    bpy.context.view_layer.objects.active = obj
    if p.get("decimate_faces") and len(obj.data.polygons) > p["decimate_faces"]:
        m = obj.modifiers.new("dec", "DECIMATE")
        m.ratio = p["decimate_faces"] / len(obj.data.polygons)
        bpy.ops.object.modifier_apply(modifier="dec")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(p.get("angle_limit", 60)), island_margin=p.get("island_margin", 0.004), area_weight=0.0)
    bpy.ops.object.mode_set(mode="OBJECT")
    me = obj.data
    me.calc_loop_triangles()
    V = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", V)
    V = V.reshape(-1, 3)
    F = np.empty(len(me.loop_triangles) * 3, np.int64)
    me.loop_triangles.foreach_get("vertices", F)
    L = np.empty(len(me.loop_triangles) * 3, np.int64)
    me.loop_triangles.foreach_get("loops", L)
    uv_all = np.empty(len(me.loops) * 2)
    me.uv_layers.active.data.foreach_get("uv", uv_all)
    UV = uv_all.reshape(-1, 2)[L].reshape(-1, 3, 2)
    np.savez(p["out_npz"], V=V, F=F.reshape(-1, 3), UV=UV)
    bpy.ops.wm.save_as_mainfile(filepath=p["out_blend"])
    finish(p, {"vertices": len(V), "triangles": len(F) // 3})


def op_depth(p):
    reset_scene()
    obj = import_ply(p["mesh"]) if p["mesh"].endswith(".ply") else None
    if obj is None:
        bpy.ops.wm.open_mainfile(filepath=p["mesh"])
        obj = [o for o in bpy.data.objects if o.type == "MESH"][0]
    dg = bpy.context.evaluated_depsgraph_get()
    bvh = BVHTree.FromObject(obj, dg)
    M = np.array(obj.matrix_world)
    out = Path(p["out"])
    out.mkdir(parents=True, exist_ok=True)
    s = p.get("scale", 0.5)
    for cj in p["cameras"]:
        K, R, t = np.array(cj["K"]), np.array(cj["R"]), np.array(cj["t"])
        w, h = int(cj["width"] * s), int(cj["height"] * s)
        uu, vv = np.meshgrid((np.arange(w) + 0.5) / s, (np.arange(h) + 0.5) / s)
        Cw = -R.T @ t
        if cj.get("ortho"):
            xc = (uu.ravel() - K[0, 2]) / K[0, 0]
            yc = (vv.ravel() - K[1, 2]) / K[1, 1]
            origins = (np.stack([xc, yc, np.full_like(xc, -1000.0)], 1) - t) @ R
            dirs = np.broadcast_to(R[2], origins.shape)
        else:
            rays = np.stack([(uu.ravel() - K[0, 2]) / K[0, 0], (vv.ravel() - K[1, 2]) / K[1, 1], np.ones(w * h)], 1)
            dirs = rays @ R
            dirs /= np.linalg.norm(dirs, axis=1, keepdims=True)
            origins = np.broadcast_to(Cw, dirs.shape)
        # object space ray casting (mesh imported with identity transform)
        Minv = np.linalg.inv(M)
        o_l = origins @ Minv[:3, :3].T + Minv[:3, 3]
        d_l = dirs @ Minv[:3, :3].T
        D = np.full(w * h, np.nan, np.float32)
        rc = bvh.ray_cast
        for i in range(w * h):
            hit = rc(Vector(o_l[i]), Vector(d_l[i]))
            if hit[0] is not None:
                X = M[:3, :3] @ np.array(hit[0]) + M[:3, 3]
                D[i] = (R[2] @ X) + t[2]
        np.save(out / f"{cj['name']}.npy", D.reshape(h, w))
    finish(p, {"cameras": len(p["cameras"]), "scale": s})


def textured_material(img_path, name="reprojected", roughness=0.8, unlit=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(img_path)
    tex.interpolation = "Linear"
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = roughness
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if unlit:
        em = nt.nodes.new("ShaderNodeEmission")
        nt.links.new(tex.outputs["Color"], em.inputs["Color"])
        nt.links.new(em.outputs["Emission"], nt.nodes["Material Output"].inputs["Surface"])
    return m, tex


def op_assemble(p):
    reset_scene()
    bpy.ops.wm.open_mainfile(filepath=p["blend"])
    sc = bpy.context.scene
    obj = [o for o in bpy.data.objects if o.type == "MESH"][0]
    mat, tex = textured_material(p["texture"], roughness=p.get("roughness", 0.8))
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    tex.image.pack()
    bpy.ops.wm.save_as_mainfile(filepath=p["out_blend"])
    res = {"blend": p["out_blend"]}
    if p.get("out_glb"):
        bpy.ops.export_scene.gltf(filepath=p["out_glb"], export_format="GLB", use_selection=False, export_apply=True)
        res["glb"] = p["out_glb"]
    renders = p.get("render_cameras") or []
    if renders:
        # Unlit: the texture holds captured (lit) colour, so compare it without relighting.
        em = nt_unlit(mat)
        setup_cycles(sc, renders[0]["width"], renders[0]["height"], samples=p.get("samples", 8), denoise=False, transparent=True)
        sc.view_settings.view_transform = "Standard"
        world_color(sc, (0, 0, 0), 0.0)
        out = Path(p["render_out"])
        out.mkdir(parents=True, exist_ok=True)
        for cj in renders:
            cam = add_camera(sc, cj)
            sc.camera = cam
            sc.render.filepath = str(out / f"{cj['name']}.png")
            bpy.ops.render.render(write_still=True)
        res["renders"] = len(renders)
    finish(p, res)


def nt_unlit(mat):
    nt = mat.node_tree
    tex = [n for n in nt.nodes if n.type == "TEX_IMAGE"][0]
    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(tex.outputs["Color"], em.inputs["Color"])
    nt.links.new(em.outputs["Emission"], nt.nodes["Material Output"].inputs["Surface"])
    return em


def op_export_parts(p):
    """Evaluation only: write each mesh object of a ground-truth .blend as a PLY."""
    from asset_pipeline.blender.common import mesh_arrays, write_ply

    bpy.ops.wm.open_mainfile(filepath=p["blend"])
    out = Path(p["out"])
    out.mkdir(parents=True, exist_ok=True)
    names = []
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        V, F = mesh_arrays(o)
        write_ply(out / f"{o.name}.ply", V, F)
        names.append(o.name)
    finish(p, {"parts": names})


def op_export_merged(p):
    """World-space triangles of every visible mesh object in a .blend (evaluated), as one PLY."""
    from asset_pipeline.blender.common import mesh_arrays, write_ply

    bpy.ops.wm.open_mainfile(filepath=p["blend"])
    if p.get("action"):
        arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
        if arm:
            arm.animation_data_create()
            arm.animation_data.action = bpy.data.actions[p["action"]]
            bpy.context.scene.frame_set(int(p.get("frame", 1)))
    Vs, Fs, off = [], [], 0
    for o in bpy.data.objects:
        if o.type != "MESH" or o.name.startswith("_") or o.hide_render:
            continue
        V, F = mesh_arrays(o)
        Vs.append(V)
        Fs.append(F + off)
        off += len(V)
    write_ply(p["out"], np.concatenate(Vs), np.concatenate(Fs))
    finish(p, {"vertices": off, "triangles": int(sum(len(f) for f in Fs))})


if __name__ == "__main__":
    P = payload()
    {"unwrap": op_unwrap, "depth": op_depth, "assemble": op_assemble, "export_parts": op_export_parts, "export_merged": op_export_merged}[P["op"]](P)
