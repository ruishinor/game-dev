"""Cycles renders of the exported armour GLB: inventory icons and worn evidence.

Reuses render_evidence's lighting and the shared Cycles setup (the same
renderer as the Stillpoint and Halo Construct routes). The GLB rendered is
the exact runtime export (Meshopt undone by js/decompress.mjs for Blender).

payload (op "icons"):  glb, out, items, size, samples, view {az, el}
payload (op "worn"):   glb, body (plain body GLB), out, prefix, items, samples,
                       width, height, poses [null | {action, time}]
"""
from __future__ import annotations

import math
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

from asset_pipeline.blender.common import finish, look_at_matrix, payload, setup_cycles, world_color
from asset_pipeline.blender.render_evidence import ground, lights, scene_bounds

MANNEQUIN_KEEP = ("body", "head", "hands", "shell_shorts", "shell_shoes")


def fresh():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        bpy.ops.preferences.addon_enable(module="cycles")
    except Exception:
        pass
    return bpy.context.scene


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    return [o for o in bpy.data.objects if o not in before]


def base_name(o):
    return o.name.split(".")[0]


def camera(sc, target, dist, az, el, lens=50):
    cd = bpy.data.cameras.new("cam")
    cd.lens = lens
    cam = bpy.data.objects.new("cam", cd)
    sc.collection.objects.link(cam)
    sc.camera = cam
    a, e = math.radians(az), math.radians(el)
    eye = target + dist * np.array([-math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)])
    cam.matrix_world = Matrix(look_at_matrix(eye, target).tolist())
    return cam


def studio(sc, centre, size, strength=0.7, rig="soft", scale=1.0):
    if rig != "hard":
        world_color(sc, (0.40, 0.42, 0.45), strength)
        lights(sc, centre, size)
        return
    # hard-surface rig: dark world, warm key, two cool rims, a softbox above
    # whose reflections define the metal planes (Cycles area lights reflect)
    world_color(sc, (0.05, 0.055, 0.065), scale)
    c = Vector(tuple(map(float, centre)))
    k = max(size, 0.5) ** 2
    for name, off, energy, col, sz in (("key", (-1.1, -1.6, 1.0), 260, (1.0, 0.94, 0.86), 1.0),
                                        ("rim_l", (-1.4, 1.5, 0.6), 520, (0.72, 0.82, 1.0), 0.6),
                                        ("rim_r", (1.5, 1.3, 0.5), 520, (0.72, 0.82, 1.0), 0.6),
                                        ("box", (0.3, -0.8, 1.9), 300, (1.0, 1.0, 1.0), 2.0),
                                        ("fill", (1.6, -1.2, -0.2), 70, (0.9, 0.92, 1.0), 1.4)):
        ld = bpy.data.lights.new(name, "AREA")
        ld.energy = energy * k * scale
        ld.color = col
        ld.size = sz * max(size, 0.5)
        lo = bpy.data.objects.new(name, ld)
        sc.collection.objects.link(lo)
        lo.location = c + Vector(off) * max(size, 0.5)
        lo.rotation_euler = (c - lo.location).to_track_quat("-Z", "Y").to_euler()


def add_glare(sc, threshold=0.85, size=0.78, strength=0.9):
    """Fog-glow bloom on the emissive channels only (threshold above the lit metal)."""
    tree = bpy.data.node_groups.new("_glare", "CompositorNodeTree")
    tree.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    rl = tree.nodes.new("CompositorNodeRLayers")
    g = tree.nodes.new("CompositorNodeGlare")
    out = tree.nodes.new("NodeGroupOutput")
    for k, v in (("Type", "Fog Glow"), ("Quality", "High"), ("Threshold", threshold), ("Size", size), ("Strength", strength)):
        try:
            g.inputs[k].default_value = v
        except Exception:
            pass
    tree.links.new(rl.outputs["Image"], g.inputs["Image"])
    tree.links.new(g.outputs["Image"], out.inputs[0])
    sc.compositing_node_group = tree
    sc.render.use_compositing = True


def boost_channels(strength):
    """The GLB carries the channels as a plain emissive factor; give them the
    brightness the runtime shader reaches (white-hot core, red falloff)."""
    for m in bpy.data.materials:
        if not m.name.startswith("CL_Channel") or not m.use_nodes:
            continue
        for n in m.node_tree.nodes:
            if n.type == "BSDF_PRINCIPLED":
                n.inputs["Emission Color"].default_value = (1.0, 0.13, 0.05, 1)
                n.inputs["Emission Strength"].default_value = strength
                n.inputs["Base Color"].default_value = (0.3, 0.02, 0.01, 1)


def belongs(o, item):
    n = base_name(o)
    return n == item or n.startswith(item + "__")


def op_icons(p):
    out = Path(p["out"])
    icons = {}
    for item in p["items"]:
        sc = fresh()
        objs = import_glb(p["glb"])
        keep = [o for o in objs if o.type == "MESH" and belongs(o, item)]
        for o in objs:
            if o.type == "MESH" and o not in keep:
                bpy.data.objects.remove(o, do_unlink=True)
        half = p.get("keep_half", {}).get(item)
        if half:  # a pair (gloves) is shown as one piece: keep the +x (left) half
            import bmesh
            for o in keep:
                bm = bmesh.new()
                bm.from_mesh(o.data)
                bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.x < 0], context="VERTS")
                bm.to_mesh(o.data)
                bm.free()
        bpy.context.view_layer.update()
        lo, hi = scene_bounds(keep)
        centre = (lo + hi) / 2
        size = float(np.linalg.norm(hi - lo))
        setup_cycles(sc, p["size"], p["size"], samples=p["samples"], denoise=True, transparent=True)
        rig = p.get("rig", "soft")
        studio(sc, centre, max(size, 0.6) * (1.0 if rig == "hard" else 1.4), 0.9, rig=rig, scale=p.get("light_scale", 1.0))
        if p.get("channel_strength"):
            boost_channels(p["channel_strength"])
        glare_from(sc, p)
        v = p["view"]
        # frame the silhouette: distance from the bounding radius and lens
        lens = 60
        fov = 2 * math.atan(18 / lens)
        dist = (size / 2) / math.tan(fov / 2) * 1.02
        camera(sc, centre, dist, v["az"], v["el"], lens)
        f = out / f"{item}_hero.png"
        sc.render.filepath = str(f)
        bpy.ops.render.render(write_still=True)
        icons[item] = str(f)
    finish(p, {"icons": icons})


def mannequin_material(rgb=(0.42, 0.43, 0.44), roughness=0.7):
    m = bpy.data.materials.new("_mannequin")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = roughness
    return m


def glare_from(sc, p):
    g = p.get("glare")
    if not g:
        return
    add_glare(sc, **(g if isinstance(g, dict) else {}))
    sc.view_settings.view_transform = "AgX"
    try:
        sc.view_settings.look = p.get("look", "AgX - Medium High Contrast")
    except TypeError:
        pass
    sc.view_settings.exposure = float(p.get("exposure", 0.0))


def op_worn(p):
    out = Path(p["out"])
    written = []
    for k, pose in enumerate(p["poses"]):
        sc = fresh()
        mm = mannequin_material(tuple(p.get("mannequin_rgb", (0.42, 0.43, 0.44))), p.get("mannequin_roughness", 0.7))
        groups = []
        items = p["items"][:1] if p.get("together") else p["items"]
        n = len(items)
        for i, item in enumerate(items):
            dx = (i - (n - 1) / 2) * 0.95
            body = import_glb(p["body"])
            arm_b = next(o for o in body if o.type == "ARMATURE")
            for o in body:
                if o.type == "MESH":
                    if base_name(o) in MANNEQUIN_KEEP:
                        o.data.materials.clear()
                        o.data.materials.append(mm)
                        for slot in o.material_slots:
                            slot.material = mm
                    else:
                        bpy.data.objects.remove(o, do_unlink=True)
            armour = import_glb(p["glb"])
            arm_a = next(o for o in armour if o.type == "ARMATURE")
            for o in armour:
                if o.type == "MESH" and not (belongs(o, item) or (p.get("together") and any(belongs(o, it) for it in p["items"]))):
                    bpy.data.objects.remove(o, do_unlink=True)
            for a in (arm_b, arm_a):
                top = a
                while top.parent:
                    top = top.parent
                top.location.x += dx
            if not pose:
                # the importer leaves the first clip active on the body: show the true bind pose
                # (the armour armature carries no clip, so its import pose is the bind)
                if arm_b.animation_data:
                    for tr in list(arm_b.animation_data.nla_tracks):
                        arm_b.animation_data.nla_tracks.remove(tr)
                    arm_b.animation_data.action = None
                for pb in arm_b.pose.bones:
                    src = arm_a.pose.bones.get(pb.name)
                    if src is not None:
                        pb.matrix_basis = src.matrix_basis.copy()
            if pose:
                act = bpy.data.actions.get(pose["action"]) or next((x for x in bpy.data.actions if x.name.startswith(pose["action"])), None)
                if act is None and p.get("clip_glb"):
                    # this body ships no clips; the game drives it with the male body's
                    for o in import_glb(p["clip_glb"]):
                        bpy.data.objects.remove(o, do_unlink=True)
                    act = next(x for x in bpy.data.actions if x.name.startswith(pose["action"]))
                for a in (arm_b, arm_a):
                    a.animation_data_create()
                    for tr in list(a.animation_data.nla_tracks):  # imported clips arrive as NLA strips
                        a.animation_data.nla_tracks.remove(tr)
                    a.animation_data.action = act
                    slots = getattr(act, "slots", None)
                    if slots and hasattr(a.animation_data, "action_slot"):
                        # Blender 5 layered actions: a second armature needs the slot too
                        a.animation_data.action_slot = slots[0]
                sc.frame_set(int(round(pose["time"] * sc.render.fps)) + int(act.frame_range[0]))
            groups.append(item)
        bpy.context.view_layer.update()
        meshes = [o for o in bpy.data.objects if o.type == "MESH"]
        lo, hi = scene_bounds(meshes)
        centre = (lo + hi) / 2
        size = float(np.linalg.norm(hi - lo))
        setup_cycles(sc, p["width"], p["height"], samples=p["samples"], denoise=True)
        rig = p.get("rig", "soft")
        studio(sc, centre, max(size, 2.0) * (0.55 if rig == "hard" else 1.0), 0.55, rig=rig, scale=p.get("light_scale", 1.0))
        if p.get("channel_strength"):
            boost_channels(p["channel_strength"])
        glare_from(sc, p)
        g = ground(sc, float(lo[2]), max(size, 2.0))
        if p.get("ground_rgb"):
            gb = g.data.materials[0].node_tree.nodes["Principled BSDF"]
            gb.inputs["Base Color"].default_value = (*p["ground_rgb"], 1)
            gb.inputs["Roughness"].default_value = 0.6
        tag = "bind" if not pose else pose["action"].lower()
        for view, az in (("front", 0), ("back", 180), ("three_quarter", 35)):
            if pose and view == "back":
                continue
            # frame the figure by its height (posed arms change the bounding box)
            hgt = float(hi[2] - lo[2])
            fit = hgt * 0.56 * 50 / 18  # portrait frame: the 36 mm sensor spans the height
            cam = camera(sc, np.array([centre[0], centre[1], lo[2] + hgt * 0.5]), fit, az, 6, 50)
            f = out / f"{p['prefix']}_{tag}_{view}.png"
            sc.render.filepath = str(f)
            bpy.ops.render.render(write_still=True)
            written.append(str(f))
            bpy.data.objects.remove(cam, do_unlink=True)
    finish(p, {"renders": written})


def main():
    p = payload()
    {"icons": op_icons, "worn": op_worn}[p["op"]](p)


if __name__ == "__main__":
    main()
