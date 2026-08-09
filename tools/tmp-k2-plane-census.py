#!/usr/bin/env python3
"""TEMP: census K2 reference top-facing triangle planes in world space."""
import math
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from repair_oracles import (  # noqa: E402
    _bin_chunk_index,
    _read_rows,
    find_node,
    node_world_matrix,
    read_glb,
    transform_point,
)


def sub(a, b):
    return tuple(a[i] - b[i] for i in range(3))


def cross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def tri_plane(a, b, c):
    n = cross(sub(b, a), sub(c, a))
    mag = math.sqrt(sum(v * v for v in n))
    if mag < 1e-10:
        return None
    area = mag / 2
    n = tuple(v / mag for v in n)
    if n[1] < 0:
        n = tuple(-v for v in n)
    d = -sum(n[i] * a[i] for i in range(3))
    return n, d, area


def quant(v, step):
    return round(v / step) * step


def census(gltf, data, name):
    ni = find_node(gltf, name)
    node = gltf['nodes'][ni]
    m = node_world_matrix(gltf, ni)
    groups = defaultdict(lambda: {'area': 0.0, 'tris': 0, 'pts': []})
    for prim in gltf['meshes'][node['mesh']]['primitives']:
        pos_acc = prim.get('attributes', {}).get('POSITION')
        if pos_acc is None:
            continue
        pts = [transform_point(m, p) for p in _read_rows(gltf, data, pos_acc)]
        if 'indices' in prim:
            ids = [r[0] for r in _read_rows(gltf, data, prim['indices'])]
        else:
            ids = list(range(len(pts)))
        for i in range(0, len(ids) - 2, 3):
            abc = [pts[ids[i + j]] for j in range(3)]
            plane = tri_plane(*abc)
            if not plane:
                continue
            n, d, area = plane
            if n[1] < 0.15:
                continue
            key = tuple(quant(v, 0.01) for v in (*n, d))
            g = groups[key]
            g['area'] += area
            g['tris'] += 1
            g['pts'].extend(abc)

    print(f'\n{name}: {len(groups)} top-facing plane clusters')
    for key, g in sorted(groups.items(), key=lambda kv: kv[1]['area'], reverse=True)[:35]:
        lo = [min(p[i] for p in g['pts']) for i in range(3)]
        hi = [max(p[i] for p in g['pts']) for i in range(3)]
        n = key[:3]
        d = key[3]
        print(
            f" area={g['area']:7.3f} tris={g['tris']:4d} "
            f"n=({n[0]:+.2f},{n[1]:+.2f},{n[2]:+.2f}) d={d:+.2f} "
            f"x={lo[0]:+.3f}..{hi[0]:+.3f} "
            f"y={lo[1]:+.3f}..{hi[1]:+.3f} "
            f"z={lo[2]:+.3f}..{hi[2]:+.3f}"
        )


def component_census(gltf, data, name):
    """Connected top-sheet components, useful for separating roof from greebles."""
    ni = find_node(gltf, name)
    node = gltf['nodes'][ni]
    m = node_world_matrix(gltf, ni)
    candidates = []
    for prim in gltf['meshes'][node['mesh']]['primitives']:
        pos_acc = prim.get('attributes', {}).get('POSITION')
        if pos_acc is None:
            continue
        pts = [transform_point(m, p) for p in _read_rows(gltf, data, pos_acc)]
        ids = ([r[0] for r in _read_rows(gltf, data, prim['indices'])]
               if 'indices' in prim else list(range(len(pts))))
        for i in range(0, len(ids) - 2, 3):
            abc = [pts[ids[i + j]] for j in range(3)]
            plane = tri_plane(*abc)
            if not plane:
                continue
            n, d, area = plane
            cy = sum(p[1] for p in abc) / 3
            if n[1] > 0.95 and 2.30 <= cy <= 2.46:
                keys = [tuple(round(v, 5) for v in p) for p in abc]
                candidates.append((keys, abc, area))
    parent = list(range(len(candidates)))

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(a, b):
        a, b = root(a), root(b)
        if a != b:
            parent[b] = a

    owners = defaultdict(list)
    for ti, (keys, _, _) in enumerate(candidates):
        for key in keys:
            owners[key].append(ti)
    for tis in owners.values():
        for ti in tis[1:]:
            union(tis[0], ti)
    comps = defaultdict(lambda: {'area': 0.0, 'pts': [], 'tris': 0})
    for ti, (_, abc, area) in enumerate(candidates):
        c = comps[root(ti)]
        c['area'] += area
        c['pts'].extend(abc)
        c['tris'] += 1
    print(f'\n{name}: {len(comps)} connected top-sheet components')
    ordered = sorted(comps.values(), key=lambda v: v['area'], reverse=True)
    for ci, c in enumerate(ordered[:40]):
        lo = [min(p[i] for p in c['pts']) for i in range(3)]
        hi = [max(p[i] for p in c['pts']) for i in range(3)]
        print(
            f" area={c['area']:7.3f} tris={c['tris']:4d} "
            f"x={lo[0]:+.3f}..{hi[0]:+.3f} "
            f"y={lo[1]:+.3f}..{hi[1]:+.3f} "
            f"z={lo[2]:+.3f}..{hi[2]:+.3f}"
        )
        if ci < 2:
            pts = sorted(set(tuple(round(v, 4) for v in p) for p in c['pts']),
                         key=lambda p: (p[2], p[0], p[1]))
            print('   points:', ' '.join(f'({p[0]:+.4f},{p[1]:+.4f},{p[2]:+.4f})' for p in pts))


def roof_mesh_components(gltf, data, name):
    """All-triangle connected components wholly above the K2 roof datum."""
    ni = find_node(gltf, name)
    node = gltf['nodes'][ni]
    m = node_world_matrix(gltf, ni)
    candidates = []
    for prim in gltf['meshes'][node['mesh']]['primitives']:
        pos_acc = prim.get('attributes', {}).get('POSITION')
        if pos_acc is None:
            continue
        pts = [transform_point(m, p) for p in _read_rows(gltf, data, pos_acc)]
        ids = ([r[0] for r in _read_rows(gltf, data, prim['indices'])]
               if 'indices' in prim else list(range(len(pts))))
        for i in range(0, len(ids) - 2, 3):
            abc = [pts[ids[i + j]] for j in range(3)]
            if min(p[1] for p in abc) < 2.25:
                continue
            plane = tri_plane(*abc)
            if not plane:
                continue
            keys = [tuple(round(v, 5) for v in p) for p in abc]
            candidates.append((keys, abc, plane[2]))
    parent = list(range(len(candidates)))

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(a, b):
        a, b = root(a), root(b)
        if a != b:
            parent[b] = a

    owners = defaultdict(list)
    for ti, (keys, _, _) in enumerate(candidates):
        for key in keys:
            owners[key].append(ti)
    for tis in owners.values():
        for ti in tis[1:]:
            union(tis[0], ti)
    comps = defaultdict(lambda: {'area': 0.0, 'pts': [], 'tris': 0})
    for ti, (_, abc, area) in enumerate(candidates):
        c = comps[root(ti)]
        c['area'] += area
        c['pts'].extend(abc)
        c['tris'] += 1
    ordered = sorted(comps.values(), key=lambda v: v['area'], reverse=True)
    print(f'\n{name}: {len(ordered)} connected all-triangle roof components y>=2.25')
    for c in ordered[:80]:
        lo = [min(p[i] for p in c['pts']) for i in range(3)]
        hi = [max(p[i] for p in c['pts']) for i in range(3)]
        if c['area'] < 0.002:
            continue
        print(
            f" area={c['area']:7.3f} tris={c['tris']:4d} "
            f"x={lo[0]:+.3f}..{hi[0]:+.3f} "
            f"y={lo[1]:+.3f}..{hi[1]:+.3f} "
            f"z={lo[2]:+.3f}..{hi[2]:+.3f}"
        )


path = Path(sys.argv[1] if len(sys.argv) > 1 else
            'public/models/community-candidates/k2_black_panther_armored_warfare.glb')
gltf, chunks = read_glb(path)
data = chunks[_bin_chunk_index(chunks)][1]
for node_name in (sys.argv[2:] or ['Object_21', 'Object_22', 'Object_10', 'Object_2', 'Object_24']):
    census(gltf, data, node_name)
    if node_name in ('Object_21', 'Object_22'):
        component_census(gltf, data, node_name)
    roof_mesh_components(gltf, data, node_name)
