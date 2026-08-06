#!/usr/bin/env python3
# leo2a5 r9 — order 1a TIER-EDGE diagnostics.
# 1) roofline pale-run metric (done-gate: no continuous pale run >=40px at 1x
#    on view-left/right): for each column over the turret span, sample the
#    topmost 3 body pixels; a column is PALE if its max luma >= THR. Longest
#    consecutive pale run reported, ref vs proc.
# 2) hero-rr crown p95 (the ≤92 done-gate) re-read + upper-crown-only window.
# 3) close-front tier-rim scan: horizontal bright-line detector over the
#    turret zone — rows whose in-body luma p90 exceeds neighbours by >12
#    (the lit-rim signature), with run widths.
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

def roofline(tag, rgb, x0, x1, thr):
    L = luma(rgb); air = mask_air(rgb)
    H = rgb.shape[0]
    vals = np.full(x1 - x0, -1.0)
    tops = np.full(x1 - x0, -1)
    for i, x in enumerate(range(x0, x1)):
        col = air[:, x]
        nz = np.nonzero(~col)[0]
        if nz.size == 0:
            continue
        t = nz[0]
        tops[i] = t
        vals[i] = L[t:t + 3, x].max()
    pale = vals >= thr
    # longest run
    best = 0; cur = 0; runs = []
    st = None
    for i, p in enumerate(pale):
        if p:
            cur += 1
            if st is None: st = i
            best = max(best, cur)
        else:
            if cur >= 12: runs.append((x0 + st, x0 + i - 1, cur))
            cur = 0; st = None
    if cur >= 12: runs.append((x0 + st, x0 + len(pale) - 1, cur))
    v = vals[vals >= 0]
    print(f'{tag} x[{x0}..{x1}] thr {thr}: longest pale run {best}px, '
          f'roofline luma med {np.median(v):.1f} p90 {np.percentile(v, 90):.1f}; runs>=12px: {runs}')
    return best

def rimscan(tag, rgb, x0, x1, y0, y1, jump=12.0):
    L = luma(rgb); air = mask_air(rgb)
    print(f'{tag} bright-row scan [{x0}..{x1}]x[{y0}..{y1}]:')
    rows = []
    for y in range(y0, y1):
        b = L[y, x0:x1][~air[y, x0:x1]]
        rows.append(np.percentile(b, 90) if b.size > 30 else np.nan)
    rows = np.array(rows)
    for i in range(2, len(rows) - 2):
        if np.isnan(rows[i]): continue
        nb = np.nanmean([rows[i - 2], rows[i + 2]])
        if rows[i] - nb > jump:
            # measure the bright run width in that row
            rl = L[y0 + i, x0:x1]
            ra = air[y0 + i, x0:x1]
            bright = (rl >= nb + jump) & ~ra
            best = cur = 0
            for p in bright:
                cur = cur + 1 if p else 0
                best = max(best, cur)
            print(f'  row y={y0 + i}: p90 {rows[i]:.1f} vs nb {nb:.1f} (+{rows[i]-nb:.1f}), longest bright run {best}px')

view = sys.argv[1] if len(sys.argv) > 1 else 'all'
if view in ('all', 'left'):
    ref, proc = halves('view-left')
    print('== view-left roofline (turret span x 240..470) ==')
    for thr in (80, 85, 90):
        roofline('REF ', ref, 240, 470, thr)
        roofline('PROC', proc, 240, 470, thr)
if view in ('all', 'right'):
    ref, proc = halves('view-right')
    print('== view-right roofline (turret span x 170..400) ==')
    for thr in (80, 85, 90):
        roofline('REF ', ref, 170, 400, thr)
        roofline('PROC', proc, 170, 400, thr)
if view in ('all', 'hero'):
    ref, proc = halves('hero-rearright')
    print('== hero-rr crown window (the r8 crown p95 zone x 420..610 y 300..340) ==')
    for tag, h in (('REF ', ref), ('PROC', proc)):
        L = luma(h); air = mask_air(h)
        w = L[300:340, 420:610]; a = mask_air(h[300:340, 420:610])
        b = w[~a]
        print(f'{tag} crown: n={b.size} med {np.median(b):.1f} p75 {np.percentile(b,75):.1f} p95 {np.percentile(b,95):.1f} over92={int((b>92).sum())} over100={int((b>100).sum())}')
    # the official under-bustle window p95 (done-gate <=92)
    for tag, h in (('REF ', ref), ('PROC', proc)):
        L = luma(h)
        w = h[330:385, 420:610]
        a = mask_air(w); b = luma(w)[~a]
        print(f'{tag} under-bustle: med {np.median(b):.1f} p75 {np.percentile(b,75):.1f} p95 {np.percentile(b,95):.1f}')
if view in ('all', 'close'):
    ref, proc = halves('close-front')
    print('== close-front turret tier zone (x 150..520, y 120..300) ==')
    rimscan('REF ', ref, 150, 520, 120, 300)
    rimscan('PROC', proc, 150, 520, 120, 300)
