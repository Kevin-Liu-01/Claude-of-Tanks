#!/usr/bin/env python3
# TEMP (t84 r32 INDEPENDENT CRITIC): re-derived measurements on MY fresh
# official critic pairs (shots/critic-t84/, rendered 2026-08-04 11:24).
# Mask-method per BUILD-STANDARD §D: bg |px-0x151b20| maxch <= 13 (8-conn
# background flood, >=12px clusters, label-text excluded); ITU-601 luma
# rects with coordinates. Pair frame: REF x [0,640), PROC x [640,1280).
# Deleted after round.
import sys, os
import numpy as np
from PIL import Image
from collections import deque

SHOTS = 'shots/critic-t84'
BG = np.array([0x15, 0x1b, 0x20])

def load(view, shots=None):
    return np.asarray(Image.open(os.path.join(shots or SHOTS, f'{view}.png')).convert('RGB')).astype(np.int16)

def sky_mask(img):
    return (np.abs(img - BG).max(axis=2) <= 13)

def flood_open(sky, x0, x1):
    h, w = sky.shape
    half = sky[:, x0:x1]
    open_ = np.zeros_like(half, dtype=bool)
    dq = deque()
    hh, hw = half.shape
    for x in range(hw):
        for y in (0, hh - 1):
            if half[y, x] and not open_[y, x]:
                open_[y, x] = True; dq.append((y, x))
    for y in range(hh):
        for x in (0, hw - 1):
            if half[y, x] and not open_[y, x]:
                open_[y, x] = True; dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for dy, dx in ((1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)):
            ny, nx = y+dy, x+dx
            if 0 <= ny < hh and 0 <= nx < hw and half[ny, nx] and not open_[ny, nx]:
                open_[ny, nx] = True; dq.append((ny, nx))
    return half & ~open_

def clusters(mask, x0, min_px=12):
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    out = []
    for yy in range(h):
        row = mask[yy]
        for xx in np.nonzero(row & ~seen[yy])[0]:
            if seen[yy, xx]:
                continue
            dq = deque([(yy, xx)]); seen[yy, xx] = True
            n = 0; mnx = mxx = xx; mny = mxy = yy
            while dq:
                y, x = dq.popleft(); n += 1
                mnx = min(mnx, x); mxx = max(mxx, x); mny = min(mny, y); mxy = max(mxy, y)
                for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
                    ny, nx = y+dy, x+dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True; dq.append((ny, nx))
            if mxy < 34 and mnx < 220:  # label text zone
                continue
            if n >= min_px:
                out.append((n, (mnx + x0, mny, mxx + x0, mxy)))
    out.sort(reverse=True)
    return out

def luma(img):
    return img[..., 0] * 0.299 + img[..., 1] * 0.587 + img[..., 2] * 0.114

def rect_stats(img, x0, x1, y0, y1, tag=''):
    sub = img[y0:y1, x0:x1]
    sky = (np.abs(sub - BG).max(axis=2) <= 13)
    L = luma(sub)[~sky]
    bgc = int(sky.sum())
    if L.size == 0:
        print(f'  {tag:22s} [{x0}..{x1}]x[{y0}..{y1}]: ALL BG ({bgc}px)')
        return
    rgb = sub[~sky].mean(axis=0)
    p = np.percentile(L, [5, 25, 50, 75, 95])
    print(f'  {tag:22s} [{x0}..{x1}]x[{y0}..{y1}]: n={L.size} bg={bgc} '
          f'p5={p[0]:.1f} p25={p[1]:.1f} med={p[2]:.1f} p75={p[3]:.1f} p95={p[4]:.1f} '
          f'mean={L.mean():.1f} sd={L.std():.1f} rgb=({rgb[0]:.0f},{rgb[1]:.0f},{rgb[2]:.0f}) '
          f'g-r={rgb[1]-rgb[0]:+.0f} sub30={int((L<30).sum())} sub45={int((L<45).sum())} pale95={int((L>=95).sum())}')

def edge_census(img, x0, x1, y0, y1, tag='', thresh=12):
    """|∇L|>thresh edge pixels on the rect (vehicle px only)."""
    sub = img[y0:y1, x0:x1]
    L = luma(sub)
    sky = (np.abs(sub - BG).max(axis=2) <= 13)
    gx = np.abs(np.diff(L, axis=1)); gy = np.abs(np.diff(L, axis=0))
    e = np.zeros(L.shape, dtype=bool)
    e[:, :-1] |= gx > thresh
    e[:-1, :] |= gy > thresh
    e &= ~sky
    print(f'  {tag:22s} [{x0}..{x1}]x[{y0}..{y1}]: edgepx={int(e.sum())} (veh {int((~sky).sum())})')
    return int(e.sum())

VIEWS = ['view-front','view-frontleft','view-left','view-rearleft','view-rear',
         'view-rearright','view-right','view-frontright','view-top',
         'hero-frontleft','hero-rearright','hero-toptilt','close-front','close-roof']

def mode_voids():
    total_proc = 0
    for v in VIEWS:
        img = load(v)
        sky = sky_mask(img)
        for (x0, x1, half) in [(0, 640, 'REF '), (640, 1280, 'PROC')]:
            enc = flood_open(sky, x0, x1)
            cl = clusters(enc, x0)
            tot = sum(c for c, _ in cl)
            if half == 'PROC':
                total_proc += tot
            if cl:
                tops = '  '.join(f'{c}px@x{b[0]}..{b[2]} y{b[1]}..{b[3]}' for c, b in cl[:8])
                print(f'{v:18s} {half}: {len(cl)} clusters, {tot}px | {tops}')
            else:
                print(f'{v:18s} {half}: clean')
    print(f'\nTOTAL PROC enclosed-sky px (>=12px clusters): {total_proc}')

def mode_rects():
    print('== GROUP 1 done-gates ==')
    img = load('view-front')
    print('view-front:')
    rect_stats(img, 855, 1065, 258, 285, 'PROC letterbox')
    rect_stats(img, 215, 425, 258, 285, 'REF  letterbox')
    img = load('view-rear')
    print('view-rear:')
    rect_stats(img, 855, 1065, 275, 340, 'PROC collar')
    rect_stats(img, 215, 425, 275, 340, 'REF  collar')
    print('== GROUP 2 done-gates ==')
    img = load('view-left')
    print('view-left:')
    rect_stats(img, 740, 1040, 346, 386, 'PROC lower band')
    rect_stats(img, 100, 400, 346, 386, 'REF  lower band')
    rect_stats(img, 740, 1040, 372, 379, 'PROC track rows')
    rect_stats(img, 100, 400, 372, 379, 'REF  track rows')
    img = load('view-right')
    print('view-right:')
    rect_stats(img, 880, 1180, 346, 386, 'PROC lower band')
    rect_stats(img, 240, 540, 346, 386, 'REF  lower band')
    rect_stats(img, 880, 1180, 330, 352, 'PROC skirt band')
    rect_stats(img, 240, 540, 330, 352, 'REF  skirt band')
    img = load('view-rearleft')
    print('view-rearleft:')
    rect_stats(img, 1350, 1480, 310, 390, 'PROC stern zone')
    rect_stats(img, 710, 840, 310, 390, 'REF  stern zone')
    print('== GROUP 3 done-gates ==')
    img = load('close-roof')
    print('close-roof:')
    rect_stats(img, 1070, 1260, 195, 290, 'PROC cupola zone')
    rect_stats(img, 430, 620, 195, 290, 'REF  cupola zone')
    img = load('view-top')
    print('view-top edge census (|dL|>12):')
    edge_census(img, 850, 1070, 190, 330, 'PROC turret roof')
    edge_census(img, 210, 430, 190, 330, 'REF  turret roof')
    edge_census(img, 850, 1070, 60, 190, 'PROC engine deck')
    edge_census(img, 210, 430, 60, 190, 'REF  engine deck')
    edge_census(img, 850, 1070, 330, 470, 'PROC glacis deck')
    edge_census(img, 210, 430, 330, 470, 'REF  glacis deck')
    print('== hero-rearright canyon (evaluator void zone cross-check) ==')
    img = load('hero-rearright')
    rect_stats(img, 940, 1010, 240, 290, 'PROC canyon')
    rect_stats(img, 300, 370, 240, 290, 'REF  canyon')

def mode_rect(argv):
    v = argv[0]; x0, x1, y0, y1 = map(int, argv[1:5])
    img = load(v)
    rect_stats(img, x0, x1, y0, y1, v)

def mode_edge(argv):
    v = argv[0]; x0, x1, y0, y1 = map(int, argv[1:5])
    img = load(v)
    edge_census(img, x0, x1, y0, y1, v)

if __name__ == '__main__':
    m = sys.argv[1] if len(sys.argv) > 1 else 'voids'
    if m == 'voids':
        mode_voids()
    elif m == 'rects':
        mode_rects()
    elif m == 'rect':
        mode_rect(sys.argv[2:])
    elif m == 'edge':
        mode_edge(sys.argv[2:])
