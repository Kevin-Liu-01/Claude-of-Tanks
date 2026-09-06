#!/usr/bin/env python3
"""Reproduce a quarantined owner-source T-90 X comparison GLB in Blender.

Example: blender -b --python tools/t90x-source-oracle.py -- --id t90m_x
  --model /private/.../T-90M.fbx
  --output public/models/community-candidates/t90m_x_source.glb

Only source-neutral affine registration is applied. This tool is NEVER part
of a public build; generated GLBs and JSON receipts remain local and ignored.
T90A has confirmed commercial-game extraction provenance and is processed
only under the owner's explicit 2026-09-05 local-comparison exception.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import bpy
import io_scene_fbx.import_fbx as fbx_import

CONFIG = {
    't90a_x': {
        'sha': '7b48c514290a03f12711e080e930e60df2890e0e50862dc816f374f09c34bfe3',
        'axis': lambda p: (-p.y, p.z, p.x), 'flip': True,
        'xy': 1.0150648513655038, 'z': 1.0813369340448753,
        'center': (-.04525, 0, -.16559696309523803),
        'yaw': (.010, 1.468, -.0039), 'gun': (.005, 1.8174, 1.30),
    },
    't90a_vladimir_x': {
        'sha': '68eaf6f2e315363e2aff067c2daef304b6ef7bc97f74eaf5635544f2a5dbbf67',
        'axis': lambda p: (p.x, p.z, -p.y), 'flip': False,
        'xy': 13.755458515283843, 'z': 14.246247988629744,
        'center': (-.01616, -.08019, -.03036347777777776),
        'yaw': (0, 1.416, .298), 'gun': (0, 1.7287, 1.34),
    },
    't90m_x': {
        'sha': 'bcb94f3e4e815aa5c18025e34ce12a3e5f42fd1047a60fd8539691c729c2351f',
        'axis': lambda p: (-p.y, p.z, -p.x), 'flip': False,
        'xy': .6113032889087265, 'z': .638600188816399,
        'center': (-.029595, -1.48286, .19119817924603164),
        'yaw': (.018092, 1.336748, -.104459), 'gun': (.001973, 1.608251, 1.140604),
    },
    't90sm_x': {
        'sha': '0a416d2e1f32624c3fd381f1806747c769b79befa5f6d8496aec13ef950b88e0',
        'axis': lambda p: (p.x, p.z, p.y), 'flip': True,
        'xy': .758946229261995, 'z': .801259998913049,
        'center': (-.018345, -.94082, -.44811448546296323),
        'yaw': (.008, 1.532, .359), 'gun': (.001, 1.90309, 1.56),
    },
}


def ancestor(obj, name):
    while obj:
        if obj.name == name:
            return True
        obj = obj.parent
    return False


def owner(vehicle, obj):
    if vehicle == 't90a_x':
        if ancestor(obj, 'mount.001'):
            return 'gun'
        if ancestor(obj, 'turret.001'):
            return 'turret'
    elif vehicle == 't90m_x':
        if ancestor(obj, 'Main barrel') or obj.name in {'Gun mantlet', '7.62mm machine gun'}:
            return 'gun'
        if ancestor(obj, 'Turret'):
            return 'turret'
    elif vehicle == 't90sm_x':
        if obj.name == 'misc_b':
            return 'gun'
        if obj.name == 'misc_a':
            return 'turret'
    elif vehicle == 't90a_vladimir_x' and obj.name == 'desirefx.me_001':
        return 'turret'
    return 'hull'


def bounds(points):
    low = [min(p[i] for p in points) for i in range(3)]
    high = [max(p[i] for p in points) for i in range(3)]
    return {'min': low, 'max': high, 'size': [b-a for a, b in zip(low, high)]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--id', required=True, choices=CONFIG)
    parser.add_argument('--model', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    cfg = CONFIG[args.id]
    source = Path(args.model).resolve()
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    if digest != cfg['sha']:
        raise ValueError('Input hash differs from the audited owner source')
    output = Path(args.output).resolve()
    if 'community-candidates' not in output.parts or output.suffix != '.glb':
        raise ValueError('Oracle output must remain in the ignored community-candidates directory')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # Blender 5 removed the old Cycles light property; source LIGHT objects
    # have no geometric authority and are discarded before export.
    fbx_import.blen_read_light = lambda *_args: bpy.data.lights.new('ignored_source_light', type='POINT')
    if source.suffix.lower() == '.fbx':
        bpy.ops.import_scene.fbx(filepath=str(source))
    else:
        bpy.ops.wm.obj_import(filepath=str(source), forward_axis='NEGATIVE_Z', up_axis='Y')
    def normal(point):
        x, y, z = cfg['axis'](point)
        cx, ground, cz = cfg['center']
        return ((x-cx)*cfg['xy'], (y-ground)*cfg['xy'], (z-cz)*cfg['z'])
    data = []
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        points = [normal(obj.matrix_world@v.co) for v in obj.data.vertices]
        faces = [list(p.vertices)[::-1] if cfg['flip'] else list(p.vertices) for p in obj.data.polygons]
        data.append((obj.name, owner(args.id, obj), points, faces))
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    groups = {}
    for key, pivot in [('hull', (0, 0, 0)), ('turret', cfg['yaw']), ('gun', cfg['gun'])]:
        obj = bpy.data.objects.new('Oracle'+key.capitalize(), None)
        bpy.context.collection.objects.link(obj)
        obj.location = (pivot[0], -pivot[2], pivot[1])
        obj['sourceComparisonOnly'] = True
        groups[key] = obj
    rows = []
    for name, role, points, faces in data:
        pivot = (0, 0, 0) if role == 'hull' else cfg['yaw'] if role == 'turret' else cfg['gun']
        mesh = bpy.data.meshes.new(name+'_source')
        mesh.from_pydata([(x-pivot[0], -(z-pivot[2]), y-pivot[1]) for x, y, z in points], [], faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.parent = groups[role]
        rows.append({'name': name, 'owner': role, 'vertices': len(points),
                     'triangles': sum(len(f)-2 for f in faces), 'boundsM': bounds(points)})
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', export_materials='NONE', export_extras=True)
    receipt = {
        'id': args.id, 'sourceSha256': digest,
        'oracleSha256': hashlib.sha256(output.read_bytes()).hexdigest(),
        'purpose': 'local owner-source comparison only; no public or playable source buffers',
        'normalization': {key: value for key, value in cfg.items() if key != 'axis'},
        'structuralHullLengthM': 6.86, 'whole': bounds([p for _, _, points, _ in data for p in points]),
        'objects': rows,
        'ownershipWarning': 'Vladimir has fused tower/gun and mixed hull/turret glass: component masks are not certified. A/SM yaw and trunnion are inferred; M yaw uses the physical ring, gun uses the native origin. Every neutral source face is retained.',
    }
    output.with_suffix('.json').write_text(json.dumps(receipt, indent=2)+'\n')
    print(json.dumps({'output': str(output), 'oracleSha256': receipt['oracleSha256']}))


if __name__ == '__main__':
    main()
