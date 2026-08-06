#!/usr/bin/env python3
# TEMP (merkava r6): locate near-black zones on a pair half — 16x16 cells
# whose p25 luma < threshold, printed as a coarse map + cell list.
import sys
from PIL import Image

BG = (0x15, 0x1B, 0x20)
def is_bg(p):
    return abs(p[0] - BG[0]) < 12 and abs(p[1] - BG[1]) < 12 and abs(p[2] - BG[2]) < 12
def lum(p):
    return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]

path, half = sys.argv[1], sys.argv[2]
thr = float(sys.argv[3]) if len(sys.argv) > 3 else 40
xoff = 0 if half == 'ref' else 640
im = Image.open(path).convert('RGB')
px = im.load()
cells = []
for cy in range(2, 40):
    row = ''
    for cx in range(0, 40):
        vals = []
        for x in range(cx * 16, cx * 16 + 16):
            for y in range(cy * 16, cy * 16 + 16):
                p = px[xoff + x, y][:3]
                if not is_bg(p): vals.append(lum(p))
        if len(vals) < 40: row += '.'; continue
        vals.sort()
        p25 = vals[len(vals) // 4]
        if p25 < thr:
            row += '#'
            cells.append((cx * 16, cy * 16, round(p25, 1)))
        elif p25 < thr + 20: row += '+'
        else: row += ' '
    print(f'{cy*16:3d} {row}')
print('dark cells (x,y,p25):', cells[:40])
