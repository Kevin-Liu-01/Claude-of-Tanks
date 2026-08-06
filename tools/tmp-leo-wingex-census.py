#!/usr/bin/env python3
"""TEMP (leo2_revolution batch-43 WING-BAND EXCISION plan, §E sim lane).

Component census of the committed leo2_revolution.glb bytes in the EXACT
frame _index_surgery uses (repair_oracles.node_world_matrix — raw glb world,
no loader normalization, no yaw flip). Read-only: never writes the GLB.

Usage:
  python3 tools/tmp-leo-wingex-census.py                 # node map + census
  python3 tools/tmp-leo-wingex-census.py --mesh=TurretMesh --prim=0
  python3 tools/tmp-leo-wingex-census.py --dump=comps.json  # full component dump
"""
import json
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import repair_oracles as RO

GLB = RO.RECOVERED / 'leo2_revolution.glb'

# gate-frame helpers (measured constants from the r16/r18 packet):
# norm y = (glb_y + 1.108) * 0.904456 (batch-37 y_map ground raw -1.108;
# norm 2.862 = raw 2.0563 checks to 4 decimals). x/z scale is the same
# uniform loader scale; gate z = -glb z (+ registration offset the gate
# derives) — used here ONLY for interpretation, never for rules.
S = 0.904456
def norm_y(y):
    return (y + 1.108) * S


def components(gltf, data, node_name, prim_index):
    ni = RO.find_node(gltf, node_name)
    mesh_index = gltf['nodes'][ni]['mesh']
    prim = gltf['meshes'][mesh_index]['primitives'][prim_index]
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
    comp_verts = {}
    for i in range(len(pos)):
        comp_verts.setdefault(find(i), []).append(i)
    comp_tris = {}
    for k in range(0, len(idx) - 2, 3):
        comp_tris[find(idx[k])] = comp_tris.get(find(idx[k]), 0) + 1

    out = []
    for root, vids in comp_verts.items():
        lo = [min(W[i][k] for i in vids) for k in range(3)]
        hi = [max(W[i][k] for i in vids) for k in range(3)]
        out.append({
            'root': root, 'nv': len(vids), 'nt': comp_tris.get(root, 0),
            'lo': [round(v, 4) for v in lo], 'hi': [round(v, 4) for v in hi],
        })
    out.sort(key=lambda c: (c['lo'][1], c['lo'][0]))
    return out, len(pos), len(idx) // 3


def main(argv):
    gltf, chunks = RO.read_glb(GLB)
    bi = RO._bin_chunk_index(chunks)
    data = bytearray(chunks[bi][1])

    mesh_arg = next((a.split('=', 1)[1] for a in argv if a.startswith('--mesh=')), None)
    prim_arg = int(next((a.split('=', 1)[1] for a in argv if a.startswith('--prim=')), '0'))
    dump = next((a.split('=', 1)[1] for a in argv if a.startswith('--dump=')), None)

    if not mesh_arg:
        print(f'== nodes ({len(gltf["nodes"])}) / meshes ({len(gltf["meshes"])}) ==')
        for i, n in enumerate(gltf['nodes']):
            mi = n.get('mesh')
            extra = ''
            if mi is not None:
                mesh = gltf['meshes'][mi]
                prims = mesh['primitives']
                counts = []
                for p in prims:
                    nv = gltf['accessors'][p['attributes']['POSITION']]['count']
                    nt = gltf['accessors'][p['indices']]['count'] // 3 if 'indices' in p else -1
                    counts.append(f'{nv}v/{nt}t')
                extra = f" mesh#{mi} '{mesh.get('name','?')}' prims={len(prims)} [{', '.join(counts)}]"
            wm = RO.node_world_matrix(gltf, i)
            print(f"  node {i:2d} '{n.get('name','?')}'"
                  f" T={n.get('translation')} S={n.get('scale')}{extra}")
        print()

    targets = [(mesh_arg, prim_arg)] if mesh_arg else [
        ('TurretMesh', 0), ('GunMesh', 0), ('GunMesh', 1)]
    all_dump = {}
    for node_name, pi in targets:
        try:
            ni = RO.find_node(gltf, node_name)
        except Exception:
            print(f'-- {node_name}: NOT FOUND --')
            continue
        nprims = len(gltf['meshes'][gltf['nodes'][ni]['mesh']]['primitives'])
        if pi >= nprims:
            print(f'-- {node_name} prim{pi}: no such prim ({nprims} prims) --')
            continue
        comps, nv, nt = components(gltf, data, node_name, pi)
        all_dump[f'{node_name}.p{pi}'] = comps
        print(f'== {node_name} prim{pi}: {len(comps)} components, {nv} verts, {nt} tris ==')
        big = [c for c in comps if c['nv'] >= 200]
        small = [c for c in comps if c['nv'] < 200]
        print(f'   {len(big)} components >=200v, {len(small)} <200v')
        for c in big:
            lo, hi = c['lo'], c['hi']
            print(f'   BIG root {c["root"]:6d} {c["nv"]:6d}v {c["nt"]:6d}t '
                  f'x[{lo[0]:8.3f},{hi[0]:8.3f}] y[{lo[1]:7.3f},{hi[1]:7.3f}] '
                  f'z[{lo[2]:8.3f},{hi[2]:8.3f}] (normY {norm_y(lo[1]):.3f}..{norm_y(hi[1]):.3f})')
        # small-component band summary: bucket by y band and x reach
        def band(c):
            return (round(c['lo'][1], 1), round(c['hi'][1], 1))
        bands = {}
        for c in small:
            bands.setdefault(band(c), []).append(c)
        print(f'   small-component y-bands (glb y):')
        for b in sorted(bands):
            cs = bands[b]
            xlo = min(c['lo'][0] for c in cs); xhi = max(c['hi'][0] for c in cs)
            zlo = min(c['lo'][2] for c in cs); zhi = max(c['hi'][2] for c in cs)
            nvs = sum(c['nv'] for c in cs); nts = sum(c['nt'] for c in cs)
            print(f'     y[{b[0]:6.2f},{b[1]:6.2f}] n={len(cs):4d} {nvs:6d}v {nts:6d}t '
                  f'x[{xlo:8.3f},{xhi:8.3f}] z[{zlo:8.3f},{zhi:8.3f}] '
                  f'(normY {norm_y(b[0]):.3f}..{norm_y(b[1]):.3f})')
        print()

    # gun_tube_vlo + other _vlo nodes
    for i, n in enumerate(gltf['nodes']):
        name = n.get('name', '')
        if '_vlo' in name:
            mi = n.get('mesh')
            if mi is None:
                print(f'-- vlo node {i} "{name}": NO mesh ref (already dropped)')
                continue
            mesh = gltf['meshes'][mi]
            for pi2, p in enumerate(mesh['primitives']):
                pos = RO._read_rows(gltf, data, p['attributes']['POSITION'])
                world = RO.node_world_matrix(gltf, i)
                W = [RO.transform_point(world, q) for q in pos]
                lo = [min(w[k] for w in W) for k in range(3)]
                hi = [max(w[k] for w in W) for k in range(3)]
                nt = gltf['accessors'][p['indices']]['count'] // 3 if 'indices' in p else -1
                print(f'-- vlo node {i} "{name}" prim{pi2}: {len(pos)}v {nt}t '
                      f'x[{lo[0]:.3f},{hi[0]:.3f}] y[{lo[1]:.3f},{hi[1]:.3f}] z[{lo[2]:.3f},{hi[2]:.3f}]')

    if dump:
        Path(dump).write_text(json.dumps(all_dump, indent=1))
        print(f'[dump] -> {dump}')


if __name__ == '__main__':
    main(sys.argv[1:])
