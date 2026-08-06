#!/usr/bin/env python3
# TEMP (merkava 3B/3C shaded-parity r7): measure MG-rod reads the critic's way
# — contiguous dark runs ABOVE the pale roofline in an elevation render.
# For each half of a critic pair (ref x<640, proc x>=640): per column find the
# topmost PALE pixel (the roofline), then dark non-bg pixels ABOVE it that are
# either sky-separated from the roofline (floating rod line) or a >=2 px dark
# stack; report contiguous column runs (width >= min_w) with their ytop.
# Calibrated on the 3B ref right pair: rod line reads lum 41-73 at y 266-276
# floating over the pale 88-104 roofline.
# Usage: python3 tools/tmp-mgrod-measure.py <pair.png> [x0 x1 ymin ymax] [--minw=N]
import sys
from PIL import Image

BG = (0x15, 0x1B, 0x20)
PALE_L = 78      # lit sand reads 88-110; roofline = first >= this
DARK_L = 75      # rod/receiver gunmetal reads 41-75 vs pale 88+
GAP = 5          # column-gap allowance when merging runs (posts/AA breaks)


def lum(r, g, b):
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def is_bg(r, g, b):
    return abs(r - BG[0]) < 12 and abs(g - BG[1]) < 12 and abs(b - BG[2]) < 12


def measure_half(im, xoff, x0, x1, ymin, ymax, minw, label):
    px = im.load()
    cols = {}
    for x in range(x0, x1):
        yp = None
        for y in range(ymin, ymax):
            r, g, b = px[xoff + x, y][:3]
            if not is_bg(r, g, b) and lum(r, g, b) >= PALE_L:
                yp = y
                break
        if yp is None:
            continue
        dark = []
        for y in range(ymin, yp):
            r, g, b = px[xoff + x, y][:3]
            if not is_bg(r, g, b) and lum(r, g, b) <= DARK_L:
                dark.append(y)
        if not dark:
            continue
        # rod criterion: the dark pixel FLOATS — at least one sky (bg) pixel
        # between it and the pale roofline below (dark sitting directly on
        # pale is roof furniture / AA edge, not a rod silhouette)
        ok = []
        for y in dark:
            gap = any(is_bg(*px[xoff + x, yy][:3]) for yy in range(y + 1, yp))
            if gap:
                ok.append(y)
        if ok:
            cols[x] = (min(ok), len(ok))
    runs = []
    xs = sorted(cols)
    i = 0
    while i < len(xs):
        j = i
        while j + 1 < len(xs) and xs[j + 1] - xs[j] <= GAP:
            j += 1
        w = xs[j] - xs[i] + 1
        if w >= minw:
            tops = sorted(cols[x][0] for x in xs[i:j + 1])
            hs = sorted(cols[x][1] for x in xs[i:j + 1])
            runs.append((xs[i], xs[j], w, tops[len(tops) // 2], hs[len(hs) // 2]))
        i = j + 1
    print(f'{label}: {len(runs)} run(s)')
    for r in runs:
        print(f'  x {r[0]:3d}..{r[1]:3d}  w={r[2]:3d}px  ytop~{r[3]:3d}  darkH~{r[4]}px')
    return runs


def main():
    im = Image.open(sys.argv[1]).convert('RGB')
    args = [a for a in sys.argv[2:] if not a.startswith('--')]
    minw = 6
    for a in sys.argv[2:]:
        if a.startswith('--minw='):
            minw = int(a.split('=')[1])
    if len(args) >= 4:
        x0, x1, ymin, ymax = (int(v) for v in args[:4])
    else:
        x0, x1, ymin, ymax = 0, 640, 60, 330
    measure_half(im, 0, x0, x1, ymin, ymax, minw, 'REF ')
    measure_half(im, 640, x0, x1, ymin, ymax, minw, 'PROC')


main()
