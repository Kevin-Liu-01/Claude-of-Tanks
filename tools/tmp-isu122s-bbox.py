#!/usr/bin/env python3
"""TEMP (isu122s r7): non-background bbox of the REF (left half) and PROC
(right half) panes of a critic pair, plus optional sub-window bbox.
Usage: tmp-isu122s-bbox.py <png> [x0 y0 x1 y1]
"""
import sys
from PIL import Image

im = Image.open(sys.argv[1]).convert('RGB')
px = im.load()
W, H = im.size
if len(sys.argv) > 5:
    wins = [('win', *(int(v) for v in sys.argv[2:6]))]
else:
    wins = [('REF', 0, 40, W // 2, H), ('PROC', W // 2, 40, W, H)]
for name, x0, y0, x1, y1 in wins:
    mnx, mny, mxx, mxy, n = 10**9, 10**9, -1, -1, 0
    for yy in range(y0, y1):
        for xx in range(x0, x1):
            R, G, B = px[xx, yy]
            if abs(R - 21) < 11 and abs(G - 27) < 11 and abs(B - 32) < 11:
                continue
            n += 1
            mnx = min(mnx, xx); mxx = max(mxx, xx)
            mny = min(mny, yy); mxy = max(mxy, yy)
    if n == 0:
        print(f'{name}: EMPTY'); continue
    print(f'{name}: x {mnx}..{mxx} (w {mxx-mnx+1})  y {mny}..{mxy} (h {mxy-mny+1})  n={n} aspect={(mxy-mny+1)/(mxx-mnx+1):.3f}')
