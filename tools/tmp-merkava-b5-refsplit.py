#!/usr/bin/env python3
# TEMP (merkava family, B5 round): parse a recovered reference GLB's JSON
# chunk and report, per mesh node, its world AABB and whether the fidelity
# harness would put it in the TURRET mask (descendant of ^Turret$ / ^Gun$ or
# name matching the turretFollowers regex) or the HULL mask. Diagnosis only:
# answers "does the ref carry its rear duffel stack on the turret?" without
# touching any GLB bytes.
import json, struct, sys, re
import numpy as np

path = sys.argv[1]
TURRET_NODE = re.compile(r'^Turret$')
GUN_NODE = re.compile(r'^Gun$')
FOLLOWERS = re.compile(r'vehicle#(?:antenna_|bone_|ex_armor_(?!body|[lr]_)|ex_decor_(?:0[1-9]|13)|ex_decor_[lr]_02|hatch_(?:0[4-9]|1[0-3]))')
GUN_FOLLOWERS = re.compile(r'vehicle#gun_barrel_')

with open(path, 'rb') as f:
    magic, version, length = struct.unpack('<III', f.read(12))
    assert magic == 0x46546C67, 'not glb'
    clen, ctype = struct.unpack('<II', f.read(8))
    gltf = json.loads(f.read(clen))

nodes = gltf['nodes']
meshes = gltf.get('meshes', [])
accessors = gltf.get('accessors', [])

def local_matrix(n):
    if 'matrix' in n:
        return np.array(n['matrix'], dtype=float).reshape(4, 4).T
    m = np.eye(4)
    t = n.get('translation', [0, 0, 0])
    r = n.get('rotation', [0, 0, 0, 1])
    s = n.get('scale', [1, 1, 1])
    x, y, z, w = r
    R = np.array([
        [1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
        [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
        [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
    S = np.diag(s)
    m[:3, :3] = R @ S
    m[:3, 3] = t
    return m

children_of = {i: n.get('children', []) for i, n in enumerate(nodes)}
parent_of = {}
for i, ch in children_of.items():
    for c in ch:
        parent_of[c] = i

scene = gltf['scenes'][gltf.get('scene', 0)]['nodes']
world = {}
def walk(i, pm):
    wm = pm @ local_matrix(nodes[i])
    world[i] = wm
    for c in children_of[i]:
        walk(c, wm)
for r in scene:
    walk(r, np.eye(4))

def under(i, rex):
    j = i
    while j is not None:
        if rex.match(nodes[j].get('name', '')):
            return True
        j = parent_of.get(j)
    return False

rows = []
for i, n in enumerate(nodes):
    if 'mesh' not in n:
        continue
    name = n.get('name', f'(node{i})')
    mesh = meshes[n['mesh']]
    lo = np.array([np.inf] * 3)
    hi = np.array([-np.inf] * 3)
    for prim in mesh['primitives']:
        acc = accessors[prim['attributes']['POSITION']]
        amin, amax = np.array(acc['min']), np.array(acc['max'])
        for cx in (amin[0], amax[0]):
            for cy in (amin[1], amax[1]):
                for cz in (amin[2], amax[2]):
                    p = world[i] @ np.array([cx, cy, cz, 1.0])
                    lo = np.minimum(lo, p[:3])
                    hi = np.maximum(hi, p[:3])
    part = 'HULL'
    if under(i, TURRET_NODE) or FOLLOWERS.search(name):
        part = 'TURRET'
    if under(i, GUN_NODE) or GUN_FOLLOWERS.search(name):
        part = 'GUN'
    rows.append((part, name, lo, hi))

rows.sort(key=lambda r: (r[0], r[1]))
for part, name, lo, hi in rows:
    print(f'{part:6} {name:44} [{lo[0]:7.2f},{lo[1]:7.2f},{lo[2]:7.2f}] .. [{hi[0]:7.2f},{hi[1]:7.2f},{hi[2]:7.2f}]')
print(f'-- meshes: {len(rows)}  (frame = raw GLB, unnormalized)')
