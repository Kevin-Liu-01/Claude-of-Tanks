#!/usr/bin/env python3
# Enclosed-background scan (mask method, BUILD-STANDARD SD): bg = |px-0x151b20|
# maxch <= 13. Flood-fill bg from pane borders; any bg not reached is ENCLOSED
# (potential see-through void inside the silhouette). Scans the PROC pane
# (x 640..1280) of each critic view. Reports clusters with bboxes.
import sys
from collections import deque
from PIL import Image

BG = (0x15, 0x1b, 0x20)
TOL = 13

def scan(path, x0=640, x1=1280, y0=0, y1=640):
    im = Image.open(path).convert('RGB')
    W, H = im.size
    x1 = min(x1, W); y1 = min(y1, H)
    px = im.load()
    w, h = x1 - x0, y1 - y0
    isbg = [[False] * w for _ in range(h)]
    for j in range(h):
        for i in range(w):
            r, g, b = px[x0 + i, y0 + j]
            if abs(r - BG[0]) <= TOL and abs(g - BG[1]) <= TOL and abs(b - BG[2]) <= TOL:
                isbg[j][i] = True
    seen = [[False] * w for _ in range(h)]
    dq = deque()
    for i in range(w):
        for j in (0, h - 1):
            if isbg[j][i] and not seen[j][i]:
                seen[j][i] = True; dq.append((i, j))
    for j in range(h):
        for i in (0, w - 1):
            if isbg[j][i] and not seen[j][i]:
                seen[j][i] = True; dq.append((i, j))
    while dq:
        i, j = dq.popleft()
        for di, dj in ((1,0),(-1,0),(0,1),(0,-1)):
            ii, jj = i + di, j + dj
            if 0 <= ii < w and 0 <= jj < h and isbg[jj][ii] and not seen[jj][ii]:
                seen[jj][ii] = True; dq.append((ii, jj))
    # enclosed clusters
    clusters = []
    cseen = [[False] * w for _ in range(h)]
    for j in range(h):
        for i in range(w):
            if isbg[j][i] and not seen[j][i] and not cseen[j][i]:
                q = deque([(i, j)]); cseen[j][i] = True
                n = 0; bx0, by0, bx1, by1 = i, j, i, j
                while q:
                    a, b = q.popleft(); n += 1
                    bx0 = min(bx0, a); bx1 = max(bx1, a)
                    by0 = min(by0, b); by1 = max(by1, b)
                    for di, dj in ((1,0),(-1,0),(0,1),(0,-1)):
                        aa, bb = a + di, b + dj
                        if 0 <= aa < w and 0 <= bb < h and isbg[bb][aa] and not seen[bb][aa] and not cseen[bb][aa]:
                            cseen[bb][aa] = True; q.append((aa, bb))
                clusters.append((n, x0 + bx0, y0 + by0, x0 + bx1, y0 + by1))
    return clusters

views = sys.argv[1:] or ['view-front', 'close-front', 'view-left', 'view-right',
                         'view-rear', 'view-top', 'hero-toptilt', 'hero-rearright',
                         'hero-frontleft', 'view-frontleft', 'view-frontright',
                         'view-rearleft', 'view-rearright', 'close-roof']
for v in views:
    cl = scan(f'shots/critic-isu122s/{v}.png')
    cl.sort(reverse=True)
    tot = sum(c[0] for c in cl)
    print(f'{v}: enclosed-bg px total {tot}, clusters {len(cl)}')
    for n, a, b, c, d in cl[:8]:
        print(f'   {n:5d}px  bbox px({a},{b})-({c},{d})')
