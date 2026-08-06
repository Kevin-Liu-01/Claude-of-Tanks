#!/usr/bin/env python3
# leo2a5 r9 — bright-pixel locator: clusters of luma>=THR pixels in a window,
# reported as rects (half coords) so they can be mapped to world members.
import numpy as np
from PIL import Image
import sys

SHOTS = '/Users/kevinliu/claude-of-tanks/shots/critic-leo2a5'
BG = np.array([0x15, 0x1b, 0x20], dtype=np.int16)

def halves(view):
    a = np.asarray(Image.open(f'{SHOTS}/{view}.png').convert('RGB'), dtype=np.int16)
    return a[:, :640], a[:, 640:1280]

def luma(rgb):
    return 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]

def mask_air(rgb):
    d = np.abs(rgb - BG).max(axis=-1) <= 13
    blue = (rgb[..., 2] - rgb[..., 0]) >= 8
    return d & blue

def clusters(tag, rgb, x0, x1, y0, y1, thr):
    L = luma(rgb); air = mask_air(rgb)
    m = (L >= thr) & ~air
    m[:y0] = False; m[y1:] = False; m[:, :x0] = False; m[:, x1:] = False
    # connected components via flood (4-neigh), simple BFS
    seen = np.zeros_like(m, dtype=bool)
    comps = []
    ys, xs = np.nonzero(m)
    for y, x in zip(ys, xs):
        if seen[y, x]: continue
        stack = [(y, x)]; seen[y, x] = True
        pix = []
        while stack:
            cy, cx = stack.pop()
            pix.append((cy, cx))
            for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
                ny, nx = cy+dy, cx+dx
                if 0 <= ny < m.shape[0] and 0 <= nx < m.shape[1] and m[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; stack.append((ny, nx))
        pix = np.array(pix)
        comps.append((pix[:,1].min(), pix[:,1].max(), pix[:,0].min(), pix[:,0].max(), len(pix)))
    comps.sort(key=lambda c: -c[4])
    total = sum(c[4] for c in comps)
    print(f'{tag} thr {thr} [{x0}..{x1}]x[{y0}..{y1}]: {total}px in {len(comps)} comps')
    for c in comps[:18]:
        if c[4] < 6: break
        print(f'  x[{c[0]}..{c[1]}] y[{c[2]}..{c[3]}] n={c[4]}')

if sys.argv[1] == 'left':
    ref, proc = halves('view-left')
    clusters('REF ', ref, 230, 480, 218, 310, int(sys.argv[2]) if len(sys.argv) > 2 else 85)
    clusters('PROC', proc, 230, 480, 218, 310, int(sys.argv[2]) if len(sys.argv) > 2 else 85)
elif sys.argv[1] == 'hero':
    ref, proc = halves('hero-rearright')
    thr = int(sys.argv[2]) if len(sys.argv) > 2 else 92
    clusters('REF ', ref, 420, 610, 300, 385, thr)
    clusters('PROC', proc, 420, 610, 300, 385, thr)
elif sys.argv[1] == 'right':
    ref, proc = halves('view-right')
    clusters('REF ', ref, 160, 410, 218, 310, int(sys.argv[2]) if len(sys.argv) > 2 else 85)
    clusters('PROC', proc, 160, 410, 218, 310, int(sys.argv[2]) if len(sys.argv) > 2 else 85)
