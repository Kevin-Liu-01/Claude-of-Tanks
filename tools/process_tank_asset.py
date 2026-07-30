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
from mathutils import Vector


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
parser.add_argument("--rig-profile", choices=(
    "fv510", "leo2-revolution", "chieftain5", "t62mv1", "t64bv1",
    "t72b-1987", "t72bu", "type90",
))
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


def world_bounds(obj):
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return ([min(p[i] for p in corners) for i in range(3)],
            [max(p[i] for p in corners) for i in range(3)])


def separate_faces(obj, predicate, name):
    """Separate selected polygons without losing UVs/material slots."""
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    for vertex in obj.data.vertices:
        vertex.select = False
    for edge in obj.data.edges:
        edge.select = False
    selected = 0
    for poly in obj.data.polygons:
        # FBX imports do not always populate MeshPolygon.center before the
        # first dependency-graph evaluation; derive it from vertices so a
        # stale (0,0,0) cannot select the complete mesh as the cannon.
        center = sum((obj.data.vertices[i].co for i in poly.vertices), Vector()) / len(poly.vertices)
        poly.select = bool(predicate(obj.matrix_world @ center))
        selected += int(poly.select)
    if not selected or selected == len(obj.data.polygons):
        raise RuntimeError(
            f"{opt.rig_profile}: invalid {name} split ({selected}/{len(obj.data.polygons)} faces)")
    before = set(bpy.context.scene.objects)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="FACE")
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")
    made = [candidate for candidate in bpy.context.scene.objects
            if candidate not in before and candidate.type == "MESH"]
    if len(made) != 1:
        raise RuntimeError(f"{opt.rig_profile}: {name} split created {len(made)} objects")
    made[0].name = name
    return made[0]


def connected_face_groups(obj):
    """Return polygon-index groups connected by shared vertices.

    The recovered FBXs flatten object names/hierarchy, but their mechanical
    shells remain topologically disconnected. Selecting whole shells avoids
    slicing the hull roof off with a crude horizontal face cut.
    """
    vertex_faces = [[] for _ in obj.data.vertices]
    for poly in obj.data.polygons:
        for vertex_index in poly.vertices:
            vertex_faces[vertex_index].append(poly.index)
    visited = bytearray(len(obj.data.polygons))
    groups = []
    for start in range(len(obj.data.polygons)):
        if visited[start]:
            continue
        visited[start] = 1
        stack = [start]
        group = []
        while stack:
            face_index = stack.pop()
            group.append(face_index)
            for vertex_index in obj.data.polygons[face_index].vertices:
                for neighbor in vertex_faces[vertex_index]:
                    if not visited[neighbor]:
                        visited[neighbor] = 1
                        stack.append(neighbor)
        groups.append(group)
    return groups


def separate_face_indices(obj, face_indices, name):
    wanted = set(face_indices)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    for vertex in obj.data.vertices:
        vertex.select = False
    for edge in obj.data.edges:
        edge.select = False
    for poly in obj.data.polygons:
        poly.select = poly.index in wanted
    if not wanted:
        raise RuntimeError(f"{opt.rig_profile}: {name} selection is empty")
    before = set(bpy.context.scene.objects)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")
    made = [candidate for candidate in bpy.context.scene.objects
            if candidate not in before and candidate.type == "MESH"]
    if len(made) != 1:
        raise RuntimeError(f"{opt.rig_profile}: {name} split created {len(made)} objects")
    made[0].name = name
    return made[0]


def empty_at(name, point):
    node = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(node)
    node.location = point
    return node


def parent_keep_world(obj, parent):
    bpy.context.view_layer.update()
    matrix = obj.matrix_world.copy()
    parent_matrix = parent.matrix_world.copy()
    obj.parent = parent
    # Blender's exporter evaluates parent-relative transforms. Assigning only
    # matrix_world here looks correct in the viewport but can leave an identity
    # parent inverse, causing the glTF export to add the pivot translation a
    # second time (visibly floating turrets). Bake the exact parent-local
    # matrix explicitly so import/export round-trips preserve world placement.
    obj.matrix_parent_inverse.identity()
    obj.matrix_basis = parent_matrix.inverted() @ matrix
    bpy.context.view_layer.update()


FUSED_TURRET_PROFILES = {
    # profile: (vertical axis, normalized ring cut)
    # Chieftain's direct OBJ retains Y-up; the other owner FBXs are Z-up.
    "chieftain5": (1, 0.70),
    "t62mv1": (2, 0.52),
    "t64bv1": (2, 0.53),
    "t72b-1987": (2, 0.54),
    "t72bu": (2, 0.51),
    "type90": (2, 0.42),
}


def build_fused_turret(profile):
    """Separate the complete upper fighting compartment from a flattened
    body mesh. These low-poly FBXs/OBJs use disconnected mechanical shells;
    the cut follows the real turret-ring plane and keeps the fused cannon with
    the turret so yaw never leaves it or its mantlet behind.
    """
    up_axis, cut = FUSED_TURRET_PROFILES[profile]
    mesh_parts = sorted(
        (o for o in bpy.context.scene.objects if o.type == "MESH"),
        key=lambda o: len(o.data.polygons),
        reverse=True,
    )
    source_obj = mesh_parts[0]
    # Flattened FBXs commonly keep the tracks/running gear as their second
    # mesh. Its longitudinal center is a much better turret-ring reference
    # than the cut hull mesh, whose glacis/rear overhang can be asymmetric.
    ring_reference = mesh_parts[1] if len(mesh_parts) > 1 else source_obj
    lo, hi = world_bounds(source_obj)
    span = max(hi[up_axis] - lo[up_axis], 1e-9)
    ring_level = lo[up_axis] + span * cut
    selected_faces = []
    group_debug = []
    for group in connected_face_groups(source_obj):
        centers = []
        component_vertices = set()
        for face_index in group:
            poly = source_obj.data.polygons[face_index]
            centers.append(sum((source_obj.matrix_world @ source_obj.data.vertices[i].co)[up_axis]
                               for i in poly.vertices) / len(poly.vertices))
            component_vertices.update(poly.vertices)
        heights = [(source_obj.matrix_world @ source_obj.data.vertices[i].co)[up_axis]
                   for i in component_vertices]
        mean_height = sum(centers) / len(centers)
        group_debug.append((len(group), min(heights), mean_height, max(heights)))
        # Include complete upper shells (turret, mantlet, cannon, sights and
        # baskets), never just their faces above the ring. A small tolerance
        # retains skirts hanging below the nominal ring without catching the
        # tall, vertically-spanning hull shell.
        if mean_height >= ring_level - span * 0.04 and max(heights) > ring_level:
            selected_faces.extend(group)
    print("COT_COMPONENTS", profile, "ring", round(ring_level, 5),
          "top", [(n, round(a, 3), round(m, 3), round(b, 3))
                   for n, a, m, b in sorted(group_debug, reverse=True)[:18]])
    if not selected_faces:
        raise RuntimeError(f"{profile}: no connected upper components at turret ring")
    turret_part = separate_face_indices(source_obj, selected_faces, "TurretMesh")
    tlo, thi = world_bounds(turret_part)
    # Center the ring on the remaining hull, not the turret bbox: the fused
    # cannon overhang would otherwise pull a long-axis bbox center halfway
    # down the barrel and make the turret orbit around its muzzle.
    hlo, hhi = world_bounds(ring_reference)
    pivot = Vector(((hlo[0] + hhi[0]) / 2, (hlo[1] + hhi[1]) / 2, (hlo[2] + hhi[2]) / 2))
    pivot[up_axis] = ring_level
    turret_node = empty_at("Turret", pivot)
    parent_keep_world(turret_part, turret_node)
    print("COT_RIG", profile, "turret_faces", len(turret_part.data.polygons),
          "turret_pivot", tuple(round(v, 5) for v in pivot))


def build_articulation(profile):
    """Restore mechanical hierarchy in two flattened owner-supplied models.

    Thresholds are normalized to the source bounds, so original FBX/OBJ units
    do not matter. The faces remain the authored geometry; only their parent
    nodes change.
    """
    if profile in FUSED_TURRET_PROFILES:
        build_fused_turret(profile)
        return
    if profile == "fv510":
        source_obj = next((o for o in bpy.context.scene.objects
                           if o.type == "MESH" and o.name.startswith("Object_Main_Body")), None)
        front_sign = -1
    else:
        source_obj = bpy.data.objects.get("chassis_vlo")
        front_sign = 1
    if source_obj is None:
        raise RuntimeError(f"{profile}: fused source object not found")

    lo, hi = world_bounds(source_obj)
    span = [max(hi[i] - lo[i], 1e-9) for i in range(3)]
    center_x = (lo[0] + hi[0]) / 2

    def normalized(point):
        return (
            (point.x - center_x) / span[0],
            (point.y - lo[1]) / span[1],
            (point.z - lo[2]) / span[2],
        )

    if profile == "fv510":
        # Warrior: cannon points toward native -Y; the turret sits forward of
        # center and above the troop-compartment roof.
        gun_part = separate_faces(source_obj, lambda p: (
            normalized(p)[1] < 0.27 and normalized(p)[2] > 0.49 and
            abs(normalized(p)[0]) < 0.24), "GunMesh")
        turret_part = separate_faces(source_obj, lambda p: (
            normalized(p)[2] > 0.47 and normalized(p)[1] < 0.61 and
            abs(normalized(p)[0]) < 0.43), "TurretMesh")
    else:
        # Revolution: native +Y is forward. Its long L/55 lives lower than
        # the turret roof, hence the independent forward/centerline gate.
        gun_part = separate_faces(source_obj, lambda p: (
            normalized(p)[1] > 0.75 and normalized(p)[2] > 0.31 and
            abs(normalized(p)[0]) < 0.25), "GunMesh")
        turret_part = separate_faces(source_obj, lambda p: (
            normalized(p)[2] > 0.49 and 0.15 < normalized(p)[1] < 0.69 and
            abs(normalized(p)[0]) < 0.46), "TurretMesh")

    tlo, thi = world_bounds(turret_part)
    turret_point = Vector(((tlo[0] + thi[0]) / 2, (tlo[1] + thi[1]) / 2, tlo[2]))
    glo, ghi = world_bounds(gun_part)
    gun_y = glo[1] if front_sign > 0 else ghi[1]
    gun_point = Vector(((glo[0] + ghi[0]) / 2, gun_y, (glo[2] + ghi[2]) / 2))
    turret_node = empty_at("Turret", turret_point)
    gun_node = empty_at("Gun", gun_point)
    parent_keep_world(turret_part, turret_node)
    parent_keep_world(gun_node, turret_node)
    parent_keep_world(gun_part, gun_node)
    print("COT_RIG", profile, "turret_faces", len(turret_part.data.polygons),
          "gun_faces", len(gun_part.data.polygons),
          "turret_pivot", tuple(round(v, 5) for v in turret_point),
          "gun_pivot", tuple(round(v, 5) for v in gun_point))


if opt.rig_profile:
    build_articulation(opt.rig_profile)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]


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
