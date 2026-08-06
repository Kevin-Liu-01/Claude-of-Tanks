#!/usr/bin/env python3
# TEMP (merkava3d r13): decompose the close-roof sub-60 census into connected
# clusters (bbox + mean luma + count) so each ink pool can be raycast to its
# owning mesh via tmp-merk-pixprobe. PROC half by default (xo=640); --ref for
# the ref half. Usage: python3 tools/tmp-merk-r13-census.py [--thr=60] [--ref]
import sys
from collections import deque
from PIL import Image

D = 'shots/critic-merkava3d'
BG = (0x15, 0x1B, 0x20)
thr = 60
xo = 640
view = 'close-roof'
y0w, y1w = 240, 640
for a in sys.argv[1:]:
    if a.startswith('--thr='):
        thr = float(a[6:])
    elif a == '--ref':
        xo = 0
    elif a.startswith('--view='):
        view = a[7:]
    elif a.startswith('--ywin='):
        y0w, y1w = [int(v) for v in a[7:].split(',')]


def isbg(p):
    return abs(p[0] - BG[0]) <= 13 and abs(p[1] - BG[1]) <= 13 and abs(p[2] - BG[2]) <= 13


def lum(p):
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]


im = Image.open(f'{D}/{view}.png').convert('RGB')
px = im.load()
W, H = 640, 640
mask = [[False] * H for _ in range(W)]
tot = 0
for x in range(W):
    for y in range(y0w, y1w):
        p = px[xo + x, y][:3]
        if not isbg(p) and lum(p) < thr:
            mask[x][y] = True
            tot += 1
print(f'total sub-{thr} ({"ref" if xo == 0 else "proc"}) y{y0w}..{y1w}: {tot}')

seen = [[False] * H for _ in range(W)]
clusters = []
for x in range(W):
    for y in range(y0w, y1w):
        if not mask[x][y] or seen[x][y]:
            continue
        q = deque([(x, y)])
        seen[x][y] = True
        n = 0
        sx0, sx1, sy0, sy1 = x, x, y, y
        sl = 0.0
        while q:
            cx, cy = q.popleft()
            n += 1
            sl += lum(px[xo + cx, cy][:3])
            sx0 = min(sx0, cx); sx1 = max(sx1, cx)
            sy0 = min(sy0, cy); sy1 = max(sy1, cy)
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
                nx, ny = cx + dx, cy + dy
                if 0 <= nx < W and y0w <= ny < y1w and mask[nx][ny] and not seen[nx][ny]:
                    seen[nx][ny] = True
                    q.append((nx, ny))
        clusters.append((n, sx0, sx1, sy0, sy1, sl / n))
clusters.sort(reverse=True)
print(f'clusters: {len(clusters)}; top 40 by px count:')
for n, cx0, cx1, cy0, cy1, ml in clusters[:40]:
    cx = (cx0 + cx1) // 2
    cy = (cy0 + cy1) // 2
    print(f'  n={n:5d} bbox x{cx0}..{cx1} y{cy0}..{cy1} center=({cx},{cy}) meanL={ml:.1f}')
