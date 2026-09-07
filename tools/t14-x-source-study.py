#!/usr/bin/env python3
"""Local comparison-only census of the owner T-14 GLB (never playable output).

Blender's glTF importer cancels this source's root X rotation, leaving the
original OBJ frame. Rotating that frame by pi gives Blender +Z-up/-Y-forward.
Only scalar bounds, triangle/connected-island counts and ray probes are saved
in JSON; optional neutral oracle is private tool input, never a runtime mesh.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

parser = argparse.ArgumentParser()
parser.add_argument('--source', required=True)
parser.add_argument('--out', required=True)
parser.add_argument('--render', action='store_true')
parser.add_argument('--oracle', help='Optional ignored community-candidates GLB; source faces only')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
output = Path(args.out)
output.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=args.source)
objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']

def bounds(points):
    lo = [min(p[i] for p in points) for i in range(3)]
    hi = [max(p[i] for p in points) for i in range(3)]
    return dict(min=[round(v, 5) for v in lo], max=[round(v, 5) for v in hi],
                size=[round(hi[i] - lo[i], 5) for i in range(3)])

raw = {o.name: [o.matrix_world @ v.co for v in o.data.vertices] for o in objects}
all_points = [p for points in raw.values() for p in points]
raw_bounds = bounds(all_points)
hull_points = [p for o in objects if any(m and 'KORPUS' in m.name for m in o.data.materials) for p in raw[o.name]]
raw_hull = bounds(hull_points)
scale = 3.9 / raw_bounds['size'][0]
center_forward = (raw_hull['min'][1] + raw_hull['max'][1]) / 2
ground = raw_bounds['min'][2]

def game_point(p):
    return Vector((-p.x * scale, (p.z - ground) * scale, (p.y - center_forward) * scale))

rows = []
for obj in objects:
    points = [game_point(p) for p in raw[obj.name]]
    mesh = obj.data
    mesh.calc_loop_triangles()
    parents = list(range(len(points)))
    def root(i):
        while parents[i] != i:
            parents[i] = parents[parents[i]]
            i = parents[i]
        return i
    keys = {}
    for i, p in enumerate(points):
        key = tuple(round(v, 5) for v in p)
        if key in keys:
            parents[root(i)] = root(keys[key])
        else:
            keys[key] = i
    for poly in mesh.polygons:
        for i in poly.vertices[1:]:
            parents[root(i)] = root(poly.vertices[0])
    islands = {}
    for i, p in enumerate(points):
        islands.setdefault(root(i), []).append(p)
    island_rows = sorted([dict(vertices=len(v), boundsM=bounds(v)) for v in islands.values() if len(v) >= 12],
                         key=lambda x: x['vertices'], reverse=True)
    tree = BVHTree.FromPolygons(points, [list(t.vertices) for t in mesh.loop_triangles], all_triangles=True)
    probes = []
    for z in [round(-4.0 + i * .4, 2) for i in range(24)]:
        for x in [-1.7, -1.3, -.9, -.5, 0, .5, .9, 1.3, 1.7]:
            top = tree.ray_cast(Vector((x, 5, z)), Vector((0, -1, 0)))[0]
            if top:
                probes.append(dict(x=x, z=z, y=round(top.y, 5)))
    front_probes = []
    if any('BASHNYA' in m.name for m in mesh.materials):
        for y in [2.05, 2.15, 2.25, 2.35, 2.45, 2.55]:
            for x in [-1.40, -1.38, -1.3, -1.15, -1, -.85, -.7, -.55, -.4, 0, .4, .55, .7, .85, 1, 1.15, 1.3, 1.38, 1.40]:
                front = tree.ray_cast(Vector((x, y, 2)), Vector((0, 0, -1)))[0]
                if front:
                    front_probes.append(dict(x=x, y=y, z=round(front.z, 5)))
    rows.append(dict(name=obj.name, materials=[m.name for m in mesh.materials if m],
                     triangles=len(mesh.loop_triangles), boundsM=bounds(points),
                     islands=island_rows, topProbesM=probes, frontProbesM=front_probes))
    obj.parent = None
    obj.matrix_world.identity()
    for vertex, p in zip(mesh.vertices, points):
        vertex.co = (p.x, -p.z, p.y)
    mesh.update()

receipt = dict(sourcePath=args.source, sourceSha256=hashlib.sha256(Path(args.source).read_bytes()).hexdigest(),
               purpose='comparison-only, not playable geometry', rawBounds=raw_bounds, rawHullBounds=raw_hull,
               transform=dict(uniformScale=scale, sourceForwardCenter=center_forward, sourceGround=ground),
               meshes=rows)
(output / 't14-x-census.json').write_text(json.dumps(receipt, indent=2) + '\n')
print('SOURCE_CENSUS', output / 't14-x-census.json', flush=True)

if args.oracle:
    oracle = Path(args.oracle).resolve()
    if 'community-candidates' not in oracle.parts or oracle.suffix != '.glb':
        raise ValueError('Comparison output must stay in ignored community-candidates')
    oracle.parent.mkdir(parents=True, exist_ok=True)
    neutral = bpy.data.materials.new('source-comparison-neutral')
    neutral.diffuse_color = (.28, .34, .25, 1)
    # Mixed turret/gun materials are deliberately not given false articulation
    # ownership. This oracle is a fixed neutral whole-vehicle comparison.
    for obj in objects:
        obj.data.materials.clear()
        obj.data.materials.append(neutral)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(oracle), export_format='GLB',
                             use_selection=True, export_animations=False,
                             export_texcoords=False, export_yup=True)
    print('SOURCE_ORACLE', oracle, flush=True)

if args.render:
    mat = bpy.data.materials.new('neutral-original-source')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (.28, .34, .25, 1)
    bsdf.inputs['Roughness'].default_value = .76
    for obj in objects:
        obj.data.materials.clear()
        obj.data.materials.append(mat)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1200
    scene.render.resolution_percentage = 100
    scene.world = bpy.data.worlds.new('source-study-world')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.075, .09, .11, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .65
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.exposure = -1
    for position, energy in [((6, -8, 10), 1800), ((-6, -1, 7), 1300), ((2, 7, 9), 1400)]:
        bpy.ops.object.light_add(type='AREA', location=position)
        light = bpy.context.object
        light.data.energy, light.data.size = energy, 7
        light.rotation_euler = (Vector((0, 0, 1.5)) - light.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.data.type = 'ORTHO'
    scene.camera = camera
    target = Vector((0, -.2, 1.6))
    for name, direction, size in [
        ('front', (0, -1, 0), 6.0), ('side', (1, 0, 0), 11.8),
        ('quarter', (1, -1, .45), 11), ('rear', (0, 1, .15), 6),
        ('top', (0, 0, 1), 13.8), ('turret', (1, -1, .50), 5.0),
        ('turret-other', (-1, -1, .35), 5.0),
    ]:
        center = Vector((0, .2, 2.45)) if name.startswith('turret') else target
        camera.location = center + Vector(direction).normalized() * 22
        camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
        camera.data.ortho_scale = size
        scene.render.filepath = str(output / f't14-x-source-{name}.png')
        bpy.ops.render.render(write_still=True)
        print('SOURCE_RENDER', scene.render.filepath, flush=True)
