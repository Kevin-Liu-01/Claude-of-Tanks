# TEMP (leo2_revolution r19 re-cert critic): decompose r18->r19 pair diffs
# per half (REF x0..639 = batch-43 excision, PROC x640..1279 = r19 tone) and
# write red-overlay PNGs of changed pixels for visual attribution.
import sys, os
import numpy as np
from PIL import Image

before, after, outdir = sys.argv[1], sys.argv[2], sys.argv[3]
t = 4
os.makedirs(outdir, exist_ok=True)
names = sorted(n for n in os.listdir(before) if n.endswith('.png'))
for n in names:
    a = np.asarray(Image.open(os.path.join(before, n)).convert('RGB'), dtype=np.int16)
    b = np.asarray(Image.open(os.path.join(after, n)).convert('RGB'), dtype=np.int16)
    m = (np.abs(a - b) > t).any(axis=2)
    half = a.shape[1] // 2
    for side, sl in (('REF', np.s_[:, :half]), ('PROC', np.s_[:, half:])):
        mm = m[sl]
        cnt = int(mm.sum())
        if cnt:
            ys, xs = np.where(mm)
            x0 = 0 if side == 'REF' else half
            # y-row clusters: contiguous y bands with >0 changed px
            rows = np.where(mm.any(axis=1))[0]
            gaps = np.where(np.diff(rows) > 6)[0]
            bands = np.split(rows, gaps + 1)
            bstr = ' '.join(f'y{bd[0]}..{bd[-1]}({int(mm[bd[0]:bd[-1]+1].sum())})' for bd in bands[:6])
            print(f'{n} {side}: {cnt}px x{x0+xs.min()}..{x0+xs.max()} bands: {bstr}')
        else:
            print(f'{n} {side}: 0px')
    ov = np.asarray(Image.open(os.path.join(after, n)).convert('RGB')).copy()
    ov[m] = [255, 40, 40]
    Image.fromarray(ov).save(os.path.join(outdir, n.replace('.png', '-diffov.png')))
print('overlays ->', outdir)
