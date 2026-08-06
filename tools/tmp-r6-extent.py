#!/usr/bin/env python3
# TEMP (merkava 3d/1b r6, STEP 0 EXTENT AUDIT): measure per-half SOLID
# extents on a critic pair. Each 640px half is framed independently on its
# own visible box, so the scale-invariant W/H aspect of the SOLID content is
# the stance-drift signal the critic flagged (proc 8-9% narrower-per-height
# on 3d, 13-16% on 1b at front/rear). "Solid" filters whip/antenna hairlines:
# a column counts when it holds >= --minrun contiguous non-bg px; a row
# likewise. Also prints width at a set of height fractions so we can see
# WHERE the width difference lives (track band / fender line / turret).
import sys
from PIL import Image

BG = (0x15, 0x1B, 0x20)
def is_bg(p):
    return abs(p[0] - BG[0]) < 12 and abs(p[1] - BG[1]) < 12 and abs(p[2] - BG[2]) < 12

LABEL = (200, 34)  # "REFERENCE"/"PROCEDURAL" text box (x<200, y<34) is not content

def longest_run(vals):
    best = cur = 0
    for v in vals:
        cur = cur + 1 if v else 0
        best = max(best, cur)
    return best

def audit(im, xoff, label, minrun):
    px = im.load()
    S = 640
    def content(x, y):
        if x < LABEL[0] and y < LABEL[1]: return False
        return not is_bg(px[xoff + x, y][:3])
    solid_cols, solid_rows = [], []
    for x in range(S):
        col = [content(x, y) for y in range(S)]
        if longest_run(col) >= minrun: solid_cols.append(x)
    for y in range(S):
        row = [content(x, y) for x in range(S)]
        if longest_run(row) >= minrun: solid_rows.append(y)
    if not solid_cols or not solid_rows:
        print(f'{label}: EMPTY'); return None
    x0, x1 = solid_cols[0], solid_cols[-1]
    y0, y1 = solid_rows[0], solid_rows[-1]
    W, H = x1 - x0 + 1, y1 - y0 + 1
    # raw bbox (hairlines included) for reference
    rx0 = ry0 = 10**9; rx1 = ry1 = -1
    for x in range(S):
        for y in range(S):
            if content(x, y):
                rx0 = min(rx0, x); rx1 = max(rx1, x)
                ry0 = min(ry0, y); ry1 = max(ry1, y)
    rawWH = (rx1 - rx0 + 1, ry1 - ry0 + 1)
    # width profile at height fractions measured from solid TOP
    prof = []
    for f in (0.10, 0.25, 0.40, 0.55, 0.70, 0.85, 0.95):
        y = y0 + int(H * f)
        xs = [x for x in range(S) if content(x, y)]
        prof.append((f, (xs[-1] - xs[0] + 1) if xs else 0))
    print(f'{label}: solid x[{x0}..{x1}] y[{y0}..{y1}]  W={W} H={H}  W/H={W/H:.3f}  raw W={rawWH[0]} H={rawWH[1]} W/H={rawWH[0]/rawWH[1]:.3f}')
    print('   width@f: ' + '  '.join(f'{f:.2f}:{w}' for f, w in prof))
    return (W, H, rawWH)

def main():
    path = sys.argv[1]
    minrun = 8
    for a in sys.argv[2:]:
        if a.startswith('--minrun='): minrun = int(a.split('=')[1])
    im = Image.open(path).convert('RGB')
    r = audit(im, 0, 'ref ', minrun)
    p = audit(im, 640, 'proc', minrun)
    if r and p:
        ar, ap = r[0] / r[1], p[0] / p[1]
        rr, rp = r[2][0] / r[2][1], p[2][0] / p[2][1]
        print(f'solid aspect drift: proc/ref = {ap/ar:.3f}  ({(ap/ar-1)*100:+.1f}% width-per-height)')
        print(f'raw   aspect drift: proc/ref = {rp/rr:.3f}  ({(rp/rr-1)*100:+.1f}% width-per-height)')

main()
