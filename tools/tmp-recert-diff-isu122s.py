#!/usr/bin/env python3
# Pixel-diff containment renders vs graduation-baseline renders (proc pane).
# Maps exactly which regions the containment round changed on screen.
from PIL import Image, ImageChops
from collections import deque
import sys

BASE = '/private/tmp/claude-501/-Users-kevinliu-claude-of-tanks/d0226c73-49ae-490e-9a35-39379da35769/scratchpad/isu122s-head/shots/critic-isu122s'
CUR = 'shots/critic-isu122s'
OUT = 'shots/critic-isu122s/crops'

views = sys.argv[1:] or ['view-front', 'close-front', 'view-left', 'view-right',
                         'view-rear', 'view-top', 'hero-toptilt', 'hero-rearright',
                         'hero-frontleft', 'view-frontleft', 'view-frontright',
                         'view-rearleft', 'view-rearright', 'close-roof']
THR = 8  # per-channel diff threshold
for v in views:
    a = Image.open(f'{BASE}/{v}.png').convert('RGB')
    b = Image.open(f'{CUR}/{v}.png').convert('RGB')
    d = ImageChops.difference(a, b)
    px = d.load()
    W, H = d.size
    x0 = 640
    pts = []
    for j in range(H):
        for i in range(x0, W):
            r, g, bb = px[i, j]
            if max(r, g, bb) > THR:
                pts.append((i, j))
    # cluster via grid buckets (cheap): merge points within 6px
    ptset = set(pts)
    seen = set()
    clusters = []
    for p in pts:
        if p in seen: continue
        q = deque([p]); seen.add(p)
        n = 0; bx0, by0, bx1, by1 = p[0], p[1], p[0], p[1]
        while q:
            x, y = q.popleft(); n += 1
            bx0 = min(bx0, x); bx1 = max(bx1, x)
            by0 = min(by0, y); by1 = max(by1, y)
            for dx in range(-3, 4):
                for dy in range(-3, 4):
                    pp = (x + dx, y + dy)
                    if pp in ptset and pp not in seen:
                        seen.add(pp); q.append(pp)
        clusters.append((n, bx0, by0, bx1, by1))
    clusters.sort(reverse=True)
    print(f'{v}: diff px {len(pts)}, clusters {len(clusters)}')
    for n, a0, b0, a1, b1 in clusters[:10]:
        print(f'   {n:6d}px bbox px({a0},{b0})-({a1},{b1})')
