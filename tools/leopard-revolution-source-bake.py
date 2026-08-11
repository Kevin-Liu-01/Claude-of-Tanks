#!/usr/bin/env python3
"""Build/verify the Leopard 2 Revolution owner-source articulated upper.

The owner ZIP's OBJ is SHA-pinned below.  Its recovered semantic GLB preserves
the useful exact source as separate Hull, Turret and Gun trees after removing
the duplicate whole-vehicle VLO shell.  This bake copies those authored
triangles into the normal procedural material/LOD pipeline, applies the
published 4.00 m / 7.72 m datum, and leaves all donor wheels/tracks out of the
playable payload.  A locally ignored articulated oracle is regenerated from
the same rows, including donor gear for comparison only.

Usage:
  python3 tools/leopard-revolution-source-bake.py --verify
  python3 tools/leopard-revolution-source-bake.py --write
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import math
import shutil
import struct
import sys
import zipfile
from pathlib import Path

import repair_oracles as oracle


ROOT = Path(__file__).resolve().parent.parent
SOURCE = Path('/Users/kevinliu/Downloads/leopard-2-mbt-revolution.zip')
SEMANTIC_ORACLE = (ROOT / 'public/models/tanks/community/recovered/'
                   'leo2_revolution.glb')
OUTPUT = ROOT / 'src/vehicles/profiles/leopard-revolution-source-geometry.js'
REPAIRED_ORACLE = (ROOT / 'public/models/community-candidates/'
                   'leopard_revolution_repaired.glb')
SOURCE_SHA256 = '8577cb2ac53daf369dc2175b045207de4760246ec73f6434bbcfce38a0fc3e4f'
INNER_SHA256 = 'a14675098d77bc2a4adb9e6f8cfd0975384596dd55be7eef4ecc03b6f1079186'
OBJ_SHA256 = 'd97595be419fee2c474a1cd4cfdc6b502e666070d4c746dda2e7b0d8c2d60481'
SEMANTIC_SHA256 = '9342d8f1183d110fda4dc33323de7b68924833252dfb97bca20de51ef3fbb207'

# Repaired source frame (after node-world transforms): x lateral, y vertical,
# z longitudinal.  Use the widest AMAP chassis faces for width, the true
# chassis body for hull length, and the native track loop for the ground.
RAW_X0, RAW_X1 = -2.2395949363708496, 2.182955026626587
RAW_Z0, RAW_Z1 = -3.75209858960966, 4.796318804254986
GROUND_Y = -1.1080820385055246
SX = 4.00 / (RAW_X1 - RAW_X0)
SY = SX
SZ = 7.72 / (RAW_Z1 - RAW_Z0)
CX = (RAW_X0 + RAW_X1) / 2
CZ = (RAW_Z0 + RAW_Z1) / 2

# Honest articulated stations from the repaired source/reference trace.  The
# gun starts at z~=1.48 after normalization; the chosen 1.46 trunnion buries
# its rear collar into the exact source mantlet without leaving an air seam.
TURRET_PIVOT = (0.0, 1.60, -0.35)
GUN_WORLD_PIVOT = (0.0, 1.88, 1.46)
# P95-envelope repair: the source's separately-authored RWS detail mesh is
# proportionally tall (broad top 2.86 m). Preserve the primary turret mesh
# byte-for-byte and compress only that RWS node about its 2.24 m planted base.
# Thin antennas in the primary mesh remain legal spike columns.
RWS_RAW_BASE_Y = 1.3677597929735164
RWS_Y_SCALE = 0.65
GUN_Z_SCALE = 1.036
NODES = {
    'hull': ('chassis_1', 'chassis_2'),
    'turret': ('chassis_vlo002', 'chassis_vlo002_1'),
    'gun': ('chassis_vlo001', 'chassis_vlo001_1'),
    'donor': tuple([f'track_{i}' for i in range(1, 13)]
                   + ['wheel_big_0', 'wheel_big_1']
                   + [f'wheels_{i}' for i in range(1, 8)]),
}
EXPECTED = {
    'hull': (19433, 13267),
    'turret': (10306, 7481),
    'gun': (343, 287),
    'donor': (9674, 9272),
}
PLAYABLE_GROUPS = ('hull', 'turret', 'gun')
PAYLOAD_GROUPS = ('hull', 'hullGuardL', 'hullGuardR', 'turret', 'gun')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def verify_provenance():
    outer = SOURCE.read_bytes()
    if sha(outer) != SOURCE_SHA256:
        raise SystemExit(f'Revolution outer source drift: {sha(outer)}')
    with zipfile.ZipFile(io.BytesIO(outer)) as zf:
        inner = zf.read('source/Leopard 2 MBT Revolution.zip')
    if sha(inner) != INNER_SHA256:
        raise SystemExit(f'Revolution nested source drift: {sha(inner)}')
    with zipfile.ZipFile(io.BytesIO(inner)) as zf:
        obj = zf.read('Leopard 2 MBT Revolution.obj')
    if sha(obj) != OBJ_SHA256:
        raise SystemExit(f'Revolution OBJ drift: {sha(obj)}')
    semantic = SEMANTIC_ORACLE.read_bytes()
    if sha(semantic) != SEMANTIC_SHA256:
        raise SystemExit(f'Revolution semantic oracle drift: {sha(semantic)}')
    return semantic


def encode_f32(values):
    return base64.b64encode(struct.pack(f'<{len(values)}f', *values)).decode()


def encode_u32(values):
    return base64.b64encode(struct.pack(f'<{len(values)}I', *values)).decode()


def runtime_point(point, group, node_name):
    x, y, z = point
    wx, wy, wz = (-(x - CX) * SX, (y - GROUND_Y) * SY,
                  -(z - CZ) * SZ)
    if node_name == 'chassis_vlo002_1':
        base_y = (RWS_RAW_BASE_Y - GROUND_Y) * SY
        wy = base_y + (wy - base_y) * RWS_Y_SCALE
    if group == 'gun' and wz > GUN_WORLD_PIVOT[2]:
        wz = (GUN_WORLD_PIVOT[2]
              + (wz - GUN_WORLD_PIVOT[2]) * GUN_Z_SCALE)
    world = (wx, wy, wz)
    pivot = (TURRET_PIVOT if group == 'turret' else
             GUN_WORLD_PIVOT if group == 'gun' else (0.0, 0.0, 0.0))
    return tuple(world[axis] - pivot[axis] for axis in range(3))


def compact_rows():
    verify_provenance()
    gltf, chunks = oracle.read_glb(SEMANTIC_ORACLE)
    data = chunks[oracle._bin_chunk_index(chunks)][1]
    out = {}
    for group, names in NODES.items():
        points_out, indices_out = [], []
        for name in names:
            ni = oracle.find_node(gltf, name)
            node = gltf['nodes'][ni]
            prim = gltf['meshes'][node['mesh']]['primitives'][0]
            source_points = oracle._read_rows(
                gltf, data, prim['attributes']['POSITION'])
            source_indices = [row[0] for row in oracle._read_rows(
                gltf, data, prim['indices'])]
            world = oracle.node_world_matrix(gltf, ni)
            used = sorted(set(source_indices))
            remap = {old: len(points_out) + k for k, old in enumerate(used)}
            points_out.extend(runtime_point(
                oracle.transform_point(world, source_points[old]), group, name)
                for old in used)
            indices_out.extend(remap[old] for old in source_indices)
        got = (len(points_out), len(indices_out) // 3)
        if got != EXPECTED[group]:
            raise SystemExit(f'{group}: expected {EXPECTED[group]}, got {got}')
        out[group] = {
            'positions': points_out,
            'indices': indices_out,
            'counts': got,
        }
    double_side_open_components(out['hull'])
    double_side_open_components(out['turret'])
    append_completion_geometry(out)
    return out


def double_side_open_components(row):
    """Give every open source-turret sheet a physical reverse face.

    The OBJ uses many zero-thickness AMAP plates, rails and equipment skins.
    Reference masks deliberately render them DoubleSide, while the game uses
    FrontSide materials; keeping only the authored winding makes legitimate
    source detail disappear by view direction. Components are identified
    with the winding audit's 0.1 mm position-welded edge law. Only components
    with a real boundary receive reverse triangles; closed solids are never
    doubled and the completed pressure shell stays single-surface.
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
    if not added:
        raise SystemExit('open source-turret census found no boundary faces')
    row['indices'].extend(added)
    row['counts'] = (len(row['positions']), len(row['indices']) // 3)


def merge_geometry(row, positions, indices):
    offset = len(row['positions'])
    row['positions'].extend(tuple(point) for point in positions)
    row['indices'].extend(offset + index for index in indices)
    row['counts'] = (len(row['positions']), len(row['indices']) // 3)


def box_geometry(cx, cy, cz, width, height, depth, yaw=0.0):
    hx, hy, hz = width / 2, height / 2, depth / 2
    positions = []
    c, s = math.cos(yaw), math.sin(yaw)
    for x, y, z in [
            (-hx, -hy, -hz), (hx, -hy, -hz),
            (hx, -hy, hz), (-hx, -hy, hz),
            (-hx, hy, -hz), (hx, hy, -hz),
            (hx, hy, hz), (-hx, hy, hz)]:
        positions.append((cx + x * c + z * s, cy + y,
                          cz - x * s + z * c))
    indices = [
        0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
        0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5,
        2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
    ]
    indices = [indices[start + offset]
               for start in range(0, len(indices), 3)
               for offset in (0, 2, 1)]
    return positions, indices


def frustum_geometry(xb, zfb, zbb, xt, zft, zbt, y0, y1):
    positions = [
        (-xb, y0, zbb), (xb, y0, zbb),
        (xb, y0, zfb), (-xb, y0, zfb),
        (-xt, y1, zbt), (xt, y1, zbt),
        (xt, y1, zft), (-xt, y1, zft),
    ]
    indices = [
        0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
        0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5,
        2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
    ]
    indices = [indices[start + offset]
               for start in range(0, len(indices), 3)
               for offset in (0, 2, 1)]
    return positions, indices


def cylinder_y_geometry(radius, y0, y1, segments=32):
    positions = [(0.0, y0, 0.0), (0.0, y1, 0.0)]
    for ring_y in (y0, y1):
        for index in range(segments):
            angle = index * math.tau / segments
            positions.append((math.cos(angle) * radius, ring_y,
                              math.sin(angle) * radius))
    indices = []
    bottom, top = 2, 2 + segments
    for index in range(segments):
        nxt = (index + 1) % segments
        indices.extend([0, bottom + nxt, bottom + index])
        indices.extend([1, top + index, top + nxt])
        indices.extend([bottom + index, bottom + nxt, top + nxt,
                        bottom + index, top + nxt, top + index])
    indices = [indices[start + offset]
               for start in range(0, len(indices), 3)
               for offset in (0, 2, 1)]
    return positions, indices


def append_completion_geometry(rows):
    """Finish omissions in the recovered OBJ without altering its exterior.

    The archive supplies the complete AMAP shell/cage silhouette but omits
    the pressure turret underneath its brace-carried modular armor and the
    narrow fender floors beneath its side/rear slat enclosures. These solids
    are deterministic, wholly inside the source envelope, and become part of
    both the runtime payload and repaired comparison oracle.
    """
    turret = rows['turret']
    for geometry in [
            cylinder_y_geometry(1.14, 0.00, 0.14, 32),
            frustum_geometry(1.48, 1.52, -1.88,
                             1.23, 1.28, -1.68, 0.06, 0.52),
            frustum_geometry(1.23, 1.28, -1.68,
                             1.02, 1.10, -1.48, 0.50, 0.80),
            box_geometry(-1.29, 0.39, -1.18, 0.28, 0.34, 1.10, -0.08),
            box_geometry(1.29, 0.39, -1.18, 0.28, 0.34, 1.10, 0.08)]:
        merge_geometry(turret, *geometry)

    hull = rows['hull']
    for side in (-1, 1):
        merge_geometry(hull, *box_geometry(
            side * 1.79, 1.315, -1.72, 0.34, 0.055, 3.50))
        merge_geometry(hull, *box_geometry(
            side * 1.76, 1.315, -3.52, 0.40, 0.055, 0.62))
    # Continuous transom floor under the near-full-width rear slat cage.
    # Its forward edge overlaps both side floors; its rear edge remains
    # inside the exact -3.86 m source envelope and behind the shoe wrap.
    merge_geometry(hull, *box_geometry(
        0.0, 1.315, -3.70, 3.56, 0.055, 0.30))


def payloads():
    rows = compact_rows()
    hull_parts = split_hull_track_guards(rows['hull'])
    source_rows = {
        'hull': hull_parts['body'],
        'hullGuardL': hull_parts['left'],
        'hullGuardR': hull_parts['right'],
        'turret': rows['turret'],
        'gun': rows['gun'],
    }
    out = {}
    for group, row in source_rows.items():
        out[group] = {
            'p': encode_f32([v for point in row['positions'] for v in point]),
            'i': encode_u32(row['indices']),
        }
    return out


def split_hull_track_guards(row):
    """Separate source-authored skirt/fender enclosures from hull solids.

    The supplied OBJ authors the low lateral Leopard skirts as thousands of
    disconnected face islands in the same material/object as the chassis.
    They visually enclose the donor belt and are not plates for a native belt
    to pierce.  Preserve every source triangle, but route wholly lateral,
    low-running connected islands to the factory's explicit track-guard
    buckets so containment audits can distinguish enclosure from collision.
    Broad bow/stern/belly components that reach the vehicle centre remain in
    the ordinary hull bucket and continue to be audited.
    """
    points, indices = row['positions'], row['indices']
    parent = list(range(len(points)))

    def find(value):
        while parent[value] != value:
            parent[value] = parent[parent[value]]
            value = parent[value]
        return value

    def union(a, b):
        a, b = find(a), find(b)
        if a != b:
            parent[b] = a

    for start in range(0, len(indices), 3):
        union(indices[start], indices[start + 1])
        union(indices[start], indices[start + 2])

    members = {}
    for vertex in set(indices):
        members.setdefault(find(vertex), []).append(vertex)

    category = {}
    for root, vertices in members.items():
        lo = [min(points[v][axis] for v in vertices) for axis in range(3)]
        hi = [max(points[v][axis] for v in vertices) for axis in range(3)]
        low_lateral = lo[1] < 1.35 and hi[1] <= 1.75
        if low_lateral and hi[0] < -0.90:
            category[root] = 'left'
        elif low_lateral and lo[0] > 0.90:
            category[root] = 'right'
        else:
            category[root] = 'body'

    tris = {'body': [], 'left': [], 'right': []}
    for start in range(0, len(indices), 3):
        tri = indices[start:start + 3]
        tris[category[find(tri[0])]].extend(tri)

    out = {}
    for name, source_indices in tris.items():
        used = sorted(set(source_indices))
        remap = {old: new for new, old in enumerate(used)}
        out[name] = {
            'positions': [points[old] for old in used],
            'indices': [remap[old] for old in source_indices],
            'counts': (len(used), len(source_indices) // 3),
        }
    total_tris = sum(part['counts'][1] for part in out.values())
    if total_tris != row['counts'][1]:
        raise SystemExit(f'hull track-guard split lost triangles: '
                         f'{total_tris} != {row["counts"][1]}')
    return out


def repaired_oracle_bytes():
    rows = compact_rows()
    binary = bytearray()
    views, accessors, meshes = [], [], []

    def append(blob, target):
        while len(binary) % 4:
            binary.append(0)
        offset = len(binary)
        binary.extend(blob)
        views.append({'buffer': 0, 'byteOffset': offset,
                      'byteLength': len(blob), 'target': target})
        return len(views) - 1

    def mesh_for(group):
        positions, indices = rows[group]['positions'], rows[group]['indices']
        pblob = struct.pack(f'<{len(positions) * 3}f',
                            *(v for point in positions for v in point))
        iblob = struct.pack(f'<{len(indices)}I', *indices)
        pview, iview = append(pblob, 34962), append(iblob, 34963)
        lo = [min(point[a] for point in positions) for a in range(3)]
        hi = [max(point[a] for point in positions) for a in range(3)]
        accessors.append({'bufferView': pview, 'componentType': 5126,
                          'count': len(positions), 'type': 'VEC3',
                          'min': lo, 'max': hi})
        pa = len(accessors) - 1
        accessors.append({'bufferView': iview, 'componentType': 5125,
                          'count': len(indices), 'type': 'SCALAR',
                          'min': [min(indices)], 'max': [max(indices)]})
        ia = len(accessors) - 1
        meshes.append({'name': group, 'primitives': [{
            'attributes': {'POSITION': pa}, 'indices': ia, 'material': 0}]})
        return len(meshes) - 1

    mesh_ids = {group: mesh_for(group) for group in rows}
    nodes = [
        {'name': 'Root', 'children': [1, 2, 3]},
        {'name': 'Hull', 'mesh': mesh_ids['hull']},
        {'name': 'DonorRunningGear', 'mesh': mesh_ids['donor']},
        {'name': 'Turret', 'mesh': mesh_ids['turret'],
         'translation': list(TURRET_PIVOT), 'children': [4]},
        {'name': 'Gun', 'mesh': mesh_ids['gun'], 'translation': [
            GUN_WORLD_PIVOT[a] - TURRET_PIVOT[a] for a in range(3)]},
    ]
    gltf = {
        'asset': {'version': '2.0',
                  'generator': 'tools/leopard-revolution-source-bake.py',
                  'extras': {'sourceSha256': SOURCE_SHA256,
                             'objSha256': OBJ_SHA256}},
        'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': nodes,
        'meshes': meshes,
        'materials': [{'name': 'oracle-neutral', 'doubleSided': True,
                       'pbrMetallicRoughness': {
                           'baseColorFactor': [0.34, 0.40, 0.28, 1.0],
                           'metallicFactor': 0.0, 'roughnessFactor': 0.78}}],
        'buffers': [{'byteLength': len(binary)}],
        'bufferViews': views, 'accessors': accessors,
    }
    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    binary.extend(b'\x00' * ((4 - len(binary) % 4) % 4))
    total = 12 + 8 + len(js) + 8 + len(binary)
    return (struct.pack('<III', 0x46546C67, 2, total)
            + struct.pack('<II', len(js), 0x4E4F534A) + js
            + struct.pack('<II', len(binary), 0x004E4942) + bytes(binary))


def render(payload):
    rows = '\n'.join(
        f"  {key}: {{ p: '{payload[key]['p']}', i: '{payload[key]['i']}' }},"
        for key in PAYLOAD_GROUPS)
    return f"""// GENERATED by tools/leopard-revolution-source-bake.py from the
// owner-supplied Leopard 2 MBT Revolution model. Do not hand-edit the encoded
// arrays. Donor running gear is intentionally absent; leopard.js retains the
// fleet-native animated Leopard track system.
import * as THREE from 'three';

const DATA = {{
{rows}
}};

const TURRET_PIVOT = {list(TURRET_PIVOT)!r};
const GUN_WORLD_PIVOT = {list(GUN_WORLD_PIVOT)!r};

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
    const nx = Math.abs(n.getX(k)), ny = Math.abs(n.getY(k));
    const nz = Math.abs(n.getZ(k));
    let u, v;
    if (ny >= nx && ny >= nz) {{ u = p.getX(k); v = p.getZ(k); }}
    else if (nx >= nz) {{ u = p.getZ(k); v = p.getY(k); }}
    else {{ u = p.getX(k); v = p.getY(k); }}
    uv[k * 2] = u * 0.35;
    uv[k * 2 + 1] = v * 0.35;
  }}
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}}

export function buildLeopardRevolutionSourceUpper(P) {{
  P.turretG.position.fromArray(TURRET_PIVOT);
  P.gunG.position.set(
    GUN_WORLD_PIVOT[0] - TURRET_PIVOT[0],
    GUN_WORLD_PIVOT[1] - TURRET_PIVOT[1],
    GUN_WORLD_PIVOT[2] - TURRET_PIVOT[2],
  );
  P.add('hull', geometry(DATA.hull));
  P.add('hullTrackGuardL', geometry(DATA.hullGuardL));
  P.add('hullTrackGuardR', geometry(DATA.hullGuardR));
  P.add('turret', geometry(DATA.turret));
  P.add('gun', geometry(DATA.gun));

  // The exact source turret includes its RWS. Preserve the required fitting
  // census without drawing a duplicate procedural weapon.
  const mgMarker = new THREE.Group();
  mgMarker.name = 'fitting_revolutionSourceRWS';
  mgMarker.userData.fittingRoot = true;
  mgMarker.userData.fitting = 'pintleMG';
  P.turretG.add(mgMarker);
  P.muzzleZ = 4.64;
  P.topY = 1.55;
}}

// Compatibility path for the retired handcrafted builder. New production
// code calls buildLeopardRevolutionSourceUpper on an otherwise empty build.
export function replaceLeopardRevolutionSourceTurret(P) {{
  P.clear('hull', 'hullDetail', 'hullDark', 'hullRubber', 'hullGlass',
    'turret', 'turretDetail', 'turretDark', 'turretCloth', 'turretGlass',
    'turretTrack', 'gun', 'gunDark', 'gunMount', 'gunMountDark');
  P.clearDecals?.('hull', 'turret', 'gun');
  buildLeopardRevolutionSourceUpper(P);
}}
"""


def main(argv):
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--verify', action='store_true')
    mode.add_argument('--write', action='store_true')
    args = parser.parse_args(argv)
    wanted = render(payloads())
    oracle_bytes = repaired_oracle_bytes()
    if args.verify:
        if not OUTPUT.exists() or OUTPUT.read_text() != wanted:
            raise SystemExit('Leopard Revolution source payload drift')
        if not REPAIRED_ORACLE.exists() or REPAIRED_ORACLE.read_bytes() != oracle_bytes:
            raise SystemExit('Leopard Revolution repaired oracle drift')
        print('leopard-revolution-source-bake: verified 30,220 vertices / '
              '37,635 triangles; physical backs added to open source sheets; '
              'donor running gear excluded; '
              f'oracle={sha(oracle_bytes)[:8]}')
        return 0
    if OUTPUT.exists():
        shutil.copy2(OUTPUT, OUTPUT.with_suffix(OUTPUT.suffix + '.bak'))
    if REPAIRED_ORACLE.exists():
        shutil.copy2(REPAIRED_ORACLE,
                     REPAIRED_ORACLE.with_suffix(REPAIRED_ORACLE.suffix + '.bak'))
    REPAIRED_ORACLE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(wanted)
    REPAIRED_ORACLE.write_bytes(oracle_bytes)
    print(f'leopard-revolution-source-bake: wrote {OUTPUT}')
    print(f'leopard-revolution-source-bake: wrote {REPAIRED_ORACLE} '
          f'({sha(oracle_bytes)})')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
