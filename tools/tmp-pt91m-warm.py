#!/usr/bin/env python3
# TEMP (pt91m r25 critic): warm-hue census on official critic pairs —
# merkava3d r9 warm-material method (R > G + 3 and R > 55 over non-bg).
# usage: tmp-pt91m-warm.py <pair.png> <half> [x0 x1 y0 y1]
# Deleted after the round.
import sys
from PIL import Image

BG = (0x15, 0x1B, 0x20)


def is_bg(p):
    return abs(p[0] - BG[0]) < 12 and abs(p[1] - BG[1]) < 12 and abs(p[2] - BG[2]) < 12


path, half = sys.argv[1], sys.argv[2]
xoff = 0 if half == 'ref' else 640
im = Image.open(path).convert('RGB')
px = im.load()
if len(sys.argv) > 3:
    x0, x1, y0, y1 = (int(v) for v in sys.argv[3:7])
else:
    x0, x1, y0, y1 = 0, 640, 0, 640
warm = 0
lit = 0
cells = {}
for x in range(x0, x1):
    for y in range(y0, y1):
        p = px[xoff + x, y][:3]
        if is_bg(p):
            continue
        lit += 1
        if p[0] > p[1] + 3 and p[0] > 55:
            warm += 1
            key = (x // 32 * 32, y // 32 * 32)
            cells[key] = cells.get(key, 0) + 1
print(f'{half} warm census [{x0}..{x1}]x[{y0}..{y1}]: {warm} warm px of {lit} lit')
for k in sorted(cells, key=lambda k: -cells[k])[:12]:
    print(f'  cell ({k[0]},{k[1]}) {cells[k]}')
