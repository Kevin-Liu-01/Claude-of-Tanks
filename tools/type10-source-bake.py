#!/usr/bin/env python3
"""Verify or refresh the owner-source Type 10 geometry payload.

The committed GLB is the reproducible conversion of the owner's OBJ (the
newly supplied ZIP carries the same OBJ SHA-256). Material objects are split
at complete spatial-component boundaries into hull, track guards, turret and
gun. Donor pads and running gear are retained only in the source oracle; the
playable uses the game's native running-gear builder.

Usage:
  python3 tools/type10-source-bake.py --verify
  python3 tools/type10-source-bake.py --write
"""
from __future__ import annotations

import argparse
import base64
from collections import defaultdict
import json
import re
import struct
import sys
from pathlib import Path

import repair_oracles as oracle


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'public/models/tanks/community/type-10_main_battle_tank.glb'
OUTPUT = ROOT / 'src/vehicles/profiles/type10-source-geometry.js'
ORACLE_OUTPUT = (ROOT / 'public/models/tanks/community/'
                 'type-10_main_battle_tank_repaired.glb')

# Published-datum normalization. Width follows the source's widest side-guard
# faces; z follows the complete authored hull, and height follows the broad
# turret roof rather than thin cupolas/whips.
SX = 3.24 / 2.982
SY = 2.30 / (0.851 + 1.098)
SZ = 6.79 / (3.139 - (-3.560))
GROUND_Y = -1.098
HULL_Z_CENTER = (3.139 + (-3.560)) / 2
RAW_TURRET_PIVOT = (0.0, 0.250, 0.0)
RAW_GUN_PIVOT = (0.0, 0.550, 1.500)
TURRET_PIVOT = (
    0.0,
    (RAW_TURRET_PIVOT[1] - GROUND_Y) * SY,
    (RAW_TURRET_PIVOT[2] - HULL_Z_CENTER) * SZ,
)
GUN_WORLD_PIVOT = (
    0.0,
    (RAW_GUN_PIVOT[1] - GROUND_Y) * SY,
    (RAW_GUN_PIVOT[2] - HULL_Z_CENTER) * SZ,
)
TARGET_MUZZLE_Z = 6.095
TARGET_MUZZLE_RAW = TARGET_MUZZLE_Z / SZ + HULL_Z_CENTER
GUN_Z_SCALE = ((TARGET_MUZZLE_RAW - RAW_GUN_PIVOT[2]) /
               (4.728 - RAW_GUN_PIVOT[2]))
# The OBJ is vertically stylized above its ring: broad roof equipment and
# three thick export whips make its P95 body envelope ~67% taller than the
# Type 10 datum. Keep the ring/deck datum exact, compress only content above
# it, and slim only the three long antenna courses. This preserves every
# authored solid and its seating while applying the fleet P95-envelope law.
ABOVE_RING_Y_SCALE = 0.70
ANTENNA_RADIAL_SCALE = 0.45
CENTER_ANTENNA_Y_SCALE = 0.48

NODE_EXPECTED_COMPONENTS = {
    'Object_2': 1064,
    'Object_3': 685,
    'Object_4': 178,
    'Object_5': 353,
    'Object_6': 170,
}
CLASS_EXPECTED_COMPONENTS = {
    'drop_track': 1064,
    'drop_gear': 60,
    'hull': 727,
    'guard': 236,
    'turret': 353,
    'gun_barrel': 9,
    'gun_root': 1,
}
# Filled after classification/compaction; changing these means source drift or
# a semantic-rule change and must be reviewed, never silently regenerated.
EXPECTED = {
    'hull': (30754, 20125),
    'guard': (15030, 10488),
    'turret': (31174, 21492),
    'gun': (2803, 2487),
}


def components(gltf, data, node_name):
    ni = oracle.find_node(gltf, node_name)
    node = gltf['nodes'][ni]
    prim = gltf['meshes'][node['mesh']]['primitives'][0]
    points = oracle._read_rows(gltf, data, prim['attributes']['POSITION'])
    indices = [row[0] for row in oracle._read_rows(
        gltf, data, prim['indices'])]
    world = oracle.node_world_matrix(gltf, ni)
    points = [oracle.transform_point(world, point) for point in points]

    parent = list(range(len(points)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a, b):
        a, b = find(a), find(b)
        if a != b:
            parent[a] = b

    at = {}
    for vi in set(indices):
        key = tuple(round(value, 6) for value in points[vi])
        if key in at:
            union(vi, at[key])
        else:
            at[key] = vi
    for k in range(0, len(indices), 3):
        union(indices[k], indices[k + 1])
        union(indices[k], indices[k + 2])
    grouped = defaultdict(list)
    for k in range(0, len(indices), 3):
        grouped[find(indices[k])].extend(indices[k:k + 3])
    if len(grouped) != NODE_EXPECTED_COMPONENTS[node_name]:
        raise SystemExit(f'{node_name}: expected '
                         f'{NODE_EXPECTED_COMPONENTS[node_name]} components, '
                         f'got {len(grouped)}')

    out = []
    for flat in grouped.values():
        vids = set(flat)
        pts = [points[vi] for vi in vids]
        lo = [min(point[axis] for point in pts) for axis in range(3)]
        hi = [max(point[axis] for point in pts) for axis in range(3)]
        span = [hi[axis] - lo[axis] for axis in range(3)]
        center = [(hi[axis] + lo[axis]) / 2 for axis in range(3)]
        out.append({
            'indices': flat, 'points': points, 'lo': lo, 'hi': hi,
            'span': span, 'center': center,
        })
    return out


def classify(node_name, comp):
    lo, hi = comp['lo'], comp['hi']
    span, center = comp['span'], comp['center']
    max_abs_x = max(abs(lo[0]), abs(hi[0]))
    if node_name == 'Object_2':
        return 'drop_track'
    if node_name == 'Object_3':
        donor_gear = (
            lo[1] < -0.15 and hi[1] < -0.02 and span[1] > 0.10
            and abs(center[0]) > 0.65 and max_abs_x < 1.36
            and span[2] < 1.20
        )
        guard = (
            not donor_gear and abs(center[0]) > 1.32
            and span[0] < 0.26 and hi[1] < 0.30
        )
        return 'drop_gear' if donor_gear else ('guard' if guard else 'hull')
    if node_name == 'Object_4':
        return 'hull'
    if node_name == 'Object_5':
        turret = (
            (center[1] > 0.32 and lo[2] > -2.20 and hi[2] < 2.30)
            or (lo[1] > 0.85 and lo[2] > -2.60
                and abs(center[0]) > 1.0)
        )
        return 'turret' if turret else 'hull'

    # Object_6 is the source's fused turret/gun material. Four authored rear
    # rack rails extend to raw z -3.06 and stay hull-owned. The bore sequence
    # is ten exact spatial components; only the nine forward components are
    # length-normalized to the published 9.49 m overall datum.
    if lo[2] < -2.30:
        return 'hull'
    barrel = (lo[2] >= 1.50 and hi[2] > 1.55 and max_abs_x < 0.45)
    gun_root = (0.70 < span[0] < 0.82 and lo[2] > 1.10
                and hi[2] > 1.90 and abs(center[0]) < 0.10)
    return 'gun_barrel' if barrel else ('gun_root' if gun_root else 'turret')


def encode_f32(values):
    return base64.b64encode(struct.pack(f'<{len(values)}f', *values)).decode()


def encode_u32(values):
    return base64.b64encode(struct.pack(f'<{len(values)}I', *values)).decode()


def transform(point, group, barrel=False, comp=None):
    x, y, z = point
    antenna = (comp is not None and comp['hi'][1] > 0.95
               and comp['lo'][2] < -1.75
               and comp['span'][0] < 0.10 and comp['span'][2] < 0.20)
    if antenna:
        x = comp['center'][0] + (x - comp['center'][0]) * ANTENNA_RADIAL_SCALE
        z = comp['center'][2] + (z - comp['center'][2]) * ANTENNA_RADIAL_SCALE
    if y > RAW_TURRET_PIVOT[1]:
        # Preserve one full-height whip as the legal P95 spike. The center
        # and right courses keep all segments but use the compact service
        # height; three full-height courses consume the short-hull spike
        # budget and incorrectly turn antenna tips into the body datum.
        y_scale = (CENTER_ANTENNA_Y_SCALE
                   if antenna and comp['center'][0] > -0.10
                   else ABOVE_RING_Y_SCALE)
        y = (RAW_TURRET_PIVOT[1]
             + (y - RAW_TURRET_PIVOT[1]) * y_scale)
    if barrel:
        z = RAW_GUN_PIVOT[2] + (z - RAW_GUN_PIVOT[2]) * GUN_Z_SCALE
    world = (x * SX, (y - GROUND_Y) * SY,
             (z - HULL_Z_CENTER) * SZ)
    subtract = TURRET_PIVOT if group == 'turret' else (
        GUN_WORLD_PIVOT if group == 'gun' else (0.0, 0.0, 0.0))
    return tuple(world[axis] - subtract[axis] for axis in range(3))


def semantic_geometry(include_donor=False):
    gltf, chunks = oracle.read_glb(SOURCE)
    data = chunks[oracle._bin_chunk_index(chunks)][1]
    classified = defaultdict(list)
    census = defaultdict(int)
    for node_name in NODE_EXPECTED_COMPONENTS:
        for comp in components(gltf, data, node_name):
            kind = classify(node_name, comp)
            census[kind] += 1
            if kind.startswith('drop_'):
                if include_donor:
                    classified['donor'].append((node_name, kind, comp))
            else:
                group = 'gun' if kind.startswith('gun_') else kind
                classified[group].append((node_name, kind, comp))
    if dict(census) != CLASS_EXPECTED_COMPONENTS:
        raise SystemExit(f'classification census drift: {dict(census)}')

    groups = ('hull', 'guard', 'turret', 'gun') + (
        ('donor',) if include_donor else ())
    out = {}
    for group in groups:
        positions, indices, remap = [], [], {}
        for node_name, kind, comp in classified[group]:
            for old in comp['indices']:
                key = (node_name, old)
                if key not in remap:
                    remap[key] = len(positions)
                    positions.append(transform(
                        comp['points'][old],
                        'hull' if group == 'donor' else group,
                        barrel=(kind == 'gun_barrel'), comp=comp))
                indices.append(remap[key])
        got = (len(positions), len(indices) // 3)
        want = EXPECTED.get(group)
        if want is not None and got != want:
            raise SystemExit(f'{group}: expected {want}, got {got}')
        out[group] = {
            'positions': positions,
            'indices': indices,
            'count': got,
        }
    return out, census


def payloads():
    rows, census = semantic_geometry()
    out = {}
    for group in EXPECTED:
        positions = rows[group]['positions']
        indices = rows[group]['indices']
        out[group] = {
            'p': encode_f32([value for point in positions for value in point]),
            'i': encode_u32(indices),
            'count': rows[group]['count'],
        }
    return out, census


def repaired_oracle_bytes():
    rows, _ = semantic_geometry(include_donor=True)
    binary = bytearray()
    views, accessors, meshes, nodes = [], [], [], []

    def append(blob, target):
        while len(binary) % 4:
            binary.append(0)
        offset = len(binary)
        binary.extend(blob)
        views.append({
            'buffer': 0, 'byteOffset': offset, 'byteLength': len(blob),
            'target': target,
        })
        return len(views) - 1

    def mesh_for(group):
        positions = rows[group]['positions']
        indices = rows[group]['indices']
        pblob = struct.pack(f'<{len(positions) * 3}f',
                            *(value for point in positions for value in point))
        iblob = struct.pack(f'<{len(indices)}I', *indices)
        pview = append(pblob, 34962)
        iview = append(iblob, 34963)
        lo = [min(point[axis] for point in positions) for axis in range(3)]
        hi = [max(point[axis] for point in positions) for axis in range(3)]
        accessors.append({
            'bufferView': pview, 'componentType': 5126,
            'count': len(positions), 'type': 'VEC3', 'min': lo, 'max': hi,
        })
        paccessor = len(accessors) - 1
        accessors.append({
            'bufferView': iview, 'componentType': 5125,
            'count': len(indices), 'type': 'SCALAR',
            'min': [min(indices)], 'max': [max(indices)],
        })
        iaccessor = len(accessors) - 1
        meshes.append({
            'name': group,
            'primitives': [{
                'attributes': {'POSITION': paccessor},
                'indices': iaccessor,
                'material': 0,
            }],
        })
        return len(meshes) - 1

    hull_mesh = mesh_for('hull')
    guard_mesh = mesh_for('guard')
    donor_mesh = mesh_for('donor')
    turret_mesh = mesh_for('turret')
    gun_mesh = mesh_for('gun')
    nodes.extend([
        {'name': 'Root', 'children': [1, 2, 3, 4]},
        {'name': 'Hull', 'mesh': hull_mesh},
        {'name': 'TrackGuards', 'mesh': guard_mesh},
        {'name': 'DonorRunningGear', 'mesh': donor_mesh},
        {
            'name': 'Turret', 'mesh': turret_mesh,
            'translation': list(TURRET_PIVOT), 'children': [5],
        },
        {
            'name': 'Gun', 'mesh': gun_mesh,
            'translation': [
                GUN_WORLD_PIVOT[axis] - TURRET_PIVOT[axis]
                for axis in range(3)
            ],
        },
    ])
    gltf = {
        'asset': {
            'version': '2.0',
            'generator': 'tools/type10-source-bake.py',
            'extras': {
                'title': 'Type 10 owner-source semantically repaired oracle',
                'sourceSha256':
                    '2cc5748e4357722fc1c21bf7759ec21c29f84b2cfaf1203b5bee995f4cfeca67',
            },
        },
        'extensionsUsed': ['KHR_materials_unlit'],
        'scene': 0,
        'scenes': [{'nodes': [0]}],
        'nodes': nodes,
        'meshes': meshes,
        'materials': [{
            'name': 'oracle-neutral',
            'pbrMetallicRoughness': {
                'baseColorFactor': [0.39, 0.43, 0.32, 1.0],
                'metallicFactor': 0.0,
                'roughnessFactor': 0.78,
            },
            'doubleSided': True,
            'extensions': {'KHR_materials_unlit': {}},
        }],
        'buffers': [{'byteLength': len(binary)}],
        'bufferViews': views,
        'accessors': accessors,
    }
    js = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
    js += b' ' * ((4 - len(js) % 4) % 4)
    binary.extend(b'\x00' * ((4 - len(binary) % 4) % 4))
    total = 12 + 8 + len(js) + 8 + len(binary)
    return (struct.pack('<III', 0x46546C67, 2, total)
            + struct.pack('<II', len(js), 0x4E4F534A) + js
            + struct.pack('<II', len(binary), 0x004E4942) + bytes(binary))


def current_literals(text):
    out = {}
    for key in EXPECTED:
        match = re.search(
            rf"{key}: \{{ p: '([^']*)', i: '([^']*)' \}}", text)
        if not match:
            raise SystemExit(f'{OUTPUT}: missing {key} DATA row')
        out[key] = {'p': match.group(1), 'i': match.group(2)}
    return out


def main(argv):
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--verify', action='store_true')
    mode.add_argument('--write', action='store_true')
    args = parser.parse_args(argv)
    text = OUTPUT.read_text()
    wanted, census = payloads()
    wanted_oracle = repaired_oracle_bytes()
    have = current_literals(text)
    mismatches = [key for key in EXPECTED
                  if {k: wanted[key][k] for k in ('p', 'i')} != have[key]]
    counts = ', '.join(f'{key}={wanted[key]["count"][0]}v/'
                       f'{wanted[key]["count"][1]}t' for key in EXPECTED)
    if args.verify:
        if mismatches:
            raise SystemExit('Type 10 source bake drift: ' + ', '.join(mismatches))
        if not ORACLE_OUTPUT.exists():
            raise SystemExit(f'Type 10 repaired oracle missing: {ORACLE_OUTPUT}')
        if ORACLE_OUTPUT.read_bytes() != wanted_oracle:
            raise SystemExit(f'Type 10 repaired oracle drift: {ORACLE_OUTPUT}')
        print(f'type10-source-bake: verified {counts}; '
              f'oracle={len(wanted_oracle)}b; census={dict(census)}')
        return 0
    for key in EXPECTED:
        replacement = (f"{key}: {{ p: '{wanted[key]['p']}', "
                       f"i: '{wanted[key]['i']}' }}")
        text, count = re.subn(
            rf"{key}: \{{ p: '[^']*', i: '[^']*' \}}", replacement,
            text, count=1)
        if count != 1:
            raise SystemExit(f'{OUTPUT}: failed to replace {key}')
    OUTPUT.write_text(text)
    ORACLE_OUTPUT.write_bytes(wanted_oracle)
    print(f'type10-source-bake: wrote {OUTPUT} and {ORACLE_OUTPUT}; '
          f'{counts}; oracle={len(wanted_oracle)}b')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
