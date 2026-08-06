#!/usr/bin/env python3
"""TEMP (isu122s r7): row/column L601 profiles + bright-blob bbox in a window.
Usage:
  tmp-isu122s-prof.py row <png> y x0 x1        -> per-column L along a row band
  tmp-isu122s-prof.py col <png> x y0 y1        -> per-row L along a column band
  tmp-isu122s-prof.py blob <png> x0 y0 x1 y1 thr  -> bbox of pixels with L601>thr
"""
import sys
from PIL import Image

mode = sys.argv[1]
im = Image.open(sys.argv[2]).convert('RGB')
px = im.load()
L = lambda p: 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]
if mode == 'row':
    y, x0, x1 = (int(v) for v in sys.argv[3:6])
    vals = [(x, sum(L(px[x, yy]) for yy in range(y, y + 3)) / 3) for x in range(x0, x1)]
    print(' '.join(f'{x}:{v:.0f}' for x, v in vals))
elif mode == 'col':
    x, y0, y1 = (int(v) for v in sys.argv[3:6])
    vals = [(y, sum(L(px[xx, y]) for xx in range(x, x + 3)) / 3) for y in range(y0, y1)]
    print(' '.join(f'{y}:{v:.0f}' for y, v in vals))
else:
    x0, y0, x1, y1, thr = (int(v) for v in sys.argv[3:8])
    mnx, mny, mxx, mxy, n = 10**9, 10**9, -1, -1, 0
    for yy in range(y0, y1):
        for xx in range(x0, x1):
            if L(px[xx, yy]) > thr:
                n += 1
                mnx = min(mnx, xx); mxx = max(mxx, xx)
                mny = min(mny, yy); mxy = max(mxy, yy)
    if n:
        w, h = mxx - mnx + 1, mxy - mny + 1
        print(f'blob>{thr}: x {mnx}..{mxx} (w {w}) y {mny}..{mxy} (h {h}) n={n} aspect={h/w:.3f}')
    else:
        print('blob: EMPTY')
