#!/usr/bin/env python3
"""Oracle-repair utility for recovered reference GLBs (fidelity program).

Node-LEVEL surgery only: inspect node trees, rename nodes, adjust node
translations, and re-parent nodes so each oracle assembles correctly
(turret seated on the hull ring, gun on the mantlet). Mesh/vertex data is
never modified — the binary chunk passes through byte-identical.

Usage:
  python3 tools/repair_oracles.py inspect <file.glb> [--verbose]
  python3 tools/repair_oracles.py repair  <id>            # applies REPAIRS[id]
  python3 tools/repair_oracles.py repair  --all

Repairs write <id>.glb in place, keeping the original at <id>.glb.bak
(first run only — the .bak is never overwritten, so repairs stay
re-runnable from the pristine original).
"""
import json
import struct
import sys
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RECOVERED = ROOT / 'public' / 'models' / 'tanks' / 'community' / 'recovered'

JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def read_glb(path):
    data = Path(path).read_bytes()
    magic, version, length = struct.unpack_from('<III', data, 0)
    if magic != 0x46546C67:
        raise ValueError(f'{path}: not a GLB')
    offset = 12
    gltf = None
    chunks = []  # (type, bytes) in original order
    while offset < length:
        clen, ctype = struct.unpack_from('<II', data, offset)
        offset += 8
        payload = data[offset:offset + clen]
        offset += clen
        chunks.append((ctype, payload))
        if ctype == JSON_CHUNK:
            gltf = json.loads(payload.decode('utf-8'))
    return gltf, chunks


def write_glb(path, gltf, chunks):
    payload = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
    payload += b' ' * ((4 - len(payload) % 4) % 4)
    out = []
    total = 12
    body = []
    for ctype, chunk in chunks:
        blob = payload if ctype == JSON_CHUNK else chunk
        if ctype != JSON_CHUNK:
            blob = blob + b'\x00' * ((4 - len(blob) % 4) % 4)
        body.append(struct.pack('<II', len(blob), ctype) + blob)
        total += 8 + len(blob)
    out.append(struct.pack('<III', 0x46546C67, 2, total))
    out.extend(body)
    Path(path).write_bytes(b''.join(out))


# ---------------------------------------------------------------- inspect --
def mat_mul(a, b):
    """column-major 4x4 (glTF layout) product a*b."""
    r = [0.0] * 16
    for col in range(4):
        for row in range(4):
            r[col * 4 + row] = sum(a[k * 4 + row] * b[col * 4 + k] for k in range(4))
    return r


IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


def local_matrix(node):
    if 'matrix' in node:
        return list(node['matrix'])
    t = node.get('translation', [0, 0, 0])
    r = node.get('rotation', [0, 0, 0, 1])
    s = node.get('scale', [1, 1, 1])
    x, y, z, w = r
    rot = [
        1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
        2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
        2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
        0, 0, 0, 1,
    ]
    for col in range(3):
        for row in range(3):
            rot[col * 4 + row] *= s[col]
    rot[12], rot[13], rot[14] = t
    return rot


def transform_point(m, p):
    x, y, z = p
    return (
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
    )


def mesh_local_bbox(gltf, mesh_index):
    lo = [float('inf')] * 3
    hi = [float('-inf')] * 3
    for prim in gltf['meshes'][mesh_index].get('primitives', []):
        pos = prim.get('attributes', {}).get('POSITION')
        if pos is None:
            continue
        acc = gltf['accessors'][pos]
        amin, amax = acc.get('min'), acc.get('max')
        if not amin or not amax:
            continue
        for i in range(3):
            lo[i] = min(lo[i], amin[i])
            hi[i] = max(hi[i], amax[i])
    if lo[0] == float('inf'):
        return None
    return lo, hi


def node_world_bbox(gltf, index, parent_matrix):
    """bbox of the subtree rooted at node `index` (world = scene frame)."""
    node = gltf['nodes'][index]
    world = mat_mul(parent_matrix, local_matrix(node))
    lo = [float('inf')] * 3
    hi = [float('-inf')] * 3

    def absorb(box, matrix):
        if box is None:
            return
        bmin, bmax = box
        for cx in (bmin[0], bmax[0]):
            for cy in (bmin[1], bmax[1]):
                for cz in (bmin[2], bmax[2]):
                    px, py, pz = transform_point(matrix, (cx, cy, cz))
                    lo[0] = min(lo[0], px); hi[0] = max(hi[0], px)
                    lo[1] = min(lo[1], py); hi[1] = max(hi[1], py)
                    lo[2] = min(lo[2], pz); hi[2] = max(hi[2], pz)

    if 'mesh' in node:
        absorb(mesh_local_bbox(gltf, node['mesh']), world)
    for child in node.get('children', []):
        sub = node_world_bbox(gltf, child, world)
        if sub is not None:
            absorb(sub, IDENT)
    if lo[0] == float('inf'):
        return None
    return lo, hi


def fmt_box(box):
    if box is None:
        return '(no mesh)'
    lo, hi = box
    return (f'x {lo[0]:7.2f}..{hi[0]:7.2f}  y {lo[1]:7.2f}..{hi[1]:7.2f}  '
            f'z {lo[2]:7.2f}..{hi[2]:7.2f}  '
            f'({hi[0]-lo[0]:.2f} x {hi[1]-lo[1]:.2f} x {hi[2]-lo[2]:.2f})')


def inspect(path, verbose=False):
    gltf, _ = read_glb(path)
    print(f'== {path}')
    scene = gltf.get('scenes', [{}])[gltf.get('scene', 0)]
    meshes = gltf.get('meshes', [])
    print(f'   nodes={len(gltf.get("nodes", []))} meshes={len(meshes)} '
          f'scene roots={scene.get("nodes", [])}')

    def walk(index, depth, parent_matrix):
        node = gltf['nodes'][index]
        world = mat_mul(parent_matrix, local_matrix(node))
        box = node_world_bbox(gltf, index, parent_matrix)
        t = node.get('translation')
        has_matrix = 'matrix' in node
        bits = []
        if t:
            bits.append(f't=({t[0]:.3f},{t[1]:.3f},{t[2]:.3f})')
        if node.get('rotation'):
            bits.append('rot')
        if node.get('scale'):
            bits.append(f's={node["scale"]}')
        if has_matrix:
            bits.append('MATRIX')
        if 'mesh' in node:
            prims = len(meshes[node['mesh']].get('primitives', []))
            bits.append(f'mesh#{node["mesh"]}({prims}p)')
        name = node.get('name', f'<node{index}>')
        print(f'   {"  " * depth}[{index}] {name} {" ".join(bits)}')
        print(f'   {"  " * depth}    {fmt_box(box)}')
        for child in node.get('children', []):
            walk(child, depth + 1, world)

    for root in scene.get('nodes', []):
        walk(root, 0, IDENT)


# ---------------------------------------------------------------- repairs --
def find_node(gltf, name):
    for i, node in enumerate(gltf['nodes']):
        if node.get('name') == name:
            return i
    raise KeyError(f'node named {name!r} not found')


def translate_node(gltf, name, delta):
    """Add delta (model units, node-local parent frame) to a node's translation."""
    node = gltf['nodes'][find_node(gltf, name)]
    if 'matrix' in node:
        m = list(node['matrix'])
        m[12] += delta[0]; m[13] += delta[1]; m[14] += delta[2]
        node['matrix'] = m
    else:
        t = list(node.get('translation', [0.0, 0.0, 0.0]))
        node['translation'] = [t[0] + delta[0], t[1] + delta[1], t[2] + delta[2]]


def rename_node(gltf, old, new):
    gltf['nodes'][find_node(gltf, old)]['name'] = new


def reparent_node(gltf, child_name, new_parent_name):
    """Move child under new parent, preserving its LOCAL transform as-is."""
    child = find_node(gltf, child_name)
    for node in gltf['nodes']:
        kids = node.get('children')
        if kids and child in kids:
            kids.remove(child)
    for scene in gltf.get('scenes', []):
        if child in scene.get('nodes', []):
            scene['nodes'].remove(child)
    parent = gltf['nodes'][find_node(gltf, new_parent_name)]
    parent.setdefault('children', []).append(child)


def absorb_into(gltf, child_name, parent_name):
    """Re-parent, preserving the child's WORLD transform.

    Restricted (deliberately) to the recovered WoT-kit layout this tool
    repairs: every node is a scene root carrying the identical rotation
    quaternion and no translation/scale/matrix. inv(parent) * child is then
    the identity, so the move is exact: drop the child's rotation and hang it
    under the parent. Anything else is refused loudly rather than guessed at.
    """
    child = gltf['nodes'][find_node(gltf, child_name)]
    parent = gltf['nodes'][find_node(gltf, parent_name)]
    for node, name in ((child, child_name), (parent, parent_name)):
        if any(k in node for k in ('translation', 'scale', 'matrix')):
            raise ValueError(f'{name}: absorb_into needs a rotation-only node')
    if child.get('rotation') != parent.get('rotation'):
        raise ValueError(f'{child_name} vs {parent_name}: rotations differ')
    child.pop('rotation', None)   # inv(parent_rot) * child_rot == identity
    reparent_node(gltf, child_name, parent_name)


# Per-oracle repair recipes. Each is a list of ops in model-space units of
# that GLB (verified against docs/references/tanks/<id>.md world measures and
# the inspect dump).
#
# Bergman Patton-family GLBs: Root carries quat(+90 deg about X), so the
# children live in a Z-up local frame: world = (lx, -lz, ly), i.e. a world
# delta (dx, dy_up, dz_fwd) is authored locally as (dx, dz_fwd, -dy_up).
# The turret casting is authored sunk into the hull (basket disc on the
# ground plane) and offset from the hull centreline; the repair lifts the
# whole fused Turret subtree onto the deck, recentres it, and parks the node
# ORIGIN on the turret-ring axis so the loader's autoPivot uses the authored
# ring centre (origin branch) instead of the footprint fallback.
def world_to_local(v):
    return [v[0], v[2], -v[1]]


def seat_turret(mesh_delta_world, ring_world, turret='Turret', mesh='TurretMesh'):
    """ops: move `mesh` by mesh_delta_world and put `turret`'s origin at ring_world."""
    pl = world_to_local(ring_world)
    ml = world_to_local(mesh_delta_world)
    rel = [ml[0] - pl[0], ml[1] - pl[1], ml[2] - pl[2]]
    return [
        ('translate', turret, pl),
        ('translate', mesh, rel),
    ]


# Lift values were tuned against tools/procedural-fidelity.mjs (sweeps 3.0 to
# 6.8 model units); the score optimum sits ~0.15-0.2 m below the exact
# ring-lip-on-deck seat because the print castings are slightly taller than
# the rebuilt procedural turrets, and the casting race is below deck on the
# real vehicles anyway. All four keep the casting visually proud of the roof
# with the bore band above the deck line.
REPAIRS = {
    # tube axis y12.4 / casting base ~10 / deck plate 15.8 / ring (12.6, 19.85)
    # -> recentre +5.4, lift +4.0 (dome roof ~2.22 m, packet target 2.30).
    'm26_pershing': seat_turret([5.4, 4.0, 0.0], [18.0, 15.8, 19.85]),
    # same casting, stub howitzer (no overhang); deck 15.8, ring (12.6, 20.4).
    'm45_patton': seat_turret([5.4, 3.6, 0.0], [18.0, 15.8, 20.4]),
    # deck (muffler line) 16.8; tube cx 10.9 -> recentre +7.1.
    'm46_patton': seat_turret([7.1, 4.2, 0.0], [18.0, 16.8, 20.0]),
    # deck 16.8; tube cx 11.69 -> +6.3; the long bustle rack stays in the
    # proc's 1.78-1.95 band and the roof plateau lands on the proc's 2.50.
    'm47_patton': seat_turret([6.3, 4.0, 0.0], [18.0, 16.8, 24.8]),
}


# --------------------------------------------------------------- chieftain --
# chieftain5.glb: the node named 'Turret' is the CHASSIS (lower hull + running
# gear); the real turret, gun and upper hull are 8 primitives fused into one
# mesh on the sibling root node. Materials name the parts, so the fix is a
# pure JSON re-group: no vertex, index or material data is touched — the new
# meshes reference the existing accessors.
#   mesh#0: 0 Gear_921 (turret-roof antennas) | 1 Gear_938 | 2 Turret_995
#           3 Glass_996 | 4 Cannon_128 | 5 Applique_155 | 6 Hull_361
#           7 SideSkirts_361
# This file's authored world frame is Z-up (config applies pitchOffset), and
# world y=0 is the turret-ring station (the packet's fidelity frame proves
# it: body spans -5.22..+1.97 with the origin on the ring). Ring plane sits
# at the chassis deck, world z ~74; the L11 trunnion at world (-4.7, 6, 85).
def repair_chieftain5(gltf):
    quat = [0.7071068286895752, 0, 0, 0.7071068286895752]
    mesh0 = gltf['meshes'][0]
    prims = mesh0['primitives']
    turret_prims = [prims[2], prims[0]]
    gun_prims = [prims[4]]
    mesh0['primitives'] = [prims[1], prims[3], prims[5], prims[6], prims[7]]
    gltf['meshes'].append({'name': 'TurretAssembly', 'primitives': turret_prims})
    gltf['meshes'].append({'name': 'CannonAssembly', 'primitives': gun_prims})
    turret_mesh_index = len(gltf['meshes']) - 2
    gun_mesh_index = len(gltf['meshes']) - 1

    rename_node(gltf, 'Turret', 'Chassis')
    rename_node(gltf, 'TurretMesh', 'ChassisMesh')

    nodes = gltf['nodes']
    # world = R*local with R=+90degX: (lx,ly,lz) -> (lx,-lz,ly); R^-1 world
    # (wx,wy,wz) -> (wx,wz,-wy).
    p_world = (0.0, 0.0, 74.0)          # ring axis x, ring station y, plane z
    p_local = [p_world[0], p_world[2], -p_world[1]]
    g_world = (-4.7, 6.0, 85.0)         # trunnion
    g_local = [g_world[0], g_world[2] - p_world[2], -(g_world[1] - p_world[1])]
    base = len(nodes)
    nodes.append({  # base+0 Turret
        'name': 'Turret', 'rotation': quat, 'translation': list(p_world),
        'children': [base + 1, base + 2],
    })
    nodes.append({  # base+1 TurretMesh
        'name': 'TurretMesh', 'mesh': turret_mesh_index,
        'translation': [-p_local[0], -p_local[1], -p_local[2]],
    })
    nodes.append({  # base+2 Gun
        'name': 'Gun', 'translation': g_local, 'children': [base + 3],
    })
    nodes.append({  # base+3 GunMesh
        'name': 'GunMesh', 'mesh': gun_mesh_index,
        'translation': [-p_local[0] - g_local[0], -p_local[1] - g_local[1],
                        -p_local[2] - g_local[2]],
    })
    gltf['scenes'][gltf.get('scene', 0)]['nodes'].append(base)


REPAIRS['chieftain5'] = [('py', repair_chieftain5)]


# --------------------------------------------------------------- merkava2b --
# Batch-3 diagnosis (all 146 nodes are flat scene roots sharing one +90degX
# quat; the loader classifies them purely via MERKAVA_TURRET_FOLLOWERS in
# src/vehicles/userdrops5.js — turretNode ^Turret$, gunNode ^Gun$). After the
# round-3 regex fix (skirts excluded), two defect classes remain:
#
#  1. TURRET furniture stranded hull-side (regex never matches their names, so
#     they sit in the hull mask and stay behind when rig_turret yaws):
#       gun_mask_34        mantlet block, y 1.55..2.50 z -0.91..1.21
#       turret_inside_46   casting interior + basket, y 0.61..2.59 — this is
#                          the "casting partly in the hull node" phantom that
#                          topped the hull mask at 2.59 through the ring zone
#       mg_01/mg_aa_01/mg_aa_mount_h/v/mg_mount_h/v  roof MGs, y 2.69..3.06
#       mg_twin_36         coax MG block inside the casting cheek, y 1.89..2.12
#       optic_turret_81    commander optic, y 2.52..2.76
#       ammo_01_44/ammo_40 roof ammo boxes, y 2.85..3.00
#       ex_decor_11/12/14/15/16  bustle/roof stowage, y 2.07..2.64
#     Fix: hang them under `Turret` (physical children ride rig_turret and
#     yaw with it). World transforms preserved exactly — see absorb_into.
#
#  2. HULL rear-plate fittings whose names FALSELY match the follower regex
#     ex_decor_(?:0[1-9]|13): ex_decor_08_140 / ex_decor_09_141 sit at
#     y 1.34..1.67 on the rear plate (deck is ~1.75) yet rode the turret —
#     at 180 deg yaw they orbited to the bow. Fix: renumber to the unused
#     ex_decor_17/18 slots so the regex ignores them (numbering is the only
#     semantics those WoT kit names carry).
#
# Turret bbox afterwards: x -1.41..1.53, y 0.61..3.21, z -3.94..1.61 — the
# autoPivot footprint fallback stays within 4 cm of the old axis, so the
# articulation frame is unchanged; the mask content is what moves.
MERKAVA2B_TURRET_STRAYS = [
    'vehicle#ammo_01_44', 'vehicle#ammo_40', 'vehicle#gun_mask_34',
    'vehicle#mg_01_39', 'vehicle#mg_aa_01_42', 'vehicle#mg_aa_mount_h_41',
    'vehicle#mg_aa_mount_v_43', 'vehicle#mg_mount_h_37',
    'vehicle#mg_mount_v_38', 'vehicle#mg_twin_36', 'vehicle#optic_turret_81',
    'vehicle#turret_inside_46', 'vehicle#ex_decor_11_63',
    'vehicle#ex_decor_12_64', 'vehicle#ex_decor_14_66',
    'vehicle#ex_decor_15_67', 'vehicle#ex_decor_16_80',
]


def repair_merkava2b(gltf):
    for name in MERKAVA2B_TURRET_STRAYS:
        absorb_into(gltf, name, 'Turret')
    rename_node(gltf, 'vehicle#ex_decor_08_140', 'vehicle#ex_decor_17_140')
    rename_node(gltf, 'vehicle#ex_decor_09_141', 'vehicle#ex_decor_18_141')


REPAIRS['merkava2b'] = [('py', repair_merkava2b)]


# ------------------------------------------------------------------ leo2a5 --
# Batch-3 diagnosis (111 flat scene roots, one shared +90degX quat; config is
# plain articulated('leo2a5') — turretNode ^Turret$, gunNode ^Gun$, NO
# follower regexes, so only the Turret/Gun subtrees articulate). The `Turret`
# node (mesh 'vehicle#bone_turret_40') is the bare wedge SHELL and does yaw,
# but every fitting that makes it read as an A5 turret is a stranded scene
# root that stays frozen on the hull (baseline board: at yaw 180 the shell's
# wedge nose swings aft while a complete phantom turret — wedge add-on
# modules, EMES cover, PERI, hatches, MGs, antennas, bustle bins — stays
# facing forward):
#   ex_armor_l_14/15, ex_armor_r_14/15   arrowhead wedge modules + side skins
#   turret_cap_50                        EMES roof cover, y 2.31..2.39
#   optic_commander_56                   PERI R17, y 2.59..2.98
#   hatch_05/06/07                       roof hatches + bustle roof panel
#   mg_aa_01_47, mg_mount_v_46           loader MG + mount, y 2.61..2.89
#   bone_mg_aa_h_01_45, ammo_110         MG cradle + ammo, y 2.61..2.88
#   antenna_01_109, antenna_02_108       whips at z -2.0/-2.2, y to 4.07
#   ex_decor_l_10_44, ex_decor_r_07_43   bustle stowage bins, y 1.89..2.42
# The mantlet ('vehicle#bone_gun_48', y 1.69..2.49 z 1.48..2.96) is likewise
# stranded; it belongs on the GUN so it elevates with the tube (its bbox is
# inside the Gun node's, so the loader's auto trunnion/muzzle stay put).
#
# Side effect that also fixes articulation: the Turret footprint used by the
# autoPivot fallback was z -3.13..2.12 (centre -0.51, visibly aft of the
# ring); with the wedges absorbed it becomes z -3.13..2.96 (centre -0.09).
#
# NOT moved: the engine-deck louvre banks and the rear stowage frames inside
# 'vehicle#x_root_107' (fused hull mesh) — see tools/repair_oracles_blender.py
# for the follow-up carve decision on the rear rack.
LEO2A5_TURRET_STRAYS = [
    'vehicle#ammo_110', 'vehicle#antenna_01_109', 'vehicle#antenna_02_108',
    'vehicle#bone_mg_aa_h_01_45', 'vehicle#ex_armor_l_14_54',
    'vehicle#ex_armor_l_15_53', 'vehicle#ex_armor_r_14_41',
    'vehicle#ex_armor_r_15_42', 'vehicle#ex_decor_l_10_44',
    'vehicle#ex_decor_r_07_43', 'vehicle#hatch_05_51', 'vehicle#hatch_06_52',
    'vehicle#hatch_07_55', 'vehicle#mg_aa_01_47', 'vehicle#mg_mount_v_46',
    'vehicle#optic_commander_56', 'vehicle#turret_cap_50',
]


def repair_leo2a5(gltf):
    for name in LEO2A5_TURRET_STRAYS:
        absorb_into(gltf, name, 'Turret')
    absorb_into(gltf, 'vehicle#bone_gun_48', 'Gun')


REPAIRS['leo2a5'] = [('py', repair_leo2a5)]


def repair(tank_id):
    ops = REPAIRS.get(tank_id)
    if ops is None:
        raise SystemExit(f'no repair recipe for {tank_id}')
    path = RECOVERED / f'{tank_id}.glb'
    bak = RECOVERED / f'{tank_id}.glb.bak'
    if not bak.exists():
        shutil.copy2(path, bak)
    gltf, chunks = read_glb(bak)  # always start from the pristine original
    for op in ops:
        kind = op[0]
        if kind == 'translate':
            translate_node(gltf, op[1], op[2])
        elif kind == 'rename':
            rename_node(gltf, op[1], op[2])
        elif kind == 'reparent':
            reparent_node(gltf, op[1], op[2])
        elif kind == 'py':
            op[1](gltf)
        else:
            raise ValueError(f'unknown op {kind}')
    write_glb(path, gltf, chunks)
    print(f'[repair] {tank_id}: {len(ops)} ops -> {path} (original kept at {bak.name})')


def main(argv):
    if len(argv) >= 2 and argv[0] == 'inspect':
        inspect(argv[1], verbose='--verbose' in argv)
    elif len(argv) >= 2 and argv[0] == 'repair':
        if argv[1] == '--all':
            for tank_id in REPAIRS:
                repair(tank_id)
        else:
            repair(argv[1])
    else:
        print(__doc__)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
