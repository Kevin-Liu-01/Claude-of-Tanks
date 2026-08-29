#!/usr/bin/env python3
"""Render and measure comparison-only Leopard source geometry in Blender.

The source models remain outside the playable asset path. This tool converts
selected mesh objects into a normalized, untextured study mesh so dissimilar
OBJ/GLB coordinate systems can be compared from identical views.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--id", required=True)
    parser.add_argument("--select", default=".*", help="Regex for included mesh object names")
    parser.add_argument(
        "--axes",
        default="x,z,y",
        help="Canonical x,y,z as signed source axes, for example x,z,-y",
    )
    parser.add_argument("--target-width", type=float)
    parser.add_argument(
        "--normalization-scale",
        type=float,
        help="Use the scale measured from the complete vehicle when rendering a subset",
    )
    parser.add_argument("--render-dir")
    parser.add_argument("--output-json", required=True)
    return parser.parse_args(argv)


def import_model(path: Path) -> None:
    suffix = path.suffix.lower()
    if suffix in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=str(path))
    elif suffix == ".obj":
        bpy.ops.wm.obj_import(filepath=str(path), forward_axis="NEGATIVE_Z", up_axis="Y")
    else:
        raise ValueError(f"Unsupported source format: {suffix}")


def axis_reader(token: str):
    sign = -1.0 if token.startswith("-") else 1.0
    axis = token.lstrip("+-")
    index = {"x": 0, "y": 1, "z": 2}.get(axis)
    if index is None:
        raise ValueError(f"Invalid axis token: {token}")
    return lambda value: sign * value[index]


def convex_hull(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    points = sorted(set(points))
    if len(points) <= 1:
        return points

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower = []
    for point in points:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0:
            lower.pop()
        lower.append(point)
    upper = []
    for point in reversed(points):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0:
            upper.pop()
        upper.append(point)
    return lower[:-1] + upper[:-1]


def rounded(values):
    return [round(value, 5) for value in values]


def study_geometry(objects, axes, target_width, normalization_scale):
    readers = [axis_reader(token) for token in axes]
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int]] = []
    object_rows = []
    depsgraph = bpy.context.evaluated_depsgraph_get()

    for source in objects:
        evaluated = source.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        start = len(vertices)
        local_vertices = []
        for vertex in mesh.vertices:
            world = evaluated.matrix_world @ vertex.co
            canonical = tuple(reader(world) for reader in readers)
            vertices.append(canonical)
            local_vertices.append(canonical)
        for triangle in mesh.loop_triangles:
            faces.append(tuple(start + index for index in triangle.vertices))
        mins = [min(vertex[axis] for vertex in local_vertices) for axis in range(3)]
        maxs = [max(vertex[axis] for vertex in local_vertices) for axis in range(3)]
        object_rows.append(
            {
                "name": source.name,
                "vertices": len(local_vertices),
                "triangles": len(mesh.loop_triangles),
                "rawCanonicalBounds": {"min": rounded(mins), "max": rounded(maxs)},
            }
        )
        evaluated.to_mesh_clear()

    mins = [min(vertex[axis] for vertex in vertices) for axis in range(3)]
    maxs = [max(vertex[axis] for vertex in vertices) for axis in range(3)]
    width = maxs[0] - mins[0]
    if width <= 0:
        raise ValueError("Selected geometry has zero canonical width")
    if normalization_scale is None and target_width is None:
        raise ValueError("Provide --target-width or --normalization-scale")
    scale = normalization_scale if normalization_scale is not None else target_width / width
    normalized_width = width * scale
    center_x = (mins[0] + maxs[0]) * 0.5
    ground_y = mins[1]
    center_z = (mins[2] + maxs[2]) * 0.5
    normalized = [
        ((x - center_x) * scale, (y - ground_y) * scale, (z - center_z) * scale)
        for x, y, z in vertices
    ]
    nmins = [min(vertex[axis] for vertex in normalized) for axis in range(3)]
    nmaxs = [max(vertex[axis] for vertex in normalized) for axis in range(3)]

    cross_sections = []
    half_width = normalized_width * 0.5
    tolerance = max(0.025, normalized_width * 0.018)
    for side in (-1, 1):
        for fraction in (0.20, 0.40, 0.60, 0.78):
            sample_x = side * half_width * fraction
            points = [
                (round(z, 4), round(y, 4))
                for x, y, z in normalized
                if abs(x - sample_x) <= tolerance
            ]
            hull = convex_hull(points)
            cross_sections.append(
                {
                    "side": "left" if side < 0 else "right",
                    "widthFraction": fraction,
                    "sampleXM": round(sample_x, 5),
                    "sampleToleranceM": round(tolerance, 5),
                    "pointCount": len(points),
                    "sideProfileHullZY": [[z, y] for z, y in hull],
                }
            )

    return normalized, faces, {
        "axisMap": axes,
        "normalizedWidthM": round(normalized_width, 6),
        "sourceWidth": round(width, 6),
        "normalizationScale": round(scale, 8),
        "boundsM": {"min": rounded(nmins), "max": rounded(nmaxs)},
        "objects": object_rows,
        "crossSections": cross_sections,
    }


def build_study_mesh(name, vertices, faces):
    mesh = bpy.data.meshes.new(f"{name}_study_geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    material = bpy.data.materials.new(f"{name}_study_material")
    material.diffuse_color = (0.22, 0.34, 0.20, 1.0)
    material.metallic = 0.15
    material.roughness = 0.58
    obj.data.materials.append(material)
    return obj


def point_camera(camera, position, target):
    camera.location = Vector(position)
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()


def render_views(obj, bounds, render_dir: Path, study_id: str) -> list[str]:
    render_dir.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new("source-study-world")
    scene.world.color = (0.018, 0.025, 0.028)

    plane_material = bpy.data.materials.new("study_ground_material")
    plane_material.diffuse_color = (0.035, 0.045, 0.048, 1.0)
    plane_material.roughness = 0.9
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, -0.005, 0))
    bpy.context.object.data.materials.append(plane_material)

    bpy.ops.object.light_add(type="AREA", location=(4.5, 7.5, 6.0))
    bpy.context.object.data.energy = 1100
    bpy.context.object.data.shape = "DISK"
    bpy.context.object.data.size = 5.0
    bpy.ops.object.light_add(type="AREA", location=(-5.0, 3.0, 2.0))
    bpy.context.object.data.energy = 650
    bpy.context.object.data.size = 4.0
    bpy.ops.object.light_add(type="AREA", location=(0.0, 4.0, -6.0))
    bpy.context.object.data.energy = 500
    bpy.context.object.data.size = 3.0

    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    scene.camera = camera
    min_x, min_y, min_z = bounds["min"]
    max_x, max_y, max_z = bounds["max"]
    center = ((min_x + max_x) * 0.5, (min_y + max_y) * 0.5, (min_z + max_z) * 0.5)
    extent = max(max_x - min_x, max_y - min_y, max_z - min_z)
    camera.data.ortho_scale = extent * 1.22
    distance = extent * 2.2
    views = {
        "front": (center[0], center[1], center[2] + distance),
        "right": (center[0] + distance, center[1], center[2]),
        "left": (center[0] - distance, center[1], center[2]),
        "quarter": (center[0] + distance * 0.72, center[1] + distance * 0.18, center[2] + distance * 0.72),
        "low-quarter": (center[0] + distance * 0.72, center[1] - distance * 0.04, center[2] + distance * 0.72),
        "top": (center[0], center[1] + distance, center[2]),
    }
    outputs = []
    for label, position in views.items():
        point_camera(camera, position, center)
        output = render_dir / f"{study_id}-{label}.png"
        scene.render.filepath = str(output)
        bpy.ops.render.render(write_still=True)
        outputs.append(str(output))
    return outputs


def main() -> None:
    args = parse_args()
    model_path = Path(args.model).expanduser().resolve()
    output_path = Path(args.output_json).expanduser().resolve()
    axes = [token.strip() for token in args.axes.split(",")]
    if len(axes) != 3:
        raise ValueError("--axes requires exactly three comma-separated tokens")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    import_model(model_path)
    matcher = re.compile(args.select)
    selected = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and matcher.search(obj.name)]
    if not selected:
        raise ValueError(f"No mesh objects match {args.select!r}")
    selected_names = [obj.name for obj in selected]
    vertices, faces, measurement = study_geometry(
        selected,
        axes,
        args.target_width,
        args.normalization_scale,
    )

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    study = build_study_mesh(args.id, vertices, faces)
    study.data.calc_loop_triangles()
    bounds = measurement["boundsM"]
    rendered = []
    if args.render_dir:
        rendered = render_views(study, bounds, Path(args.render_dir).resolve(), args.id)

    payload = {
        "schemaVersion": 1,
        "purpose": "comparison-only; never loaded by the playable runtime",
        "id": args.id,
        "source": str(model_path),
        "selectionRegex": args.select,
        "selectedObjectCount": len(selected),
        "selectedObjects": selected_names,
        "measurements": measurement,
        "renders": rendered,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"id": args.id, "objects": len(selected), "output": str(output_path), "renders": rendered}, indent=2))


if __name__ == "__main__":
    main()
