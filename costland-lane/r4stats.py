#!/usr/bin/env python3
"""r4stats.py <diag dir> <dist> <spec> <view> [y0 y1]: per-variant luma stats in a band, and where the AO / the cavity
darken (pixels whose luma drops by > 15 %)."""
import sys, os
import numpy as np
from PIL import Image
D, dist, spec, view = sys.argv[1:5]
y0, y1 = (int(sys.argv[5]), int(sys.argv[6])) if len(sys.argv) > 6 else (0, 900)
def L(v):
    a = np.asarray(Image.open(f'{D}/{dist}/{spec}/{os.environ.get("MAP","verdant")}/{view}-{v}.png').convert('RGB'), dtype=np.float32)[y0:y1]
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
f, n, c = L('full'), L('noao'), L('nocav')
def pct(x): return ' '.join(f'{np.percentile(x, p):5.1f}' for p in (1, 5, 25, 50))
print(f'{dist} {spec} {view} rows {y0}-{y1}: luma p1 p5 p25 p50')
print('  full ', pct(f)); print('  noao ', pct(n)); print('  nocav', pct(c))
ao = (f < 0.85 * n) & (n > 4); cav = (n < 0.85 * c) & (c > 4)
print(f'  AO darkens {ao.sum()} px (median ratio {np.median(f[ao] / n[ao]) if ao.any() else 1:.2f}); cavity darkens {cav.sum()} px (median ratio {np.median(n[cav] / c[cav]) if cav.any() else 1:.2f})')
dark = f < 12
print(f'  near-black (<12) px: full {int(dark.sum())}, noao {int((n < 12).sum())}, nocav {int((c < 12).sum())}')
