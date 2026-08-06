#!/usr/bin/env python3
# leo2a5 r6 critic — extra windows beyond the r5 script: rear-corner ladder
# metric (1a rear done-gate cites rowmean-sd 3.98), rear-right corner mirror,
# front-face p95 sub-gate re-read, and the toptilt void-zone air census.
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

def rowvar(name, rgb, x0, x1, y0, y1):
    w = luma(rgb[y0:y1, x0:x1])
    rows = w.mean(axis=1)
    grad = np.abs(np.diff(w, axis=0)).mean()
    print(f'{name} [{x0}..{x1}]x[{y0}..{y1}] rowmean-sd {rows.std():.2f} vgrad {grad:.2f}')

print('== 1a rear done-gate: corner ladder metric (gate rowmean-sd <=4.5) ==')
ref, proc = halves('view-rear')
rowvar('REF  trackrearL', ref, 68, 160, 480, 555)
rowvar('PROC trackrearL', proc, 68, 160, 480, 555)
rowvar('REF  trackrearR', ref, 480, 572, 480, 555)
rowvar('PROC trackrearR', proc, 480, 572, 480, 555)

print('== 1a front: right mirror + rowvar ==')
ref, proc = halves('view-front')
rowvar('REF  trackfrontR', ref, 480, 570, 395, 530)
rowvar('PROC trackfrontR', proc, 480, 570, 395, 530)

print('== toptilt void zone: air census inside silhouette near world (1.40,0.98,1.34) ==')
ref, proc = halves('hero-toptilt')
# scan proc half for air pixels enclosed by body: report air% per coarse cell
L = luma(proc); air = mask_air(proc)
H, W = air.shape
for cy in range(0, H, 80):
    row = []
    for cx in range(0, W, 80):
        cell = air[cy:cy+80, cx:cx+80]
        row.append(f'{100*cell.mean():4.0f}')
    print(f'proc-air y{cy:3d}: ' + ' '.join(row))
ref_air = mask_air(ref)
for cy in range(0, H, 80):
    row = []
    for cx in range(0, W, 80):
        cell = ref_air[cy:cy+80, cx:cx+80]
        row.append(f'{100*cell.mean():4.0f}')
    print(f'ref-air  y{cy:3d}: ' + ' '.join(row))
