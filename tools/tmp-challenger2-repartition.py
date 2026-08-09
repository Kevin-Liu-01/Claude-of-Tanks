#!/usr/bin/env python3
"""Temporary exact-index census for Challenger 2 oracle repartitioning."""
from pathlib import Path
import repair_oracles as ro

path = Path('public/models/tanks/community/challenger_ii.glb')
gltf, chunks = ro.read_glb(path)
data = bytearray(chunks[ro._bin_chunk_index(chunks)][1])
ni = ro.find_node(gltf, 'challendger 2_0')
prim = gltf['meshes'][gltf['nodes'][ni]['mesh']]['primitives'][0]
idx = [v[0] for v in ro._read_rows(gltf, data, prim['indices'])]
pos = ro._read_rows(gltf, data, prim['attributes']['POSITION'])
world = ro.node_world_matrix(gltf, ni)
points = [ro.transform_point(world, p) for p in pos]
parent = list(range(len(pos)))

def find(a):
    while parent[a] != a:
        parent[a] = parent[parent[a]]
        a = parent[a]
    return a

for k in range(0, len(idx) - 2, 3):
    a, b, c = find(idx[k]), find(idx[k + 1]), find(idx[k + 2])
    if a != b:
        parent[a] = b
    if find(idx[k]) != find(idx[k + 2]):
        parent[find(idx[k])] = find(idx[k + 2])

roots = {}
for i in range(len(pos)):
    roots.setdefault(find(i), set()).add(i)
tris = {r: 0 for r in roots}
for k in range(0, len(idx) - 2, 3):
    tris[find(idx[k])] += 1

rows = []
for root, vids in roots.items():
    lo = [min(points[i][a] for i in vids) for a in range(3)]
    hi = [max(points[i][a] for i in vids) for a in range(3)]
    kind = 'gun' if (lo[2] >= 2.50 and hi[0] <= 0.25 and lo[0] >= -0.25) else (
        'hull' if hi[1] <= 0.57 else 'turret')
    rows.append((kind, tris[root], len(vids), lo, hi))

for kind in ('gun', 'hull', 'turret'):
    selected = [r for r in rows if r[0] == kind]
    print(kind, 'components', len(selected), 'verts', sum(r[2] for r in selected),
          'tris', sum(r[1] for r in selected))
    for _, nt, nv, lo, hi in sorted(selected, key=lambda r: -r[1])[:20]:
        print(' ', nt, nv, [round(v, 4) for v in (*lo, *hi)])
