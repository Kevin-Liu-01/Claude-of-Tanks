#!/usr/bin/env python3
# TEMP (t72b3m shaded-parity r4, item 1 done-gate): vertical luminance
# gradient across the turret top in an elevation pair. For each half (ref
# x<640, proc x>=640) and each column of the given px window, anchor at the
# first non-bg pixel at/below ystart (skips the floating MG rod band), then
# record luminance at fixed depths below that local dome silhouette edge.
# Prints the median-over-columns luminance per depth row: a smooth curved
# shell reads as a monotone gradient; conical plates read as flat plateaus
# separated by jumps.
# Usage: python3 tools/tmp-domegrad.py <pair.png> <x0> <x1> <ystart> [rows]
import sys
from PIL import Image

BG = (0x15, 0x1B, 0x20)


def lum(r, g, b):
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def is_bg(r, g, b):
    return abs(r - BG[0]) < 10 and abs(g - BG[1]) < 10 and abs(b - BG[2]) < 10


def half(im, xoff, x0, x1, ystart, rows, label):
    px = im.load()
    cols = []
    tops = []
    for x in range(x0, x1 + 1):
        y0 = None
        for y in range(ystart, ystart + 80):
            if not is_bg(*px[xoff + x, y][:3]):
                y0 = y
                break
        if y0 is None:
            continue
        tops.append(y0)
        cols.append([lum(*px[xoff + x, y0 + k][:3]) for k in range(rows)])
    if not cols:
        print(f'{label}: EMPTY')
        return
    print(f'{label}: {len(cols)} cols, edge y {min(tops)}..{max(tops)}')
    meds = []
    for k in range(rows):
        vals = sorted(c[k] for c in cols)
        meds.append(vals[len(vals) // 2])
    line = ' '.join(f'{m:5.1f}' for m in meds)
    print(f'  L(k): {line}')
    # plateau detector: longest run of |dL| <= 0.6 on the smoothed profile
    steps = [meds[i + 1] - meds[i] for i in range(rows - 1)]
    runs, cur = [], 1
    for d in steps:
        if abs(d) <= 0.6:
            cur += 1
        else:
            runs.append(cur)
            cur = 1
    runs.append(cur)
    print(f'  span {meds[0]:.1f} -> {min(meds):.1f}/{max(meds):.1f}, maxflat {max(runs)} rows, steps>2L {sum(1 for d in steps if abs(d) > 2)}')


def main():
    im = Image.open(sys.argv[1]).convert('RGB')
    x0, x1, ystart = int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
    rows = int(sys.argv[5]) if len(sys.argv) > 5 else 18
    half(im, 0, x0, x1, ystart, rows, 'REF ')
    half(im, 640, x0, x1, ystart, rows, 'PROC')


main()
