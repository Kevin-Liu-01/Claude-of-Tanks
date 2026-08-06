#!/usr/bin/env python3
# TEMP (merkava 3d/1b r5, pintle-gun allowance round): FREE-SKY gun scanner.
# MASK METHOD for the done-gate: per column of a critic-pair half, walk from
# the top; record the FIRST content block [y0..y1] (non-bg), its median luma,
# then count the SKY pixels (bg) below it before the next content pixel.
# A column is a "floating gun" column when skyGap >= --gap (default 4) and
# the block is thin (<= --maxh). Contiguous columns merge into runs; each
# run reports width, ytop, median block luma (the polarity/luma class) and
# the median sky gap. Usage:
#   python3 tools/tmp-freesky.py <pair.png> [x0 x1 ymin ymax] [--gap=4]
#     [--maxh=14] [--half=ref|proc|both]
import sys
from PIL import Image

BG = (0x15, 0x1B, 0x20)


def lum(r, g, b):
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def is_bg(r, g, b):
    return abs(r - BG[0]) < 12 and abs(g - BG[1]) < 12 and abs(b - BG[2]) < 12


def measure_half(im, xoff, x0, x1, ymin, ymax, gap_min, max_h, label):
    px = im.load()
    cols = {}
    for x in range(x0, x1):
        y = ymin
        # find first content pixel
        y0 = None
        while y < ymax:
            if not is_bg(*px[xoff + x, y][:3]):
                y0 = y
                break
            y += 1
        if y0 is None:
            continue
        # walk the content block
        y1 = y0
        lums = []
        while y1 < ymax and not is_bg(*px[xoff + x, y1][:3]):
            lums.append(lum(*px[xoff + x, y1][:3]))
            y1 += 1
        blk_h = y1 - y0
        # count sky below the block
        gap = 0
        yy = y1
        while yy < ymax and is_bg(*px[xoff + x, yy][:3]):
            gap += 1
            yy += 1
        if gap >= gap_min and blk_h <= max_h:
            lums.sort()
            cols[x] = (y0, blk_h, lums[len(lums) // 2], gap)
    runs = []
    xs = sorted(cols)
    i = 0
    while i < len(xs):
        j = i
        while j + 1 < len(xs) and xs[j + 1] - xs[j] <= 4:
            j += 1
        w = xs[j] - xs[i] + 1
        if w >= 4:
            seg = [cols[x] for x in xs[i:j + 1]]
            med = lambda k: sorted(s[k] for s in seg)[len(seg) // 2]
            runs.append((xs[i], xs[j], w, med(0), med(1), med(2), med(3)))
        i = j + 1
    print(f'{label}: {len(runs)} floating run(s)')
    for r in runs:
        print(f'  x {r[0]:3d}..{r[1]:3d}  w={r[2]:3d}px  ytop~{r[3]:3d}  blockH~{r[4]}px  lum~{r[5]:.0f}  skyGap~{r[6]}px')
    return runs


def main():
    im = Image.open(sys.argv[1]).convert('RGB')
    args = [a for a in sys.argv[2:] if not a.startswith('--')]
    gap_min, max_h, half = 4, 14, 'both'
    for a in sys.argv[2:]:
        if a.startswith('--gap='):
            gap_min = int(a.split('=')[1])
        if a.startswith('--maxh='):
            max_h = int(a.split('=')[1])
        if a.startswith('--half='):
            half = a.split('=')[1]
    if len(args) >= 4:
        x0, x1, ymin, ymax = (int(v) for v in args[:4])
    else:
        x0, x1, ymin, ymax = 0, 640, 100, 340
    if half in ('ref', 'both'):
        measure_half(im, 0, x0, x1, ymin, ymax, gap_min, max_h, 'REF ')
    if half in ('proc', 'both'):
        measure_half(im, 640, x0, x1, ymin, ymax, gap_min, max_h, 'PROC')


main()
