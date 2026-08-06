#!/usr/bin/env python3
# leo2a5 r9 order 1a — LIT-EDGE RUN detector (the "layer cake bar" metric).
# A lit-edge pixel: luma >= FLOOR, and brighter by >= JUMP than BOTH the row
# 3 above and the row 3 below (a thin bright horizontal line between darker
# bands — the tier-rim signature). Reports horizontal runs (with 2px gap
# tolerance) longer than MINRUN, ref vs proc, over the turret band.
import numpy as np
from PIL import Image
import sys

SHOTS = '/Users/kevinliu/claude-of-tanks/shots/critic-leo2a5'
BG = np.array([0x15, 0x1b, 0x20], dtype=np.int16)

def luma(rgb):
    return 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]

def air(rgb):
    return (np.abs(rgb - BG).max(axis=-1) <= 13) & ((rgb[..., 2] - rgb[..., 0]) >= 8)

def runs(tag, rgb, x0, x1, y0, y1, jump=8.0, floor=72.0, minrun=18):
    L = luma(rgb); A = air(rgb)
    lit = np.zeros_like(L, dtype=bool)
    Lp = np.where(A, 1e9, L)   # air never counts as "darker"
    for y in range(max(y0, 3), min(y1, L.shape[0] - 3)):
        above = np.minimum(Lp[y - 3], Lp[y - 2])
        below = np.minimum(Lp[y + 2], Lp[y + 3])
        lit[y] = (L[y] >= floor) & ~A[y] & (L[y] - above >= jump) & (L[y] - below >= jump)
    lit[:, :x0] = False; lit[:, x1:] = False
    out = []
    for y in range(y0, y1):
        row = lit[y]
        cur = 0; gap = 0; st = None
        for x in range(x0, x1 + 1):
            on = row[x] if x < x1 else False
            if on:
                if st is None: st = x
                cur += 1 + gap; gap = 0
            elif st is not None and gap < 2:
                gap += 1
            elif st is not None:
                if cur >= minrun: out.append((y, st, x - gap - 1, cur))
                st = None; cur = 0; gap = 0
    # merge runs on adjacent rows (same feature, AA spread)
    merged = []
    for r in sorted(out, key=lambda r: (r[0], r[1])):
        for m in merged:
            if abs(m[0] - r[0]) <= 2 and not (r[2] < m[1] - 4 or r[1] > m[2] + 4):
                m[0] = r[0]; m[1] = min(m[1], r[1]); m[2] = max(m[2], r[2]); m[3] = max(m[3], r[3])
                break
        else:
            merged.append([r[0], r[1], r[2], r[3]])
    longest = max([m[3] for m in merged], default=0)
    print(f'{tag} [{x0}..{x1}]x[{y0}..{y1}] jump{jump} floor{floor}: longest lit-edge run {longest}px; runs>= {minrun}:')
    for m in sorted(merged, key=lambda m: -m[3])[:12]:
        print(f'  y={m[0]} x[{m[1]}..{m[2]}] len {m[3]}')
    return longest

view = sys.argv[1] if len(sys.argv) > 1 else 'left'
if view == 'left':
    a = np.asarray(Image.open(f'{SHOTS}/view-left.png').convert('RGB'), dtype=np.int16)
    runs('REF ', a[:, :640], 230, 480, 220, 320)
    runs('PROC', a[:, 640:1280], 230, 480, 220, 320)
elif view == 'right':
    a = np.asarray(Image.open(f'{SHOTS}/view-right.png').convert('RGB'), dtype=np.int16)
    runs('REF ', a[:, :640], 160, 410, 220, 320)
    runs('PROC', a[:, 640:1280], 160, 410, 220, 320)
elif view == 'close':
    a = np.asarray(Image.open(f'{SHOTS}/close-front.png').convert('RGB'), dtype=np.int16)
    runs('REF ', a[:, :640], 0, 520, 120, 420, minrun=24)
    runs('PROC', a[:, 640:1280], 0, 520, 120, 420, minrun=24)
elif view == 'hero':
    a = np.asarray(Image.open(f'{SHOTS}/hero-rearright.png').convert('RGB'), dtype=np.int16)
    runs('REF ', a[:, :640], 380, 640, 230, 330)
    runs('PROC', a[:, 640:1280], 380, 640, 230, 330)
