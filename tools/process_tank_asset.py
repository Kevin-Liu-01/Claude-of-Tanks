"""Blender-side tank asset normalizer used by the recovered-drop pipeline.

Run with:
  blender -b --python tools/process_tank_asset.py -- INPUT OUTPUT [options]

The script preserves useful authored hierarchy, normalizes common turret/gun
node names for modelLoader, optionally budgets polygon count and embedded
texture resolution, removes non-game cameras/lights, and exports one GLB.
"""
import argparse
import math
import os
import re
import sys

import bpy


def args_after_dash():
    argv = sys.argv
    return argv[argv.index("--") + 1:] if "--" in argv else []


parser = argparse.ArgumentParser()
parser.add_argument("input")
parser.add_argument("output")
parser.add_argument("--target-faces", type=int, default=180000)
parser.add_argument("--max-texture", type=int, default=1024)
parser.add_argument("--strip-textures", action="store_true")
parser.add_argument("--yaw-deg", type=float, default=0.0)
opt = parser.parse_args(args_after_dash())

src = os.path.abspath(opt.input)
dst = os.path.abspath(opt.output)
os.makedirs(os.path.dirname(dst), exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
ext = os.path.splitext(src)[1].lower()
if ext == ".fbx":
    bpy.ops.import_scene.fbx(filepath=src)
elif ext == ".obj":
    bpy.ops.wm.obj_import(filepath=src)
elif ext in (".glb", ".gltf"):
    bpy.ops.import_scene.gltf(filepath=src)
elif ext == ".stl":
    bpy.ops.wm.stl_import(filepath=src)
elif ext == ".dae":
    bpy.ops.wm.collada_import(filepath=src)
else:
    raise RuntimeError("unsupported input: " + ext)

for obj in list(bpy.data.objects):
    if obj.type in {"CAMERA", "LIGHT"}:
        bpy.data.objects.remove(obj, do_unlink=True)

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
if not meshes:
    raise RuntimeError("asset contains no mesh objects")

faces_before = sum(len(o.data.polygons) for o in meshes)
if opt.target_faces > 0 and faces_before > opt.target_faces:
    ratio = max(0.03, min(1.0, opt.target_faces / faces_before))
    for obj in meshes:
        if len(obj.data.polygons) < 200:
            continue
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        mod = obj.modifiers.new(name="COT_PerfBudget", type="DECIMATE")
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except Exception as exc:
            print("COT_WARN decimate", obj.name, exc)
        obj.select_set(False)

if opt.strip_textures:
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        for node in list(mat.node_tree.nodes):
            if node.type == "TEX_IMAGE":
                mat.node_tree.nodes.remove(node)
else:
    for image in bpy.data.images:
        if image.size[0] <= 0 or image.size[1] <= 0:
            continue
        longest = max(image.size[0], image.size[1])
        if opt.max_texture > 0 and longest > opt.max_texture:
            scale = opt.max_texture / longest
            image.scale(max(1, round(image.size[0] * scale)), max(1, round(image.size[1] * scale)))


def first_named(pattern):
    rx = re.compile(pattern, re.I)
    candidates = [o for o in bpy.context.scene.objects if rx.search(o.name)]
    if not candidates:
        return None
    # Prefer hierarchy containers, then larger meshes over tiny accessories.
    candidates.sort(key=lambda o: (o.type in {"EMPTY", "ARMATURE"},
                                   len(o.data.polygons) if o.type == "MESH" else len(o.children)),
                    reverse=True)
    return candidates[0]


turret = first_named(r"(^|[^a-z0-9])(turret|turm|bashnya|tourelle)([^a-z0-9]|$)")
gun = first_named(r"(^|[^a-z0-9])(main[^a-z0-9]?gun|gun|barrel|cannon|kanone|tube)([^a-z0-9]|$)")
if turret:
    turret.name = "Turret"
if gun and gun is not turret:
    gun.name = "Gun"

if opt.yaw_deg:
    root = bpy.data.objects.new("COT_Orientation", None)
    bpy.context.scene.collection.objects.link(root)
    top = [o for o in bpy.context.scene.objects if o is not root and o.parent is None]
    for obj in top:
        obj.parent = root
    root.rotation_euler[2] = math.radians(opt.yaw_deg)

for obj in meshes:
    for poly in obj.data.polygons:
        poly.use_smooth = True

faces_after = sum(len(o.data.polygons) for o in meshes)
print("COT_ASSET", os.path.basename(src), "meshes", len(meshes),
      "faces", faces_before, "->", faces_after,
      "turret", turret.name if turret else "NONE", "gun", gun.name if gun else "NONE")
print("COT_NODES", " | ".join(o.name for o in bpy.context.scene.objects[:120]))

bpy.ops.export_scene.gltf(
    filepath=dst,
    export_format="GLB",
    export_apply=True,
    export_materials="EXPORT",
    export_cameras=False,
    export_lights=False,
    export_animations=False,
)
if not os.path.isfile(dst) or os.path.getsize(dst) == 0:
    raise RuntimeError("GLB export failed")
print("COT_WROTE", dst, os.path.getsize(dst))
