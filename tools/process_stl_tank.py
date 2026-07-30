"""Assemble aligned hull/turret STL parts into a web-budget articulated GLB."""
import argparse
import math
import os
import sys

import bpy


argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
p = argparse.ArgumentParser()
p.add_argument("output")
p.add_argument("hull")
p.add_argument("turret", nargs="?")
p.add_argument("--target-faces", type=int, default=110000)
opt = p.parse_args(argv)

bpy.ops.wm.read_factory_settings(use_empty=True)


def load_stl(path, label):
    before = set(bpy.context.scene.objects)
    bpy.ops.wm.stl_import(filepath=os.path.abspath(path))
    added = [o for o in bpy.context.scene.objects if o not in before and o.type == "MESH"]
    if not added:
        raise RuntimeError("no mesh imported from " + path)
    for i, obj in enumerate(added):
        obj.name = label if i == 0 else f"{label}_{i}"
    return added


hulls = load_stl(opt.hull, "HullMesh")
turrets = load_stl(opt.turret, "TurretMesh") if opt.turret else []

faces_before = sum(len(o.data.polygons) for o in hulls + turrets)
if faces_before > opt.target_faces:
    ratio = max(0.04, opt.target_faces / faces_before)
    for obj in hulls + turrets:
        if len(obj.data.polygons) < 200:
            continue
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        mod = obj.modifiers.new("COT_PerfBudget", "DECIMATE")
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.select_set(False)

root = bpy.data.objects.new("Root", None)
bpy.context.scene.collection.objects.link(root)
# STL pack coordinates arrive as X=width, Y=length, Z=height while glTF is
# Y-up. The importer preserves that raw basis, so rotate the assembled model
# +90° around X: raw Y becomes forward +Z and raw -Z becomes height +Y.
root.rotation_euler[0] = math.pi / 2
for obj in hulls:
    obj.parent = root
if turrets:
    turret = bpy.data.objects.new("Turret", None)
    bpy.context.scene.collection.objects.link(turret)
    turret.parent = root
    for obj in turrets:
        obj.parent = turret

mat = bpy.data.materials.new("RecoveredPaint")
mat.diffuse_color = (0.28, 0.32, 0.22, 1)
mat.roughness = 0.78
for obj in hulls + turrets:
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = True

dst = os.path.abspath(opt.output)
os.makedirs(os.path.dirname(dst), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_apply=True,
                          export_materials="EXPORT", export_animations=False)
faces_after = sum(len(o.data.polygons) for o in hulls + turrets)
print("COT_STL_ASSET", os.path.basename(opt.hull), "+",
      os.path.basename(opt.turret) if opt.turret else "fixed",
      "faces", faces_before, "->", faces_after, "bytes", os.path.getsize(dst))
