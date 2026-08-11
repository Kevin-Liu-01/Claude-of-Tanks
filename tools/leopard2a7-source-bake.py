#!/usr/bin/env python3
"""Bake the owner-supplied Leopard 2A7V OBJ into an articulated upper.

The source has four material objects rather than useful part names. Objects
001/002 are the complete hull/armor courses, 004 is donor running gear, and
003 contains the turret plus a separately connected L/55 assembly. The bake
splits 003 only at welded connected-component boundaries; no triangle is cut.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import shutil
import struct
import sys
import zipfile
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SOURCE = Path('/Users/kevinliu/Downloads/leopard-2a7v-main-battle-tank.zip')
OUTPUT = ROOT / 'src/vehicles/profiles/leopard2a7-source-geometry.js'
ORACLE_OUTPUT = (ROOT / 'public/models/community-candidates/'
                 'leopard_2a7v_repaired.glb')
SOURCE_SHA256 = 'fef951b1794415aa5a9876efc8e9ecbdde2dbfe4c540357fc109209b254dc901'
INNER_SHA256 = '54ff6b63f2ded1dbf35ec4a8dd68a86d2562e8475f76b650a3fb95c095a9f898'

# Published-datum frame. The supplied armor envelope is 2.495383 m wide and
# its hull course is 5.239399 m long in author units. Vertical scale is
# independent because the source author used a non-uniform export frame; it
# is anchored to the broad 2.64 m body course, not antenna tips.
CX = (-1.235778 + 1.259605) / 2
CZ = (-2.856426 + 2.382972) / 2
GROUND_Y = -0.9172477
SX = 4.00 / (1.259605 - -1.235778)
# First P95/trimmed-length instrument pass measured 2.714 m and 7.603 m.
# These constants apply that measured correction directly; they are not
# hand-fit visual nudges.
SY = 1.34 * (2.64 / 2.714)
SZ = (7.72 / (2.382972 - -2.856426)) * (7.72 / 7.603)
RAW_TURRET_PIVOT = (0.0, 0.20, -0.40)
RAW_GUN_PIVOT = (0.012, 0.40, 1.46)
# Donor left/right suspension stations are authored with an asymmetric
# longitudinal offset. Centre that measurement-only course on the exact hull
# datum before the loader computes its hull box; the playable donor is absent.
DONOR_Z_SHIFT = ((-2.856426 + 2.382972) / 2
                 - (-2.952207 + 2.246605) / 2) * SZ
# The source donor course stands 3.88 m wide, outside the game's correctly
# guarded native 3.7 m track envelope. It is measurement-only, so normalize
# that donor course laterally to the replacement system instead of demanding
# an unsafe exposed belt under the 4.0 m armor skirts.
DONOR_X_SCALE = 0.965

OBJECT_GROUP = {
    'desirefx_me_001': 'hullDetail',
    'desirefx_me_002': 'hull',
    'desirefx_me_004': 'donor',
}
PLAYABLE_GROUPS = ('hull', 'hullDetail', 'hullGuardL', 'hullGuardR',
                   'turret', 'gun')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def source_obj():
    outer = SOURCE.read_bytes()
    if sha(outer) != SOURCE_SHA256:
        raise SystemExit(f'Leopard 2A7V source drift: {sha(outer)}')
    with zipfile.ZipFile(io.BytesIO(outer)) as zf:
        inner = zf.read('source/LEOPARD 2A7V MAIN BATTLE TANK.zip')
    if sha(inner) != INNER_SHA256:
        raise SystemExit(f'Leopard 2A7V nested source drift: {sha(inner)}')
    with zipfile.ZipFile(io.BytesIO(inner)) as zf:
        return zf.read('LEOPARD 2A7V MAIN BATTLE TANK.obj').decode('utf-8')


class UF:
    def __init__(self, count):
        self.parent = list(range(count))

    def find(self, value):
        while self.parent[value] != value:
            self.parent[value] = self.parent[self.parent[value]]
            value = self.parent[value]
        return value

    def union(self, a, b):
        a, b = self.find(a), self.find(b)
        if a != b:
            self.parent[b] = a


def parse_source():
    points, object_faces = [], defaultdict(list)
    current = None
    for line in source_obj().splitlines():
        if line.startswith('v '):
            points.append(tuple(map(float, line.split()[1:4])))
        elif line.startswith('o '):
            current = line[2:].strip()
        elif line.startswith('f ') and current:
            face = []
            for token in line.split()[1:]:
                raw = int(token.split('/', 1)[0])
                face.append(raw - 1 if raw > 0 else len(points) + raw)
            if len(face) != 3:
                raise SystemExit(f'non-triangle source face: {line[:80]}')
            object_faces[current].append(tuple(face))

    rows = defaultdict(list)
    for name, group in OBJECT_GROUP.items():
        rows[group].extend(object_faces[name])

    # Object 003 is triangle-soup, so shared index values cannot identify
    # solids. Weld coincident positions, union whole triangles, and move only
    # the narrow axial components that form the L/55/cradle into Gun.
    faces = object_faces['desirefx_me_003']
    weld_ids, weld_map = {}, []
    for point in points:
        key = tuple(round(value / 1e-5) for value in point)
        if key not in weld_ids:
            weld_ids[key] = len(weld_ids)
        weld_map.append(weld_ids[key])
    uf = UF(len(weld_ids))
    for face in faces:
        uf.union(weld_map[face[0]], weld_map[face[1]])
        uf.union(weld_map[face[0]], weld_map[face[2]])
    components = defaultdict(list)
    for face in faces:
        components[uf.find(weld_map[face[0]])].append(face)
    for component in components.values():
        used = {index for face in component for index in face}
        lo = [min(points[index][axis] for index in used) for axis in range(3)]
        hi = [max(points[index][axis] for index in used) for axis in range(3)]
        width = hi[0] - lo[0]
        axial = (width < 0.50 and hi[1] < 0.76 and
                 ((lo[2] > 1.30) or (lo[2] > 0.45 and hi[2] > 1.70)))
        rows['gun' if axial else 'turret'].extend(component)
    return points, rows


def world(point):
    return ((point[0] - CX) * SX,
            (point[1] - GROUND_Y) * SY,
            (point[2] - CZ) * SZ)


TURRET_PIVOT = world(RAW_TURRET_PIVOT)
GUN_WORLD_PIVOT = world(RAW_GUN_PIVOT)


def compact_rows():
    points, groups = parse_source()
    output = {}
    for group, faces in groups.items():
        pivot = (GUN_WORLD_PIVOT if group == 'gun' else
                 (TURRET_PIVOT if group == 'turret' else (0.0, 0.0, 0.0)))
        positions, indices, remap = [], [], {}
        for old in (index for face in faces for index in face):
            if old not in remap:
                remap[old] = len(positions)
                value = list(world(points[old]))
                if group == 'donor':
                    value[0] *= DONOR_X_SCALE
                    value[2] += DONOR_Z_SHIFT
                positions.append(tuple(value[axis] - pivot[axis]
                                       for axis in range(3)))
            indices.append(remap[old])
        output[group] = {
            'positions': positions,
            'indices': indices,
            'counts': (len(positions), len(indices) // 3),
        }
    return output


def encode_f32(values):
    return base64.b64encode(struct.pack(f'<{len(values)}f', *values)).decode()


def encode_u32(values):
    return base64.b64encode(struct.pack(f'<{len(values)}I', *values)).decode()


def split_track_guards(row):
    """Route complete low lateral source islands to track-guard buckets.

    The owner's OBJ places its fender, skirt and terminal enclosures in the
    same two material objects as the pressure hull. They surround the donor
    belt and are not pressure plates for a replacement belt to pierce. Keep
    every triangle, but classify only welded components that remain wholly
    lateral and below the deck. Broad bow, belly and transom components that
    reach the centre stay in the audited hull bucket.
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

    members = defaultdict(list)
    for vertex in set(indices):
        members[find(vertex)].append(vertex)
    category = {}
    for root, vertices in members.items():
        lo = [min(points[v][axis] for v in vertices) for axis in range(3)]
        hi = [max(points[v][axis] for v in vertices) for axis in range(3)]
        low_lateral = lo[1] < 1.40 and hi[1] <= 1.78
        if low_lateral and hi[0] < -0.95:
            category[root] = 'left'
        elif low_lateral and lo[0] > 0.95:
            category[root] = 'right'
        else:
            category[root] = 'body'

    tris = {'body': [], 'left': [], 'right': []}
    for start in range(0, len(indices), 3):
        tri = indices[start:start + 3]
        target = category[find(tri[0])]
        # Some upper-fender faces share welded border vertices with the broad
        # centre deck, so their component root is intentionally `body` even
        # though the complete triangle remains wholly in one track enclosure.
        # Re-route only complete low/lateral triangles; vertices and faces are
        # never cut, duplicated or moved in space.
        if target == 'body':
            tri_points = [points[index] for index in tri]
            if max(point[1] for point in tri_points) <= 1.78:
                if max(point[0] for point in tri_points) < -0.95:
                    target = 'left'
                elif min(point[0] for point in tri_points) > 0.95:
                    target = 'right'
        tris[target].extend(tri)

    out = {}
    for name, source_indices in tris.items():
        used = sorted(set(source_indices))
        remap = {old: new for new, old in enumerate(used)}
        out[name] = {
            'positions': [points[old] for old in used],
            'indices': [remap[old] for old in source_indices],
            'counts': (len(used), len(source_indices) // 3),
        }
    if sum(part['counts'][1] for part in out.values()) != row['counts'][1]:
        raise SystemExit('Leopard 2A7V track-guard split lost triangles')
    return out


def merge_rows(*rows):
    positions, indices = [], []
    for row in rows:
        offset = len(positions)
        positions.extend(row['positions'])
        indices.extend(index + offset for index in row['indices'])
    return {'positions': positions, 'indices': indices,
            'counts': (len(positions), len(indices) // 3)}


def payloads():
    rows = compact_rows()
    hull = split_track_guards(rows['hull'])
    detail = split_track_guards(rows['hullDetail'])
    runtime = {
        'hull': hull['body'],
        'hullDetail': detail['body'],
        'hullGuardL': merge_rows(hull['left'], detail['left']),
        'hullGuardR': merge_rows(hull['right'], detail['right']),
        'turret': rows['turret'],
        'gun': rows['gun'],
        'donor': rows['donor'],
    }
    out = {}
    for group, row in runtime.items():
        out[group] = {
            'p': encode_f32([value for point in row['positions'] for value in point]),
            'i': encode_u32(row['indices']),
            'counts': row['counts'],
        }
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
                            *(value for point in positions for value in point))
        iblob = struct.pack(f'<{len(indices)}I', *indices)
        pview, iview = append(pblob, 34962), append(iblob, 34963)
        lo = [min(point[axis] for point in positions) for axis in range(3)]
        hi = [max(point[axis] for point in positions) for axis in range(3)]
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
        {'name': 'Root', 'children': [1, 2, 3, 4]},
        {'name': 'Hull', 'mesh': mesh_ids['hull']},
        {'name': 'HullDetail', 'mesh': mesh_ids['hullDetail']},
        {'name': 'DonorRunningGear', 'mesh': mesh_ids['donor']},
        {'name': 'Turret', 'mesh': mesh_ids['turret'],
         'translation': list(TURRET_PIVOT), 'children': [5]},
        {'name': 'Gun', 'mesh': mesh_ids['gun'], 'translation': [
            GUN_WORLD_PIVOT[axis] - TURRET_PIVOT[axis] for axis in range(3)]},
    ]
    gltf = {
        'asset': {'version': '2.0',
                  'generator': 'tools/leopard2a7-source-bake.py',
                  'extras': {'sourceSha256': SOURCE_SHA256}},
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


def render(data):
    rows = '\n'.join(
        f"  {key}: {{ p: '{data[key]['p']}', i: '{data[key]['i']}' }},"
        for key in PLAYABLE_GROUPS)
    return f"""// GENERATED by tools/leopard2a7-source-bake.py from the owner ZIP.
// Do not hand-edit encoded arrays. Donor running gear is intentionally absent.
import * as THREE from 'three';

const DATA = {{
{rows}
}};
const TURRET_PIVOT = {list(TURRET_PIVOT)!r};
const GUN_WORLD_PIVOT = {list(GUN_WORLD_PIVOT)!r};

function bytes(s) {{
  const raw = atob(s), out = new Uint8Array(raw.length);
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
  return g;
}}

export function replaceLeopard2A7SourceUpper(P) {{
  P.turretG.clear(); P.turretG.add(P.gunG);
  P.gunG.clear(); P.gunG.add(P.recoilG); P.recoilG.clear();
  P.clear('hull', 'hullDetail', 'hullDark', 'hullRubber', 'hullGlass',
    'hullCloth', 'turret', 'turretDetail', 'turretDark', 'turretCloth',
    'turretGlass', 'turretTrack', 'gun', 'gunDark', 'gunMount', 'gunMountDark');
  P.clearDecals?.('hull', 'turret', 'gun');
  P.turretG.position.fromArray(TURRET_PIVOT);
  P.gunG.position.set(
    GUN_WORLD_PIVOT[0] - TURRET_PIVOT[0],
    GUN_WORLD_PIVOT[1] - TURRET_PIVOT[1],
    GUN_WORLD_PIVOT[2] - TURRET_PIVOT[2]);
  P.add('hull', geometry(DATA.hull));
  P.add('hullDetail', geometry(DATA.hullDetail));
  P.add('hullTrackGuardL', geometry(DATA.hullGuardL));
  P.add('hullTrackGuardR', geometry(DATA.hullGuardR));
  P.add('turret', geometry(DATA.turret));
  P.add('gunDark', geometry(DATA.gun));
  const mg = new THREE.Group();
  mg.name = 'fitting_leopard2A7SourceMG';
  mg.userData.fittingRoot = true; mg.userData.fitting = 'pintleMG';
  P.turretG.add(mg);
  P.muzzleZ = 4.45; P.topY = 1.10;
}}
"""


def main(argv):
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--verify', action='store_true')
    mode.add_argument('--write', action='store_true')
    args = parser.parse_args(argv)
    data = payloads()
    wanted, oracle = render(data), repaired_oracle_bytes()
    census = ', '.join(f'{key}={data[key]["counts"]}'
                       for key in (*PLAYABLE_GROUPS, 'donor'))
    if args.verify:
        if not OUTPUT.exists() or OUTPUT.read_text() != wanted:
            raise SystemExit('Leopard 2A7V source payload drift')
        if not ORACLE_OUTPUT.exists() or ORACLE_OUTPUT.read_bytes() != oracle:
            raise SystemExit('Leopard 2A7V repaired oracle drift')
        print(f'leopard2a7-source-bake: verified {census}; '
              f'oracle={len(oracle)}b')
        return 0
    if OUTPUT.exists():
        shutil.copy2(OUTPUT, OUTPUT.with_suffix(OUTPUT.suffix + '.bak'))
    if ORACLE_OUTPUT.exists():
        shutil.copy2(ORACLE_OUTPUT,
                     ORACLE_OUTPUT.with_suffix(ORACLE_OUTPUT.suffix + '.bak'))
    OUTPUT.write_text(wanted)
    ORACLE_OUTPUT.write_bytes(oracle)
    print(f'leopard2a7-source-bake: wrote payload and oracle; {census}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
