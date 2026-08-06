#!/usr/bin/env python3
# TEMP (merkava 3d/1b r6): pair-half scanners.
#  cols mode: per-column first-content ytop/len/lum + second-content ytop —
#    decodes silhouette lines + floating rods on a critic pair half.
#  rect mode: luma stats (p5/p25/med/p75/p95/mean) of a rect on a half.
#  row mode: per-row first-content xleft/len/lum from the left (or right).
# Usage:
#   python3 tools/tmp-r6-scan.py cols <pair.png> <half> <x0> <x1> [ymin ymax] [--step=2]
#   python3 tools/tmp-r6-scan.py rect <pair.png> <half> <x0> <x1> <y0> <y1>
import sys
from PIL import Image

BG = (0x15, 0x1B, 0x20)
def is_bg(p):
    return abs(p[0] - BG[0]) < 12 and abs(p[1] - BG[1]) < 12 and abs(p[2] - BG[2]) < 12
def lum(p):
    return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]

def main():
    mode, path, half = sys.argv[1], sys.argv[2], sys.argv[3]
    xoff = 0 if half == 'ref' else 640
    im = Image.open(path).convert('RGB')
    px = im.load()
    args = [a for a in sys.argv[4:] if not a.startswith('--')]
    step = 2
    for a in sys.argv[4:]:
        if a.startswith('--step='): step = int(a.split('=')[1])
    if mode == 'cols':
        x0, x1 = int(args[0]), int(args[1])
        ymin = int(args[2]) if len(args) > 2 else 34
        ymax = int(args[3]) if len(args) > 3 else 640
        for x in range(x0, x1, step):
            y = ymin
            while y < ymax and is_bg(px[xoff + x, y][:3]): y += 1
            if y >= ymax:
                print(f'x {x:3d}: empty'); continue
            y0 = y; lums = []
            while y < ymax and not is_bg(px[xoff + x, y][:3]):
                lums.append(lum(px[xoff + x, y][:3])); y += 1
            blk = y - y0
            g = 0
            while y < ymax and is_bg(px[xoff + x, y][:3]): g += 1; y += 1
            y2 = y if y < ymax else -1
            lums.sort()
            print(f'x {x:3d}: top {y0:3d} h {blk:3d} lum {lums[len(lums)//2]:5.1f}  gap {g:3d}  next {y2:3d}')
    elif mode == 'rect':
        x0, x1, y0, y1 = (int(v) for v in args[:4])
        vals = []
        for x in range(x0, x1):
            for y in range(y0, y1):
                p = px[xoff + x, y][:3]
                if not is_bg(p): vals.append(lum(p))
        if not vals:
            print('rect: all bg'); return
        vals.sort()
        n = len(vals)
        q = lambda f: vals[min(n - 1, int(n * f))]
        print(f'rect [{x0}..{x1}]x[{y0}..{y1}] n={n} ({100*n/((x1-x0)*(y1-y0)):.0f}% lit): '
              f'p5 {q(0.05):.1f}  p25 {q(0.25):.1f}  med {q(0.5):.1f}  p75 {q(0.75):.1f}  p95 {q(0.95):.1f}  mean {sum(vals)/n:.1f}')

main()
