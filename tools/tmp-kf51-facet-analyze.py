#!/usr/bin/env python3
# tmp-kf51-facet-analyze.py — offline analysis of tmp-kf51-frontfacet-probe
# output: side-rake least-squares fits per y band + plan front polyline per
# height band (x-bin -> max z), for REF and PROC. Diagnosis-only (§D).
import json, sys, math

path = sys.argv[1] if len(sys.argv) > 1 else 'shots/leopard-r11/probe-kf51-before.json'
d = json.load(open(path))

def fit(rows, y0, y1, col=1):
    pts = [(r[0], r[col]) for r in rows if y0 - 1e-6 <= r[0] <= y1 + 1e-6 and r[col] is not None and r[col] > -900]
    if len(pts) < 3: return None
    n = len(pts)
    sy = sum(p[0] for p in pts); sz = sum(p[1] for p in pts)
    syy = sum(p[0]*p[0] for p in pts); syz = sum(p[0]*p[1] for p in pts)
    den = n*syy - sy*sy
    if abs(den) < 1e-9: return None
    slope = (n*syz - sy*sz)/den
    b = (sz - slope*sy)/n
    resid = max(abs(z - (slope*y + b)) for y, z in pts)
    return dict(n=n, slope=round(slope, 4), deg=round(math.degrees(math.atan(abs(slope))), 2),
                resid_mm=round(resid*1000, 1))

for name in ('ref', 'proc'):
    m = d[name]
    print(f"== {name.upper()} turret y {m['yMin']:.3f}..{m['yMax']:.3f} zMax {m['zMax']:.3f} xMax {m['xMax']:.3f}")
    rows = m['side']
    # print side leading edge over the front band
    print('  side leading edge (y -> max z):')
    for r in rows:
        if r[0] >= 1.60 and r[1] > 1.5:
            print(f"    y={r[0]:.2f} z={r[1]:.3f} L={r[2] if r[2] is not None else '-'} R={r[3] if r[3] is not None else '-'}")
    # plan bands from the grid: for y bands, x -> max z
    grid = m['grid']
    bands = [(1.70, 1.90), (1.90, 2.10), (2.10, 2.30), (2.30, 2.50), (2.50, 2.60)]
    for (y0, y1) in bands:
        line = {}
        for x, y, z in grid:
            if y0 <= y < y1:
                if not (line.get(x, -9) >= z): line[x] = z
        xs = sorted(line)
        if not xs: continue
        print(f"  plan band y [{y0:.2f},{y1:.2f}): x -> max z")
        out = []
        for x in xs:
            if line[x] > 1.2:
                out.append(f"{x:+.2f}:{line[x]:.2f}")
        # print in chunks of 12
        for i in range(0, len(out), 12):
            print('    ' + '  '.join(out[i:i+12]))
print()
# side rake fits over candidate cheek bands
print('== side rake fits (z = a*y+b), angleFromVertical:')
for name in ('ref', 'proc'):
    rows = d[name]['side']
    for (y0, y1) in [(1.90, 2.10), (2.00, 2.20), (2.10, 2.30), (2.20, 2.45), (1.95, 2.25)]:
        f = fit(rows, y0, y1)
        if f: print(f"  {name.upper():4} y[{y0:.2f},{y1:.2f}] slope {f['slope']:+.3f} angle {f['deg']:.1f} deg resid {f['resid_mm']:.0f} mm n={f['n']}")
