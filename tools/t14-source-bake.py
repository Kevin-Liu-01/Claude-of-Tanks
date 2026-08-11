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
# Complete source components that form the hollow side-skirt/fender enclosure
# around the native belt.  Keeping them in dedicated guard buckets preserves
# every source triangle while allowing the track-containment audit to treat
# the enclosure as a guard rather than a hull plate pierced by its own track.
TRACK_GUARD_COMPONENTS = {
    'Object_2': {89, 90, 139, 140},
    'Object_3': {0, 103},
    'Object_13': {0, 91},
}
# Filled after the first reviewed source classification.  Counts are compact
# encoded vertices / triangles, not raw accessor domains.
EXPECTED = {
    'trackGuardL': (10128, 11680),
    'trackGuardR': (10106, 11680),
    'hull': (44814, 51616),
    'hullDetail': (17631, 23002),
    'turret': (25751, 35802),
    'turretDetail': (17271, 21436),
    'turretWeapon': (7408, 10128),
    'gun': (6461, 7112),
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


def split_outer_guard_triangles(points, indices):
    """Separate source side-enclosure faces without cutting a triangle."""
    rest, left, right = [], [], []
    for start in range(0, len(indices), 3):
        tri = indices[start:start + 3]
        world = [transform(points[index], 'hull') for index in tri]
        xs = [point[0] for point in world]
        ys = [point[1] for point in world]
        zs = [point[2] for point in world]
        outer = (max(abs(value) for value in xs) >= 1.48 and
                 (all(value > 0 for value in xs) or
                  all(value < 0 for value in xs)) and
                 max(ys) >= 0.80 and min(ys) <= 1.50 and
                 max(zs) >= -3.30 and min(zs) <= 3.85)
        if not outer:
            rest.extend(tri)
        elif sum(xs) > 0:
            right.extend(tri)
        else:
            left.extend(tri)
    return rest, left, right


def double_side_open_components(row):
    """Give authored open sheets a physical reverse face.

    Every material in the supplied OBJ-derived GLB is intentionally marked
    DoubleSide.  The game renders procedural materials FrontSide, so an open
    fender, bracket, sensor skin or armor sheet otherwise disappears from one
    direction even though the source keeps it visible.  Welded edge incidence
    identifies only components with a real boundary; closed pressure solids
    remain single-surface.
    """
    source = list(row['indices'])
    parent = list(range(len(row['positions'])))

    def find(value):
        while parent[value] != value:
            parent[value] = parent[parent[value]]
            value = parent[value]
        return value

    def union(a, b):
        a, b = find(a), find(b)
        if a != b:
            parent[a] = b

    canonical = {}
    canonical_id = {}
    for index, point in enumerate(row['positions']):
        key = tuple(round(value * 1e4) for value in point)
        if key in canonical:
            union(index, canonical[key])
        else:
            canonical[key] = index
        canonical_id[index] = canonical[key]
    for start in range(0, len(source), 3):
        union(source[start], source[start + 1])
        union(source[start + 1], source[start + 2])

    components = {}
    for start in range(0, len(source), 3):
        tri = tuple(source[start:start + 3])
        components.setdefault(find(tri[0]), []).append(tri)

    added = []
    for triangles in components.values():
        edges = {}
        for tri in triangles:
            ids = [canonical_id[index] for index in tri]
            for a, b in ((ids[0], ids[1]), (ids[1], ids[2]),
                         (ids[2], ids[0])):
                if a == b:
                    continue
                key = (min(a, b), max(a, b))
                edges[key] = edges.get(key, 0) + 1
        if not any(count == 1 for count in edges.values()):
            continue
        for a, b, c in triangles:
            added.extend((a, c, b))
    row['indices'].extend(added)


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
            selected = TRACK_GUARD_COMPONENTS.get(node_name)
            if selected is None:
                rows[group].append((node_name, points, indices))
                continue
            for serial, comp in enumerate(components(points, indices)):
                target = group
                if serial in selected:
                    used = {index for index in comp['indices']}
                    mean_x = sum(points[index][0] for index in used) / len(used)
                    # The gate transform mirrors raw X; choose the bucket in
                    # runtime space so labels remain semantically stable.
                    target = 'trackGuardR' if mean_x < 0 else 'trackGuardL'
                    rows[target].append((node_name, points, comp['indices']))
                    continue
                rest, left, right = split_outer_guard_triangles(
                    points, comp['indices'])
                if rest:
                    rows[group].append((node_name, points, rest))
                if left:
                    rows['trackGuardL'].append((node_name, points, left))
                if right:
                    rows['trackGuardR'].append((node_name, points, right))

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
        out[group] = {
            'positions': positions,
            'indices': flat_indices,
            'p': encode_f32([value for point in positions for value in point]),
            'i': encode_u32(flat_indices),
            'counts': (len(positions), len(flat_indices) // 3),
        }
    for row in out.values():
        double_side_open_components(row)
        row['i'] = encode_u32(row['indices'])
        row['counts'] = (len(row['positions']), len(row['indices']) // 3)
    for group, row in out.items():
        want = EXPECTED[group]
        if want is not None and row['counts'] != want:
            raise SystemExit(
                f'{group}: expected {want}, got {row["counts"]}')
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
