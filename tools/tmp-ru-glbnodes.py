#!/usr/bin/env python3
# tmp-ru-glbnodes.py — dump GLB scene-graph NODE NAMES + accessor bounds
# (dimension metadata only; vertex/index data is never read) to identify
# misparented/plate nodes in the recovered russia-family oracles.
# Usage: python3 tools/tmp-ru-glbnodes.py public/models/tanks/community/recovered/t72bu.glb
import json, struct, sys

def read_glb_json(path):
    with open(path, 'rb') as f:
        magic, ver, total = struct.unpack('<III', f.read(12))
        assert magic == 0x46546C67, 'not a GLB'
        clen, ctype = struct.unpack('<II', f.read(8))
        return json.loads(f.read(clen))

def main(path):
    g = read_glb_json(path)
    nodes = g.get('nodes', [])
    meshes = g.get('meshes', [])
    accs = g.get('accessors', [])
    kids = {}
    for i, n in enumerate(nodes):
        for c in n.get('children', []):
            kids[c] = i
    def mesh_bounds(mi):
        m = meshes[mi]
        mn = [1e9]*3; mx = [-1e9]*3
        for prim in m.get('primitives', []):
            pa = prim.get('attributes', {}).get('POSITION')
            if pa is None: continue
            a = accs[pa]
            for k in range(3):
                mn[k] = min(mn[k], a['min'][k]); mx[k] = max(mx[k], a['max'][k])
        return mn, mx
    def walk(i, depth):
        n = nodes[i]
        name = n.get('name', f'#{i}')
        extras = []
        if 'translation' in n: extras.append('t=' + ','.join(f'{v:.2f}' for v in n['translation']))
        if 'rotation' in n: extras.append('r=' + ','.join(f'{v:.2f}' for v in n['rotation']))
        if 'scale' in n: extras.append('s=' + ','.join(f'{v:.2f}' for v in n['scale']))
        line = '  ' * depth + f'{name}'
        if 'mesh' in n:
            mn, mx = mesh_bounds(n['mesh'])
            sz = [mx[k]-mn[k] for k in range(3)]
            line += f'  MESH size {sz[0]:.2f}x{sz[1]:.2f}x{sz[2]:.2f} y {mn[1]:.2f}..{mx[1]:.2f} z {mn[2]:.2f}..{mx[2]:.2f} x {mn[0]:.2f}..{mx[0]:.2f}'
        if extras: line += '  [' + ' '.join(extras) + ']'
        print(line)
        for c in n.get('children', []):
            walk(c, depth + 1)
    roots = [i for i in range(len(nodes)) if i not in kids]
    scene = g.get('scenes', [{}])[g.get('scene', 0)].get('nodes', roots)
    for r in scene:
        walk(r, 0)

main(sys.argv[1])
