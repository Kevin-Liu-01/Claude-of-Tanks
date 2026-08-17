#!/usr/bin/env python3
"""Bake the owner-supplied Type 99A2 upper geometry for the playable.

The source is a material-bucket export with every mesh under one root.  This
script restores semantic articulation at whole-mesh / whole-connected-
component boundaries: the hull stays fixed; turret armor, ERA and roof kit
yaw together; the mantlet and gun elevate together.  Donor tracks, wheels,
arms and end drums are intentionally excluded so the game-native six-wheel
running gear remains authoritative.

Usage:
  python3 tools/type99a-source-bake.py --write
  python3 tools/type99a-source-bake.py --verify
"""
from __future__ import annotations

import argparse
import base64
from collections import defaultdict
import hashlib
import shutil
import struct
import sys
from pathlib import Path

import repair_oracles as oracle


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'public/models/community-candidates/type_99a2_armored_warfare.glb'
OUTPUT = ROOT / 'src/vehicles/profiles/type99a-source-geometry.js'
SOURCE_SHA256 = '35024b8262ae065153da0f704f1c42a66b4a8e239a46a525af76ee12c405043f'

# Gate-parity transform from docs/references/vertex/type99a.json.
SCALE = 0.99865
OFFSET = (-0.0039, -0.0252, 0.3609)
TURRET_PIVOT = (0.0, 1.001, 0.05)
GUN_WORLD_PIVOT = (0.0, 1.94, 2.05)

NODE_GROUPS = {
    'hull': ('Object_27',),
    'hullDetail': ('Object_2', 'Object_22', 'Object_24', 'Object_28'),
    'turret': ('Object_31',),
    'turretDetail': (
        'Object_3', 'Object_4', 'Object_6', 'Object_9', 'Object_10',
        'Object_11', 'Object_12', 'Object_15', 'Object_16', 'Object_19',
        'Object_20', 'Object_23', 'Object_30',
    ),
    'gun': ('Object_7', 'Object_13', 'Object_17', 'Object_21'),
}
DONOR_GEAR = ('Object_5', 'Object_8', 'Object_14', 'Object_18',
              'Object_25', 'Object_26')

# Filled after the first reviewed bake.  Values are compact encoded vertices
# and triangles, not the source accessor domains.
EXPECTED = {
    'hull': (16239, 12640),
    'hullDetail': (1262, 888),
    'turret': (13666, 11207),
    'turretDetail': (2295, 1868),
    'gun': (8082, 7696),
}


def source_bytes():
    data = SOURCE.read_bytes()
    got = hashlib.sha256(data).hexdigest()
    if got != SOURCE_SHA256:
        raise SystemExit(f'Type 99A2 source drift: expected {SOURCE_SHA256}, got {got}')
    return data


def mesh_data(gltf, data, node_name):
    ni = oracle.find_node(gltf, node_name)
    node = gltf['nodes'][ni]
    prim = gltf['meshes'][node['mesh']]['primitives'][0]
    points = oracle._read_rows(gltf, data, prim['attributes']['POSITION'])
    indices = [row[0] for row in oracle._read_rows(gltf, data, prim['indices'])]
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
    world = tuple(point[axis] * SCALE + OFFSET[axis] for axis in range(3))
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
    for group, names in NODE_GROUPS.items():
        for name in names:
            points, indices = mesh_data(gltf, data, name)
            rows[group].append((name, points, indices))

    # Object_29 mixes forward hull ERA/lights with turret cheek and optic
    # solids.  Split only its complete connected islands.  Turret islands sit
    # above y=1.50 and aft of source z=2.0; the forward lower islands remain
    # fixed to the hull.  No vertex or triangle is cut.
    points, indices = mesh_data(gltf, data, 'Object_29')
    for comp in components(points, indices):
        group = ('turretDetail'
                 if comp['lo'][1] >= 1.50 and comp['hi'][2] <= 2.0
                 else 'hullDetail')
        rows[group].append(('Object_29', points, comp['indices']))

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


def render(data):
    rows = '\n'.join(
        f"  {key}: {{ p: '{data[key]['p']}', i: '{data[key]['i']}' }},"
        for key in EXPECTED)
    return f"""// GENERATED by tools/type99a-source-bake.py from the owner-supplied Type 99A2.
// Do not hand-edit encoded arrays. Donor running gear is intentionally absent.
import * as THREE from 'three';

const DATA = {{
{rows}
}};

const TURRET_PIVOT = [{TURRET_PIVOT[0]}, {TURRET_PIVOT[1]}, {TURRET_PIVOT[2]}];
const GUN_WORLD_PIVOT = [{GUN_WORLD_PIVOT[0]}, {GUN_WORLD_PIVOT[1]}, {GUN_WORLD_PIVOT[2]}];

function bytes(s) {{
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}}

function geometry(row) {{
  if (!row.positions) {{
    const pb = bytes(row.p), ib = bytes(row.i);
    row.positions = new Float32Array(pb.buffer, pb.byteOffset, pb.byteLength / 4);
    row.indices = new Uint32Array(ib.buffer, ib.byteOffset, ib.byteLength / 4);
  }}
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(row.positions, 3));
  g.setIndex(new THREE.BufferAttribute(row.indices, 1));
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let k = 0; k < p.count; k++) {{
    const nx = Math.abs(n.getX(k)), ny = Math.abs(n.getY(k)), nz = Math.abs(n.getZ(k));
    let u, v;
    if (ny >= nx && ny >= nz) {{ u = p.getX(k); v = p.getZ(k); }}
    else if (nx >= nz) {{ u = p.getZ(k); v = p.getY(k); }}
    else {{ u = p.getX(k); v = p.getY(k); }}
    uv[k * 2] = u * 0.35; uv[k * 2 + 1] = v * 0.35;
  }}
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}}

export function buildType99ASourceGeometry(P) {{
  P.turretG.position.fromArray(TURRET_PIVOT);
  P.gunG.position.set(
    GUN_WORLD_PIVOT[0] - TURRET_PIVOT[0],
    GUN_WORLD_PIVOT[1] - TURRET_PIVOT[1],
    GUN_WORLD_PIVOT[2] - TURRET_PIVOT[2]);
  P.add('hull', geometry(DATA.hull));
  P.add('hullDetail', geometry(DATA.hullDetail));
  P.add('turret', geometry(DATA.turret));
  P.add('turretDetail', geometry(DATA.turretDetail));
  P.add('gunDark', geometry(DATA.gun));

  const mgMarker = new THREE.Group();
  mgMarker.name = 'fitting_type99aSourceQJC88';
  mgMarker.userData.fittingRoot = true;
  mgMarker.userData.fitting = 'pintleMG';
  P.turretG.add(mgMarker);
  P.muzzleZ = 7.764;
  P.topY = 3.35;
}}
"""


def main(argv):
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--verify', action='store_true')
    mode.add_argument('--write', action='store_true')
    args = parser.parse_args(argv)
    data = payloads()
    wanted = render(data)
    counts = ', '.join(f'{key}={data[key]["counts"]}' for key in EXPECTED)
    if args.verify:
        if not OUTPUT.exists() or OUTPUT.read_text() != wanted:
            raise SystemExit('Type 99A2 source bake drift')
        print('type99a-source-bake: verified ' + counts +
              '; donor running gear excluded')
        return 0
    if OUTPUT.exists():
        shutil.copy2(OUTPUT, OUTPUT.with_suffix(OUTPUT.suffix + '.bak'))
    OUTPUT.write_text(wanted)
    print(f'type99a-source-bake: wrote {OUTPUT}; {counts}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
