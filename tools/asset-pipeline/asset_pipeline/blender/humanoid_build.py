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


# ---------------------------------------------------------------- wardrobe

MATERIALS = {
    # name: base colour, worn-edge colour, metallic, roughness, noise scale, weave
    "bronze_plate": ((0.40, 0.26, 0.13), (0.72, 0.55, 0.33), 0.85, 0.36, 18.0, False),
    "ceramic_plate": ((0.76, 0.70, 0.59), (0.84, 0.78, 0.69), 0.04, 0.63, 23.0, False),
    "graphite_plate": ((0.085, 0.09, 0.095), (0.40, 0.40, 0.41), 0.70, 0.44, 22.0, False),
    "ebony_plate": ((0.035, 0.032, 0.030), (0.18, 0.14, 0.095), 0.72, 0.38, 25.0, False),
    "leather": ((0.17, 0.11, 0.07), (0.30, 0.21, 0.14), 0.0, 0.62, 40.0, False),
    "brass": ((0.70, 0.52, 0.25), (0.86, 0.72, 0.45), 1.0, 0.28, 30.0, False),
    "ochre_trim": ((0.62, 0.42, 0.12), (0.80, 0.62, 0.30), 0.45, 0.42, 30.0, False),
    "stave": ((0.16, 0.13, 0.10), (0.55, 0.42, 0.26), 0.75, 0.40, 25.0, False),
    "navy_cloth": ((0.075, 0.09, 0.19), (0.16, 0.18, 0.30), 0.0, 0.92, 14.0, True),
    "olive_plate": ((0.25, 0.28, 0.13), (0.52, 0.49, 0.40), 0.18, 0.55, 18.0, False),
    "sash_blue": ((0.035, 0.11, 0.42), (0.12, 0.24, 0.58), 0.0, 0.86, 14.0, True),
}


def procedural_material(name):
    """Principled material with noise mottling, convex-edge wear and cavity
    darkening; returns (material, {"base","rough","metal"} output sockets)."""
    spec = MATERIALS[name]
    base, worn, metal, rough, scale, weave = spec[:6]
    emission = spec[6] if len(spec) > 6 and spec[6] else None  # (r, g, b, strength) or None
    mottle_k = spec[7] if len(spec) > 7 else 0.35
    wear_k = spec[8] if len(spec) > 8 else 1.0
    m = bpy.data.materials.new("wd_" + name)
    m.use_nodes = True
    nt = m.node_tree
    N = nt.nodes.new
    L = nt.links.new
    bsdf = nt.nodes["Principled BSDF"]
    tc = N("ShaderNodeTexCoord")
    noise = N("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 6.0
    L(tc.outputs["Object"], noise.inputs["Vector"])
    geo = N("ShaderNodeNewGeometry")
    edge = N("ShaderNodeMapRange")  # pointiness -> convex edge mask
    edge.inputs["From Min"].default_value = 0.52
    edge.inputs["From Max"].default_value = 0.6
    L(geo.outputs["Pointiness"], edge.inputs["Value"])
    wear = N("ShaderNodeMath")
    wear.operation = "MULTIPLY"
    L(edge.outputs["Result"], wear.inputs[0])
    L(noise.outputs["Fac"], wear.inputs[1])
    mix = N("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs["A"].default_value = (*base, 1)
    mix.inputs["B"].default_value = (*worn, 1)
    wear_amt = N("ShaderNodeMath")
    wear_amt.operation = "MULTIPLY"
    wear_amt.inputs[1].default_value = wear_k
    L(wear.outputs[0], wear_amt.inputs[0])
    L(wear_amt.outputs[0], mix.inputs["Factor"])
    mottle = N("ShaderNodeMix")
    mottle.data_type = "RGBA"
    mottle.blend_type = "MULTIPLY"
    mottle.inputs["Factor"].default_value = mottle_k
    L(mix.outputs["Result"], mottle.inputs["A"])
    L(noise.outputs["Color"], mottle.inputs["B"])
    ao = N("ShaderNodeAmbientOcclusion")
    ao.inputs["Distance"].default_value = 0.03
    cav = N("ShaderNodeMix")
    cav.data_type = "RGBA"
    cav.blend_type = "MULTIPLY"
    cav.inputs["Factor"].default_value = 0.6
    L(mottle.outputs["Result"], cav.inputs["A"])
    L(ao.outputs["AO"], cav.inputs["B"])
    base_out = cav.outputs["Result"]
    rr = N("ShaderNodeMapRange")
    rr.inputs["To Min"].default_value = rough - 0.1
    rr.inputs["To Max"].default_value = rough + 0.12
    L(noise.outputs["Fac"], rr.inputs["Value"])
    rough_out = rr.outputs["Result"]
    mv = N("ShaderNodeValue")
    mv.outputs[0].default_value = metal
    metal_out = mv.outputs[0]
    if weave:
        wv = N("ShaderNodeTexWave")
        wv.inputs["Scale"].default_value = 260.0
        wv.inputs["Distortion"].default_value = 1.5
        L(tc.outputs["Object"], wv.inputs["Vector"])
        bump = N("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.25
        L(wv.outputs["Fac"], bump.inputs["Height"])
        L(bump.outputs["Normal"], bsdf.inputs["Normal"])
    else:
        bump = N("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.08
        L(noise.outputs["Fac"], bump.inputs["Height"])
        L(bump.outputs["Normal"], bsdf.inputs["Normal"])
    L(base_out, bsdf.inputs["Base Color"])
    L(rough_out, bsdf.inputs["Roughness"])
    L(metal_out, bsdf.inputs["Metallic"])
    ec = N("ShaderNodeRGB")  # emission colour as a bakeable socket (black when none)
    ec.outputs[0].default_value = (*(emission[:3] if emission else (0.0, 0.0, 0.0)), 1)
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission[:3], 1)
        bsdf.inputs["Emission Strength"].default_value = emission[3]
    return m, {"base": base_out, "rough": rough_out, "metal": metal_out, "emit": ec.outputs[0], "emissive": bool(emission)}


def mesh_arrays(ob):
    """Triangulated evaluated mesh -> glTF-frame arrays with per-corner UV/normal splits."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    me.calc_loop_triangles()
    uvl = me.uv_layers.active.data
    co = np.array([v.co[:] for v in me.vertices])
    M = np.array(ob.matrix_world)
    co = co @ M[:3, :3].T + M[:3, 3]
    try:
        corner_n = np.array([cn.vector[:] for cn in me.corner_normals])
    except AttributeError:  # Blender < 4.1
        me.calc_normals_split()
        corner_n = np.array([l.normal[:] for l in me.loops])
    key, out_p, out_n, out_uv, idx = {}, [], [], [], []
    for tri in me.loop_triangles:
        for li in tri.loops:
            vi = me.loops[li].vertex_index
            uv = uvl[li].uv
            n = corner_n[li]
            k = (vi, round(uv[0], 5), round(uv[1], 5), round(n[0], 3), round(n[1], 3), round(n[2], 3))
            if k not in key:
                key[k] = len(out_p)
                out_p.append(co[vi])
                out_n.append(n)
                out_uv.append((uv[0], 1 - uv[1]))
            idx.append(key[k])
    ev.to_mesh_clear()
    P = np.array(out_p)
    Nn = np.array(out_n) @ M[:3, :3].T
    to_gltf = lambda A: np.stack([A[:, 0], A[:, 2], -A[:, 1]], 1)
    return to_gltf(P), to_gltf(Nn), np.array(out_uv), np.array(idx).reshape(-1, 3)


def op_wardrobe(p):
    """Thickness, bevels and materials for designed pieces; one baked atlas per set."""
    import json as _json

    sc = reset_scene()
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    out = Path(p["out"])
    out.mkdir(parents=True, exist_ok=True)
    meta = _json.loads(Path(p["pieces_json"]).read_text())
    for k, v in p.get("materials", {}).items():  # route-specific palettes
        MATERIALS[k] = tuple(tuple(x) if isinstance(x, list) else x for x in v)
    data = np.load(p["pieces_npz"])
    mats = {}
    sets = {}
    for pc in meta:
        V = gltf_to_blender(data[pc["name"] + "_V"])
        F = data[pc["name"] + "_F"]
        ob = mesh_from_arrays(pc["name"], V, F)
        # orient normals away from the body axis
        select_only(ob)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.remove_doubles(threshold=1e-5)
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode="OBJECT")
        cen = np.array(pc.get("axis", [0, 0, 1.2]))
        cen_b = gltf_to_blender(cen[None])[0]
        nrm = np.array([pl.normal[:] for pl in ob.data.polygons])
        ctr = np.array([pl.center[:] for pl in ob.data.polygons])
        rel = ctr - cen_b
        if not pc.get("axis3d"):
            rel[:, 2] = 0
        if np.mean(np.sum(nrm * rel, 1)) < 0 and pc.get("thickness"):
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.flip_normals()
            bpy.ops.object.mode_set(mode="OBJECT")
        if pc.get("subdivide"):
            sd = ob.modifiers.new("subd", "SUBSURF")
            sd.levels = sd.render_levels = 1
        if pc.get("thickness"):
            so = ob.modifiers.new("solid", "SOLIDIFY")
            so.thickness = pc["thickness"]
            so.offset = 1.0
            so.use_even_offset = pc.get("even", True)
        if pc.get("bevel"):
            bv = ob.modifiers.new("bevel", "BEVEL")
            bv.width = pc["bevel"]
            bv.segments = 2
            bv.limit_method = "ANGLE"
        select_only(ob)
        bpy.ops.object.shade_smooth()
        if hasattr(ob.data, "use_auto_smooth"):
            ob.data.use_auto_smooth = True
        for mod in list(ob.modifiers):
            apply_modifier(ob, mod)
        try:
            bpy.ops.object.shade_auto_smooth(angle=math.radians(40))
        except Exception:
            pass
        mk = pc["mat"]
        if mk not in mats:
            mats[mk] = procedural_material(mk)
        ob.data.materials.append(mats[mk][0])
        sets.setdefault(pc["set"], []).append(ob)
    report = {"sets": {}}
    size = p.get("texture", 1024)
    for set_name, objs in sets.items():
        select_only(*objs)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=0.004, scale_to_bounds=False)
        try:
            bpy.ops.uv.pack_islands(margin=0.004, rotate=True, shape_method="CONCAVE")
        except TypeError:
            bpy.ops.uv.pack_islands(margin=0.004, rotate=True)
        bpy.ops.object.mode_set(mode="OBJECT")
        used = {o.data.materials[0].name for o in objs}
        set_mats = [mm for mm in mats.values() if mm[0].name in used]
        images = {}
        for kind, colorspace, socket in (("basecolor", "sRGB", "base"), ("roughness", "Non-Color", "rough"), ("metallic", "Non-Color", "metal")):
            img = bpy.data.images.new(f"{set_name}_{kind}", size, size, alpha=False)
            img.colorspace_settings.name = colorspace
            for mat, socks in set_mats:
                nt = mat.node_tree
                out_node = nt.nodes["Material Output"]
                em = nt.nodes.get("_bake_emit") or nt.nodes.new("ShaderNodeEmission")
                em.name = "_bake_emit"
                nt.links.new(socks[socket], em.inputs["Color"])
                nt.links.new(em.outputs["Emission"], out_node.inputs["Surface"])
                tex = nt.nodes.get("_bake_tex") or nt.nodes.new("ShaderNodeTexImage")
                tex.name = "_bake_tex"
                tex.image = img
                nt.nodes.active = tex
            sc.cycles.samples = 1
            sc.render.bake.use_selected_to_active = False
            sc.render.bake.margin = 6
            sc.render.bake.use_clear = True
            select_only(*objs)
            bpy.ops.object.bake(type="EMIT")
            save_image(img, out / f"{set_name}_{kind}.png")
            images[kind] = f"{set_name}_{kind}.png"
        if any(socks["emissive"] for _, socks in set_mats):
            img = bpy.data.images.new(f"{set_name}_emissive", size, size, alpha=False)
            for mat, socks in set_mats:
                nt = mat.node_tree
                em = nt.nodes["_bake_emit"]
                nt.links.new(socks["emit"], em.inputs["Color"])
                nt.nodes["_bake_tex"].image = img
                nt.nodes.active = nt.nodes["_bake_tex"]
            select_only(*objs)
            bpy.ops.object.bake(type="EMIT")
            save_image(img, out / f"{set_name}_emissive.png")
            images["emissive"] = f"{set_name}_emissive.png"
        for mat, socks in set_mats:  # restore the shader for the normal bake
            nt = mat.node_tree
            nt.links.new(nt.nodes["Principled BSDF"].outputs["BSDF"], nt.nodes["Material Output"].inputs["Surface"])
        nimg = bpy.data.images.new(f"{set_name}_normal", size, size, alpha=False)
        nimg.colorspace_settings.name = "Non-Color"
        for mat, _ in set_mats:
            mat.node_tree.nodes["_bake_tex"].image = nimg
            mat.node_tree.nodes.active = mat.node_tree.nodes["_bake_tex"]
        sc.cycles.samples = 4
        select_only(*objs)
        sc.render.bake.use_selected_to_active = False
        bpy.ops.object.bake(type="NORMAL")
        save_image(nimg, out / f"{set_name}_normal.png")
        images["normal"] = f"{set_name}_normal.png"
        arrays = {}
        tris = 0
        for o in objs:
            Pp, Nn, UV, I = mesh_arrays(o)
            arrays[o.name + "_P"], arrays[o.name + "_N"], arrays[o.name + "_UV"], arrays[o.name + "_I"] = Pp, Nn, UV, I
            tris += len(I)
        np.savez_compressed(out / f"{set_name}_pieces.npz", **arrays)
        report["sets"][set_name] = {"pieces": [o.name for o in objs], "triangles": tris, "images": images, "npz": f"{set_name}_pieces.npz"}
    blend_name = p.get("blend_name", "wardrobe_source.blend")
    bpy.ops.wm.save_as_mainfile(filepath=str(out / blend_name), compress=True)
    report["blend"] = blend_name
    finish(p, report)


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
    {"clean": op_clean, "wardrobe": op_wardrobe, "blend": op_blend}[p["op"]](p)


if __name__ == "__main__":
    main()
