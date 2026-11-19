"""Turn an authored multi-part creature .blend into a rigged, animated, baked runtime asset.

Steps (one Blender process):
  1. selective reduction per part class (silhouette-defining parts keep their geometry)
  2. armature: root, body, <leg>_upper, <leg>_lower per leg (legs read from the build)
  3. rigid skinning: each part follows exactly one bone (stone never stretches)
  4. one UV atlas; bake base colour, roughness and normal from the node materials
  5. gait clips authored with IK constraints driven by a foot-placement solver, then
     baked to plain keyframes (constraints removed) so any glTF runtime can play them
  6. save the rigged .blend and export GLB

Clips are in place: the runtime moves the entity. Each locomotion clip records the
ground speed (m/s) or turn rate (deg/s) at which its planted feet do not slide.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

from asset_pipeline.blender.common import finish, payload

FPS = 30
ASSET_ID = "creature"


# ----------------------------------------------------------------------------- 1-3 geometry, rig, skin
def reduce_parts(objs, ratios):
    for o in objs:
        r = ratios.get(o.get("part_class", ""), ratios.get("*", 1.0))
        if r < 1.0 and len(o.data.polygons) > 40:
            m = o.modifiers.new("dec", "DECIMATE")
            m.ratio = r
            m.use_collapse_triangulate = True
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.modifier_apply(modifier="dec")


def build_armature(legs, body_z):
    arm_data = bpy.data.armatures.new("rig")
    arm = bpy.data.objects.new("rig", arm_data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones
    root = eb.new("root")
    root.head, root.tail = (0, 0, 0), (0, -0.4, 0)
    body = eb.new("body")
    body.head, body.tail = (0, 0, body_z), (0, -0.5, body_z)
    body.parent = root
    for lg in legs:
        hip, knee, foot = (Vector(lg[k]) for k in ("hip", "knee", "foot"))
        up = eb.new(f"leg_{lg['name']}_upper")
        up.head, up.tail = hip, knee
        up.parent = body
        lo = eb.new(f"leg_{lg['name']}_lower")
        lo.head, lo.tail = knee, foot
        lo.parent = up
        lo.use_connect = True
        # roll so the local X axis is the knee hinge (horizontal, perpendicular to the leg plane)
        for b in (up, lo):
            d = (b.tail - b.head).normalized()
            hinge = d.cross(Vector((0, 0, 1))).normalized()
            b.align_roll(hinge.cross(d))
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def join_and_skin(objs, arm):
    for o in objs:
        vg = o.vertex_groups.new(name=o["bone"])
        vg.add(list(range(len(o.data.vertices))), 1.0, "REPLACE")
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    body = bpy.context.view_layer.objects.active
    body.name = f"{ASSET_ID}_mesh"
    mod = body.modifiers.new("rig", "ARMATURE")
    mod.object = arm
    body.parent = arm
    return body


# ----------------------------------------------------------------------------- 4 bake
def fill_bake_misses(obj, high, imgs, out_dir, margin):
    """Selected-to-active rays that find no high-res surface leave black texels
    (where reduction moved the surface further than the ray distance). Bake the
    reduced mesh's own materials directly (no rays, so no misses) and use that
    wherever the detailed bake missed."""
    import cv2

    high.select_set(False)
    bpy.context.view_layer.objects.active = obj
    for kind, btype, extra in [("basecolor", "DIFFUSE", {"pass_filter": {"COLOR"}}), ("roughness", "ROUGHNESS", {}), ("normal", "NORMAL", {"normal_space": "TANGENT"})]:
        for m in obj.data.materials:
            m.node_tree.nodes.active = m.node_tree.nodes[f"_bake_{kind}"]
        bpy.ops.object.bake(type=btype, uv_layer="atlas", use_clear=True, margin=margin, **extra)
        imgs[kind].filepath_raw = str(Path(out_dir) / f"{kind}_fallback.png")
        imgs[kind].save()
    det = cv2.imread(str(Path(out_dir) / "basecolor.png"))
    fb = cv2.imread(str(Path(out_dir) / "basecolor_fallback.png"))
    covered = fb.max(axis=2) > 0
    miss = (det.max(axis=2) <= 2) & covered
    miss = cv2.dilate(miss.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    miss &= covered
    for kind in imgs:
        d = cv2.imread(str(Path(out_dir) / f"{kind}.png"), cv2.IMREAD_UNCHANGED)
        f = cv2.imread(str(Path(out_dir) / f"{kind}_fallback.png"), cv2.IMREAD_UNCHANGED)
        d[miss] = f[miss]
        cv2.imwrite(str(Path(out_dir) / f"{kind}.png"), d)
        imgs[kind].filepath_raw = str(Path(out_dir) / f"{kind}.png")
        imgs[kind].source = "FILE"
        imgs[kind].filepath = str(Path(out_dir) / f"{kind}.png")
        imgs[kind].reload()
    return {"missed_texels_filled": int(miss.sum()), "missed_fraction_of_covered": float(miss.sum() / max(covered.sum(), 1))}


def bake_atlas(obj, size, out_dir, margin=8, high=None, cage=0.012):
    """Bake colour/roughness/normal into one atlas. With `high`, detail is baked from the
    full-resolution source parts onto the reduced mesh (selected-to-active)."""
    me = obj.data
    atlas = me.uv_layers.new(name="atlas")
    me.uv_layers.active = atlas
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(80), island_margin=0.002, area_weight=0.0)
    bpy.ops.uv.pack_islands(rotate=True, margin=0.0015, shape_method="CONCAVE")
    bpy.ops.object.mode_set(mode="OBJECT")
    if high is not None:
        high.select_set(True)
        bpy.context.view_layer.objects.active = obj
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 4
    sc.render.bake.margin = margin
    imgs = {}
    for kind, cs in [("basecolor", "sRGB"), ("roughness", "Non-Color"), ("normal", "Non-Color")]:
        img = bpy.data.images.new(f"{obj.name}_{kind}", size, size, alpha=False, float_buffer=False)
        img.colorspace_settings.name = cs
        imgs[kind] = img
    # every material gets an (inactive-for-shading) image node: the bake target
    for m in me.materials:
        nt = m.node_tree
        for kind, img in imgs.items():
            n = nt.nodes.new("ShaderNodeTexImage")
            n.name = f"_bake_{kind}"
            n.image = img
    for kind, btype, extra in [("basecolor", "DIFFUSE", {"pass_filter": {"COLOR"}}), ("roughness", "ROUGHNESS", {}), ("normal", "NORMAL", {"normal_space": "TANGENT"})]:
        for m in me.materials:
            m.node_tree.nodes.active = m.node_tree.nodes[f"_bake_{kind}"]
        if high is not None:
            extra = dict(extra, use_selected_to_active=True, cage_extrusion=cage, max_ray_distance=cage * 2.5)
        bpy.ops.object.bake(type=btype, uv_layer="atlas", use_clear=True, margin=margin, **extra)
        p = Path(out_dir) / f"{kind}.png"
        imgs[kind].filepath_raw = str(p)
        imgs[kind].file_format = "PNG"
        imgs[kind].save()
    fill = {}
    if high is not None:
        fill = fill_bake_misses(obj, high, imgs, out_dir, margin)
    # replace all materials with one baked PBR material (one draw call)
    mat = bpy.data.materials.new(f"{ASSET_ID}_baked")
    mat.use_nodes = True
    nt = mat.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Metallic"].default_value = 0.0
    uv = nt.nodes.new("ShaderNodeUVMap")
    uv.uv_map = "atlas"
    tex = {}
    for kind, img in imgs.items():
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = img
        nt.links.new(uv.outputs["UV"], n.inputs["Vector"])
        tex[kind] = n
    nt.links.new(tex["basecolor"].outputs["Color"], b.inputs["Base Color"])
    nt.links.new(tex["roughness"].outputs["Color"], b.inputs["Roughness"])
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.uv_map = "atlas"
    nt.links.new(tex["normal"].outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    me.materials.clear()
    me.materials.append(mat)
    # keep only the atlas UV for export
    for layer in list(me.uv_layers):
        if layer.name != "atlas":
            me.uv_layers.remove(layer)
    return {**{k: str(Path(out_dir) / f"{k}.png") for k in imgs}, "bake_fill": fill}


# ----------------------------------------------------------------------------- 5 gait
def smoothstep(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def gait(legs, duration, speed_fn, yaw_rate_fn, order, duty=0.78, cycle=2.2, lift=0.16, bob=0.0, sway=0.0, shift=None, breathe=0.012, warmup=0.0):
    """Simulate foot targets (root space) and body offsets per frame.

    Stance feet stay fixed on the ground in world space: in root space they
    move by -(v + w x r) dt. Swing feet travel in an arc to a landing point
    ahead of their rest position by half a stance stride. With v = w = 0 the
    clip is a planted idle.
    """
    skip = int(round(warmup * FPS))  # simulate from rest, keep only the steady-state part
    n = int(round(duration * FPS)) + 1 + skip
    rest = {lg["name"]: np.array(lg["foot"][:2]) for lg in legs}
    pos = {k: v.copy() for k, v in rest.items()}
    phase_off = {name: i / len(order) for i, name in enumerate(order)}
    frames = []
    swing_from = {}
    for f in range(n):
        t = f / FPS
        v = speed_fn(t)
        w = math.radians(yaw_rate_fn(t))
        moving = abs(v) > 1e-4 or abs(w) > 1e-4
        feet = {}
        dt = 1.0 / FPS
        for name in order:
            ph = (t / cycle + phase_off[name]) % 1.0
            in_swing = moving and ph >= duty
            r = pos[name]
            if not in_swing:
                swing_from.pop(name, None)
                # planted: counter the body's motion (root moves forward = -Y)
                vel = np.array([0.0, v]) + w * np.array([r[1], -r[0]])
                pos[name] = r + vel * dt if f else r
                feet[name] = (pos[name][0], pos[name][1], 0.0)
            else:
                s = (ph - duty) / (1 - duty)
                if name not in swing_from:
                    swing_from[name] = pos[name].copy()
                stride_ahead = np.array([0.0, -v * cycle * duty / 2]) + w * cycle * duty / 2 * np.array([-rest[name][1], rest[name][0]])
                target = rest[name] + stride_ahead
                p = swing_from[name] + (target - swing_from[name]) * smoothstep(s)
                pos[name] = p
                feet[name] = (p[0], p[1], lift * math.sin(math.pi * s))
        swinging = [nm for nm in order if feet[nm][2] > 1e-4]
        body = np.zeros(3)
        body[2] = breathe * math.sin(2 * math.pi * t / 4.0) - bob * (1 - math.cos(4 * math.pi * t / cycle)) * 0.5
        if swinging and sway:  # lean away from the lifted foot (support polygon)
            away = -np.array(rest[swinging[0]]) / np.linalg.norm(rest[swinging[0]])
            body[:2] += away * sway
        if shift:
            body[:2] += np.array(shift["axis"]) * shift["amp"] * math.sin(2 * math.pi * t / shift["period"])
            body[2] -= shift.get("dip", 0.02) * abs(math.sin(2 * math.pi * t / shift["period"]))
        if f >= skip:
            frames.append({"feet": feet, "body": body.tolist()})
    return frames


def author_clip(arm, legs, name, frames):
    """Drive IK targets per frame, then bake visual pose to a plain action."""
    sc = bpy.context.scene
    tgts = {lg["name"]: bpy.data.objects[f"_ik_{lg['name']}"] for lg in legs}
    body_pb = arm.pose.bones["body"]
    act = bpy.data.actions.new(name + "_drive")
    arm.animation_data_create()
    for o in tgts.values():
        o.animation_data_create()
        o.animation_data.action = None
    for f, fr in enumerate(frames, start=1):
        sc.frame_set(f)
        body_pb.matrix = Matrix.Translation(Vector(fr["body"])) @ body_pb.bone.matrix_local
        bpy.context.view_layer.update()
        body_pb.keyframe_insert("location", frame=f)
        for nm, p in fr["feet"].items():
            tgts[nm].location = Vector(p)
            tgts[nm].keyframe_insert("location", frame=f)
    sc.frame_start, sc.frame_end = 1, len(frames)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.nla.bake(frame_start=1, frame_end=len(frames), only_selected=True, visual_keying=True, clear_constraints=False, use_current_action=False,
                     bake_types={"POSE"})
    bpy.ops.object.mode_set(mode="OBJECT")
    baked = arm.animation_data.action
    baked.name = name
    baked.use_fake_user = True
    # clear the driving keys so the next clip starts clean
    for o in tgts.values():
        o.animation_data.action = None
    arm.animation_data.action = None
    body_pb.location = (0, 0, 0)
    bpy.data.actions.remove(act)
    return baked


def setup_ik(arm, legs):
    for lg in legs:
        t = bpy.data.objects.new(f"_ik_{lg['name']}", None)
        bpy.context.scene.collection.objects.link(t)
        t.location = lg["foot"]
        pole = bpy.data.objects.new(f"_pole_{lg['name']}", None)
        bpy.context.scene.collection.objects.link(pole)
        hip, knee = np.array(lg["hip"]), np.array(lg["knee"])
        out = knee - hip
        out[2] = 0
        out /= np.linalg.norm(out)
        pole.location = tuple(knee + out * 1.0 + np.array([0, 0, 0.6]))
        pole.parent = arm
        c = arm.pose.bones[f"leg_{lg['name']}_lower"].constraints.new("IK")
        c.target = t
        c.pole_target = pole
        c.pole_angle = 0.0
        c.chain_count = 2
        c.use_tail = True
    # pole angle: pick the value that keeps the rest pose unchanged
    bpy.context.view_layer.update()


def calibrate_pole_angles(arm, legs):
    """Choose each IK pole angle so the solved rest pose matches the authored rest pose."""
    for lg in legs:
        pb = arm.pose.bones[f"leg_{lg['name']}_upper"]
        c = arm.pose.bones[f"leg_{lg['name']}_lower"].constraints["IK"]
        rest_knee = Vector(lg["knee"])
        best = None
        for a in range(-180, 181, 5):
            c.pole_angle = math.radians(a)
            bpy.context.view_layer.update()
            err = ((arm.matrix_world @ pb.tail) - rest_knee).length
            if best is None or err < best[0]:
                best = (err, a)
        for a in np.arange(best[1] - 5, best[1] + 5.01, 0.5):
            c.pole_angle = math.radians(a)
            bpy.context.view_layer.update()
            err = ((arm.matrix_world @ pb.tail) - rest_knee).length
            if err < best[0]:
                best = (err, a)
        c.pole_angle = math.radians(best[1])
        lg["pole_angle_deg"] = float(best[1])
        lg["pole_rest_error_m"] = float(best[0])
    bpy.context.view_layer.update()


# ----------------------------------------------------------------------------- main
def main():
    p = payload()
    bpy.ops.wm.open_mainfile(filepath=p["blend"])
    sc = bpy.context.scene
    sc.render.fps = FPS
    global ASSET_ID
    ASSET_ID = p.get("asset_id", "creature")
    legs = json.loads(sc["creature_legs"])
    objs = [o for o in sc.objects if o.type == "MESH"]
    tris0 = sum(len(o.data.polygons) for o in objs)
    # full-resolution copy of every part: the bake source for detail lost by reduction
    hi_parts = []
    for o in objs:
        c = o.copy()
        c.data = o.data.copy()
        sc.collection.objects.link(c)
        hi_parts.append(c)
    bpy.ops.object.select_all(action="DESELECT")
    for c in hi_parts:
        c.select_set(True)
    bpy.context.view_layer.objects.active = hi_parts[0]
    bpy.ops.object.join()
    high = bpy.context.view_layer.objects.active
    high.name = "_bake_high"
    reduce_parts(objs, p["reduce"])
    for o in objs:
        o.data.calc_loop_triangles()
    tris1 = sum(len(o.data.loop_triangles) for o in objs)
    body_z = float(np.mean([lg["hip"][2] for lg in legs]))
    arm = build_armature(legs, body_z)
    mesh = join_and_skin(objs, arm)
    # triangulate before unwrapping/baking: exported MikkTSpace tangents must match the bake's
    import bmesh

    bm = bmesh.new()
    bm.from_mesh(mesh.data)
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method="BEAUTY", ngon_method="BEAUTY")
    bm.to_mesh(mesh.data)
    bm.free()
    mesh.data.name = mesh.name
    out = Path(p["out"])
    out.mkdir(parents=True, exist_ok=True)
    maps = bake_atlas(mesh, p["texture_size"], out, high=high)
    bpy.data.objects.remove(high)
    setup_ik(arm, legs)
    calibrate_pole_angles(arm, legs)
    order = p.get("gait_order", ["BL", "FL", "BR", "FR"])
    G = p["gait"]
    v, cyc = G["walk_speed"], G["cycle_s"]
    ramp = G.get("ramp_s", 1.2)
    clips = {
        "Idle": gait(legs, 4.0, lambda t: 0.0, lambda t: 0.0, order, breathe=0.014),
        "WeightShift": gait(legs, 4.0, lambda t: 0.0, lambda t: 0.0, order, breathe=0.008, shift={"axis": [1, 0.25], "amp": 0.07, "period": 4.0, "dip": 0.025}),
        "Walk": gait(legs, cyc, lambda t: v, lambda t: 0.0, order, cycle=cyc, bob=0.03, sway=0.05, lift=G["lift"], warmup=2 * cyc),
        "WalkStart": gait(legs, cyc, lambda t: v * smoothstep(t / ramp), lambda t: 0.0, order, cycle=cyc, bob=0.03, sway=0.05, lift=G["lift"]),
        "WalkStop": gait(legs, cyc, lambda t: v * (1 - smoothstep(t / ramp)), lambda t: 0.0, order, cycle=cyc, bob=0.03, sway=0.05, lift=G["lift"]),
        "Turn": gait(legs, cyc, lambda t: 0.0, lambda t: G["turn_deg_s"], order, cycle=cyc, bob=0.02, sway=0.04, lift=G["lift"] * 0.8, warmup=2 * cyc),
    }
    meta = {}
    for name, frames in clips.items():
        author_clip(arm, legs, name, frames)
        meta[name] = {"frames": len(frames), "seconds": (len(frames) - 1) / FPS, "loop": name in ("Idle", "WeightShift", "Walk", "Turn")}
    meta["Walk"]["ground_speed_m_s"] = v
    meta["WalkStart"]["ground_speed_m_s"] = f"0 -> {v}"
    meta["WalkStop"]["ground_speed_m_s"] = f"{v} -> 0"
    meta["WalkStart"]["speed_samples"] = [round(v * smoothstep(f / FPS / ramp), 5) for f in range(meta["WalkStart"]["frames"])]
    meta["WalkStop"]["speed_samples"] = [round(v * (1 - smoothstep(f / FPS / ramp)), 5) for f in range(meta["WalkStop"]["frames"])]
    meta["Turn"]["turn_rate_deg_s"] = G["turn_deg_s"]
    # remove IK rig helpers; keep plain FK keyframes only
    for pb in arm.pose.bones:
        for c in list(pb.constraints):
            pb.constraints.remove(c)
    for o in [o for o in sc.objects if o.name.startswith(("_ik_", "_pole_"))]:
        bpy.data.objects.remove(o)
    # one NLA strip per clip so the exporter writes each as a named animation
    arm.animation_data_create()
    for name in clips:
        tr = arm.animation_data.nla_tracks.new()
        tr.name = name
        tr.strips.new(name, 1, bpy.data.actions[name])
        tr.mute = True
    arm.animation_data.action = None
    # attachment socket for future equipment / effects (top of the crystal cluster)
    sock = bpy.data.objects.new("socket_crystal_crown", None)
    sc.collection.objects.link(sock)
    sock.parent = arm
    sock.parent_type = "BONE"
    sock.parent_bone = "body"
    sock.matrix_world = Matrix.Translation((0, -0.2, 2.6))
    sc["clips"] = json.dumps(meta)
    bpy.ops.file.pack_all()  # the rigged .blend must open with its baked maps anywhere
    bpy.ops.wm.save_as_mainfile(filepath=str(out / p["blend_name"]), compress=True)
    bpy.ops.export_scene.gltf(filepath=str(out / p["glb_name"]), export_format="GLB", export_animations=True, export_animation_mode="NLA_TRACKS",
                              export_skins=True, export_def_bones=False, export_tangents=True, export_extras=True, export_yup=True, export_apply=False,
                              export_image_format="AUTO", export_force_sampling=True, export_frame_range=False)
    mesh.data.calc_loop_triangles()
    finish(p, {"triangles_source": tris0, "triangles_runtime": len(mesh.data.loop_triangles), "vertices_runtime": len(mesh.data.vertices),
               "bones": [b.name for b in arm.data.bones], "clips": meta, "maps": maps, "legs": legs,
               "glb": str(out / p["glb_name"]), "blend": str(out / p["blend_name"])})


if __name__ == "__main__":
    main()
