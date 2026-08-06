#!/usr/bin/env python3
# leo2a5 r9 — the r9 done-gate windows in one pass (official pairs only).
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

def w(tag, h, x0, x1, y0, y1):
    c = h[y0:y1, x0:x1]
    a = air(c); b = luma(c)[~a]
    hsv = np.asarray(Image.fromarray(c.astype(np.uint8)).convert('HSV'), dtype=np.float64)
    hue = np.median(hsv[..., 0][~a] * 360 / 255)
    print(f'{tag}: med {np.median(b):.1f} p5 {np.percentile(b,5):.1f} p75 {np.percentile(b,75):.1f} '
          f'p95 {np.percentile(b,95):.1f} hue {hue:.1f} sub45 {(b<45).sum()} over92 {(b>92).sum()} n {b.size}')
    return b

def rowsd(tag, h, x0, x1, y0, y1):
    c = luma(h[y0:y1, x0:x1])
    rows = c.mean(axis=1)
    print(f'{tag}: rowmean-sd {rows.std():.2f} vgrad {np.abs(np.diff(c, axis=0)).mean():.2f}')

print('== 1a done-gates ==')
ref, proc = halves('hero-rearright')
w('REF  hero-rr under-bustle (p95<=92 / p75>=68)', ref, 420, 610, 330, 385)
w('PROC hero-rr under-bustle (p95<=92 / p75>=68)', proc, 420, 610, 330, 385)
ref, proc = halves('view-rear')
w('REF  rear louvre med (82..88)', ref, 100, 540, 312, 372)
w('PROC rear louvre med (82..88)', proc, 100, 540, 312, 372)
rowsd('REF  louvre-tex (>=4.5)', ref, 100, 540, 312, 372)
rowsd('PROC louvre-tex (>=4.5)', proc, 100, 540, 312, 372)

print('== 1a roofline band profile (alternation amplitude, view-left) ==')
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
w('REF  left turret-side (p95>=83 watch)', ref, 240, 420, 252, 296)
w('PROC left turret-side (p95>=83 watch)', proc, 240, 420, 252, 296)

print('== 2a glacis (rowmean-sd <=6.0, med 64.3..66, hue family) ==')
ref, proc = halves('view-front')
w('REF  glacis', ref, 200, 440, 330, 372)
w('PROC glacis', proc, 200, 440, 330, 372)
rowsd('REF  glacis-tex', ref, 200, 440, 330, 372)
rowsd('PROC glacis-tex', proc, 200, 440, 330, 372)
rowsd('PROC front-face ladder (5.75/5.79 watch)', proc, 70, 160, 395, 530)

print('== 2c gear window (hue>=50, sub45<=2358, ladders<=4.0) ==')
ref, proc = halves('view-left')
w('REF  gear', ref, 100, 540, 352, 400)
w('PROC gear', proc, 100, 540, 352, 400)
w('PROC strip (law: med ratio 0.92-1.16 vs 60.5)', proc, 120, 500, 352, 366)
ref, proc = halves('view-rear')
rowsd('PROC trackrearL ladder (<=4.0)', proc, 68, 160, 480, 555)
rowsd('PROC trackrearR ladder (<=4.0)', proc, 480, 572, 480, 555)
w('PROC rear corner med (warm watch)', proc, 68, 160, 480, 555)

print('== deck / top watch (banked class, no-worse) ==')
ref, proc = halves('view-top')
w('REF  deck', ref, 235, 405, 95, 230)
w('PROC deck', proc, 235, 405, 95, 230)
