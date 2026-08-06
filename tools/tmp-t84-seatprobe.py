# t84 owner report probe (2026-08-04): "turret was elevated too far away
# from the hull" — measure the CASTING underside band vs the hull roof in
# the print, within the casting plan zone (excluding gun tube + basket
# interior), to size the seat-down batch.
import sys
sys.path.insert(0, 'tools')
from repair_oracles import read_glb, _acc_reader
import struct

gltf, chunks = read_glb('public/models/tanks/community/recovered/t84.glb')
bi = next(i for i, (t, _) in enumerate(chunks) if t == 0x004E4942)
data = chunks[bi][1]

# TurretMesh node: world = t(-0.075,10.682,4.297) on the Turret parent, then
# TurretMesh t(+0.075,-10.682,-4.297) — net identity vs Root. Read raw verts.
mesh = gltf['meshes'][1]
prim = mesh['primitives'][0]
acc, n, fmt, off, stride = _acc_reader(gltf, data, prim['attributes']['POSITION'])

# Histogram: casting shell zone = z in [-19..+10] (bustle..cheeks; tube is
# z>+10 forward), radial plan |x|<13.9. Bucket y in 0.25u bins, but only
# OUTER shell verts (|x|>4.5 — outside the basket/race radius ~10.4? use
# 4.5..13.9 to catch the skirt) to find the visible underside.
import collections
hist = collections.Counter()
lo = 1e9
for i in range(acc['count']):
    x, y, z = struct.unpack_from('<fff', data, off + i * stride)
    if -19.0 <= z <= 10.0 and 4.5 <= abs(x) <= 13.9:
        hist[round(y * 4) / 4] += 1
        lo = min(lo, y)
print('outer-shell min y:', lo)
for yb in sorted(hist):
    if yb <= 19.0:
        print(f'  y {yb:6.2f}: {hist[yb]}')
print('hull roof (HullMesh max y): 15.27  | scale ~0.09 m/u')
