# t84 TURRET-SEAT graduate-change, MEASURE phase (2026-08-04, russia agent).
# Full band decomposition of the committed post-batch-35 print (and the
# pristine .bak cross-check) to plan the batch-40 compound repair:
# hull-upper-band y_map stretch + Turret-node seat-down translate.
#
# usage: python3 tools/tmp-t84-seatprobe2.py [path]
import sys, struct, collections
sys.path.insert(0, 'tools')
from repair_oracles import read_glb, _acc_reader

PATH = sys.argv[1] if len(sys.argv) > 1 else 'public/models/tanks/community/recovered/t84.glb'
gltf, chunks = read_glb(PATH)
bi = next(i for i, (t, _) in enumerate(chunks) if t == 0x004E4942)
data = chunks[bi][1]

# ---- node graph + census (world == raw verts: Turret/TurretMesh cancel) ----
IDENT = None
def local_t(node):
    return node.get('translation', [0.0, 0.0, 0.0])

reach = []          # (name, mesh_index, world_translation)
def visit(ni, off):
    node = gltf['nodes'][ni]
    t = local_t(node)
    off = [off[0] + t[0], off[1] + t[1], off[2] + t[2]]
    if 'mesh' in node:
        reach.append((node.get('name'), node['mesh'], tuple(off)))
    for ci in node.get('children', []):
        visit(ci, off)
for ri in gltf['scenes'][gltf.get('scene', 0)]['nodes']:
    visit(ri, [0.0, 0.0, 0.0])

nprims = nverts = ntris = 0
for _nm, mi, _o in reach:
    for prim in gltf['meshes'][mi]['primitives']:
        nprims += 1
        nverts += gltf['accessors'][prim['attributes']['POSITION']]['count']
        ntris += gltf['accessors'][prim['indices']]['count'] // 3 if 'indices' in prim \
            else gltf['accessors'][prim['attributes']['POSITION']]['count'] // 3
print(f'file: {PATH}')
print(f'census: prims {nprims} / verts {nverts} / tris {ntris}')
for nm, mi, off in reach:
    print(f'  node {nm}: mesh {mi} ({gltf["meshes"][mi].get("name")}), world offset {tuple(round(v,4) for v in off)}')

def verts_of(mesh_index, world_off):
    prim = gltf['meshes'][mesh_index]['primitives'][0]
    acc, n, fmt, off, stride = _acc_reader(gltf, data, prim['attributes']['POSITION'])
    ox, oy, oz = world_off
    for i in range(acc['count']):
        x, y, z = struct.unpack_from('<fff', data, off + i * stride)
        yield (x + ox, y + oy, z + oz)

# ---- global extents ----
mesh_ext = {}
gmin = [1e9]*3; gmax = [-1e9]*3
for nm, mi, off in reach:
    mn = [1e9]*3; mx = [-1e9]*3
    for v in verts_of(mi, off):
        for k in range(3):
            mn[k] = min(mn[k], v[k]); mx[k] = max(mx[k], v[k])
            gmin[k] = min(gmin[k], v[k]); gmax[k] = max(gmax[k], v[k])
    mesh_ext[nm] = (mn, mx)
    print(f'{nm}: x {mn[0]:.4f}..{mx[0]:.4f}  y {mn[1]:.4f}..{mx[1]:.4f}  z {mn[2]:.4f}..{mx[2]:.4f}')
print(f'WHOLE: x {gmin[0]:.4f}..{gmax[0]:.4f} (width {gmax[0]-gmin[0]:.4f})  '
      f'y {gmin[1]:.4f}..{gmax[1]:.4f}  z {gmin[2]:.4f}..{gmax[2]:.4f}')
S = 3.56 / (gmax[0] - gmin[0])
print(f'registration scale s = 3.56/width = {S:.6f} m/u   '
      f'(ground {gmin[1]:.4f}u; heights below in m assume ground-ref)')
def m(yu):  # model-u height over ground -> meters in gate frame
    return (yu - gmin[1]) * S

# ---- hull top profile by z-bin ----
print('\nHULL top profile (max y per 2u z-bin; + the x where the max lives):')
hull = next(r for r in reach if r[0] == 'HullMesh')
prof = {}
for x, y, z in verts_of(hull[1], hull[2]):
    b = round(z / 2) * 2
    if b not in prof or y > prof[b][0]:
        prof[b] = (y, x)
for b in sorted(prof, reverse=True):
    y, x = prof[b]
    print(f'  z {b:7.1f}: top y {y:7.3f}u = {m(y):5.3f} m   (at x {x:6.2f})')

# ---- turret decomposition ----
tur = next(r for r in reach if r[0] == 'TurretMesh')
# plan zone of the casting (probe1: z -19..+10 casting, z>+10 tube)
under = {}   # outer-shell min-y by 2u z-bin (4.5<|x|<13.9)
roof = {}    # casting max-y by 2u z-bin (all x), y<=24.75 to exclude furniture
furn = {}    # furniture y>24.75 cluster
basket_lo = 1e9; basket_hi = -1e9
tube = {'ymin': 1e9, 'ymax': -1e9, 'zmin': 1e9, 'zmax': -1e9, 'xmin': 1e9, 'xmax': -1e9, 'n': 0}
cast_ext = [1e9, -1e9, 1e9, -1e9]  # x/z extents of casting zone
for x, y, z in verts_of(tur[1], tur[2]):
    if z > 10.0:
        tube['ymin'] = min(tube['ymin'], y); tube['ymax'] = max(tube['ymax'], y)
        tube['zmin'] = min(tube['zmin'], z); tube['zmax'] = max(tube['zmax'], z)
        tube['xmin'] = min(tube['xmin'], x); tube['xmax'] = max(tube['xmax'], x)
        tube['n'] += 1
        continue
    b = round(z / 2) * 2
    cast_ext[0] = min(cast_ext[0], x); cast_ext[1] = max(cast_ext[1], x)
    cast_ext[2] = min(cast_ext[2], z); cast_ext[3] = max(cast_ext[3], z)
    if 4.5 <= abs(x) <= 13.9:
        if b not in under or y < under[b]:
            under[b] = y
    if y <= 24.75:
        if b not in roof or y > roof[b]:
            roof[b] = y
    else:
        fb = round(z / 2) * 2
        e = furn.setdefault(fb, [1e9, -1e9, 1e9, -1e9])  # ymin,ymax,xmin,xmax
        e[0] = min(e[0], y); e[1] = max(e[1], y); e[2] = min(e[2], x); e[3] = max(e[3], x)
    if abs(x) < 4.5:
        basket_lo = min(basket_lo, y); basket_hi = max(basket_hi, y)

print(f'\nTURRET casting zone: x {cast_ext[0]:.2f}..{cast_ext[1]:.2f}, z {cast_ext[2]:.2f}..{cast_ext[3]:.2f}')
print(f'basket/interior (|x|<4.5): y {basket_lo:.3f}..{basket_hi:.3f}u '
      f'({m(basket_lo):.3f}..{m(basket_hi):.3f} m)')
print(f'fused tube (z>10): y {tube["ymin"]:.3f}..{tube["ymax"]:.3f}u '
      f'(axis ~{(tube["ymin"]+tube["ymax"])/2:.3f}u = {m((tube["ymin"]+tube["ymax"])/2):.3f} m, '
      f'r {(tube["ymax"]-tube["ymin"])/2:.3f}u), z ..{tube["zmax"]:.3f}u, '
      f'|x|<={max(abs(tube["xmin"]), abs(tube["xmax"])):.3f}, {tube["n"]} verts')

print('\ncasting UNDERSIDE (outer shell 4.5<|x|<13.9, min y per z-bin) '
      'vs casting ROOF (max y <=24.75):')
for b in sorted(set(under) | set(roof), reverse=True):
    u = under.get(b); r = roof.get(b)
    us = f'{u:7.3f}u ={m(u):5.3f}m' if u is not None else '        --      '
    rs = f'{r:7.3f}u ={m(r):5.3f}m' if r is not None else '        --      '
    print(f'  z {b:7.1f}: under {us}   roof {rs}')

if furn:
    print('\nfurniture cluster (y>24.75) by z-bin:')
    for b in sorted(furn, reverse=True):
        y0, y1, x0, x1 = furn[b]
        print(f'  z {b:7.1f}: y {y0:.2f}..{y1:.2f}u ({m(y0):.3f}..{m(y1):.3f} m), x {x0:.2f}..{x1:.2f}')

# global casting stats
u_all = min(under.values()); r_all = max(roof.values())
print(f'\ncasting outer-shell underside LOW: {u_all:.4f}u = {m(u_all):.4f} m')
print(f'casting roof HIGH (<=24.75): {r_all:.4f}u = {m(r_all):.4f} m')
hull_top = mesh_ext['HullMesh'][1][1]
print(f'hull top: {hull_top:.4f}u = {m(hull_top):.4f} m')
print(f'DAYLIGHT (underside-low - hull top): {u_all - hull_top:.4f}u = {(u_all - hull_top)*S:.4f} m')
print(f'casting height (roof-high - underside-low): {r_all - u_all:.4f}u = {(r_all - u_all)*S:.4f} m')
print(f'whole top: {gmax[1]:.4f}u = {m(gmax[1]):.4f} m')
