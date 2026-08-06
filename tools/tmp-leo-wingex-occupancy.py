#!/usr/bin/env python3
"""TEMP (leo2_revolution batch-43 wing-band excision): occupancy analysis of
TurretMesh prim0 in glb world frame. For each (x,z) cell: min/max vertex y.
Floating thin roof-height cells with no support below = wing-band candidates.
Also per-component classification passes for candidate delete rules.
Read-only.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import repair_oracles as RO

GLB = RO.RECOVERED / 'leo2_revolution.glb'
S = 0.904456


def load(node_name, prim_index):
    gltf, chunks = RO.read_glb(GLB)
    bi = RO._bin_chunk_index(chunks)
    data = bytearray(chunks[bi][1])
    ni = RO.find_node(gltf, node_name)
    prim = gltf['meshes'][gltf['nodes'][ni]['mesh']]['primitives'][prim_index]
    idx = [v[0] for v in RO._read_rows(gltf, data, prim['indices'])]
    pos = RO._read_rows(gltf, data, prim['attributes']['POSITION'])
    world = RO.node_world_matrix(gltf, ni)
    W = [RO.transform_point(world, p) for p in pos]
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
    comp = {}
    for i in range(len(pos)):
        comp.setdefault(find(i), []).append(i)
    tris = {}
    for k in range(0, len(idx) - 2, 3):
        tris[find(idx[k])] = tris.get(find(idx[k]), 0) + 1
    return W, comp, tris


def main():
    W, comp, tris = load('TurretMesh', 0)

    # ---- occupancy: 0.1 z-bins x 0.1 x-bins, min/max y per cell
    CELL = 0.1
    cells = {}
    for (x, y, z) in W:
        key = (round(x / CELL) * CELL, round(z / CELL) * CELL)
        lo, hi = cells.get(key, (99.0, -99.0))
        cells[key] = (min(lo, y), max(hi, y))

    # side profile per z-bin: solid depth (min y of any cell with |x|<=0.6)
    # vs full x reach
    print('== per z-bin (glb): core minY (|x|<=0.7) / maxY | full x reach at y>=1.0 | minY outboard (|x|>1.35)')
    zs = sorted({k[1] for k in cells})
    for zb in zs:
        row = [(k[0], v) for k, v in cells.items() if abs(k[1] - zb) < 1e-6]
        core = [v for (xb, v) in row if abs(xb) <= 0.7]
        outb = [v for (xb, v) in row if abs(xb) > 1.35]
        reach = [xb for (xb, v) in row if v[1] >= 1.0]
        cminy = min((v[0] for v in core), default=None)
        cmaxy = max((v[1] for v in core), default=None)
        ominy = min((v[0] for v in outb), default=None)
        omaxy = max((v[1] for v in outb), default=None)
        print(f'  z {zb:6.2f} core y[{cminy if cminy is not None else "-":>6}..'
              f'{cmaxy if cmaxy is not None else "-":>6}] '
              f'reach x [{min(reach) if reach else 0:6.2f},{max(reach) if reach else 0:6.2f}] '
              f'outboard y[{ominy if ominy is not None else "-"}..{omaxy if omaxy is not None else "-"}] n={len(row)}')

    # ---- x-band support: per x-bin over the whole mesh, min y
    print()
    print('== per x-bin (glb): minY / maxY / nverts')
    xs = {}
    for (x, y, z) in W:
        xb = round(x / CELL) * CELL
        lo, hi, n = xs.get(xb, (99.0, -99.0, 0))
        xs[xb] = (min(lo, y), max(hi, y), n + 1)
    for xb in sorted(xs):
        lo, hi, n = xs[xb]
        print(f'  x {xb:6.2f} y[{lo:6.3f}..{hi:6.3f}] n={n:5d}')


if __name__ == '__main__':
    main()
