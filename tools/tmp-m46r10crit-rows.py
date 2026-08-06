#!/usr/bin/env python3
# TEMP (m46_patton r10 graduation critic): per-row ITU-601 profile over an
# x-window of one pair half — locates deck-slat crest rows and measures
# row-for-row luma parity (the r10 R5 done-gate class). Also row-SD mode
# (C4 slat-rhythm presence) and a paired-summary mode.
# Halves: ref = x 0..639, proc = x 640..1279.
# Modes:
#   rows <pair> <half> x0 x1 y0 y1 [--minpx=8]   per-row n/med/p75/max table
#   crest <pair> x0 x1 y0 y1 [--minpx=8]         both halves: rows sorted by
#                                                 p75 (top 12) for crest match
#   rowsd <pair> <half> x0 x1 y0 y1              SD of row means (rhythm)
import sys
from PIL import Image

BG = (0x15, 0x1B, 0x20)


def is_bg(p):
    return abs(p[0] - BG[0]) < 12 and abs(p[1] - BG[1]) < 12 and abs(p[2] - BG[2]) < 12


def lum(p):
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]


def pct(vals, q):
    if not vals:
        return None
    s = sorted(vals)
    i = min(len(s) - 1, max(0, int(round(q * (len(s) - 1)))))
    return s[i]


def row_stats(px, xoff, x0, x1, y, minpx):
    vals = []
    for x in range(x0, x1):
        p = px[xoff + x, y][:3]
        if is_bg(p):
            continue
        vals.append(lum(p))
    if len(vals) < minpx:
        return None
    med = pct(vals, 0.5)
    p75 = pct(vals, 0.75)
    return (len(vals), med, p75, max(vals))


def main():
    mode = sys.argv[1]
    path = sys.argv[2]
    im = Image.open(path).convert('RGB')
    px = im.load()
    args = [a for a in sys.argv[3:] if not a.startswith('--')]
    minpx = 8
    for a in sys.argv:
        if a.startswith('--minpx='):
            minpx = int(a.split('=')[1])

    if mode == 'rows':
        half = args[0]
        xoff = 0 if half == 'ref' else 640
        x0, x1, y0, y1 = (int(v) for v in args[1:5])
        for y in range(y0, y1):
            st = row_stats(px, xoff, x0, x1, y, minpx)
            if st:
                print(f'{half} y={y}: n={st[0]} med={st[1]:.1f} p75={st[2]:.1f} max={st[3]:.1f}')
    elif mode == 'crest':
        x0, x1, y0, y1 = (int(v) for v in args[:4])
        for half, xoff in (('ref', 0), ('proc', 640)):
            rows = []
            for y in range(y0, y1):
                st = row_stats(px, xoff, x0, x1, y, minpx)
                if st:
                    rows.append((st[2], y, st[1], st[3]))
            rows.sort(reverse=True)
            tops = ' '.join(f'y{y}:p75 {p75:.0f}(med {med:.0f},max {mx:.0f})' for p75, y, med, mx in rows[:12])
            print(f'{half} top-p75 rows: {tops}')
    elif mode == 'rowsd':
        half = args[0]
        xoff = 0 if half == 'ref' else 640
        x0, x1, y0, y1 = (int(v) for v in args[1:5])
        means = []
        for y in range(y0, y1):
            vals = []
            for x in range(x0, x1):
                p = px[xoff + x, y][:3]
                if is_bg(p):
                    continue
                vals.append(lum(p))
            if len(vals) >= minpx:
                means.append(sum(vals) / len(vals))
        if not means:
            print(f'{half} rowsd: EMPTY')
            return
        m = sum(means) / len(means)
        sd = (sum((v - m) ** 2 for v in means) / len(means)) ** 0.5
        print(f'{half} rowsd [{x0}..{x1}]x[{y0}..{y1}]: rows={len(means)} mean={m:.1f} rowSD={sd:.2f}')


main()
