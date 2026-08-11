#!/usr/bin/env python3
"""Verify or refresh the T-80U exact-source upper-vehicle payload.

The attributed javanilga GLB is also the owner's supplied ``tank_t-80u.glb``
source, after the repository's established node repair/normalization.  This
tool applies the same runtime dimension fit, merges only hull/turret/gun
source nodes, and deliberately excludes every donor wheel, sprocket, idler
and track node.  Live running gear remains the fleet-native procedural system.

Usage:
  python3 tools/t80u-source-bake.py --verify
  python3 tools/t80u-source-bake.py --write
"""
from __future__ import annotations

import argparse
import base64
import json
import re
import struct
import sys
from pathlib import Path

import repair_oracles as oracle


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'public/models/tanks/t80u_javanilga.glb'
OUTPUT = ROOT / 'src/vehicles/profiles/t80u-source-geometry.js'
HULL_NODES = ('Object_8', 'Object_4', 'Object_6')
TURRET_ROOT = 'Object09_24'
GUN_ROOT = 'Object1101_22'
TARGET_HULL_LENGTH = 7.01


def descendants(gltf, root):
    out = []
    todo = [oracle.find_node(gltf, root)]
    while todo:
        ni = todo.pop()
        out.append(ni)
        todo.extend(gltf['nodes'][ni].get('children', []))
    return out


def mesh_rows(gltf, binary, node_indices):
    points, indices = [], []
    for ni in node_indices:
        node = gltf['nodes'][ni]
        if 'mesh' not in node:
            continue
        world = oracle.node_world_matrix(gltf, ni)
        for primitive in gltf['meshes'][node['mesh']]['primitives']:
            local = oracle._read_rows(
                gltf, binary, primitive['attributes']['POSITION'])
            raw_indices = [row[0] for row in oracle._read_rows(
                gltf, binary, primitive['indices'])]
            base = len(points)
            points.extend(oracle.transform_point(world, point)
                          for point in local)
            indices.extend(base + value for value in raw_indices)
    return points, indices


def bbox(points):
    return ([min(p[a] for p in points) for a in range(3)],
            [max(p[a] for p in points) for a in range(3)])


def normalize(points, scale, center_x, ground_y, center_z):
    return [((x - center_x) * scale,
             (y - ground_y) * scale,
             (z - center_z) * scale) for x, y, z in points]


def encode_f32(points):
    flat = [value for point in points for value in point]
    return base64.b64encode(
        struct.pack(f'<{len(flat)}f', *flat)).decode()


def encode_u32(indices):
    return base64.b64encode(
        struct.pack(f'<{len(indices)}I', *indices)).decode()


def payloads():
    gltf, chunks = oracle.read_glb(SOURCE)
    binary = chunks[oracle._bin_chunk_index(chunks)][1]
    hull_ids = [oracle.find_node(gltf, name) for name in HULL_NODES]
    turret_ids = descendants(gltf, TURRET_ROOT)
    gun_ids = descendants(gltf, GUN_ROOT)
    hull, hi = mesh_rows(gltf, binary, hull_ids)
    turret, ti = mesh_rows(gltf, binary, turret_ids)
    gun, gi = mesh_rows(gltf, binary, gun_ids)

    # Match modelLoader's hull-only real-dimension fit.  The repaired source
    # hull package spans the authored full side-screen envelope; its gun is a
    # sibling and therefore excluded from the length box exactly as at runtime.
    all_without_gun = hull + turret
    lo, high = bbox(all_without_gun)
    scale = TARGET_HULL_LENGTH / (high[2] - lo[2])
    center_x = (lo[0] + high[0]) / 2
    ground_y = lo[1]
    center_z = (lo[2] + high[2]) / 2
    hull = normalize(hull, scale, center_x, ground_y, center_z)
    turret = normalize(turret, scale, center_x, ground_y, center_z)
    gun = normalize(gun, scale, center_x, ground_y, center_z)

    tlo, thi = bbox(turret)
    turret_pivot = ((tlo[0] + thi[0]) / 2, max(tlo[1], 0.4),
                    (tlo[2] + thi[2]) / 2)
    glo, ghi = bbox(gun)
    gun_pivot = ((glo[0] + ghi[0]) / 2, (glo[1] + ghi[1]) / 2,
                 glo[2] + (ghi[2] - glo[2]) * 0.12)
    turret = [(x - turret_pivot[0], y - turret_pivot[1],
               z - turret_pivot[2]) for x, y, z in turret]
    gun = [(x - gun_pivot[0], y - gun_pivot[1], z - gun_pivot[2])
           for x, y, z in gun]
    rows = {
        'hull': {'p': encode_f32(hull), 'i': encode_u32(hi)},
        'turret': {'p': encode_f32(turret), 'i': encode_u32(ti)},
        'gun': {'p': encode_f32(gun), 'i': encode_u32(gi)},
    }
    meta = {
        'turretPivot': [round(v, 9) for v in turret_pivot],
        'gunWorldPivot': [round(v, 9) for v in gun_pivot],
        'muzzleZ': round(ghi[2] - gun_pivot[2], 9),
        'counts': {key: [len(points), len(indices) // 3]
                   for key, points, indices in (
                       ('hull', hull, hi), ('turret', turret, ti),
                       ('gun', gun, gi))},
    }
    return rows, meta


def literals(text):
    rows = {}
    for key in ('hull', 'turret', 'gun'):
        match = re.search(
            rf"{key}: \{{ p: '([^']*)', i: '([^']*)' \}}", text)
        if not match:
            raise SystemExit(f'{OUTPUT}: missing {key} DATA row')
        rows[key] = {'p': match.group(1), 'i': match.group(2)}
    match = re.search(r'const SOURCE_META = (\{.*?\});', text)
    if not match:
        raise SystemExit(f'{OUTPUT}: missing SOURCE_META')
    return rows, json.loads(match.group(1))


def main(argv):
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--verify', action='store_true')
    mode.add_argument('--write', action='store_true')
    args = parser.parse_args(argv)
    text = OUTPUT.read_text()
    wanted, meta = payloads()
    have, old_meta = literals(text)
    mismatches = [key for key in wanted if wanted[key] != have[key]]
    if meta != old_meta:
        mismatches.append('meta')
    if args.verify:
        if mismatches:
            raise SystemExit('T-80U source bake drift: ' + ', '.join(mismatches))
        total_v = sum(v[0] for v in meta['counts'].values())
        total_t = sum(v[1] for v in meta['counts'].values())
        print(f't80u-source-bake: verified 3 source payloads '
              f'({total_v:,} vertices; {total_t:,} triangles; donor gear excluded)')
        return 0
    for key in wanted:
        replacement = (f"{key}: {{ p: '{wanted[key]['p']}', "
                       f"i: '{wanted[key]['i']}' }}")
        text, count = re.subn(
            rf"{key}: \{{ p: '[^']*', i: '[^']*' \}}", replacement,
            text, count=1)
        if count != 1:
            raise SystemExit(f'{OUTPUT}: failed to replace {key}')
    text, count = re.subn(
        r'const SOURCE_META = \{.*?\};',
        'const SOURCE_META = ' + json.dumps(meta, separators=(',', ':')) + ';',
        text, count=1)
    if count != 1:
        raise SystemExit(f'{OUTPUT}: failed to replace SOURCE_META')
    OUTPUT.write_text(text)
    print(f't80u-source-bake: wrote {OUTPUT}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
