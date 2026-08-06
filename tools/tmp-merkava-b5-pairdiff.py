#!/usr/bin/env python3
# TEMP (merkava family, B5 round): pixel-diff two critic-pair directories
# (before/after) view by view. Each pair PNG is ref|proc side by side; the
# REF half must be byte-identical (same GLB, same rig) and the PROC half
# shows exactly what the profile change moved. Reports per view: changed
# pixel count, max |delta| per channel, and the changed-region bbox; writes
# amplified diff heatmaps for any view with deltas.
import sys, os
import numpy as np
from PIL import Image

a_dir, b_dir, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out_dir, exist_ok=True)
names = sorted(n for n in os.listdir(a_dir) if n.endswith('.png'))
total_changed = 0
for n in names:
    pa, pb = os.path.join(a_dir, n), os.path.join(b_dir, n)
    if not os.path.exists(pb):
        print(f'{n:24} MISSING in after dir')
        continue
    ia = np.asarray(Image.open(pa).convert('RGB')).astype(np.int16)
    ib = np.asarray(Image.open(pb).convert('RGB')).astype(np.int16)
    if ia.shape != ib.shape:
        print(f'{n:24} SHAPE {ia.shape} vs {ib.shape}')
        continue
    d = np.abs(ia - ib).max(axis=2)
    changed = int((d > 0).sum())
    total_changed += changed
    if changed == 0:
        print(f'{n:24} IDENTICAL')
        continue
    ys, xs = np.nonzero(d)
    w = ia.shape[1]
    half = 'REF-HALF!' if xs.min() < w // 2 else 'proc-half'
    print(f'{n:24} changed {changed:7d}px  maxD {int(d.max()):3d}  bbox x{xs.min()}..{xs.max()} y{ys.min()}..{ys.max()}  {half}')
    heat = np.clip(d * 8, 0, 255).astype(np.uint8)
    Image.fromarray(np.stack([heat, np.zeros_like(heat), np.zeros_like(heat)], axis=2) + (ia // 3).astype(np.uint8)).save(os.path.join(out_dir, f'diff-{n}'))
print(f'-- total changed px across {len(names)} views: {total_changed}')
