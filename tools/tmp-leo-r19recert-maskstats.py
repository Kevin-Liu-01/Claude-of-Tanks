# TEMP (leo2_revolution r19 re-cert critic): luma stats ON the changed-pixel
# mask (PROC half only), before vs after — the builder's methodology
# re-derived on MY pair frame. Also splits the mask into the SEOSS band vs
# ring band by y-cluster for per-zone deltas.
import sys
import numpy as np
from PIL import Image

BEFORE, AFTER = sys.argv[1], sys.argv[2]
T = 4

def luma(a):
    return 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]

views = ['view-front', 'view-frontleft', 'view-left', 'view-rearleft',
         'view-rear', 'view-rearright', 'view-right', 'view-frontright',
         'view-top', 'hero-frontleft', 'hero-rearright', 'hero-toptilt',
         'close-front', 'close-roof']
for v in views:
    b = np.asarray(Image.open(f'{BEFORE}/{v}.png').convert('RGB'), dtype=np.int16)
    a = np.asarray(Image.open(f'{AFTER}/{v}.png').convert('RGB'), dtype=np.int16)
    m = (np.abs(b - a) > T).any(axis=2)
    m[:, :640] = False  # PROC half only
    if not m.any():
        print(f'{v}: no proc changes')
        continue
    lb, la = luma(b.astype(np.float64)), luma(a.astype(np.float64))
    rows = np.where(m.any(axis=1))[0]
    gaps = np.where(np.diff(rows) > 12)[0]
    bands = np.split(rows, gaps + 1)
    print(f'{v}: {int(m.sum())}px changed')
    for bd in bands:
        bm = m.copy()
        bm[:bd[0], :] = False
        bm[bd[-1] + 1:, :] = False
        if bm.sum() < 30:
            continue
        pb, pa = lb[bm], la[bm]
        print(f'   band y{bd[0]}..{bd[-1]} ({int(bm.sum())}px): '
              f'med {np.median(pb):.1f}->{np.median(pa):.1f} '
              f'p10 {np.percentile(pb,10):.1f}->{np.percentile(pa,10):.1f} '
              f'p90 {np.percentile(pb,90):.1f}->{np.percentile(pa,90):.1f} '
              f'sd {pb.std():.1f}->{pa.std():.1f}')
