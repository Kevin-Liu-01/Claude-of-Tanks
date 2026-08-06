#!/usr/bin/env python3
# TEMP (isu152 r5 independent critic): claims audit on the official pairs.
# ITU-601 luma, bg discriminator |px-0x151b20| maxch <= 13. Deleted after round.
import sys
from PIL import Image

BG = (0x15, 0x1B, 0x20)
def is_bg(p):
    return abs(p[0]-BG[0]) <= 13 and abs(p[1]-BG[1]) <= 13 and abs(p[2]-BG[2]) <= 13
def luma(p):
    return 0.299*p[0] + 0.587*p[1] + 0.114*p[2]

def load(name):
    return Image.open(f'shots/critic-isu152/{name}.png').convert('RGB')

def pane_bbox(img, pane):  # pane 0=ref,1=proc
    x0 = 640*pane
    px = img.load()
    minx, miny, maxx, maxy = 10**9, 10**9, -1, -1
    for y in range(28, 640):
        for x in range(x0, x0+640):
            if not is_bg(px[x, y]):
                if x < minx: minx = x
                if x > maxx: maxx = x
                if y < miny: miny = y
                if y > maxy: maxy = y
    return (minx - x0, miny, maxx - x0, maxy)

def rect_stats(img, pane, x0, y0, x1, y1):
    """luma stats over non-bg px + bg count, rect in pane coords."""
    px = img.load()
    off = 640*pane
    ls, nbg, nsky = [], 0, 0
    for y in range(y0, y1+1):
        for x in range(x0, x1+1):
            p = px[x+off, y]
            if is_bg(p): nsky += 1
            else: ls.append(luma(p))
    ls.sort()
    n = len(ls)
    tot = n + nsky
    def pct(q):
        return ls[min(n-1, int(n*q))] if n else -1
    return dict(n=n, sky=nsky, tot=tot, p05=round(pct(0.05),1), p25=round(pct(0.25),1),
                p50=round(pct(0.50),1), p95=round(pct(0.95),1),
                dark45=round(100*sum(1 for v in ls if v <= 45)/max(1,tot),1),
                skypct=round(100*nsky/max(1,tot),1))

def row_dark(img, pane, y, thr=60):
    px = img.load()
    off = 640*pane
    body = [luma(px[x+off, y]) for x in range(640) if not is_bg(px[x+off, y])]
    if not body: return dict(n=0)
    dk = sum(1 for v in body if v < thr)
    body.sort()
    return dict(n=len(body), dark=round(100*dk/len(body),1), p50=round(body[len(body)//2],1))

def row_width(img, pane, y):
    px = img.load()
    off = 640*pane
    xs = [x for x in range(640) if not is_bg(px[x+off, y])]
    return (len(xs), xs[0], xs[-1]) if xs else (0, -1, -1)

cmd = sys.argv[1] if len(sys.argv) > 1 else 'all'

if cmd in ('all', 'reg'):
    print('=== registration: pane bboxes (ref | proc), all 14 ===')
    for name in ['view-front','view-frontleft','view-left','view-rearleft','view-rear',
                 'view-rearright','view-right','view-frontright','view-top',
                 'hero-frontleft','hero-rearright','hero-toptilt','close-front','close-roof']:
        img = load(name)
        r = pane_bbox(img, 0); p = pane_bbox(img, 1)
        rw, rh = r[2]-r[0], r[3]-r[1]; pw, ph = p[2]-p[0], p[3]-p[1]
        print(f'{name:16s} ref {rw}x{rh} @({r[0]},{r[1]})  proc {pw}x{ph} @({p[0]},{p[1]})  d=({pw-rw:+d},{ph-rh:+d})')

if cmd in ('all', 'rear'):
    print('=== view-rear crest rows 118-170: width ref | proc | ratio ===')
    img = load('view-rear')
    for y in range(118, 171, 2):
        rn, ra, rb = row_width(img, 0, y)
        pn, pa, pb = row_width(img, 1, y)
        ratio = (pb-pa+1)/(rb-ra+1) if rn and pn else 0
        print(f'y{y}: ref {rb-ra+1}px ({ra}-{rb})  proc {pb-pa+1}px ({pa}-{pb})  ratio {ratio:.3f}')

if cmd in ('all', 'left'):
    img = load('view-left')
    print('=== view-left ground rows y392-399 (proc | ref) ===')
    for y in range(392, 400):
        pr = row_dark(img, 1, y); rr = row_dark(img, 0, y)
        print(f'y{y}: proc n{pr.get("n",0)} dark {pr.get("dark","-")}% p50 {pr.get("p50","-")} | ref n{rr.get("n",0)} dark {rr.get("dark","-")}% p50 {rr.get("p50","-")}')
    print('=== view-left window band rect x150-262 y366-384 (r4 rect) ===')
    print('proc', rect_stats(img, 1, 150, 366, 262, 384))
    print('ref ', rect_stats(img, 0, 150, 366, 262, 384))
    print('=== view-left muzzle sky-break cols x318-334 (pane) ===')
    px = img.load()
    for x in range(318, 335):
        col = []
        for y in range(200, 300):
            p = px[x+640, y]
            col.append('S' if is_bg(p) else 'G')
        s = ''.join(col)
        # summarize runs
        runs, cur, cnt = [], s[0], 1
        for ch in s[1:]:
            if ch == cur: cnt += 1
            else: runs.append(f'{cur}{cnt}'); cur, cnt = ch, 1
        runs.append(f'{cur}{cnt}')
        print(f'x{x}: {" ".join(runs[:8])}')

if cmd in ('all', 'stern'):
    img = load('view-left')
    # stern zone: z -3.25 -> px = 46+(z+3.407)*60.2 = 46+9.45 = 55.5 (pane coords, rear at LEFT in view-left)
    print('=== view-left stern cols x50-80: lowest non-bg y (proc | ref) ===')
    px = img.load()
    for x in range(50, 81, 3):
        def lowest(off):
            for y in range(430, 200, -1):
                if not is_bg(px[x+off, y]): return y
            return -1
        print(f'x{x}: proc bottom y{lowest(640)} | ref bottom y{lowest(0)}')

if cmd in ('all', 'top'):
    img = load('view-top')
    print('=== view-top intake cell fields (proc rects x250-290/x350-385 y160-225 r4 coords) ===')
    print('proc L', rect_stats(img, 1, 250, 160, 290, 225))
    print('proc R', rect_stats(img, 1, 350, 160, 385, 225))
    print('ref  L', rect_stats(img, 0, 250, 160, 290, 225))
    print('ref  R', rect_stats(img, 0, 350, 160, 385, 225))

if cmd in ('all', 'holes'):
    print('=== hole scan: bg-colored px INSIDE silhouette (all 14, proc pane) ===')
    for name in ['view-front','view-frontleft','view-left','view-rearleft','view-rear',
                 'view-rearright','view-right','view-frontright','view-top',
                 'hero-frontleft','hero-rearright','hero-toptilt','close-front','close-roof']:
        img = load(name)
        px = img.load()
        holes = 0
        spots = []
        for y in range(30, 640):
            # find body span this row
            xs = [x for x in range(640) if not is_bg(px[x+640, y])]
            if len(xs) < 2: continue
            for x in range(xs[0]+1, xs[-1]):
                if is_bg(px[x+640, y]):
                    # interior bg px: check it's enclosed vertically too (cheap check)
                    up = any(not is_bg(px[x+640, yy]) for yy in range(max(28,y-40), y))
                    dn = any(not is_bg(px[x+640, yy]) for yy in range(y+1, min(640, y+40)))
                    if up and dn:
                        holes += 1
                        if len(spots) < 8 and (not spots or abs(spots[-1][0]-x) > 5 or abs(spots[-1][1]-y) > 5):
                            spots.append((x, y))
        print(f'{name:16s} enclosed-bg px {holes} {spots[:6]}')
