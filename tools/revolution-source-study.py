#!/usr/bin/env python3
"""Comparison-only Revolution study with a correct Blender Z-up render frame.

Uses leopard-source-study.py's OBJ import and numeric measurements. No source
geometry is exported into the game. The owner archive has no license record;
keep the archive, extraction and rendered evidence in an external temp folder.
"""

from pathlib import Path
import runpy

import bpy
from mathutils import Vector


def render_views(obj, bounds, render_dir, study_id):
    render_dir.mkdir(parents=True, exist_ok=True)
    # Measurements use game coordinates (+Y up, +Z forward). Rendering maps
    # these to Blender (+Z up, -Y forward) with a proper rotation, no mirroring.
    for vertex in obj.data.vertices:
        x, y, z = vertex.co
        vertex.co = (x, -z, y)
    for polygon in obj.data.polygons:
        polygon.flip()
    obj.data.update()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1440
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new("revolution-study-world")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.10, 0.12, 0.14, 1)
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.5
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.exposure = -1
    material = obj.data.materials[0]
    material.diffuse_color = (0.23, 0.32, 0.21, 1)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = material.diffuse_color
    bsdf.inputs["Roughness"].default_value = 0.75
    bsdf.inputs["Metallic"].default_value = 0.1
    for location, energy, size in [((5, -5, 9), 1600, 7), ((-6, -1, 5), 1100, 6), ((0, 6, 7), 1300, 5)]:
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.data.energy, light.data.size = energy, size
        light.rotation_euler = (Vector((0, 0, 1.5)) - light.location).to_track_quat("-Z", "Y").to_euler()
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    scene.camera = camera
    mins, maxs = bounds["min"], bounds["max"]
    center = Vector(((mins[0] + maxs[0]) / 2, -(mins[2] + maxs[2]) / 2, (mins[1] + maxs[1]) / 2))
    span = max(maxs[i] - mins[i] for i in range(3))
    camera.data.ortho_scale = span * 1.14
    distance = span * 2
    views = {
        "front": (0, -1, 0), "rear": (0, 1, 0),
        "right": (1, 0, 0), "left": (-1, 0, 0),
        "quarter": (0.75, -0.75, 0.40),
        "rear-quarter": (-0.75, 0.75, 0.40),
        "top": (0, 0, 1),
    }
    outputs = []
    for label, direction in views.items():
        camera.location = center + Vector(direction).normalized() * distance
        camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
        camera.data.ortho_scale = span * (1.60 if label == "top" else 1.14)
        output = render_dir / f"{study_id}-{label}.png"
        scene.render.filepath = str(output)
        bpy.ops.render.render(write_still=True)
        outputs.append(str(output))
    return outputs


study = runpy.run_path(str(Path(__file__).with_name("leopard-source-study.py")))
study["main"].__globals__["render_views"] = render_views
study["main"]()
