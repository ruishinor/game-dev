"""Blender jobs for the imported-mechanical-humanoid workflow.

payload["op"] selects the job:

  clean     Rebuild the cleaned body: voxel-remesh the protrusion-flattened
            source surface into one manifold, decimate it with protected
            regions, unwrap a compact atlas and bake from the original source:
            base colour (missed rays keep a sentinel colour, so genuinely dark
            texels are never mistaken for misses), the same from an X-mirrored
            copy of the source (donor colour for areas a removed accessory
            covered), tangent-space normals, ambient occlusion and object-space
            position. Exports the low mesh and writes the bake images.
  blend     Import a finished GLB and save it as an editable .blend.

Coordinates: positions arrive in the glTF frame (+Y up, +Z forward) and are
converted to Blender's (x, -z, y) on import; GLB export converts back.
"""
from __future__ import annotations

import math
from pathlib import Path

import bpy
import numpy as np

from asset_pipeline.blender.common import finish, payload, reset_scene

SENTINEL = (1.0, 0.0, 1.0)


def gltf_to_blender(P):
    P = np.asarray(P, float)
    return np.stack([P[:, 0], -P[:, 2], P[:, 1]], 1)


def mesh_from_arrays(name, V, F):
    me = bpy.data.meshes.new(name)
    me.from_pydata(V.tolist(), [], F.tolist())
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def select_only(*objs, active=None):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]


def apply_modifier(ob, mod):
    select_only(ob)
    bpy.ops.object.modifier_apply(modifier=mod.name)


def new_image(name, size, color, float_buffer=False):
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=float_buffer)
    img.generated_color = (*color, 1.0)
    if float_buffer:
        img.colorspace_settings.name = "Non-Color"
    return img


def bake_target_material(ob, img, emit_position=False):
    """Give `ob` a single material whose active node is an image texture `img`."""
    mat = bpy.data.materials.new(f"_bake_{img.name}")
    mat.use_nodes = True
    nt = mat.node_tree
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    if emit_position:
        bsdf = nt.nodes["Principled BSDF"]
        nt.nodes.remove(bsdf)
        # encoded = (P + (1, 1, 0.1)) / 2, so a 16-bit PNG holds [-1,1]x[-1,1]x[-0.1,1.9] m
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        add = nt.nodes.new("ShaderNodeVectorMath")
        add.operation = "ADD"
        add.inputs[1].default_value = (1.0, 1.0, 0.1)
        mul = nt.nodes.new("ShaderNodeVectorMath")
        mul.operation = "SCALE"
        mul.inputs["Scale"].default_value = 0.5
        em = nt.nodes.new("ShaderNodeEmission")
        nt.links.new(geo.outputs["Position"], add.inputs[0])
        nt.links.new(add.outputs[0], mul.inputs[0])
        nt.links.new(mul.outputs[0], em.inputs["Color"])
        nt.links.new(em.outputs["Emission"], nt.nodes["Material Output"].inputs["Surface"])
    nt.nodes.active = tex
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    return mat


def bake(sc, kind, target, source=None, *, extrusion=0.02, ray=0.05, margin=8, samples=1, clear=True, pass_filter=None):
    sc.cycles.samples = samples
    bk = sc.render.bake
    bk.use_selected_to_active = source is not None
    bk.cage_extrusion = extrusion
    bk.max_ray_distance = ray
    bk.margin = margin
    bk.use_clear = clear
    if source is not None:
        select_only(source, target, active=target)
    else:
        select_only(target)
    kw = {"type": kind}
    if pass_filter is not None:
        kw["pass_filter"] = pass_filter
    bpy.ops.object.bake(**kw)


def save_image(img, path, fmt="PNG", depth="8"):
    img.filepath_raw = str(path)
    img.file_format = fmt
    sc = bpy.context.scene
    s = sc.render.image_settings
    s.file_format = fmt
    s.color_depth = depth
    s.color_mode = "RGB"
    img.save_render(str(path), scene=sc)


def protect_group(ob, rules):
    """Vertex group 'protect' = 1 for vertices matching any rule (Blender coords)."""
    g = ob.vertex_groups.new(name="protect")
    co = np.array([v.co[:] for v in ob.data.vertices])
    w = np.zeros(len(co))
    for r in rules:
        m = np.ones(len(co), bool)
        if "z_min" in r:
            m &= co[:, 2] >= r["z_min"]
        if "z_max" in r:
            m &= co[:, 2] <= r["z_max"]
        if "abs_x_min" in r:
            m &= np.abs(co[:, 0]) >= r["abs_x_min"]
        w = np.maximum(w, np.where(m, r.get("weight", 1.0), 0.0))
    for i in np.nonzero(w > 0)[0]:
        g.add([int(i)], float(w[i]), "REPLACE")
    return float((w > 0).mean())


def op_clean(p):
    sc = reset_scene()
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    out = Path(p["out"])
    out.mkdir(parents=True, exist_ok=True)
    # original source, untouched, as the bake source
    bpy.ops.import_scene.gltf(filepath=p["source"])
    src = next(o for o in sc.objects if o.type == "MESH")
    src.name = "source"
    bpy.ops.object.select_all(action="DESELECT")
    # X-mirrored copy of the source: donor colour for surfaces a removed accessory covered
    mir = src.copy()
    mir.data = src.data.copy()
    mir.name = "source_mirror"
    sc.collection.objects.link(mir)
    mir.scale = (-1, 1, 1)
    select_only(mir)
    bpy.ops.object.transform_apply(scale=True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.flip_normals()
    bpy.ops.object.mode_set(mode="OBJECT")
    # cleaned surface -> manifold high mesh
    V = np.load(p["clean_positions"])
    F = np.load(p["faces"])
    hi = mesh_from_arrays("clean_high", gltf_to_blender(V), F)
    rm = hi.modifiers.new("remesh", "REMESH")
    rm.mode, rm.voxel_size, rm.adaptivity = "VOXEL", p.get("voxel", 0.003), 0.0
    apply_modifier(hi, rm)
    sm = hi.modifiers.new("smooth", "SMOOTH")
    sm.factor, sm.iterations = 0.5, p.get("smooth_iterations", 4)
    apply_modifier(hi, sm)
    select_only(hi)
    bpy.ops.object.shade_smooth()
    hi_tris = sum(len(f.vertices) - 2 for f in hi.data.polygons)
    # low mesh: decimate with protected regions (ring head, hands, feet)
    lo = hi.copy()
    lo.data = hi.data.copy()
    lo.name = "body"
    sc.collection.objects.link(lo)
    # Two passes. The voxel remesh is uniform, so the protected vertex
    # fraction a is also its area fraction. For a final density D on the
    # rest and k*D on protected regions, D = target / (k*a + 1 - a): pass 1
    # collapses everything to density k*D, pass 2 only unprotected vertices.
    tris = lambda o: sum(len(f.vertices) - 2 for f in o.data.polygons)
    k = p.get("protect_density", 2.0)
    a = protect_group(lo, p["protect"])
    D = p["target_triangles"] / (k * a + 1 - a)
    d1 = lo.modifiers.new("decimate_all", "DECIMATE")
    d1.decimate_type, d1.use_collapse_triangulate = "COLLAPSE", True
    d1.ratio = min(1.0, k * D / hi_tris)
    apply_modifier(lo, d1)
    protected = a
    d2 = lo.modifiers.new("decimate_rest", "DECIMATE")
    d2.decimate_type, d2.use_collapse_triangulate = "COLLAPSE", True
    d2.vertex_group, d2.invert_vertex_group = "protect", True
    d2.ratio = 1.0 / k
    ratios = [d1.ratio, d2.ratio]
    apply_modifier(lo, d2)
    lo_tris = sum(len(f.vertices) - 2 for f in lo.data.polygons)
    # compact atlas
    select_only(lo)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(p.get("uv_angle", 60)), island_margin=p.get("uv_margin", 0.003), area_weight=0.0, scale_to_bounds=False)
    try:  # Blender 3.6+: concave packing fills the atlas far better than bounding boxes
        bpy.ops.uv.pack_islands(margin=p.get("uv_margin", 0.003), rotate=True, shape_method="CONCAVE")
    except TypeError:
        bpy.ops.uv.pack_islands(margin=p.get("uv_margin", 0.003), rotate=True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.shade_smooth()
    size = p.get("texture", 2048)
    written = {}
    # 1) base colour from the source (sentinel marks misses)
    col = new_image("color", size, SENTINEL)
    bake_target_material(lo, col)
    bake(sc, "DIFFUSE", lo, src, extrusion=p.get("cage", 0.03), ray=p.get("ray", 0.08), clear=False, pass_filter={"COLOR"})
    save_image(col, out / "bake_color.png")
    written["color"] = "bake_color.png"
    # 2) donor colour from the mirrored source
    dcol = new_image("donor", size, SENTINEL)
    bake_target_material(lo, dcol)
    bake(sc, "DIFFUSE", lo, mir, extrusion=p.get("cage", 0.03), ray=p.get("ray", 0.08), clear=False, pass_filter={"COLOR"})
    save_image(dcol, out / "bake_donor.png")
    written["donor"] = "bake_donor.png"
    # 3) tangent-space normals from the cleaned high mesh
    nrm = new_image("normal", size, (0.5, 0.5, 1.0))
    nrm.colorspace_settings.name = "Non-Color"
    bake_target_material(lo, nrm)
    bake(sc, "NORMAL", lo, hi, extrusion=0.01, ray=0.03)
    save_image(nrm, out / "bake_normal.png")
    written["normal"] = "bake_normal.png"
    # 4) ambient occlusion of the low mesh (for partial removal of baked-in cavity shading)
    ao = new_image("ao", size, (1, 1, 1))
    ao.colorspace_settings.name = "Non-Color"
    bake_target_material(lo, ao)
    sc.world = sc.world or bpy.data.worlds.new("w")
    for o in (src, mir, hi):  # coincident surfaces would occlude everything
        o.hide_render = True
    bake(sc, "AO", lo, None, samples=p.get("ao_samples", 32))
    for o in (src, mir, hi):
        o.hide_render = False
    save_image(ao, out / "bake_ao.png")
    written["ao"] = "bake_ao.png"
    # 5) object-space position (glTF frame recovered in Python) for UV-space region masks
    pos = new_image("position", size, (0, 0, 0), float_buffer=True)
    bake_target_material(lo, pos, emit_position=True)
    bake(sc, "EMIT", lo, None, margin=8)
    save_image(pos, out / "bake_position.png", depth="16")
    written["position"] = "bake_position.png"
    # export the low mesh (geometry + UV only)
    lo.data.materials.clear()
    for o in (src, mir, hi):
        o.hide_set(True)
    select_only(lo)
    bpy.ops.export_scene.gltf(filepath=str(out / "body_low.glb"), export_format="GLB", use_selection=True,
                              export_materials="NONE", export_normals=True, export_texcoords=True, export_apply=True)
    # keep the cleaned high mesh too (normal-bake source; evidence renders)
    hi.hide_set(False)
    select_only(hi)
    bpy.ops.export_scene.gltf(filepath=str(out / "body_high.glb"), export_format="GLB", use_selection=True,
                              export_materials="NONE", export_normals=True, export_texcoords=False, export_apply=True)
    finish(p, {"high_triangles": hi_tris, "low_triangles": lo_tris, "protected_fraction": protected,
               "decimate_ratios": ratios, "texture": size, "images": written,
               "low": "body_low.glb", "high": "body_high.glb"})


def op_blend(p):
    reset_scene()
    for f in p["imports"]:
        bpy.ops.import_scene.gltf(filepath=f)
    for name, objs in p.get("collections", {}).items():
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
        for o in list(bpy.context.scene.objects):
            if any(o.name.startswith(n) for n in objs):
                for c in o.users_collection:
                    c.objects.unlink(o)
                col.objects.link(o)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=p["out"], compress=True)
    finish(p, {"blend": p["out"], "objects": sorted(o.name for o in bpy.context.scene.objects)})


def main():
    p = payload()
    {"clean": op_clean, "blend": op_blend}[p["op"]](p)


if __name__ == "__main__":
    main()
