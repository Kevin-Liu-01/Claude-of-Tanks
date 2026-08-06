#!/usr/bin/env python3
# TEMP (t84 r32 builder): enclosed-sky border-flood scan + luma rects on the
# official critic pairs (shots/critic-t84/). Mask-method per BUILD-STANDARD §D:
# bg |px-0x151b20| maxch <= 13; ITU-601 luma rects. Deleted after round.
import sys, os
import numpy as np
from PIL import Image

SHOTS = sys.argv[1] if len(sys.argv) > 1 else 'shots/critic-t84'
BG = np.array([0x15, 0x1b, 0x20])

def load(view):
    img = np.asarray(Image.open(os.path.join(SHOTS, f'{view}.png')).convert('RGB')).astype(np.int16)
    return img

def sky_mask(img):
    return (np.abs(img - BG).max(axis=2) <= 13)

def flood_open(sky, x0, x1):
    """Flood the sky mask from the border of the half [x0,x1) — returns open-sky mask."""
    h, w = sky.shape
    half = sky[:, x0:x1]
    from collections import deque
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
        # 8-connected background flood (complement of 4-connected foreground)
        for dy, dx in ((1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)):
            ny, nx = y+dy, x+dx
            if 0 <= ny < hh and 0 <= nx < hw and half[ny, nx] and not open_[ny, nx]:
                open_[ny, nx] = True; dq.append((ny, nx))
    return half & ~open_

def clusters(mask, x0, min_px=12):
    """4-connected clusters of an enclosed-sky mask; returns [(count, bbox)]."""
    from collections import deque
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
            # label text zone: x<210,y<32 of the half (REFERENCE/PROCEDURAL)
            if mxy < 34 and mnx < 220:
                continue
            if n >= min_px:
                out.append((n, (mnx + x0, mny, mxx + x0, mxy)))
    out.sort(reverse=True)
    return out

def luma(img):
    return img[..., 0] * 0.299 + img[..., 1] * 0.587 + img[..., 2] * 0.114

def rect_stats(img, x0, x1, y0, y1, tag=''):
    """Luma stats on vehicle (non-bg) pixels of rect."""
    sub = img[y0:y1, x0:x1]
    sky = (np.abs(sub - BG).max(axis=2) <= 13)
    L = luma(sub)[~sky]
    bgc = int(sky.sum())
    if L.size == 0:
        print(f'  {tag} [{x0}..{x1}]x[{y0}..{y1}]: ALL BG ({bgc}px)')
        return
    rgb = sub[~sky].mean(axis=0)
    p = np.percentile(L, [5, 25, 50, 75, 95])
    print(f'  {tag} [{x0}..{x1}]x[{y0}..{y1}]: n={L.size} bg={bgc} '
          f'p5={p[0]:.1f} p25={p[1]:.1f} med={p[2]:.1f} p75={p[3]:.1f} p95={p[4]:.1f} '
          f'mean={L.mean():.1f} sd={L.std():.1f} rgb=({rgb[0]:.0f},{rgb[1]:.0f},{rgb[2]:.0f}) '
          f'g-r={rgb[1]-rgb[0]:+.0f} sub30={int((L<30).sum())} sub45={int((L<45).sum())} pale95={int((L>=95).sum())}')

VIEWS = ['view-front','view-frontleft','view-left','view-rearleft','view-rear',
         'view-rearright','view-right','view-frontright','view-top',
         'hero-frontleft','hero-rearright','hero-toptilt','close-front','close-roof']

if __name__ == '__main__':
    mode = sys.argv[2] if len(sys.argv) > 2 else 'voids'
    if mode == 'voids':
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
                    tops = '  '.join(f'{c}px@x{b[0]}..{b[2]} y{b[1]}..{b[3]}' for c, b in cl[:6])
                    print(f'{v:18s} {half}: {len(cl)} clusters, {tot}px | {tops}')
                else:
                    print(f'{v:18s} {half}: clean')
        print(f'\nTOTAL PROC enclosed-sky px (>=12px clusters): {total_proc}')
    elif mode == 'rects':
        # GROUP 1 done-gate rects (verdict coords, pair frame)
        img = load('view-front')
        print('view-front:')
        rect_stats(img, 855, 1065, 258, 285, 'PROC letterbox')
        rect_stats(img, 215, 425, 258, 285, 'REF  letterbox')
        img = load('view-rear')
        print('view-rear:')
        rect_stats(img, 855, 1065, 275, 340, 'PROC collar')
        rect_stats(img, 215, 425, 275, 340, 'REF  collar')
        # GROUP 2 rects
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
        img = load('view-rearleft')
        print('view-rearleft:')
        rect_stats(img, 710+640, 310, 840+640-640, 390, 'BAD')  # placeholder
    elif mode == 'rect':
        # ad-hoc: view x0 x1 y0 y1
        v = sys.argv[3]; x0, x1, y0, y1 = map(int, sys.argv[4:8])
        img = load(v)
        rect_stats(img, x0, x1, y0, y1, v)
