# t84 batch-40 PLAN dry-run (builder lane: IN-MEMORY only, no GLB writes).
# Applies the proposed compound repair to the committed print's verts in
# memory and reports every seat/height acceptance metric + census.
#   y_map  = [(0,0),(11.0,11.0),(14.682,15.52),(19.0,22.501),(22.2,25.701),
#             (24.75,29.8235),(30.0,35.0735)]   (long_map identity)
#   then Turret-node translate [0, -5.2029, 0]
import sys, struct
sys.path.insert(0, 'tools')
from repair_oracles import read_glb, _acc_reader

Y_MAP = [(0, 0), (11.0, 11.0), (14.682, 15.52), (19.0, 22.501),
         (22.2, 25.701), (24.75, 29.8235), (30.0, 35.0735)]
DT = -5.2029
S = 0.090169  # 3.56 / 39.4812 raw width (width-anchor registration)

def pw(v, pts=Y_MAP):
    if v <= pts[0][0]:
        s = (pts[1][1] - pts[0][1]) / (pts[1][0] - pts[0][0])
        return pts[0][1] + (v - pts[0][0]) * s
    for (a0, b0), (a1, b1) in zip(pts, pts[1:]):
        if v <= a1:
            return b0 + (b1 - b0) * (v - a0) / (a1 - a0)
    s = (pts[-1][1] - pts[-2][1]) / (pts[-1][0] - pts[-2][0])
    return pts[-1][1] + (v - pts[-1][0]) * s

# slope sanity
for (a0, b0), (a1, b1) in zip(Y_MAP, Y_MAP[1:]):
    sl = (b1 - b0) / (a1 - a0)
    assert a1 > a0 and b1 > b0, 'non-monotone'
    print(f'zone {a0:7.3f}..{a1:7.3f} u ({a0*S:5.3f}..{a1*S:5.3f} m): slope {sl:.5f}')

gltf, chunks = read_glb('public/models/tanks/community/recovered/t84.glb')
bi = next(i for i, (t, _) in enumerate(chunks) if t == 0x004E4942)
data = chunks[bi][1]

def verts(mi):
    prim = gltf['meshes'][mi]['primitives'][0]
    acc, n, fmt, off, stride = _acc_reader(gltf, data, prim['attributes']['POSITION'])
    for i in range(acc['count']):
        yield struct.unpack_from('<fff', data, off + i * stride)

# census (reachable, node-translation contract verified earlier)
nprims = nverts = ntris = 0
for mi in (0, 1):
    for prim in gltf['meshes'][mi]['primitives']:
        nprims += 1
        nverts += gltf['accessors'][prim['attributes']['POSITION']]['count']
        ntris += gltf['accessors'][prim['indices']]['count'] // 3
print(f'\ncensus: ({nprims}, {nverts}, {ntris})  [expect literal (2, 98284, 259887)]')

warp_top = -1e30
# hull: y_map only
hull_deck_ring = -1e30   # z -12..14, |x|<10
hull_hump = -1e30        # z -20..-13
hull_top = -1e30
glacis_z20 = -1e30
for x, y, z in verts(0):
    y2 = pw(y)
    warp_top = max(warp_top, y2)
    hull_top = max(hull_top, y2)
    if -12 <= z <= 14 and abs(x) < 10:
        hull_deck_ring = max(hull_deck_ring, y2)
    if -20 <= z <= -13:
        hull_hump = max(hull_hump, y2)
    if 19 <= z <= 21:
        glacis_z20 = max(glacis_z20, y2)

# turret: y_map then translate
rim_low = 1e30; rim_ring = 1e30          # outer shell 4.5<|x|<13.9, z -19..10, plug excluded
roof_hi = -1e30; top = -1e30
tube_lo = 1e30; tube_hi = -1e30          # z 30..68
mant_lo = 1e30                            # z 22..26 (root/mantlet bottom)
plug_lo = 1e30
for x, y, z in verts(1):
    y2 = pw(y) + DT
    warp_top = max(warp_top, pw(y))       # pre-translate guard check
    top = max(top, y2)
    if -19 <= z <= 10 and 4.5 <= abs(x) <= 13.9:
        if y < 12:
            plug_lo = min(plug_lo, y2)
        else:
            rim_low = min(rim_low, y2)
            if -2 <= z <= 10:
                rim_ring = min(rim_ring, y2)
    if -19 <= z <= 10 and y <= 24.75:
        roof_hi = max(roof_hi, y2)
    if 30 <= z <= 68:
        tube_lo = min(tube_lo, y2); tube_hi = max(tube_hi, y2)
    if 22 <= z <= 26:
        mant_lo = min(mant_lo, y2)

m = lambda u: u * S
print(f'\npre-translate warped top (y_top_max guard): {warp_top:.4f}u  -> y_top_max 29.95 {"OK" if warp_top < 29.95 else "FAIL"}')
print(f'hull ring deck:   {hull_deck_ring:8.4f}u = {m(hull_deck_ring):.4f} m   (target 1.3994, family 1.39-1.45)')
print(f'hull engine hump: {hull_hump:8.4f}u = {m(hull_hump):.4f} m   (class 1.45-1.50)')
print(f'hull top:         {hull_top:8.4f}u = {m(hull_top):.4f} m')
print(f'glacis @z20:      {glacis_z20:8.4f}u = {m(glacis_z20):.4f} m')
print(f'casting rim low:  {rim_low:8.4f}u = {m(rim_low):.4f} m   (seat = deck - overlap)')
print(f'  -> overlap vs ring deck: {m(hull_deck_ring - rim_low)*100:.2f} cm (family 2-3 cm)')
print(f'casting roof:     {roof_hi:8.4f}u = {m(roof_hi):.4f} m   (target pub 2.2200)')
print(f'assembly top:     {top:8.4f}u = {m(top):.4f} m   (furniture crest; heightM datum is bare roof)')
print(f'tube band:        {tube_lo:.4f}..{tube_hi:.4f}u = {m(tube_lo):.4f}..{m(tube_hi):.4f} m '
      f'(axis {m((tube_lo+tube_hi)/2):.4f}, dia {m(tube_hi-tube_lo):.4f} — was dia {2.737*S:.4f}: '
      f'{"CIRCULAR ✓" if abs((tube_hi-tube_lo)-2.737) < 0.01 else "DISTORTED ✗"})')
print(f'mantlet bottom (z22..26): {mant_lo:.4f}u = {m(mant_lo):.4f} m vs glacis @z20 {m(glacis_z20):.4f} '
      f'-> clearance {m(mant_lo-glacis_z20)*100:+.1f} cm')
print(f'basket plug: {plug_lo:.4f}u = {m(plug_lo):.4f} m (interior; hull belly/floor class ~0.35)')
print(f'\ndaylight check: rim_low - hull ring deck = {m(rim_low-hull_deck_ring):+.4f} m (was +0.276)')
