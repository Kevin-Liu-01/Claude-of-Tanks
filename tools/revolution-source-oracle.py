#!/usr/bin/env python3
"""Measure the owner OBJ in a hull-centered frame and emit a LOCAL QA oracle.

The external mesh stays in a gitignored comparison directory, never a runtime
vehicle. Numeric receipts contain bounds and stations, not a source mesh dump.
"""

import argparse
import hashlib
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


parser = argparse.ArgumentParser()
parser.add_argument("--model", required=True)
parser.add_argument("--output-json", required=True)
parser.add_argument("--output-glb")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=args.model, forward_axis="NEGATIVE_Z", up_axis="Y")
objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
raw = {obj.name: [(p.x, p.z, p.y) for p in [obj.matrix_world @ v.co for v in obj.data.vertices]] for obj in objects}


def bounds(points):
    lo = [min(p[i] for p in points) for i in range(3)]
    hi = [max(p[i] for p in points) for i in range(3)]
    return {"min": [round(v, 5) for v in lo], "max": [round(v, 5) for v in hi],
            "size": [round(hi[i] - lo[i], 5) for i in range(3)]}


all_points = [p for points in raw.values() for p in points]
complete, chassis = bounds(all_points), bounds(raw["chassis"])
center_x = sum((complete["min"][0], complete["max"][0])) / 2
center_z = sum((chassis["min"][2], chassis["max"][2])) / 2
scale_xy = 4 / complete["size"][0]
scale_hull_z = 7.72 / chassis["size"][2]
source_bow = chassis["max"][2]
gun_scale_z = (9.97 - 7.72) / (complete["max"][2] - source_bow)


def normalized(p):
    x, y, z = p
    return ((x - center_x) * scale_xy, (y - complete["min"][1]) * scale_xy,
            (z - center_z) * scale_hull_z if z <= source_bow else 3.86 + (z - source_bow) * gun_scale_z)


normalized_objects = {name: [normalized(p) for p in points] for name, points in raw.items()}
rows = [{"name": obj.name, "vertices": len(obj.data.vertices), "triangles": sum(len(p.vertices) - 2 for p in obj.data.polygons),
         "boundsM": bounds(normalized_objects[obj.name])} for obj in objects]


def components(obj):
    points = normalized_objects[obj.name]
    parents = list(range(len(points)))

    def root(i):
        while parents[i] != i:
            parents[i] = parents[parents[i]]
            i = parents[i]
        return i

    # OBJ normal/UV seams can duplicate one physical vertex. Coincident-point
    # welding here identifies connected measurement islands; export stays exact.
    keys = {}
    for i, point in enumerate(points):
        key = tuple(round(v, 5) for v in point)
        if key in keys:
            parents[root(i)] = root(keys[key])
        else:
            keys[key] = i
    for poly in obj.data.polygons:
        for i in poly.vertices[1:]:
            parents[root(i)] = root(poly.vertices[0])
    islands = {}
    for i in range(len(points)):
        islands.setdefault(root(i), []).append(i)
    output = []
    for indices in islands.values():
        if len(indices) < 8:
            continue
        box = bounds([points[i] for i in indices])
        row = {"vertices": len(indices), "boundsM": box}
        if len(indices) >= 900:
            group = root(indices[0])
            polygons = [poly for poly in obj.data.polygons if root(poly.vertices[0]) == group]
            sections = []
            for station_index in range(21):
                z = box["min"][2] + 0.002 + (box["size"][2] - 0.004) * station_index / 20
                crossing = []
                for poly in polygons:
                    indices_poly = list(poly.vertices)
                    for i, j in zip(indices_poly, indices_poly[1:] + indices_poly[:1]):
                        a, b = points[i], points[j]
                        if (a[2] <= z <= b[2] or b[2] <= z <= a[2]) and abs(b[2] - a[2]) > 1e-8:
                            t = (z - a[2]) / (b[2] - a[2])
                            crossing.append(tuple(a[axis] + t * (b[axis] - a[axis]) for axis in range(3)))
                if crossing:
                    section_box = bounds(crossing)
                    sections.append({"z": round(z, 4), "xMin": section_box["min"][0], "xMax": section_box["max"][0],
                                     "yMin": section_box["min"][1], "yMax": section_box["max"][1]})
            row["longitudinalSectionsM"] = sections
            if box["min"][1] > 1 and 4 < box["size"][2] < 6:
                tree = BVHTree.FromPolygons([Vector(p) for p in points],
                                           [list(poly.vertices) for poly in polygons])
                probes = []
                for z in [-2.3, -1.6, -0.6, 0.2, 0.9, 1.6, 1.9]:
                    for x in [-0.95, 0.95]:
                        top = tree.ray_cast(Vector((x, 4, z)), Vector((0, -1, 0)))[0]
                        bottom = tree.ray_cast(Vector((x, 0, z)), Vector((0, 1, 0)))[0]
                        if top and bottom:
                            probes.append({"x": x, "z": z, "roofY": round(top.y, 5), "chinY": round(bottom.y, 5)})
                row["verticalRayProbesM"] = probes
                plan_probes = []
                for y in [1.8, 2.02]:
                    for x in [-1.4, -1.1, -0.65, 0.65, 1.1, 1.4]:
                        front = tree.ray_cast(Vector((x, y, 5)), Vector((0, 0, -1)))[0]
                        rear = tree.ray_cast(Vector((x, y, -5)), Vector((0, 0, 1)))[0]
                        if front and rear:
                            plan_probes.append({"x": x, "y": y, "frontZ": round(front.z, 5), "rearZ": round(rear.z, 5)})
                row["planRayProbesM"] = plan_probes
        output.append(row)
    return sorted(output, key=lambda row: -row["vertices"])


component_rows = {obj.name: components(obj) for obj in objects if obj.name in {"chassis", "chassis_vlo", "wheel_big_0", "wheel_big_1"}}
payload = {
    "purpose": "local comparison only; no source geometry enters playable runtime",
    "source": str(Path(args.model).resolve()),
    "sourceSha256": hashlib.sha256(Path(args.model).read_bytes()).hexdigest(),
    "frame": {"x": "right", "y": "up from lowest track", "z": "forward from midpoint of chassis bounds"},
    "normalization": {"widthM": 4, "hullLengthM": 7.72, "overallLengthM": 9.97,
        "sourceCenterX": center_x, "sourceGroundY": complete["min"][1], "sourceHullCenterZ": center_z,
        "scaleXY": scale_xy, "scaleHullZ": scale_hull_z, "gunOverhangZScale": gun_scale_z,
        "gunOverhangStartsAtSourceZ": source_bow},
    "objects": rows,
    "components": component_rows,
}
Path(args.output_json).parent.mkdir(parents=True, exist_ok=True)
Path(args.output_json).write_text(json.dumps(payload, indent=2) + "\n")
if args.output_glb:
    for obj in objects:
        obj.matrix_world.identity()
        for vertex, (x, y, z) in zip(obj.data.vertices, normalized_objects[obj.name]):
            vertex.co = (x, -z, y)
        # The signed source-to-canonical axis map reflects Blender Y. Reverse
        # face winding as well as normals so Three.js sees the same closed
        # surfaces Blender's two-sided viewport shows. Connectivity is unchanged.
        for polygon in obj.data.polygons:
            polygon.flip()
        obj.data.update()
    output = Path(args.output_glb).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", export_materials="NONE")
print(json.dumps({"output": args.output_json, "oracle": args.output_glb, "objects": len(objects)}))
