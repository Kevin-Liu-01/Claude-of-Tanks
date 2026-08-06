#!/usr/bin/env python3
# TEMP (merkava r11): warm-pixel census + cluster dump (critic defect A method)
# warm := R > G+3 and R > 55 (non-bg). Modes:
#   census <pair> <half> [x0 x1 y0 y1]     warm count in rect (default whole half)
#   clusters <pair> <half> [x0 x1 y0 y1]   warm pixel grid-cluster summary (16px cells)
#   at <pair> <half> x y                   RGB at pixel
import sys
from PIL import Image

BG = (0x15, 0x1B, 0x20)


def is_bg(p):
    return abs(p[0] - BG[0]) < 12 and abs(p[1] - BG[1]) < 12 and abs(p[2] - BG[2]) < 12


def main():
    mode, path, half = sys.argv[1], sys.argv[2], sys.argv[3]
    xoff = 0 if half == 'ref' else 640
    im = Image.open(path).convert('RGB')
    px = im.load()
    W, H = im.size
    args = [int(a) for a in sys.argv[4:]]
    x0, x1, y0, y1 = (args + [0, 640, 0, H])[:4] if len(args) >= 4 else (0, 640, 0, H)

    if mode == 'at':
        x, y = args[0], args[1]
        print(px[xoff + x, y])
        return

    warm = []
    for x in range(x0, min(x1, 640)):
        for y in range(y0, min(y1, H)):
            p = px[xoff + x, y][:3]
            if is_bg(p):
                continue
            if y < 30 and x < 200:
                continue  # label text
            if p[0] > p[1] + 3 and p[0] > 55:
                warm.append((x, y, p))

    if mode == 'census':
        print(f'{half} warm census [{x0}..{x1}]x[{y0}..{y1}]: {len(warm)}')
        return

    if mode == 'clusters':
        cells = {}
        for (x, y, p) in warm:
            key = (x // 16, y // 16)
            cells.setdefault(key, []).append((x, y, p))
        rows = sorted(cells.items(), key=lambda kv: -len(kv[1]))
        print(f'{half} warm total {len(warm)}; top cells (16px):')
        for (cx, cy), pts in rows[:24]:
            rs = sum(p[2][0] for p in pts) / len(pts)
            gs = sum(p[2][1] for p in pts) / len(pts)
            bs = sum(p[2][2] for p in pts) / len(pts)
            print(f'  cell x{cx*16}-{cx*16+15} y{cy*16}-{cy*16+15}: n={len(pts)} meanRGB ({rs:.0f},{gs:.0f},{bs:.0f})')


main()
