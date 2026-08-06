#!/usr/bin/env python3
# leo2a5 r10 CRITIC (fifth adjudication) — every banked/held window re-derived
# on MY fresh pairs + over92 blob morphology for the speckle/edge adjudication.
# Windows in HALF-frame coords (each half 640x640).
import numpy as np
from PIL import Image

SHOTS = '/Users/kevinliu/claude-of-tanks/shots/critic-leo2a5'
BG = np.array([0x15, 0x1b, 0x20], dtype=np.int16)

def halves(view):
    a = np.asarray(Image.open(f'{SHOTS}/{view}.png').convert('RGB'), dtype=np.int16)
    return a[:, :640], a[:, 640:1280]

def luma(rgb):
    return 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]

def air(rgb):
    return (np.abs(rgb - BG).max(axis=-1) <= 13) & ((rgb[..., 2] - rgb[..., 0]) >= 8)

def w(tag, h, x0, x1, y0, y1, brights=(92,)):
    c = h[y0:y1, x0:x1]
    a = air(c); b = luma(c)[~a]
    hsv = np.asarray(Image.fromarray(c.astype(np.uint8)).convert('HSV'), dtype=np.float64)
    hue = np.median(hsv[..., 0][~a] * 360 / 255)
    out = (f'{tag}: med {np.median(b):.1f} sd {b.std():.2f} p5 {np.percentile(b,5):.1f} '
           f'p75 {np.percentile(b,75):.1f} p95 {np.percentile(b,95):.1f} hue {hue:.1f} '
           f'sub45 {(b<45).sum()}')
    for bb in brights: out += f' over{bb} {(b>bb).sum()}'
    print(out + f' n {b.size}')

def rowsd(tag, h, x0, x1, y0, y1):
    c = luma(h[y0:y1, x0:x1])
    rows = c.mean(axis=1)
    print(f'{tag}: rowmean-sd {rows.std():.2f} vgrad {np.abs(np.diff(c, axis=0)).mean():.2f}')

def blobs(tag, h, x0, x1, y0, y1, thresh=92):
    # connected components (4-conn) of the over-thresh mask inside the window:
    # speckle = many small scattered blobs; lit-edge = few long thin runs.
    c = h[y0:y1, x0:x1]
    a = air(c)
    m = (luma(c) > thresh) & ~a
    lab = np.zeros(m.shape, dtype=np.int32); nl = 0
    comp = []
    from collections import deque
    for yy in range(m.shape[0]):
        for xx in range(m.shape[1]):
            if m[yy, xx] and lab[yy, xx] == 0:
                nl += 1; q = deque([(yy, xx)]); lab[yy, xx] = nl
                px = []
                while q:
                    py, pxx = q.popleft(); px.append((py, pxx))
                    for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
                        ny, nx = py+dy, pxx+dx
                        if 0 <= ny < m.shape[0] and 0 <= nx < m.shape[1] and m[ny, nx] and lab[ny, nx] == 0:
                            lab[ny, nx] = nl; q.append((ny, nx))
                ys = [p[0] for p in px]; xs = [p[1] for p in px]
                comp.append((len(px), min(xs)+x0, max(xs)+x0, min(ys)+y0, max(ys)+y0))
    comp.sort(reverse=True)
    tot = int(m.sum())
    small = sum(1 for c2 in comp if c2[0] <= 3)
    print(f'{tag}: over{thresh} total {tot}px in {len(comp)} blobs; <=3px blobs {small}; top5:')
    for c2 in comp[:5]:
        n, xa, xb, ya, yb = c2
        ww, hh = xb-xa+1, yb-ya+1
        shape = 'LINE' if (max(ww,hh) >= 4*max(1,min(ww,hh))) else 'PATCH'
        print(f'   {n}px [{xa}..{xb}]x[{ya}..{yb}] ({ww}x{hh} {shape})')

def aircensus(tag, h, x0=0, x1=640, y0=40, y1=640):
    # enclosed-air census (§B2, blue-signature method): air components not
    # touching the window border = enclosed pockets.
    c = h[y0:y1, x0:x1]
    m = air(c)
    from collections import deque
    lab = np.zeros(m.shape, dtype=np.int32); nl = 0
    enc = 0; encpx = 0; comps = []
    for yy in range(m.shape[0]):
        for xx in range(m.shape[1]):
            if m[yy, xx] and lab[yy, xx] == 0:
                nl += 1; q = deque([(yy, xx)]); lab[yy, xx] = nl
                px = []; border = False
                while q:
                    py, pxx = q.popleft(); px.append((py, pxx))
                    if py in (0, m.shape[0]-1) or pxx in (0, m.shape[1]-1): border = True
                    for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
                        ny, nx = py+dy, pxx+dx
                        if 0 <= ny < m.shape[0] and 0 <= nx < m.shape[1] and m[ny, nx] and lab[ny, nx] == 0:
                            lab[ny, nx] = nl; q.append((ny, nx))
                if not border:
                    enc += 1; encpx += len(px)
                    if len(px) >= 6:
                        ys = [p[0]+y0 for p in px]; xs = [p[1]+x0 for p in px]
                        comps.append((len(px), min(xs), max(xs), min(ys), max(ys)))
    comps.sort(reverse=True)
    print(f'{tag}: enclosed-air {encpx}px in {enc} comps; >=6px comps: ' +
          (', '.join(f'{n}px[{xa}..{xb}]x[{ya}..{yb}]' for n, xa, xb, ya, yb in comps[:6]) or 'none'))

print('== BANKED WINDOW 1: hero-rr crown p95 (order <=92, ref 89.3, builder 94.9) ==')
ref, proc = halves('hero-rearright')
w('REF  hero-rr under-bustle', ref, 420, 610, 330, 385, brights=(92, 100))
w('PROC hero-rr under-bustle', proc, 420, 610, 330, 385, brights=(92, 100))
blobs('REF  crown-window blobs', ref, 420, 610, 330, 385)
blobs('PROC crown-window blobs', proc, 420, 610, 330, 385)

print('== BANKED WINDOW 2: 2c p75 hold (>=68, builder 67.9) — same window above (p75 col) ==')
print('== BANKED WINDOW 3: glacis rowmean-sd (<=6.0 ordered, builder 7.72) ==')
ref, proc = halves('view-front')
w('REF  glacis', ref, 200, 440, 330, 372)
w('PROC glacis', proc, 200, 440, 330, 372)
rowsd('REF  glacis-tex', ref, 200, 440, 330, 372)
rowsd('PROC glacis-tex', proc, 200, 440, 330, 372)
rowsd('PROC front-face ladder (5.75/5.79 watch)', proc, 70, 160, 395, 530)
rowsd('REF  front-face ladder', ref, 70, 160, 395, 530)

print('== 1a DRIVER: roofline 9-band alternation (view-left; builder 2.29 vs ref 2.63) ==')
ref, proc = halves('view-left')
for tag, h in (('REF ', ref), ('PROC', proc)):
    L = luma(h); A = air(h)
    alt = []
    for x in range(250, 460, 6):
        col = np.nonzero(~A[:, x])[0]
        if col.size == 0: continue
        t = col[0]
        band = [L[t + i:t + i + 3, x].mean() for i in range(0, 27, 3)]
        d = np.abs(np.diff(band))
        alt.append((np.array(d) >= 8).sum())
    print(f'{tag} roofline 9-band alternations >=8: mean {np.mean(alt):.2f} max {max(alt)}')

print('== held windows: rear med / louvre-tex / corners / taillight ==')
ref, proc = halves('view-rear')
w('REF  rear louvre med (82..88)', ref, 100, 540, 312, 372)
w('PROC rear louvre med (82..88)', proc, 100, 540, 312, 372)
rowsd('REF  louvre-tex (>=4.5)', ref, 100, 540, 312, 372)
rowsd('PROC louvre-tex (>=4.5)', proc, 100, 540, 312, 372)
rowsd('PROC trackrearL ladder (<=4.0)', proc, 68, 160, 480, 555)
rowsd('PROC trackrearR ladder (<=4.0)', proc, 480, 572, 480, 555)
w('REF  rear corner', ref, 68, 160, 480, 555)
w('PROC rear corner (warm watch)', proc, 68, 160, 480, 555)
w('REF  taillightL', ref, 165, 220, 380, 430)
w('PROC taillightL', proc, 165, 220, 380, 430)

print('== held windows: gear / strip / turret-side / hull-side / disc (view-left) ==')
ref, proc = halves('view-left')
w('REF  gear', ref, 100, 540, 352, 400)
w('PROC gear (hue>=50; sub45 fleet-base 2576)', proc, 100, 540, 352, 400)
w('REF  strip', ref, 120, 500, 352, 366)
w('PROC strip (ratio 0.92..1.16 vs ref med)', proc, 120, 500, 352, 366)
w('REF  turret-side', ref, 240, 420, 252, 296)
w('PROC turret-side (p95>=83)', proc, 240, 420, 252, 296)
w('REF  hull-side', ref, 120, 500, 308, 348)
w('PROC hull-side', proc, 120, 500, 308, 348)
w('REF  sprocket-face', ref, 62, 105, 318, 360)
w('PROC sprocket-face (p95<=80)', proc, 62, 105, 318, 360)

print('== DECK KNOB adjudication: view-top deck + over92 morphology ==')
ref, proc = halves('view-top')
w('REF  deck', ref, 235, 405, 95, 230, brights=(92, 120))
w('PROC deck (knob ON: med~56.6, over92 154 caution)', proc, 235, 405, 95, 230, brights=(92, 120))
rowsd('REF  deck-tex', ref, 235, 405, 95, 230)
rowsd('PROC deck-tex', proc, 235, 405, 95, 230)
blobs('REF  deck blobs', ref, 235, 405, 95, 230)
blobs('PROC deck blobs', proc, 235, 405, 95, 230)

print('== §B2 enclosed-air census (blue-signature) ==')
for view in ('close-front', 'view-top', 'hero-toptilt', 'view-rear', 'close-roof'):
    ref, proc = halves(view)
    aircensus(f'REF  {view}', ref)
    aircensus(f'PROC {view}', proc)
