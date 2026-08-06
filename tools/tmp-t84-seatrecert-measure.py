#!/usr/bin/env python3
# TEMP (t84 SEAT RE-CERT INDEPENDENT CRITIC, batch-40 graduate-change):
# re-derived measurements on MY fresh official critic pairs
# (shots/critic-t84/). Mask-method per BUILD-STANDARD SD: bg
# |px-0x151b20| maxch <= 13, 8-conn border flood, >=12px clusters,
# label-text excluded — PLUS the BLUE-SIGNATURE term (B-R >= +8,
# revolution-r7 law) reported side by side. SEAT mode: per-column
# daylight gap between casting underside and hull deck (the owner
# report). Pair frame: REF x [0,640), PROC x [640,1280).
# Deleted after round.
import sys, os
import numpy as np
from PIL import Image
from collections import deque

SHOTS = 'shots/critic-t84'
BG = np.array([0x15, 0x1b, 0x20])

def load(view, shots=None):
    return np.asarray(Image.open(os.path.join(shots or SHOTS, f'{view}.png')).convert('RGB')).astype(np.int16)

def sky_mask(img, blue=False):
    m = (np.abs(img - BG).max(axis=2) <= 13)
    if blue:
        m &= (img[..., 2] - img[..., 0]) >= 8
    return m

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
    print('== SB2 border-flood enclosed sky: maskCount(blueCount) per half ==')
    total_proc = 0; total_proc_blue = 0
    for v in VIEWS:
        img = load(v)
        sky = sky_mask(img)
        skyb = sky_mask(img, blue=True)
        for (x0, x1, half) in [(0, 640, 'REF '), (640, 1280, 'PROC')]:
            enc = flood_open(sky, x0, x1)
            encb = flood_open(skyb, x0, x1)
            cl = clusters(enc, x0)
            clb = clusters(encb, x0)
            tot = sum(c for c, _ in cl)
            totb = sum(c for c, _ in clb)
            if half == 'PROC':
                total_proc += tot; total_proc_blue += totb
            if cl or clb:
                tops = '  '.join(f'{c}px@x{b[0]}..{b[2]} y{b[1]}..{b[3]}' for c, b in cl[:6])
                print(f'{v:18s} {half}: mask {tot}px / blue {totb}px | {tops}')
            else:
                print(f'{v:18s} {half}: clean')
    print(f'\nTOTAL PROC enclosed px (>=12 clusters): mask {total_proc} / blue-signature {total_proc_blue}')

def column_runs(img, x, sky):
    """maximal non-sky runs in column x, as (ytop, ybot) list"""
    col = ~sky[:, x]
    runs = []
    y = 0; h = col.shape[0]
    while y < h:
        if col[y]:
            y0 = y
            while y < h and col[y]:
                y += 1
            runs.append((y0, y - 1))
        else:
            y += 1
    return runs

def seat_scan(img, x0, x1, cx0, cx1, tag, band=(268, 306)):
    """Per-column DAYLIGHT within the seat band y band[0]..band[1]:
    sky px with vehicle content both ABOVE and BELOW in the same column
    (i.e. sky reading through between casting underside and deck).
    Casting columns cx0..cx1 (abs px)."""
    sky = sky_mask(img)
    sky[:34, :] = True  # label rows read as sky (ignored)
    y0, y1 = band
    gaps = []
    worst = []
    for x in range(cx0, cx1):
        col_sky = sky[:, x]
        col = ~col_sky
        if not col.any():
            continue
        n = 0
        for y in range(y0, y1):
            if col_sky[y] and col[:y].any() and col[y+1:].any():
                n += 1
        gaps.append(n)
        if n:
            worst.append((n, x))
    gaps = np.array(gaps)
    ncols = gaps.size
    if ncols == 0:
        print(f'  {tag:28s}: no content columns'); return
    nz = gaps[gaps > 0]
    worst.sort(reverse=True)
    ws = ' worst: ' + ', '.join(f'{n}px@x{x}' for n, x in worst[:5]) if worst else ''
    print(f'  {tag:28s} cols x{cx0}..{cx1} band y{y0}..{y1}: {ncols} cols, daylight>0 in {nz.size} '
          f'({100.0*nz.size/ncols:.0f}%), mean {gaps.mean():.2f}px, max {gaps.max()}px{ws}')
    return gaps

def mode_seat():
    print('== SEAT READ: per-column sky gap casting-underside -> next mass ==')
    print('(fresh PROC vs fresh REF vs the pre-seat archive PROC)')
    for v, (rx0, rx1), (px0, px1) in [
        ('view-left', (148, 309), (787, 952)),
        ('view-right', (331, 492), (968, 1133)),
    ]:
        img = load(v)
        seat_scan(img, 0, 640, rx0, rx1, f'{v} REF  casting band')
        seat_scan(img, 640, 1280, px0, px1, f'{v} PROC casting band')
    for v in ['view-left']:
        img_b = np.asarray(Image.open(f'shots/russia-t84-seat/before-{v}.png').convert('RGB')).astype(np.int16)
        img_a = np.asarray(Image.open(f'shots/russia-t84-seat/after-{v}.png').convert('RGB')).astype(np.int16)
        seat_scan(img_b, 640, 1280, 787, 994, f'BEFORE archive {v} PROC')
        seat_scan(img_a, 640, 1280, 787, 952, f'AFTER  archive {v} PROC')

def mode_rect(argv):
    v = argv[0]; x0, x1, y0, y1 = map(int, argv[1:5])
    img = load(v)
    rect_stats(img, x0, x1, y0, y1, v)

def mode_edge(argv):
    v = argv[0]; x0, x1, y0, y1 = map(int, argv[1:5])
    img = load(v)
    edge_census(img, x0, x1, y0, y1, v)

def mode_runs(argv):
    """print content runs for one column, diagnosis"""
    v = argv[0]; x = int(argv[1])
    img = load(v)
    sky = sky_mask(img)
    sky[:34, :] = True
    print(v, 'col', x, column_runs(img, x, sky))

if __name__ == '__main__':
    m = sys.argv[1] if len(sys.argv) > 1 else 'voids'
    if m == 'voids':
        mode_voids()
    elif m == 'seat':
        mode_seat()
    elif m == 'rect':
        mode_rect(sys.argv[2:])
    elif m == 'edge':
        mode_edge(sys.argv[2:])
    elif m == 'runs':
        mode_runs(sys.argv[2:])
