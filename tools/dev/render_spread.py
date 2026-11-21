import sys, json, math, bpy
from mathutils import Vector
a = json.loads(sys.argv[1])
bpy.ops.wm.open_mainfile(filepath=a["blend"])
sc = bpy.context.scene
sc.render.engine = "CYCLES"; sc.cycles.device = "CPU"; sc.cycles.samples = a.get("samples", 24)
sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = a.get("w", 960), a.get("h", 720)
w = sc.world or bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
bg = w.node_tree.nodes.get("Background"); bg.inputs[0].default_value = (0.28, 0.3, 0.34, 1); bg.inputs[1].default_value = 0.6
for m in bpy.data.materials:
    if m.name.startswith("PS_") and m.name != "PS_Body":
        b = m.node_tree.nodes.get("Principled BSDF")
        if b: b.inputs["Emission Strength"].default_value = a.get("emit", 3.0)
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sc.collection.objects.link(sun)
sun.data.energy = 3.2; sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(35))
# ground plane
bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -0.01))
g = bpy.context.active_object; gm = bpy.data.materials.new("g"); gm.use_nodes = True
gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.09, 0.08, 0.07, 1); g.data.materials.append(gm)
for i, n in enumerate(a.get("spread", [])):
    o = bpy.data.objects.get(n)
    if o: o.location.x = (i - len(a["spread"]) / 2) * 5.5
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 35
for name, eye, tgt in a["views"]:
    cam.location = Vector(eye); d = Vector(tgt) - Vector(eye)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = a["out"] + "/" + name + ".png"
    bpy.ops.render.render(write_still=True)
