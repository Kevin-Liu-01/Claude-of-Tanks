#!/usr/bin/env python3
"""Verify or refresh the owner-source AMX-40 geometry payload.

The local-only Armored Warfare GLB supplies the exact upper hull, turret,
mantlet furniture and CN120. Donor track/wheel nodes are deliberately omitted;
the playable retains its six-wheel fleet-native animated running gear.

Usage:
  python3 tools/amx40-source-bake.py --verify
  python3 tools/amx40-source-bake.py --write
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import re
import struct
import sys
from pathlib import Path

import repair_oracles as oracle


ROOT = Path(__file__).resolve().parent.parent
SOURCE = (ROOT / 'public/models/community-candidates/'
          'amx-40_armored_warfare.glb')
OUTPUT = ROOT / 'src/vehicles/profiles/amx40-source-geometry.js'
SOURCE_SHA256 = '570a12b0ced56299061fc0a57c3f86343d2aa45e2fb79d53e049f58da2e9849d'

# Exact gate-parity normalization from docs/references/vertex/amx40.json.
SCALE = 1.000447
OFFSET = (-0.0013, -0.0014, 0.0469)
TURRET_PIVOT = (-0.001, 1.545, -0.421)
GUN_WORLD_PIVOT = (0.0, 1.94, 1.30)

GROUPS = {
    # Objects 10/17/18/19/21/22/23 are donor gear and never enter DATA.
    'hull': ('Object_9', 'Object_16'),
    'hullDetail': ('Object_3', 'Object_4', 'Object_13'),
    'turret': ('Object_12',),
    'turretDetail': ('Object_6', 'Object_7', 'Object_8',
                     'Object_11', 'Object_24'),
    # Mantlet/LLLTV/coax parts physically elevate with the CN120.
    'gun': ('Object_2', 'Object_5', 'Object_14', 'Object_15', 'Object_20'),
}
EXPECTED = {
    'hull': (37971, 28838),
    'hullDetail': (4184, 3721),
    'turret': (25923, 20574),
    'turretDetail': (4393, 3722),
    'gun': (4281, 3850),
}


def source_bytes():
    data = SOURCE.read_bytes()
    got = hashlib.sha256(data).hexdigest()
    if got != SOURCE_SHA256:
        raise SystemExit(f'AMX-40 source drift: expected {SOURCE_SHA256}, got {got}')


def encode_f32(values):
    return base64.b64encode(
        struct.pack(f'<{len(values)}f', *values)).decode()


def encode_u32(values):
    return base64.b64encode(
        struct.pack(f'<{len(values)}I', *values)).decode()


def transform(point, group):
    world = tuple(point[axis] * SCALE + OFFSET[axis] for axis in range(3))
    subtract = (GUN_WORLD_PIVOT if group == 'gun' else
                (TURRET_PIVOT if group.startswith('turret') else
                 (0.0, 0.0, 0.0)))
    return tuple(world[axis] - subtract[axis] for axis in range(3))


def payloads():
    source_bytes()
    gltf, chunks = oracle.read_glb(SOURCE)
    data = chunks[oracle._bin_chunk_index(chunks)][1]
    out = {}
    for group, node_names in GROUPS.items():
        positions, indices = [], []
        for node_name in node_names:
            ni = oracle.find_node(gltf, node_name)
            node = gltf['nodes'][ni]
            prim = gltf['meshes'][node['mesh']]['primitives'][0]
            points = oracle._read_rows(
                gltf, data, prim['attributes']['POSITION'])
            old_indices = [row[0] for row in oracle._read_rows(
                gltf, data, prim['indices'])]
            world = oracle.node_world_matrix(gltf, ni)
            base = len(positions)
            positions.extend(transform(oracle.transform_point(world, point), group)
                             for point in points)
            indices.extend(base + old for old in old_indices)
        got = (len(positions), len(indices) // 3)
        want = EXPECTED[group]
        if want is not None and got != want:
            raise SystemExit(f'{group}: expected {want}, got {got}')
        out[group] = {
            'p': encode_f32([value for point in positions for value in point]),
            'i': encode_u32(indices),
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
            raise SystemExit('AMX-40 source bake drift: ' + ', '.join(mismatches))
        print('amx40-source-bake: verified ' + counts +
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
    print(f'amx40-source-bake: wrote {OUTPUT}; {counts}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
