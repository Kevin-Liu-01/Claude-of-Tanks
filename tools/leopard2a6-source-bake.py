#!/usr/bin/env python3
"""Bake the owner-supplied Leopard 2A6 GLB into articulated source geometry.

The source keeps hull, turret and gun as separate semantic meshes. Donor
tracks, road wheels, rollers and terminal gears are deliberately excluded so
the playable vehicle retains the fleet-native animated linked-shoe system.

Usage:
  python3 tools/leopard2a6-source-bake.py --write
  python3 tools/leopard2a6-source-bake.py --verify
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SOURCE = Path('/Users/kevinliu/Downloads/leopard_2_a6.glb')
OUTPUT = ROOT / 'src/vehicles/profiles/leopard2a6-source-geometry.js'
SOURCE_SHA256 = 'b98d81990ecf8a65e8d7f81158226f1bd55fe71d6e923c4f896151d7ee237477'

# Source semantic nodes/meshes. These are stable under the frozen source hash.
GROUPS = {
    'hull': (11, 4),
    'turret': (9, 3),
    'gun': (21, 9),
}

# Owner-model datum. Width normalization puts this source's 7.63049-unit hull
# at 7.51 m; preserving that authored aspect ratio is more faithful than
# stretching only the plan axis to the 7.72 m published nominal. Its raw
# complete L/55 envelope then lands at the documented ~10.96 m.
TARGET_HULL_LENGTH = 7.51
TARGET_WIDTH = 3.75

# The raw source ships two 1.6 m bustle whips upright. The registered project
# oracle uses the same physically valid Bundeswehr tied-down pose: a rigid
# -90-degree fold about each whip's shared base line, without deleting,
# scaling or reshaping a source vertex. The exact census makes source drift
# fail closed.
WHIP_BOXES = [
    (-0.95, -0.88, 1.42, 3.10, 2.05, 2.40),
    (0.85, 0.92, 1.42, 3.10, 2.05, 2.40),
]
WHIP_PIVOT = (1.4310, 2.1243)  # GLB-world (y, z)
WHIP_VERTICES = 104

COMPONENT = {
    5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2),
    5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4),
}
ARITY = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def glb():
    data = SOURCE.read_bytes()
    got = sha(data)
    if got != SOURCE_SHA256:
        raise SystemExit(f'Leopard 2A6 source drift: {got}')
    if data[:4] != b'glTF' or struct.unpack_from('<I', data, 4)[0] != 2:
        raise SystemExit('Leopard 2A6 source is not GLB v2')
    doc = binary = None
    offset = 12
    while offset < len(data):
        size, kind = struct.unpack_from('<II', data, offset)
        payload = data[offset + 8:offset + 8 + size]
        offset += 8 + size
        if kind == 0x4E4F534A:
            doc = json.loads(payload)
        elif kind == 0x004E4942:
            binary = payload
    if doc is None or binary is None:
        raise SystemExit('Leopard 2A6 GLB is missing JSON or BIN data')
    return doc, binary


def matrix_for(node):
    if 'matrix' in node:
        return node['matrix']
    tx, ty, tz = node.get('translation', [0.0, 0.0, 0.0])
    sx, sy, sz = node.get('scale', [1.0, 1.0, 1.0])
    x, y, z, w = node.get('rotation', [0.0, 0.0, 0.0, 1.0])
    return [
        (1 - 2*y*y - 2*z*z) * sx, (2*x*y + 2*z*w) * sx,
        (2*x*z - 2*y*w) * sx, 0.0,
        (2*x*y - 2*z*w) * sy, (1 - 2*x*x - 2*z*z) * sy,
        (2*y*z + 2*x*w) * sy, 0.0,
        (2*x*z + 2*y*w) * sz, (2*y*z - 2*x*w) * sz,
        (1 - 2*x*x - 2*y*y) * sz, 0.0,
        tx, ty, tz, 1.0,
    ]


def mmul(a, b):
    # GLTF matrices are column-major.
    return [
        sum(a[k * 4 + row] * b[col * 4 + k] for k in range(4))
        for col in range(4) for row in range(4)
    ]


def transform(matrix, point):
    p = (*point, 1.0)
    return tuple(
        sum(matrix[col * 4 + row] * p[col] for col in range(4))
        for row in range(3)
    )


def accessor(doc, binary, index):
    a = doc['accessors'][index]
    view = doc['bufferViews'][a['bufferView']]
    fmt, width = COMPONENT[a['componentType']]
    arity = ARITY[a['type']]
    stride = view.get('byteStride', width * arity)
    offset = view.get('byteOffset', 0) + a.get('byteOffset', 0)
    return [
        struct.unpack_from('<' + fmt * arity, binary, offset + i * stride)
        for i in range(a['count'])
    ]


def world_matrices(doc):
    parent = {
        child: i for i, node in enumerate(doc['nodes'])
        for child in node.get('children', [])
    }
    out = []
    for start, node in enumerate(doc['nodes']):
        matrix = matrix_for(node)
        here = start
        while here in parent:
            here = parent[here]
            matrix = mmul(matrix_for(doc['nodes'][here]), matrix)
        out.append(matrix)
    return out


def raw_rows(doc, binary):
    worlds = world_matrices(doc)
    rows = {}
    for group, (node_index, mesh_index) in GROUPS.items():
        node = doc['nodes'][node_index]
        if node.get('mesh') != mesh_index:
            raise SystemExit(f'{group}: semantic mesh drift')
        primitive = doc['meshes'][mesh_index]['primitives'][0]
        positions = accessor(doc, binary, primitive['attributes']['POSITION'])
        indices = [value[0] for value in accessor(doc, binary, primitive['indices'])]
        positions = [transform(worlds[node_index], point) for point in positions]
        if group == 'turret':
            py, pz = WHIP_PIVOT
            folded = []
            hits = 0
            for x, y, z in positions:
                inside = any(
                    x0 <= x <= x1 and y0 <= y <= y1 and z0 <= z <= z1
                    for x0, x1, y0, y1, z0, z1 in WHIP_BOXES
                )
                if inside:
                    hits += 1
                    dy, dz = y - py, z - pz
                    y, z = py + dz, pz - dy
                folded.append((x, y, z))
            if hits != WHIP_VERTICES:
                raise SystemExit(
                    f'Leopard 2A6 whip census drift: expected '
                    f'{WHIP_VERTICES}, got {hits}')
            positions = folded
        # Sketchfab wrapper converts authored Z-up to Y-up. The source gun
        # points toward -Z after that wrapper; a 180-degree gameplay yaw makes
        # the cannon point down our canonical +Z. Two sign flips preserve
        # triangle winding.
        positions = [(-p[0], p[1], -p[2]) for p in positions]
        origin = transform(worlds[node_index], (0.0, 0.0, 0.0))
        origin = (-origin[0], origin[1], -origin[2])
        rows[group] = {'positions': positions, 'indices': indices, 'origin': origin}
    return rows


def normalized_rows():
    doc, binary = glb()
    rows = raw_rows(doc, binary)
    hull = rows['hull']['positions']
    lo = [min(p[a] for p in hull) for a in range(3)]
    hi = [max(p[a] for p in hull) for a in range(3)]
    center_x = (lo[0] + hi[0]) * 0.5
    center_z = (lo[2] + hi[2]) * 0.5
    sx = TARGET_WIDTH / (hi[0] - lo[0])
    # Preserve the source's cross-section aspect ratio. A 4% independent
    # height warp was explicitly falsified: it improved the nominal dimension
    # while collapsing the exact source-station match from 100 to 66.5.
    sy = sx
    sz = TARGET_HULL_LENGTH / (hi[2] - lo[2])

    # The native track replaces donor gear, but the vertical datum must still
    # be the donor source's real contact patch. Track meshes 0/1 carry it.
    worlds = world_matrices(doc)
    ground = float('inf')
    for node_index in (3, 5):
        mesh_index = doc['nodes'][node_index]['mesh']
        primitive = doc['meshes'][mesh_index]['primitives'][0]
        for point in accessor(doc, binary, primitive['attributes']['POSITION']):
            world = transform(worlds[node_index], point)
            ground = min(ground, world[1])

    def normalize(point):
        return (
            (point[0] - center_x) * sx,
            (point[1] - ground) * sy,
            (point[2] - center_z) * sz,
        )

    for row in rows.values():
        row['positions'] = [normalize(point) for point in row['positions']]
        row['origin'] = normalize(row['origin'])
    # Procedural groups are articulated containers: hull vertices remain in
    # tank-root space, while turret and gun vertices must be local to their
    # authored ring/trunnion origins. Storing world-space vertices here would
    # apply each pivot twice and visibly float the complete assembly.
    for group in ('turret', 'gun'):
        ox, oy, oz = rows[group]['origin']
        rows[group]['positions'] = [
            (x - ox, y - oy, z - oz)
            for x, y, z in rows[group]['positions']
        ]
    return rows, {'scale': (sx, sy, sz), 'center': (center_x, center_z), 'ground': ground}


def encode_f32(values):
    return base64.b64encode(struct.pack(f'<{len(values)}f', *values)).decode()


def encode_u32(values):
    return base64.b64encode(struct.pack(f'<{len(values)}I', *values)).decode()


def render():
    rows, datum = normalized_rows()
    payload = {}
    for group, row in rows.items():
        payload[group] = {
            'p': encode_f32([value for point in row['positions'] for value in point]),
            'i': encode_u32(row['indices']),
            'counts': (len(row['positions']), len(row['indices']) // 3),
        }
    turret = rows['turret']['origin']
    gun = rows['gun']['origin']
    muzzle = max(point[2] for point in rows['gun']['positions'])
    top = turret[1] + max(point[1] for point in rows['turret']['positions'])
    header = (
        '// GENERATED by tools/leopard2a6-source-bake.py; do not hand edit.\n'
        f'// Source SHA-256: {SOURCE_SHA256}\n'
        f'// Normalization sx/sy/sz: {datum["scale"][0]:.9f} / '
        f'{datum["scale"][1]:.9f} / {datum["scale"][2]:.9f}\n'
        "import * as THREE from 'three';\n\n"
    )
    body = 'const DATA = ' + json.dumps(payload, separators=(',', ':')) + ';\n\n'
    tail = f'''const TURRET_PIVOT = {json.dumps([round(v, 9) for v in turret])};
const GUN_WORLD_PIVOT = {json.dumps([round(v, 9) for v in gun])};

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

export function buildLeopard2A6SourceUpper(P) {{
  P.turretG.position.fromArray(TURRET_PIVOT);
  P.gunG.position.set(
    GUN_WORLD_PIVOT[0] - TURRET_PIVOT[0],
    GUN_WORLD_PIVOT[1] - TURRET_PIVOT[1],
    GUN_WORLD_PIVOT[2] - TURRET_PIVOT[2]);
  P.add('hull', geometry(DATA.hull));
  P.add('turret', geometry(DATA.turret));
  P.add('gunDark', geometry(DATA.gun));

  const mgMarker = new THREE.Group();
  mgMarker.name = 'fitting_leopard2A6SourceMG3';
  mgMarker.userData.fittingRoot = true;
  mgMarker.userData.fitting = 'pintleMG';
  P.turretG.add(mgMarker);
  P.muzzleZ = {muzzle:.6f};
  P.topY = {top:.6f};
}}
'''
    return header + body + tail, payload, rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    if args.write == args.verify:
        parser.error('choose exactly one of --write or --verify')
    text, payload, rows = render()
    if args.write:
        OUTPUT.write_text(text)
    elif not OUTPUT.exists() or OUTPUT.read_text() != text:
        raise SystemExit('Leopard 2A6 source module is stale; run --write')
    print('Leopard 2A6 source bake:', ', '.join(
        f'{name} {len(rows[name]["positions"])}v/{len(rows[name]["indices"]) // 3}t'
        for name in ('hull', 'turret', 'gun')))
    print('output SHA-256:', sha(text.encode()))


if __name__ == '__main__':
    main()
