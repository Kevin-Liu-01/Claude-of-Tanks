#!/usr/bin/env python3
"""Verify or refresh the FV510 exact-source geometry payload.

The repaired CC-BY oracle is the authoritative input.  This tool applies the
same width-true, yaw-180 runtime frame used by the fidelity harness, removes
the donor running gear at whole spatial-component boundaries, compacts the
repaired Hull index domain, and rewrites only the four base64 position/index
literals in profiles/fv510-source-geometry.js.  The Track row is retained as
reproducible source evidence but is never rendered; FV510 uses the native
procedural running-gear system.

Usage:
  python3 tools/fv510-source-bake.py --verify
  python3 tools/fv510-source-bake.py --write
"""
from __future__ import annotations

import argparse
import base64
import re
import struct
import sys
from pathlib import Path

import repair_oracles as oracle


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'public/models/tanks/community/fv510_warrior.glb'
OUTPUT = ROOT / 'src/vehicles/profiles/fv510-source-geometry.js'
SCALE = 226.42858034570025
# Exact world-space minimum of the repaired donor (the Track lower run).
GROUND_Y = -0.008613259599806524
TURRET_PIVOT = (0.0, 1.9502881433331656, 0.0)
GUN_WORLD_PIVOT = (0.17724602393905647, 2.0095263859349415,
                   1.3262918738176461)
NODES = {
    'track': 'Object_Track.jpg_mat_0-Track.jpg_0',
    'hull': 'Hull',
    'turret': 'Turret',
    'gun': 'Gun',
}
EXPECTED = {
    'track': (558, 480),
    'hull': (24614, 19000),
    'turret': (4565, 3989),
    'gun': (438, 410),
}


def strip_donor_running_gear(points, indices):
    """Remove source wheels/end-drums without cutting a triangle.

    The repaired Hull has 593 spatially connected authored solids after
    exact export-seam welding.  Road wheels and end drums occupy a strict
    low/inboard envelope; Warrior skirts, strakes and guards sit farther
    outboard or have higher/thinner bounds.  Classifying complete components
    preserves every retained face and prevents donor/native wheel overlap.
    """
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
    used = set(indices)
    for vi in sorted(used):
        # Six decimals in runtime metres is sub-micron for this payload and
        # exactly reunites the donor's UV/normal export splits.
        key = tuple(round(v, 6) for v in points[vi])
        if key in at:
            union(vi, at[key])
        else:
            at[key] = vi
    for k in range(0, len(indices), 3):
        union(indices[k], indices[k + 1])
        union(indices[k], indices[k + 2])
    comps = {}
    for k in range(0, len(indices), 3):
        tri = indices[k:k + 3]
        comps.setdefault(find(tri[0]), []).append(tri)
    if len(comps) != 593:
        raise SystemExit(f'hull: expected 593 spatial components, got '
                         f'{len(comps)}')

    removed = set()
    for root, tris in comps.items():
        vids = {v for tri in tris for v in tri}
        pts = [points[v] for v in vids]
        lo = [min(p[a] for p in pts) for a in range(3)]
        hi = [max(p[a] for p in pts) for a in range(3)]
        span = [hi[a] - lo[a] for a in range(3)]
        center_x = (lo[0] + hi[0]) / 2
        max_abs_x = max(abs(lo[0]), abs(hi[0]))
        donor_gear = (hi[1] <= 1.10 and lo[1] < 0.80
                      and span[1] > 0.12 and abs(center_x) > 0.65
                      and max_abs_x < 1.29)
        if donor_gear:
            removed.add(root)
    if len(removed) != 34:
        raise SystemExit(f'hull: expected 34 donor-gear components, got '
                         f'{len(removed)}')

    flat = [v for root, tris in comps.items() if root not in removed
            for tri in tris for v in tri]
    order = sorted(set(flat))
    remap = {old: new for new, old in enumerate(order)}
    compact = [points[old] for old in order]
    return compact, [remap[old] for old in flat]


def encode_f32(values):
    return base64.b64encode(struct.pack(f'<{len(values)}f', *values)).decode()


def encode_u32(values):
    return base64.b64encode(struct.pack(f'<{len(values)}I', *values)).decode()


def payloads():
    gltf, chunks = oracle.read_glb(SOURCE)
    data = chunks[oracle._bin_chunk_index(chunks)][1]
    out = {}
    for key, node_name in NODES.items():
        ni = oracle.find_node(gltf, node_name)
        node = gltf['nodes'][ni]
        prim = gltf['meshes'][node['mesh']]['primitives'][0]
        positions = oracle._read_rows(
            gltf, data, prim['attributes']['POSITION'])
        indices = [row[0] for row in oracle._read_rows(
            gltf, data, prim['indices'])]
        world = oracle.node_world_matrix(gltf, ni)
        runtime = []
        subtract = TURRET_PIVOT if key == 'turret' else (
            GUN_WORLD_PIVOT if key == 'gun' else (0.0, 0.0, 0.0))
        for pos in positions:
            x, y, z = oracle.transform_point(world, pos)
            runtime.append((-x * SCALE - subtract[0],
                            (y - GROUND_Y) * SCALE - subtract[1],
                            -z * SCALE - subtract[2]))

        # The repaired Hull intentionally retains the donor POSITION accessor
        # while its index accessor names only hull-owned triangles. Remove the
        # donor wheel/end-drum components, then compact so the runtime payload
        # contains neither turret/gun vertices nor duplicate running gear.
        # The other repaired nodes are already compact.
        if key == 'hull':
            runtime, indices = strip_donor_running_gear(runtime, indices)

        want_verts, want_tris = EXPECTED[key]
        got = (len(runtime), len(indices) // 3)
        if got != (want_verts, want_tris):
            raise SystemExit(f'{key}: expected {EXPECTED[key]}, got {got}')
        flat = [value for point in runtime for value in point]
        out[key] = {'p': encode_f32(flat), 'i': encode_u32(indices)}
    return out


def current_literals(text):
    out = {}
    for key in NODES:
        match = re.search(
            rf"{key}: \{{ p: '([^']+)', i: '([^']+)' \}}", text)
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
    mismatches = [key for key in NODES if wanted[key] != have[key]]
    if args.verify:
        if mismatches:
            raise SystemExit('FV510 source bake drift: ' + ', '.join(mismatches))
        print('fv510-source-bake: verified 4 source-derived payloads '
              '(30,175 encoded vertices; 23,879 triangles; donor track '
              'evidence retained but not rendered)')
        return 0
    for key in NODES:
        replacement = f"{key}: {{ p: '{wanted[key]['p']}', i: '{wanted[key]['i']}' }}"
        text, count = re.subn(
            rf"{key}: \{{ p: '[^']+', i: '[^']+' \}}", replacement, text,
            count=1)
        if count != 1:
            raise SystemExit(f'{OUTPUT}: failed to replace {key}')
    OUTPUT.write_text(text)
    print(f'fv510-source-bake: wrote {OUTPUT}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
