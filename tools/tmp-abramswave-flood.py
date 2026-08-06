#!/usr/bin/env python3
# TEMP (independent critic, abrams wave 2026-08-05): §B2 flood check per the
# current §D law — a sky/void pixel must BOTH sit within maxch<=13 of the bg
# 0x151b20 AND carry the blue signature B-R >= +8 (revolution-r7 term; warm
# near-black shadow is NOT sky). Reports, per half of an official critic pair:
#   - total sky px inside the tank's bbox interior
#   - ENCLOSED sky regions (not connected to the outside border) + their rects
# Usage: tmp-abramswave-flood.py <pairpath> [minregion]
import sys
from PIL import Image

BG = (0x15, 0x1B, 0x20)
pair = sys.argv[1]
minreg = int(sys.argv[2]) if len(sys.argv) > 2 else 3
img = Image.open(pair).convert('RGB')
W, H = img.size
px = img.load()
half_w = W // 2

def is_sky(p):
    return (abs(p[0] - BG[0]) <= 13 and abs(p[1] - BG[1]) <= 13 and abs(p[2] - BG[2]) <= 13
            and (p[2] - p[0]) >= 8)

for name, xoff in (('REF ', 0), ('PROC', half_w)):
    sky = [[False] * half_w for _ in range(H)]
    for y in range(H):
        for x in range(half_w):
            sky[y][x] = is_sky(px[x + xoff, y])
    # flood from border: mark all border-connected sky as OUTSIDE
    outside = [[False] * half_w for _ in range(H)]
    stack = []
    for x in range(half_w):
        for y in (0, H - 1):
            if sky[y][x] and not outside[y][x]:
                outside[y][x] = True; stack.append((x, y))
    for y in range(H):
        for x in (0, half_w - 1):
            if sky[y][x] and not outside[y][x]:
                outside[y][x] = True; stack.append((x, y))
    while stack:
        x, y = stack.pop()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < half_w and 0 <= ny < H and sky[ny][nx] and not outside[ny][nx]:
                outside[ny][nx] = True; stack.append((nx, ny))
    # enclosed = sky and not outside; group into regions
    seen = [[False] * half_w for _ in range(H)]
    regions = []
    for y in range(H):
        for x in range(half_w):
            if sky[y][x] and not outside[y][x] and not seen[y][x]:
                # BFS region
                q = [(x, y)]; seen[y][x] = True
                x0 = x1 = x; y0 = y1 = y; n = 0
                while q:
                    cx, cy = q.pop()
                    n += 1
                    x0 = min(x0, cx); x1 = max(x1, cx); y0 = min(y0, cy); y1 = max(y1, cy)
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < half_w and 0 <= ny < H and sky[ny][nx] and not outside[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = True; q.append((nx, ny))
                if n >= minreg:
                    regions.append((n, x0, y0, x1, y1))
    regions.sort(reverse=True)
    tot = sum(r[0] for r in regions)
    print(f'{name} enclosed-sky px {tot} in {len(regions)} regions (>= {minreg} px)')
    for n, x0, y0, x1, y1 in regions[:8]:
        print(f'   {n:5d} px  rect x{x0}-{x1} y{y0}-{y1}')
