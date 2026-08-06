# t84 seat plan: exact shell-rim band — y histogram of the casting outer
# zone (4.5<|x|<13.9, z -19..+10) with the basket plug's x-extent mapped,
# plus the free-tube band (z 30..68) for the axis/radius check.
import sys, struct, collections
sys.path.insert(0, 'tools')
from repair_oracles import read_glb, _acc_reader

gltf, chunks = read_glb('public/models/tanks/community/recovered/t84.glb')
bi = next(i for i, (t, _) in enumerate(chunks) if t == 0x004E4942)
data = chunks[bi][1]
prim = gltf['meshes'][1]['primitives'][0]
acc, n, fmt, off, stride = _acc_reader(gltf, data, prim['attributes']['POSITION'])

hist = collections.Counter()
plug = {'xmin': 1e9, 'xmax': -1e9, 'zmin': 1e9, 'zmax': -1e9, 'n': 0}
tube_lo = 1e9; tube_hi = -1e9; tube_x = 0.0
rim_by_z = {}
for i in range(acc['count']):
    x, y, z = struct.unpack_from('<fff', data, off + i * stride)
    if 30.0 <= z <= 68.0:
        tube_lo = min(tube_lo, y); tube_hi = max(tube_hi, y)
        tube_x = max(tube_x, abs(x))
    if -19.0 <= z <= 10.0 and 4.5 <= abs(x) <= 13.9:
        hist[round(y * 4) / 4] += 1
        if y < 12.0:
            plug['xmin'] = min(plug['xmin'], x); plug['xmax'] = max(plug['xmax'], x)
            plug['zmin'] = min(plug['zmin'], z); plug['zmax'] = max(plug['zmax'], z)
            plug['n'] += 1
        else:
            b = round(z / 2) * 2
            if b not in rim_by_z or y < rim_by_z[b]:
                rim_by_z[b] = y

S = 0.090169
print('casting outer zone y-histogram (0.25u bins, y<=20):')
for yb in sorted(hist):
    if yb <= 20.0:
        print(f'  y {yb:6.2f} ({yb*S:5.3f} m): {hist[yb]}')
print(f"\nplug (y<12): {plug['n']} verts, x {plug['xmin']:.2f}..{plug['xmax']:.2f}, "
      f"z {plug['zmin']:.2f}..{plug['zmax']:.2f}")
print('\nshell rim (plug excluded, min y per z-bin):')
for b in sorted(rim_by_z, reverse=True):
    print(f'  z {b:7.1f}: rim {rim_by_z[b]:7.3f}u = {rim_by_z[b]*S:5.3f} m')
print(f'\nfree tube (z 30..68): y {tube_lo:.3f}..{tube_hi:.3f}u '
      f'(axis {(tube_lo+tube_hi)/2:.3f}u = {(tube_lo+tube_hi)/2*S:.4f} m, '
      f'r {(tube_hi-tube_lo)/2:.3f}u = {(tube_hi-tube_lo)/2*S:.4f} m), max|x| {tube_x:.3f}')
