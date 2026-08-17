#!/usr/bin/env python3
"""Verify or refresh the owner-source T-14 geometry payload.

The 3DYAROSLAV2 GLB is a local-only measurement oracle.  Complete source
material nodes provide the hull and turret; donor tracks, wheels and end
drums are excluded so the playable keeps the fleet-native seven-wheel track
system.  Object_14 mixes the 2A82 and roof weapons, so it is split only at
whole spatial-component boundaries: forward components elevate with the gun,
while rear roof equipment remains turret-owned.

Usage:
  python3 tools/t14-source-bake.py --verify
  python3 tools/t14-source-bake.py --write
"""
from __future__ import annotations

import argparse
import base64
from collections import defaultdict
import hashlib
import re
import struct
import sys
from pathlib import Path

import repair_oracles as oracle


ROOT = Path(__file__).resolve().parent.parent
SOURCE = (ROOT / 'public/models/community-candidates/'
          't-14_armara_uralvagon_factory.glb')
OUTPUT = ROOT / 'src/vehicles/profiles/t14-source-geometry.js'
SOURCE_SHA256 = '02785328797c80090fd0e9c48b5bb6fe8e7a1e3fac4d340138fede6348c8d2b3'

# Gate-parity source frame from docs/references/vertex/t14.json.  The width
# anchor is exact; the hull is 8.639 m long in the supplied model, addressing
# the owner's overlong/low procedural read without stretching the source.
SCALE = 2.057775
OFFSET = (0.0, 0.0347, 0.6785)
TURRET_PIVOT = (0.001, 1.836, -0.597)
GUN_WORLD_PIVOT = (0.0, 2.03, 0.0)
BARREL_KNEE_Z = 2.0
BARREL_TIP_Z = 5.643
TARGET_BARREL_TIP_Z = 6.45

NODE_GROUPS = {
    'hull': ('Object_2', 'Object_3'),
    'hullDetail': ('Object_12', 'Object_13'),
    'turret': ('Object_8', 'Object_9'),
    'turretDetail': ('Object_10', 'Object_11'),
    'turretWeapon': ('Object_15',),
}
# Filled after the first reviewed source classification.  Counts are compact
# encoded vertices / triangles, not raw accessor domains.
EXPECTED = {
    'hull': (61800, 56697),
    'hullDetail': (20671, 17485),
    'turret': (25751, 21351),
    'turretDetail': (17271, 18113),
    'turretWeapon': (7408, 7330),
    'gun': (6461, 5500),
}


def source_bytes():
    data = SOURCE.read_bytes()
    got = hashlib.sha256(data).hexdigest()
    if got != SOURCE_SHA256:
        raise SystemExit(f'T-14 source drift: expected {SOURCE_SHA256}, got {got}')
    return data


def mesh_data(gltf, data, node_name):
    ni = oracle.find_node(gltf, node_name)
    node = gltf['nodes'][ni]
    prim = gltf['meshes'][node['mesh']]['primitives'][0]
    points = oracle._read_rows(
        gltf, data, prim['attributes']['POSITION'])
    indices = [row[0] for row in oracle._read_rows(
        gltf, data, prim['indices'])]
    world = oracle.node_world_matrix(gltf, ni)
    points = [oracle.transform_point(world, point) for point in points]
    return points, indices


def components(points, indices):
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
    out = []
    for flat in grouped.values():
        pts = [points[vi] for vi in set(flat)]
        out.append({
            'indices': flat,
            'lo': [min(point[axis] for point in pts) for axis in range(3)],
            'hi': [max(point[axis] for point in pts) for axis in range(3)],
        })
    return out


def transform(point, group):
    x, y, z = point
    world = [-x * SCALE + OFFSET[0],
             y * SCALE + OFFSET[1],
             -z * SCALE + OFFSET[2]]
    if group == 'gun' and world[2] > BARREL_KNEE_Z:
        factor = ((TARGET_BARREL_TIP_Z - BARREL_KNEE_Z) /
                  (BARREL_TIP_Z - BARREL_KNEE_Z))
        world[2] = BARREL_KNEE_Z + (world[2] - BARREL_KNEE_Z) * factor
    subtract = (GUN_WORLD_PIVOT if group == 'gun' else
                (TURRET_PIVOT if group.startswith('turret') else
                 (0.0, 0.0, 0.0)))
    return tuple(world[axis] - subtract[axis] for axis in range(3))


def encode_f32(values):
    return base64.b64encode(
        struct.pack(f'<{len(values)}f', *values)).decode()


def encode_u32(values):
    return base64.b64encode(
        struct.pack(f'<{len(values)}I', *values)).decode()


def payloads():
    source_bytes()
    gltf, chunks = oracle.read_glb(SOURCE)
    data = chunks[oracle._bin_chunk_index(chunks)][1]
    rows = {group: [] for group in EXPECTED}
    for group, node_names in NODE_GROUPS.items():
        for node_name in node_names:
            points, indices = mesh_data(gltf, data, node_name)
            rows[group].append((node_name, points, indices))

    # Object_14 contains both the forward 2A82 course and small rear roof
    # weapon pieces.  The source faces forward along raw -z.  No triangle is
    # cut: only components wholly forward of raw z=0 elevate with the gun.
    points, indices = mesh_data(gltf, data, 'Object_14')
    for comp in components(points, indices):
        group = 'gun' if comp['hi'][2] < 0.0 else 'turretWeapon'
        rows[group].append(('Object_14', points, comp['indices']))

    out = {}
    for group, sources in rows.items():
        positions, flat_indices, remap = [], [], {}
        for serial, (node_name, points, indices) in enumerate(sources):
            for old in indices:
                key = (serial, node_name, old)
                if key not in remap:
                    remap[key] = len(positions)
                    positions.append(transform(points[old], group))
                flat_indices.append(remap[key])
        got = (len(positions), len(flat_indices) // 3)
        want = EXPECTED[group]
        if want is not None and got != want:
            raise SystemExit(f'{group}: expected {want}, got {got}')
        out[group] = {
            'p': encode_f32([value for point in positions for value in point]),
            'i': encode_u32(flat_indices),
            'counts': got,
        }
    return out


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
    wanted = payloads()
    have = current_literals(text)
    mismatches = [key for key in EXPECTED
                  if {'p': wanted[key]['p'], 'i': wanted[key]['i']} != have[key]]
    counts = ', '.join(f'{key}={wanted[key]["counts"]}' for key in EXPECTED)
    if args.verify:
        if mismatches:
            raise SystemExit('T-14 source bake drift: ' + ', '.join(mismatches))
        print('t14-source-bake: verified ' + counts +
              '; donor running gear excluded')
        return 0
    for key in EXPECTED:
        row = wanted[key]
        replacement = f"{key}: {{ p: '{row['p']}', i: '{row['i']}' }}"
        text, count = re.subn(
            rf"{key}: \{{ p: '[^']*', i: '[^']*' \}}", replacement,
            text, count=1)
        if count != 1:
            raise SystemExit(f'{OUTPUT}: failed to replace {key}')
    OUTPUT.write_text(text)
    print(f't14-source-bake: wrote {OUTPUT}; {counts}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
