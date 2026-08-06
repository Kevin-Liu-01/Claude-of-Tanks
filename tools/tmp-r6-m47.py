#!/usr/bin/env python3
# TEMP (m47 r6, GROUP-N round): hue/tone scanners over the OFFICIAL critic
# pairs (1280x720 halves: ref x 0..639, proc x 640..1279). Extends the banked
# tmp-r7-merkava.py family with the r4 verdict's N-driver measurements:
#   rg    <pair> <half> x0 x1 y0 y1     mean-RGB r/g ratio + L601 stats of
#                                        non-bg pixels (N1 hue-split window)
#   flat  <pair> <half> x0 x1 y0 y1 [--cell=14]  per-cell mean/sd map -> counts
#                                        cells with sd<3 (flat-disc detector)
#   wedge <pair> <half> x0 x1 y0 y1 <thr>  largest 4-connected sub-thr blob
#                                        (N4 done-gate: no wedge > 40 px)
# BG + luma per the mask-method law; blue-signature guard for any sky claim.
import sys
from PIL import Image

BG = (0x15, 0x1B, 0x20)


def is_bg(p):
    return abs(p[0] - BG[0]) < 12 and abs(p[1] - BG[1]) < 12 and abs(p[2] - BG[2]) < 12


def lum(p):
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]


def main():
    mode, path, half = sys.argv[1], sys.argv[2], sys.argv[3]
    xoff = 0 if half == 'ref' else 640
    im = Image.open(path).convert('RGB')
    px = im.load()
    args = [a for a in sys.argv[4:] if not a.startswith('--')]
    opts = {}
    for a in sys.argv[4:]:
        if a.startswith('--'):
            k, _, v = a[2:].partition('=')
            opts[k] = int(v) if v else 1

    if mode == 'rg':
        x0, x1, y0, y1 = (int(v) for v in args[:4])
        sr = sg = sb = n = 0
        vals = []
        for x in range(x0, x1):
            for y in range(y0, y1):
                p = px[xoff + x, y][:3]
                if is_bg(p):
                    continue
                sr += p[0]; sg += p[1]; sb += p[2]; n += 1
                vals.append(lum(p))
        vals.sort()
        m = len(vals)
        q = lambda f: vals[min(m - 1, int(m * f))]
        mean = sum(vals) / m
        sd = (sum((v - mean) ** 2 for v in vals) / m) ** 0.5
        print(f'{half} rg [{x0}..{x1}]x[{y0}..{y1}] n={n} meanRGB ({sr/n:.1f},{sg/n:.1f},{sb/n:.1f}) '
              f'r/g {sr/max(sg,1):.3f} | p5 {q(0.05):.1f} med {q(0.5):.1f} p75 {q(0.75):.1f} '
              f'p95 {q(0.95):.1f} sd {sd:.2f} sub30 {sum(1 for v in vals if v < 30)}')

    elif mode == 'flat':
        x0, x1, y0, y1 = (int(v) for v in args[:4])
        c = opts.get('cell', 14)
        flat = 0
        tot = 0
        worst = []
        for cx in range(x0, x1 - c, c):
            for cy in range(y0, y1 - c, c):
                vals = []
                for x in range(cx, cx + c):
                    for y in range(cy, cy + c):
                        p = px[xoff + x, y][:3]
                        if is_bg(p):
                            continue
                        vals.append(lum(p))
                if len(vals) < c * c * 0.9:
                    continue
                tot += 1
                mean = sum(vals) / len(vals)
                sd = (sum((v - mean) ** 2 for v in vals) / len(vals)) ** 0.5
                if sd < 3.0 and mean > 55:
                    flat += 1
                    worst.append((cx, cy, round(mean, 1), round(sd, 2)))
        print(f'{half} flat [{x0}..{x1}]x[{y0}..{y1}] cell={c}: {flat}/{tot} pale-flat cells (sd<3, mean>55)')
        for w in worst[:8]:
            print('   ', w)

    elif mode == 'wedge':
        x0, x1, y0, y1 = (int(v) for v in args[:4])
        thr = float(args[4])
        w, h = x1 - x0, y1 - y0
        dark = [[False] * w for _ in range(h)]
        for x in range(x0, x1):
            for y in range(y0, y1):
                p = px[xoff + x, y][:3]
                if not is_bg(p) and lum(p) < thr:
                    dark[y - y0][x - x0] = True
        seen = [[False] * w for _ in range(h)]
        best = 0
        bestat = None
        for yy in range(h):
            for xx in range(w):
                if not dark[yy][xx] or seen[yy][xx]:
                    continue
                stack = [(xx, yy)]
                seen[yy][xx] = True
                size = 0
                while stack:
                    ax, ay = stack.pop()
                    size += 1
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        bx, by = ax + dx, ay + dy
                        if 0 <= bx < w and 0 <= by < h and dark[by][bx] and not seen[by][bx]:
                            seen[by][bx] = True
                            stack.append((bx, by))
                if size > best:
                    best = size
                    bestat = (x0 + xx, y0 + yy)
        print(f'{half} wedge [{x0}..{x1}]x[{y0}..{y1}] thr<{thr}: largest blob {best} px at {bestat}')


if __name__ == '__main__':
    main()
