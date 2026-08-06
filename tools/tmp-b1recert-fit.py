#!/usr/bin/env python3
# b1recert: independent straight-line fits of prow/hood/crown/chin from the
# frontfacet probe JSON (ref = print, proc = in-tree WIP). Angles quoted as
# degrees FROM VERTICAL of the front profile line z(y): ang = atan(|dz/dy|).
import json
import math
import sys

P = json.load(open(sys.argv[1]))

def rows(side):
    # side: list of [y, zAll, zL, zR] (front line max world z per 2 cm y-band)
    return [(r[0], r[1]) for r in P[side]['side']]

def fit(pts, y0, y1, name, side):
    seg = [(y, z) for y, z in pts if y0 <= y <= y1 and z is not None]
    if len(seg) < 3:
        print(f'  {side} {name}: <3 pts in y {y0}..{y1}')
        return
    n = len(seg)
    sy = sum(p[0] for p in seg); sz = sum(p[1] for p in seg)
    syy = sum(p[0] * p[0] for p in seg); syz = sum(p[0] * p[1] for p in seg)
    m = (n * syz - sy * sz) / (n * syy - sy * sy)
    b = (sz - m * sy) / n
    resid = max(abs(z - (m * y + b)) for y, z in seg)
    ang = math.degrees(math.atan(abs(m)))
    print(f'  {side} {name}: slope {m:+.3f} angle-from-vertical {ang:.1f} deg  (y {y0}..{y1}, n {n}, max resid {resid*1000:.0f} mm)')

for side in ('ref', 'proc'):
    pts = rows(side)
    zs = [z for _, z in pts if z is not None]
    prow = max(pts, key=lambda p: (p[1] if p[1] is not None else -9))
    print(f'{side}: {len(pts)} rows, prow (max z) at y {prow[0]:.2f} z {prow[1]:.3f}')
    fit(pts, 1.86, 2.24, 'hood ', side)
    fit(pts, 2.48, 2.72, 'crown', side)
    fit(pts, 1.64, 1.82, 'chin ', side)
