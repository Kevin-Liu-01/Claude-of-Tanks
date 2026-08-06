# TEMP (leo2_revolution r19 tone-round re-cert critic): pixel diff between
# the preserved r18 critic pairs (ce7f3824, ratified) and MY fresh pairs at
# b53a16f8. numpy port of tools/tmp-leo-tonediff.py (t>4), per-view bbox +
# ref-half leak check (pair frame: REFERENCE left half, PROCEDURAL right).
import sys, os
import numpy as np
from PIL import Image

before = sys.argv[1]
after = sys.argv[2]
t = int(sys.argv[3]) if len(sys.argv) > 3 else 4
names = sorted(n for n in os.listdir(before) if n.endswith('.png'))
total = 0
for n in names:
    a = np.asarray(Image.open(os.path.join(before, n)).convert('RGB'), dtype=np.int16)
    b = np.asarray(Image.open(os.path.join(after, n)).convert('RGB'), dtype=np.int16)
    if a.shape != b.shape:
        print(f'{n}: SIZE MISMATCH {a.shape} vs {b.shape}')
        continue
    m = (np.abs(a - b) > t).any(axis=2)
    nch = int(m.sum())
    total += nch
    w = a.shape[1]
    half = w // 2
    refleak = int(m[:, :half].sum())
    if nch:
        ys, xs = np.where(m)
        print(f'{n}: {nch} px (t>{t}) bbox x{xs.min()}..{xs.max()} y{ys.min()}..{ys.max()} | ref-half px {refleak}')
    else:
        print(f'{n}: identical (t>{t})')
print(f'TOTAL: {total} px across {len(names)} views')
