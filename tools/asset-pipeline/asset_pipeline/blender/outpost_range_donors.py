"""Rebuild selected static firing-range/weapon GLB donors in the project's
Blender pipeline, preserving source transforms, component names and materials.

This is real topology work (angle-limited hardsurface bevel + weighted normals),
not polygon-count inflation or replacement with primitives. Rigged/skeletal
donors are deliberately not bevelled without a character-specific workflow.
Usage:
 blender --background --factory-startup --python outpost_range_donors.py --
   <refinement-report.json> <output-directory>
"""
import hashlib
import json
import math
from pathlib import Path
import sys
import traceback

import bpy

MAX_MESH_POLYS = 40000
MAX_RESULT_POLYS = 240000
MAX_REBUILDS = 8


def count_triangles(scene):
    count = 0
    for obj in scene.objects:
        if obj.type != "MESH":
            continue
        mesh = obj.data
        mesh.calc_loop_triangles()
        count += len(mesh.loop_triangles)
    return count


def safely_bevel(obj):
    """Apply topology enhancement only to static, manageable hard edges."""
    mesh = obj.data
    before = len(mesh.polygons)
    if before < 6 or before > MAX_MESH_POLYS or obj.find_armature():
        return {"name": obj.name, "before": before, "after": before,
                "status": "preserved: unfit for broad static bevel"}
    bbox = list(obj.bound_box)
    diagonal = math.sqrt(sum(
        (max(p[i] for p in bbox) - min(p[i] for p in bbox)) ** 2
        for i in range(3)
    ))
    if diagonal < 0.001:
        return {"name": obj.name, "before": before, "after": before, "status": "degenerate bounds"}
    # Imported GLBs may instance one mesh datablock across several objects.
    # Blender refuses modifier_apply on multi-user data; make this copy local
    # before topology changes while retaining each object and its transforms.
    if obj.data.users > 1:
        obj.data = obj.data.copy()
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    # 0.4% of the model diagonal, no more than 20 mm in authored units.
    width = min(0.02, max(0.0005, diagonal * 0.004))
    modifier = obj.modifiers.new("Expedition bevel / machined edge catches", "BEVEL")
    modifier.width = width
    modifier.segments = 3
    modifier.limit_method = "ANGLE"
    modifier.angle_limit = math.radians(45)
    try:
        applied = bpy.ops.object.modifier_apply(modifier=modifier.name)
        if "FINISHED" not in applied:
            raise RuntimeError(f"Bevel modifier not applied: {applied}")
    except Exception as exc:
        if modifier.name in obj.modifiers:
            obj.modifiers.remove(modifier)
        return {"name": obj.name, "before": before, "after": before,
                "status": "preserved: bevel unsupported", "error": str(exc)}
    after = len(obj.data.polygons)
    if after > MAX_RESULT_POLYS:
        raise RuntimeError(f"Unbounded remesh {obj.name}: {before} -> {after} polygons")
    for poly in obj.data.polygons:
        poly.use_smooth = True
    weighted = obj.modifiers.new("Expedition face-weighted shading", "WEIGHTED_NORMAL")
    weighted.keep_sharp = True
    try:
        applied = bpy.ops.object.modifier_apply(modifier=weighted.name)
        if "FINISHED" not in applied:
            raise RuntimeError(f"Weighted normal modifier not applied: {applied}")
    except Exception:
        if weighted.name in obj.modifiers:
            obj.modifiers.remove(weighted)
    return {"name": obj.name, "before": before, "after": after,
            "status": "rebevelled", "edgeWidth": width,
            "changed": after > before}


def rebuild(entry, index, output):
    source = Path(entry["refinedPath"])
    if not source.is_file():
        raise FileNotFoundError(source)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    sc = bpy.context.scene
    meshes = [o for o in sc.objects if o.type == "MESH"]
    if not meshes:
        raise ValueError("No geometry in " + str(source))
    before = count_triangles(sc)
    has_rig = any(o.type == "ARMATURE" for o in sc.objects) or bool(entry.get("skins"))
    details = []
    if not has_rig:
        details = [safely_bevel(obj) for obj in meshes]
    else:
        details = [{"name":o.name,"before":len(o.data.polygons),"after":len(o.data.polygons),
            "status":"preserved skinned donor"} for o in meshes]
    after = count_triangles(sc)
    if after > max(MAX_RESULT_POLYS * max(1, len(meshes)), before * 12):
        raise RuntimeError(f"Total triangle budget exceeded: {before} -> {after}")
    outfile = output / (str(index).zfill(2) + "-" + source.name)
    bpy.ops.export_scene.gltf(filepath=str(outfile), export_format="GLB",
                              export_apply=False, export_normals=True,
                              export_texcoords=True, export_materials="EXPORT",
                              export_animations=True)
    if not outfile.is_file() or outfile.stat().st_size < 128:
        raise RuntimeError("Blender did not produce a valid-sized GLB")
    digest = hashlib.sha256(outfile.read_bytes()).hexdigest()
    return {"source": entry["source"], "sourceSha256":entry["sourceSha256"],
            "inputRefinementSha256":entry["refinedSha256"], "out":str(outfile),
            "outputSha256":digest, "bytes":outfile.stat().st_size,
            "meshCount":len(meshes), "trianglesBefore":before,
            "trianglesAfter":after, "skinnedPreserved":has_rig,
            "meshDetails":details}


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if len(args) != 2:
        raise SystemExit("usage: blender -b -P outpost_range_donors.py -- <refinement-report.json> <output-dir>")
    incoming = json.loads(Path(args[0]).read_text())
    outdir = Path(args[1]).resolve()
    outdir.mkdir(parents=True, exist_ok=True)
    selected = incoming.get("built", [])[:MAX_REBUILDS]
    if not selected:
        raise RuntimeError("No refined donors; source staging/refinement pipeline must run first")
    built, failed = [], []
    for i, row in enumerate(selected):
        try:
            built.append(rebuild(row, i, outdir))
        except Exception as err:
            failed.append({"source":row.get("source"),"error":str(err),
                "trace":traceback.format_exc(limit=3)})
    report = {"sourceArchiveSha256":incoming.get("sourceArchiveSha256"),
        "selected":len(selected),"remeshed":len(built),"failed":failed,"built":built,
        "acceptance":"awaiting rendered front/side review, in-game placement, collider fit and GPU benchmarks"}
    (outdir / "blender-remesh-report.json").write_text(json.dumps(report, indent=2) + "\n")
    print("OUTPOST_DONOR_REMESH " + json.dumps({
        "selected":len(selected),"outputs":len(built),"failures":len(failed),
        "topologyEnhanced":sum(any(d.get("changed") for d in b["meshDetails"]) for b in built),
        "triangles":[[x["trianglesBefore"],x["trianglesAfter"]] for x in built]}))
    if failed or not built:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
