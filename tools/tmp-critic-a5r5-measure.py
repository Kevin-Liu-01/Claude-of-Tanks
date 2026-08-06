#!/usr/bin/env python3
# leo2a5 r5 critic — ITU-601 luma rects + censuses on the official pairs.
# Windows quoted in HALF-frame coords (each half 640x640; proc = full-x minus 640).
import numpy as np
from PIL import Image

SHOTS = '/Users/kevinliu/claude-of-tanks/shots/critic-leo2a5'
BG = np.array([0x15, 0x1b, 0x20], dtype=np.int16)

def halves(view):
    a = np.asarray(Image.open(f'{SHOTS}/{view}.png').convert('RGB'), dtype=np.int16)
    return a[:, :640], a[:, 640:1280]

def luma(rgb):
    return 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]

def mask_air(rgb):
    return (np.abs(rgb - BG).max(axis=-1) <= 13)

def stats(name, rgb, x0, x1, y0, y1, subs=(30, 45), brights=()):
    w = rgb[y0:y1, x0:x1]
    L = luma(w)
    air = mask_air(w)
    body = L[~air]
    if body.size == 0:
        print(f'{name}: ALL AIR'); return
    hsv = np.asarray(Image.fromarray(w.astype(np.uint8)).convert('HSV'), dtype=np.float64)
    hue = hsv[..., 0][~air] * 360 / 255; sat = hsv[..., 1][~air] * 100 / 255
    out = (f'{name} [{x0}..{x1}]x[{y0}..{y1}] n={body.size} air%={100*air.mean():.1f} '
           f'med {np.median(body):.1f} sd {body.std():.2f} p5 {np.percentile(body,5):.1f} '
           f'p75 {np.percentile(body,75):.1f} p95 {np.percentile(body,95):.1f} '
           f'hue {np.median(hue):.1f} sat {np.median(sat):.1f}')
    for s in subs: out += f' sub{s}={int((body < s).sum())}'
    for b in brights: out += f' over{b}={int((body > b).sum())}'
    print(out)

def rowvar(name, rgb, x0, x1, y0, y1):
    # ladder detector: sd of row means + mean |row-to-row delta| (texture grain)
    w = luma(rgb[y0:y1, x0:x1])
    rows = w.mean(axis=1)
    grad = np.abs(np.diff(w, axis=0)).mean()
    print(f'{name} [{x0}..{x1}]x[{y0}..{y1}] rowmean-sd {rows.std():.2f} vgrad {grad:.2f}')

print('== view-left: gear band / turret field / hull field ==')
ref, proc = halves('view-left')
# gear band: skirt-bottom to ground (wheels+shoes). tanks span ref x~45..595 / proc x~45..595 (half coords)
stats('REF  gear', ref, 100, 540, 352, 400)
stats('PROC gear', proc, 100, 540, 352, 400)
# under-skirt strip (band 3-dim law zone): thin strip right under skirt lip
stats('REF  strip', ref, 120, 500, 352, 366)
stats('PROC strip', proc, 120, 500, 352, 366)
# turret side field (big flat pale zone on proc): turret band
stats('REF  turret-side', ref, 240, 420, 252, 296)
stats('PROC turret-side', proc, 240, 420, 252, 296)
# hull side band
stats('REF  hull-side', ref, 120, 500, 308, 348)
stats('PROC hull-side', proc, 120, 500, 308, 348)
# sprocket disc zone (proc pale disc): center ~ (87,338) half-coords r 15
stats('REF  sprocket-face', ref, 62, 105, 318, 360)
stats('PROC sprocket-face', proc, 62, 105, 318, 360)

print('== view-front: track fronts / glacis ==')
ref, proc = halves('view-front')
stats('REF  trackfrontL', ref, 70, 160, 395, 530, subs=(30, 45), brights=(110,))
stats('PROC trackfrontL', proc, 70, 160, 395, 530, subs=(30, 45), brights=(110,))
rowvar('REF  trackfrontL-ladder', ref, 70, 160, 395, 530)
rowvar('PROC trackfrontL-ladder', proc, 70, 160, 395, 530)
stats('REF  glacis', ref, 200, 440, 330, 372)
stats('PROC glacis', proc, 200, 440, 330, 372)
rowvar('REF  glacis-tex', ref, 200, 440, 330, 372)
rowvar('PROC glacis-tex', proc, 200, 440, 330, 372)

print('== view-rear: louvre band / flap-track corners / rear wall ==')
ref, proc = halves('view-rear')
# ref louvre band spans nearly full width y~310..375
stats('REF  louvre-band', ref, 100, 540, 312, 372)
stats('PROC louvre-band', proc, 100, 540, 312, 372)
rowvar('REF  louvre-tex', ref, 100, 540, 312, 372)
rowvar('PROC louvre-tex', proc, 100, 540, 312, 372)
# taillight cluster zones (ref ring guards ~ (190,400),(450,400))
stats('REF  taillightL', ref, 165, 220, 380, 430)
stats('PROC taillightL', proc, 165, 220, 380, 430)
# track rears at corners
stats('REF  trackrearL', ref, 68, 160, 480, 555, subs=(30,), brights=(110,))
stats('PROC trackrearL', proc, 68, 160, 480, 555, subs=(30,), brights=(110,))

print('== view-rearleft: stern frame khaki zone ==')
ref, proc = halves('view-rearleft')
stats('REF  stern-frame', ref, 63, 140, 305, 390)
stats('PROC stern-frame', proc, 63, 140, 305, 390)

print('== view-top: deck stripes ==')
ref, proc = halves('view-top')
stats('REF  deck', ref, 235, 405, 95, 230, brights=(120,))
stats('PROC deck', proc, 235, 405, 95, 230, brights=(120,))
rowvar('REF  deck-tex', ref, 235, 405, 95, 230)
rowvar('PROC deck-tex', proc, 235, 405, 95, 230)

print('== hero-rearright: under-bustle backing ==')
ref, proc = halves('hero-rearright')
stats('REF  under-bustle', ref, 420, 610, 330, 385)
stats('PROC under-bustle', proc, 420, 610, 330, 385)
