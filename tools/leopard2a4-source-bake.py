#!/usr/bin/env python3
"""Bake the owner-supplied Leopard 2A4 OTCo OBJ into articulated geometry.

The authoritative download is a three-level ZIP whose original OBJ retains
102 semantic object names.  We use those names instead of the convenience GLB
conversion, which merges them into material buckets and loses turret
parenting.  Donor wheels, suspension, terminals, rollers and tracks are
excluded so the playable keeps the game-native animated track system.

Usage:
  python3 tools/leopard2a4-source-bake.py --write
  python3 tools/leopard2a4-source-bake.py --verify
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
SOURCE = Path('/Users/kevinliu/Downloads/leopard-2a4-otco.zip')
OUTPUT = ROOT / 'src/vehicles/profiles/leopard2a4-source-geometry.js'
ORACLE_OUTPUT = (ROOT / 'public/models/community-candidates/'
                 'leopard_2a4_otco_repaired.glb')
SOURCE_SHA256 = '84bdbd4ced44b2d2e4352ccd64bdcc0b6e0f762f786ecb74872c3fa0a3c4e833'
LEVEL2_SHA256 = '6373056de119786172c71c3ed7f504507efc7ba4a047cb422ac3512676d4ed19'
LEVEL3_SHA256 = '83d0bcc8593cebe7fbe50134e25f52e03bea27d855643da1e0bfe1ebbcb354d1'

# Root-plan center is the complete non-gun source box. The game loader uses
# the same box when it centers a sourced vehicle; applying it to the playable
# payload keeps exact source stations aligned with the native running gear and
# prevents thin barrel/rail courses from aliasing into different gate columns.
ROOT_PLAN_CENTER = (0.008, 0.0, -0.214625)
# The source print is 4.9-6.2% short after width/P95 normalization. A single
# measured longitudinal correction restores the published L/44 overall and
# hull-length datums without changing its cross-sections or turret identity.
LONGITUDINAL_SCALE = 1.055
TURRET_PIVOT = (
    -0.008, 1.665, 0.064625 * LONGITUDINAL_SCALE)
GUN_WORLD_PIVOT = (
    -0.008, 1.99, 0.684625 * LONGITUDINAL_SCALE)

TURRET = {'vehicle#bone_turret_28'}
TURRET_CLOTH = {'vehicle#turret_net_36'}
GUN = {
    'vehicle#gun_mask_33', 'vehicle#gun_barrel_34',
    'vehicle#bone_mg_gun_twin_35',
}
TURRET_DETAIL = {
    'vehicle#hatch_02_29', 'vehicle#hatch_03_30',
    'vehicle#hatch_09_31', 'vehicle#ex_decor_07_32',
    'vehicle#bone_commander_sight_h_37',
    'vehicle#bone_mg_aa_h_01_38', 'vehicle#bone_mg_aa_v_01_39',
    'vehicle#ex_decor_06_97',
    # The source names this late object as a generic decoration, but its
    # complete bounds (y 1.834..2.153, z 2.496..2.759) put it above the bow
    # and physically on the turret's forward equipment course. Leaving it in
    # the fallback hull bucket strands it in empty air when the turret yaws.
    'vehicle#ex_decor_11_98', 'vehicle#ammo_99',
    'vehicle#antenna_01_100', 'vehicle#antenna_02_101',
}
HULL = {'vehicle#x_root_96'}
HULL_CLOTH = {'vehicle#body_net_95'}

# Frozen after the first reviewed source bake. Values are compact referenced
# vertex and triangle counts, not the raw OBJ declaration domains.
EXPECTED = {
    'hull': (75339, 49224),
    'hullDetail': (28168, 28018),
    'hullCloth': (11034, 15368),
    'turret': (37347, 36294),
    'turretDetail': (14825, 14553),
    'turretCloth': (11906, 18162),
    'gun': (7455, 6874),
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def source_obj():
    outer = SOURCE.read_bytes()
    if sha(outer) != SOURCE_SHA256:
        raise SystemExit(f'Leopard 2A4 source drift: {sha(outer)}')
    with zipfile.ZipFile(io.BytesIO(outer)) as zf:
        level2 = zf.read('source/leopard-2-otco-war-thunder-leviathans.zip')
    if sha(level2) != LEVEL2_SHA256:
        raise SystemExit(f'Leopard 2A4 nested source drift: {sha(level2)}')
    with zipfile.ZipFile(io.BytesIO(level2)) as zf:
        level3 = zf.read('source/Leopard_2_(OTCo).zip')
    if sha(level3) != LEVEL3_SHA256:
        raise SystemExit(f'Leopard 2A4 OBJ archive drift: {sha(level3)}')
    with zipfile.ZipFile(io.BytesIO(level3)) as zf:
        return zf.read('Leopard_2_(OTCo).obj').decode('utf-8')


def group_for(name, include_donor=False):
    if name.startswith(('vehicle#wheel_', 'vehicle#suspension_',
                        'vehicle#track_')):
        return 'donor' if include_donor else None
    if name in TURRET:
        return 'turret'
    if name in TURRET_CLOTH:
        return 'turretCloth'
    if name in TURRET_DETAIL:
        return 'turretDetail'
    if name in GUN:
        return 'gun'
    if name in HULL:
        return 'hull'
    if name in HULL_CLOTH:
        return 'hullCloth'
    return 'hullDetail'


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
                raise SystemExit(f'non-triangle face in source: {line[:80]}')
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
        want = EXPECTED.get(group)
        if want is not None and got != want:
            raise SystemExit(f'{group}: expected {want}, got {got}')
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
    """Build a local articulated GLB from the exact semantic OBJ buckets."""
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
        {'name': 'Root', 'children': [1, 2, 3, 4, 5]},
        {'name': 'Hull', 'mesh': mesh_ids['hull']},
        {'name': 'HullDetail', 'mesh': mesh_ids['hullDetail']},
        {'name': 'HullCloth', 'mesh': mesh_ids['hullCloth']},
        {'name': 'DonorRunningGear', 'mesh': mesh_ids['donor']},
        {
            'name': 'Turret', 'mesh': mesh_ids['turret'],
            'translation': list(TURRET_PIVOT), 'children': [6, 7, 8],
        },
        {'name': 'TurretDetail', 'mesh': mesh_ids['turretDetail']},
        {'name': 'TurretCloth', 'mesh': mesh_ids['turretCloth']},
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
            'generator': 'tools/leopard2a4-source-bake.py',
            'extras': {
                'title': 'Leopard 2A4 OTCo semantic articulated oracle',
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
    return f"""// GENERATED by tools/leopard2a4-source-bake.py from the owner OTCo ZIP.
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

export function buildLeopard2A4SourceGeometry(P) {{
  P.turretG.position.fromArray(TURRET_PIVOT);
  P.gunG.position.set(
    GUN_WORLD_PIVOT[0] - TURRET_PIVOT[0],
    GUN_WORLD_PIVOT[1] - TURRET_PIVOT[1],
    GUN_WORLD_PIVOT[2] - TURRET_PIVOT[2]);
  P.add('hull', geometry(DATA.hull));
  P.add('hullDetail', geometry(DATA.hullDetail));
  P.add('hullCloth', geometry(DATA.hullCloth));
  P.add('turret', geometry(DATA.turret));
  P.add('turretDetail', geometry(DATA.turretDetail));
  P.add('turretCloth', geometry(DATA.turretCloth));
  P.add('gunDark', geometry(DATA.gun));

  const mgMarker = new THREE.Group();
  mgMarker.name = 'fitting_leopard2A4SourceMG3';
  mgMarker.userData.fittingRoot = true;
  mgMarker.userData.fitting = 'pintleMG';
  P.turretG.add(mgMarker);
  P.muzzleZ = 5.698;
  P.topY = 4.035;
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
            raise SystemExit('Leopard 2A4 source bake drift')
        if not ORACLE_OUTPUT.exists():
            raise SystemExit(f'Leopard 2A4 repaired oracle missing: '
                             f'{ORACLE_OUTPUT}')
        if ORACLE_OUTPUT.read_bytes() != wanted_oracle:
            raise SystemExit(f'Leopard 2A4 repaired oracle drift: '
                             f'{ORACLE_OUTPUT}')
        print('leopard2a4-source-bake: verified ' + counts +
              f'; oracle={len(wanted_oracle)}b; donor running gear excluded')
        return 0
    if OUTPUT.exists():
        shutil.copy2(OUTPUT, OUTPUT.with_suffix(OUTPUT.suffix + '.bak'))
    if ORACLE_OUTPUT.exists():
        shutil.copy2(
            ORACLE_OUTPUT,
            ORACLE_OUTPUT.with_suffix(ORACLE_OUTPUT.suffix + '.bak'))
    OUTPUT.write_text(wanted)
    ORACLE_OUTPUT.write_bytes(wanted_oracle)
    print(f'leopard2a4-source-bake: wrote {OUTPUT} and {ORACLE_OUTPUT}; '
          f'{counts}; oracle={len(wanted_oracle)}b')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
