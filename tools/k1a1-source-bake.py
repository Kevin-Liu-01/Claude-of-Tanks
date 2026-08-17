#!/usr/bin/env python3
"""Bake the owner-supplied semantic K1A1 OBJ into articulated geometry.

The nested archive retains twelve named objects. Donor treads and suspension
are excluded so the playable keeps the game's native animated/damage-aware
running gear; all other source triangles are preserved exactly.

Usage:
  python3 tools/k1a1-source-bake.py --write
  python3 tools/k1a1-source-bake.py --verify
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
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SOURCE = Path('/Users/kevinliu/Downloads/k1a1-armored-warfare.zip')
ORACLE = ROOT / 'public/models/community-candidates/k1a1_kojf.glb'
REPAIRED_ORACLE = (ROOT / 'public/models/community-candidates/'
                   'k1a1_kojf_repaired.glb')
OUTPUT = ROOT / 'src/vehicles/profiles/k1a1-source-geometry.js'
SOURCE_SHA256 = 'd2e8eeb7d828b2cff23ee78d54657ebf97935f430151741f4dab8a23cbb6a96d'
INNER_SHA256 = 'ecce014c12e3d4ac783bdcfbba691ad17c6ddb4e190cc10761c7df8fcefb442a'
OBJ_SHA256 = '7c55e7f54f0f7d59247e1559b92fc1db82952191566ef5504fd78dcde9df6d93'
ORACLE_SHA256 = 'b36b620f868cccbdbc2a874c6967273e2cc712b7df83c6e1bc054ec95bad24a0'

ROOT_PLAN_CENTER = (0.0, 0.0, -0.0205)
LONGITUDINAL_SCALE = 1.020
TURRET_PIVOT = (0.01365, 1.46386, 0.12871 * LONGITUDINAL_SCALE)
GUN_WORLD_PIVOT = (0.0352, 1.83317, 2.91914 * LONGITUDINAL_SCALE)

HULL = {'vehicle#k1a1--k1a1_2'}
TURRET = {'vehicle#k1a1_turret_0'}
TURRET_DETAIL = {
    'vehicle#k1a1_smokecaps_turret_6',
    'vehicle#antenna_short_7',
    'vehicle#k1a1_noeffect01_turret_8',
    'vehicle#k1a1_cannonbase_9',
    'vehicle#k1a1_cage_turret_11',
}
GUN = {'vehicle#k1a1_cannon_10'}

EXPECTED = {
    'hull': (27012, 29401),
    'turret': (8255, 8097),
    'turretDetail': (12007, 12931),
    'gun': (1510, 1836),
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def source_obj():
    outer = SOURCE.read_bytes()
    if sha(outer) != SOURCE_SHA256:
        raise SystemExit(f'K1A1 source drift: {sha(outer)}')
    with zipfile.ZipFile(io.BytesIO(outer)) as zf:
        inner = zf.read('source/K1A1.zip')
    if sha(inner) != INNER_SHA256:
        raise SystemExit(f'K1A1 nested source drift: {sha(inner)}')
    with zipfile.ZipFile(io.BytesIO(inner)) as zf:
        obj = zf.read('K1A1.obj')
    if sha(obj) != OBJ_SHA256:
        raise SystemExit(f'K1A1 OBJ drift: {sha(obj)}')
    if not ORACLE.exists() or sha(ORACLE.read_bytes()) != ORACLE_SHA256:
        raise SystemExit('K1A1 semantic GLB oracle missing or drifted')
    return obj.decode('utf-8')


def group_for(name, include_donor=False):
    if name.startswith(('vehicle#tread_', 'vehicle#suspension_')):
        return 'donor' if include_donor else None
    if name in HULL:
        return 'hull'
    if name in TURRET:
        return 'turret'
    if name in TURRET_DETAIL:
        return 'turretDetail'
    if name in GUN:
        return 'gun'
    raise SystemExit(f'unclassified K1A1 object: {name}')


def parse_obj(text, include_donor=False):
    points = []
    objects = {key: [] for key in EXPECTED}
    if include_donor:
        objects['donor'] = []
    current = None
    for line in text.splitlines():
        if line.startswith('v '):
            points.append(tuple(map(float, line.split()[1:4])))
        elif line.startswith('o '):
            current = group_for(line[2:].strip(), include_donor)
        elif line.startswith('f ') and current is not None:
            face = []
            for token in line.split()[1:]:
                raw = int(token.split('/', 1)[0])
                face.append(raw - 1 if raw > 0 else len(points) + raw)
            if len(face) != 3:
                raise SystemExit(f'non-triangle K1A1 face: {line[:80]}')
            objects[current].extend(face)
    return points, objects


def transform(point, group):
    point = (
        point[0] - ROOT_PLAN_CENTER[0],
        point[1],
        (point[2] - ROOT_PLAN_CENTER[2]) * LONGITUDINAL_SCALE,
    )
    subtract = (GUN_WORLD_PIVOT if group == 'gun' else
                (TURRET_PIVOT if group.startswith('turret') else
                 (0.0, 0.0, 0.0)))
    return tuple(point[axis] - subtract[axis] for axis in range(3))


def encode_f32(values):
    return base64.b64encode(struct.pack(f'<{len(values)}f', *values)).decode()


def encode_u32(values):
    return base64.b64encode(struct.pack(f'<{len(values)}I', *values)).decode()


def compact_rows(include_donor=False):
    points, objects = parse_obj(source_obj(), include_donor)
    out = {}
    for group, indices in objects.items():
        positions, flat, remap = [], [], {}
        for old in indices:
            if old not in remap:
                remap[old] = len(positions)
                positions.append(transform(points[old], group))
            flat.append(remap[old])
        got = (len(positions), len(flat) // 3)
        if group in EXPECTED and got != EXPECTED[group]:
            raise SystemExit(f'{group}: expected {EXPECTED[group]}, got {got}')
        out[group] = {
            'positions': positions,
            'indices': flat,
            'counts': got,
        }
    return out


def payloads():
    rows = compact_rows()
    out = {}
    for group, row in rows.items():
        out[group] = {
            'p': encode_f32([
                value for point in row['positions'] for value in point]),
            'i': encode_u32(row['indices']),
            'counts': row['counts'],
        }
    return out


def repaired_oracle_bytes():
    rows = compact_rows(include_donor=True)
    binary = bytearray()
    views, accessors, meshes = [], [], []

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
        pblob = struct.pack(
            f'<{len(positions) * 3}f',
            *(value for point in positions for value in point))
        iblob = struct.pack(f'<{len(indices)}I', *indices)
        pview = append(pblob, 34962)
        iview = append(iblob, 34963)
        lo = [min(point[axis] for point in positions) for axis in range(3)]
        hi = [max(point[axis] for point in positions) for axis in range(3)]
        accessors.append({
            'bufferView': pview, 'componentType': 5126,
            'count': len(positions), 'type': 'VEC3',
            'min': lo, 'max': hi,
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

    mesh_ids = {group: mesh_for(group) for group in rows}
    nodes = [
        {'name': 'Root', 'children': [1, 2, 3]},
        {'name': 'Hull', 'mesh': mesh_ids['hull']},
        {'name': 'DonorRunningGear', 'mesh': mesh_ids['donor']},
        {
            'name': 'Turret', 'mesh': mesh_ids['turret'],
            'translation': list(TURRET_PIVOT), 'children': [4, 5],
        },
        {'name': 'TurretDetail', 'mesh': mesh_ids['turretDetail']},
        {
            'name': 'Gun', 'mesh': mesh_ids['gun'],
            'translation': [
                GUN_WORLD_PIVOT[axis] - TURRET_PIVOT[axis]
                for axis in range(3)
            ],
        },
    ]
    gltf = {
        'asset': {
            'version': '2.0',
            'generator': 'tools/k1a1-source-bake.py',
            'extras': {
                'title': 'K1A1 owner-source datum-normalized oracle',
                'sourceSha256': SOURCE_SHA256,
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


def render(data):
    rows = '\n'.join(
        f"  {key}: {{ p: '{data[key]['p']}', i: '{data[key]['i']}' }},"
        for key in EXPECTED)
    return f"""// GENERATED by tools/k1a1-source-bake.py from the owner K1A1 ZIP.
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

export function buildK1A1SourceGeometry(P) {{
  P.turretG.position.fromArray(TURRET_PIVOT);
  P.gunG.position.set(
    GUN_WORLD_PIVOT[0] - TURRET_PIVOT[0],
    GUN_WORLD_PIVOT[1] - TURRET_PIVOT[1],
    GUN_WORLD_PIVOT[2] - TURRET_PIVOT[2]);
  P.add('hull', geometry(DATA.hull));
  P.add('turret', geometry(DATA.turret));
  P.add('turretDetail', geometry(DATA.turretDetail));
  P.add('gunDark', geometry(DATA.gun));

  const marker = new THREE.Group();
  marker.name = 'fitting_k1a1SourceK6';
  marker.userData.fittingRoot = true;
  marker.userData.fitting = 'pintleMG';
  P.turretG.add(marker);
  P.muzzleZ = 3.05;
  P.topY = 3.065;
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
    wanted_oracle = repaired_oracle_bytes()
    counts = ', '.join(f'{key}={data[key]["counts"]}' for key in EXPECTED)
    if args.verify:
        if not OUTPUT.exists() or OUTPUT.read_text() != wanted:
            raise SystemExit('K1A1 source bake drift')
        if not REPAIRED_ORACLE.exists():
            raise SystemExit(f'K1A1 repaired oracle missing: '
                             f'{REPAIRED_ORACLE}')
        if REPAIRED_ORACLE.read_bytes() != wanted_oracle:
            raise SystemExit(f'K1A1 repaired oracle drift: '
                             f'{REPAIRED_ORACLE}')
        print('k1a1-source-bake: verified ' + counts +
              f'; oracle={len(wanted_oracle)}b; donor running gear excluded')
        return 0
    if OUTPUT.exists():
        shutil.copy2(OUTPUT, OUTPUT.with_suffix(OUTPUT.suffix + '.bak'))
    if REPAIRED_ORACLE.exists():
        shutil.copy2(
            REPAIRED_ORACLE,
            REPAIRED_ORACLE.with_suffix(REPAIRED_ORACLE.suffix + '.bak'))
    OUTPUT.write_text(wanted)
    REPAIRED_ORACLE.write_bytes(wanted_oracle)
    print(f'k1a1-source-bake: wrote {OUTPUT} and {REPAIRED_ORACLE}; '
          f'{counts}; oracle={len(wanted_oracle)}b')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
