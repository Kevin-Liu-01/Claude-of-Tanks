#!/usr/bin/env python3
# TEMP (merkava 3B/3C shaded-parity r5): pixel-sample rects on the critic
# pair PNGs (ref half x<640, proc half x>=640). Unlike tmp-leo-bandsample.py
# this keeps DEEP-SHADOW pixels (the items under test are the dark track
# run / rear-corner stacks; only the board background is filtered) and
# reports the mean/median luminance the work order quotes.
# Usage: python3 tools/tmp-merkava-tonesample.py <pair.png> <label> x0 y0 x1 y1 [...]
import sys
from PIL import Image

BG = (0x15, 0x1B, 0x20)


def lum(r, g, b):
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def sample(im, x0, y0, x1, y1):
    px = im.load()
    keep = []
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b = px[x, y][:3]
            if abs(r - BG[0]) < 10 and abs(g - BG[1]) < 10 and abs(b - BG[2]) < 10:
                continue
            keep.append((r, g, b))
    if not keep:
        return None
    n = len(keep)
    ls = sorted(lum(*p) for p in keep)
    med = ls[n // 2]
    mean = sum(ls) / n
    mr = sorted(p[0] for p in keep)[n // 2]
    mg = sorted(p[1] for p in keep)[n // 2]
    mb = sorted(p[2] for p in keep)[n // 2]
    pcts = tuple(ls[min(n - 1, int(n * q))] for q in (0.05, 0.25, 0.50, 0.75, 0.95))
    return n, med, mean, (mr, mg, mb), pcts


def main():
    im = Image.open(sys.argv[1]).convert('RGB')
    args = sys.argv[2:]
    while args:
        label, x0, y0, x1, y1 = args[0], *(int(v) for v in args[1:5])
        args = args[5:]
        s = sample(im, x0, y0, x1, y1)
        if s is None:
            print(f'{label:22s} EMPTY')
            continue
        n, med, mean, med_rgb, pcts = s
        print(f'{label:22s} n={n:6d} lum(med)={med:5.1f} lum(mean)={mean:5.1f} medRGB=({med_rgb[0]:3d},{med_rgb[1]:3d},{med_rgb[2]:3d}) p5/25/50/75/95={pcts[0]:.0f}/{pcts[1]:.0f}/{pcts[2]:.0f}/{pcts[3]:.0f}/{pcts[4]:.0f}')


main()
