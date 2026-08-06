# TEMP (cheek+gun re-cert critic): localize the builder's change per view.
# Diffs shots/abrams-cheek-r1/{before,after}-<id>/<view>.png — BOTH pair
# halves reported separately (REF half must be 0-diff; PROC half bbox is the
# change locus for my crop reads). Threshold recorded per §D addendum.
import sys, os, json
from PIL import Image

IDS = ['m1a1', 'm1a1ha', 'm1a2', 'm1a2_tejas', 'm1a2_sepv2']
VIEWS = ['view-front', 'view-frontleft', 'view-left', 'view-rearleft', 'view-rear',
         'view-rearright', 'view-right', 'view-frontright', 'view-top',
         'hero-frontleft', 'hero-rearright', 'hero-toptilt', 'close-front', 'close-roof']
THRESH = 4  # per-channel, >THRESH counts (recorded per §D addendum)
ROOT = 'shots/abrams-cheek-r1'

out = {}
for tid in IDS:
    out[tid] = {}
    for view in VIEWS:
        b = f'{ROOT}/before-{tid}/{view}.png'
        a = f'{ROOT}/after-{tid}/{view}.png'
        if not (os.path.exists(b) and os.path.exists(a)):
            out[tid][view] = 'MISSING'
            continue
        ib = Image.open(b).convert('RGB')
        ia = Image.open(a).convert('RGB')
        if ib.size != ia.size:
            out[tid][view] = f'SIZE {ib.size} vs {ia.size}'
            continue
        w, h = ib.size
        half = w // 2
        pb, pa = ib.load(), ia.load()
        stats = {}
        for name, x0, x1 in [('ref', 0, half), ('proc', half, w)]:
            n = 0
            bx = [10**9, -1, 10**9, -1]  # x0,x1,y0,y1
            for y in range(h):
                for x in range(x0, x1):
                    c1, c2 = pb[x, y], pa[x, y]
                    if (abs(c1[0]-c2[0]) > THRESH or abs(c1[1]-c2[1]) > THRESH
                            or abs(c1[2]-c2[2]) > THRESH):
                        n += 1
                        if x < bx[0]: bx[0] = x
                        if x > bx[1]: bx[1] = x
                        if y < bx[2]: bx[2] = y
                        if y > bx[3]: bx[3] = y
            stats[name] = {'px': n, 'bbox': bx if n else None}
        out[tid][view] = stats

for tid in IDS:
    print(f'== {tid}')
    for view in VIEWS:
        s = out[tid][view]
        if isinstance(s, str):
            print(f'  {view:16s} {s}')
            continue
        r, p = s['ref'], s['proc']
        print(f"  {view:16s} ref {r['px']:6d} {r['bbox']}   proc {p['px']:6d} {p['bbox']}")
with open(sys.argv[1] if len(sys.argv) > 1 else '/dev/null', 'w') as f:
    json.dump(out, f)
