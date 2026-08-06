#!/usr/bin/env python3
"""TEMP (isu122s r7): ITU-601 ON-ELEMENT rect stats — the r7 measurement law.
Usage: tmp-isu122s-rect.py <png> x0,y0,x1,y1 label [x0,y0,x1,y1 label ...]
Prints n, mean RGB, L(601), p25/p50/p75, dark-dot% (L < mean-18), warm%.
Background pixels (the harness ~#151a22 field) are excluded.
"""
import sys
from PIL import Image

src = sys.argv[1]
im = Image.open(src).convert('RGB')
px = im.load()
args = sys.argv[2:]
for i in range(0, len(args), 2):
    x0, y0, x1, y1 = (int(v) for v in args[i].split(','))
    label = args[i + 1] if i + 1 < len(args) else args[i]
    Ls, rs, gs, bs, warm = [], 0, 0, 0, 0
    for yy in range(y0, y1):
        for xx in range(x0, x1):
            R, G, B = px[xx, yy]
            if abs(R - 21) < 11 and abs(G - 27) < 11 and abs(B - 32) < 11:
                continue  # harness background
            L = 0.299 * R + 0.587 * G + 0.114 * B
            Ls.append(L); rs += R; gs += G; bs += B
            if R > G + 4:
                warm += 1
    if not Ls:
        print(f'{label}: EMPTY')
        continue
    Ls.sort()
    n = len(Ls)
    mean = sum(Ls) / n
    p = lambda q: Ls[min(n - 1, int(q * n))]
    dark = sum(1 for v in Ls if v < mean - 18)
    print(f'{label} [{x0},{y0}-{x1},{y1}]: n={n} rgb=({rs/n:.1f},{gs/n:.1f},{bs/n:.1f}) '
          f'L601={mean:.1f} p25/50/75={p(.25):.1f}/{p(.5):.1f}/{p(.75):.1f} '
          f'spread={p(.75)-p(.25):.1f} dark%={100*dark/n:.1f} warm%={100*warm/n:.1f}')
