# TEMP (leopard r19 tone round): per-view pixel diff between two shot dirs.
# Usage: python3 tools/tmp-leo-tonediff.py <beforeDir> <afterDir> [t]
import sys, os
from PIL import Image

before, after = sys.argv[1], sys.argv[2]
t = int(sys.argv[3]) if len(sys.argv) > 3 else 4
names = sorted(n for n in os.listdir(before) if n.endswith('.png'))
total = 0
for n in names:
    pa = os.path.join(before, n)
    pb = os.path.join(after, n)
    if not os.path.exists(pb):
        print(f"{n}: MISSING in after")
        continue
    a = Image.open(pa).convert('RGB')
    b = Image.open(pb).convert('RGB')
    if a.size != b.size:
        print(f"{n}: size mismatch")
        continue
    da, db = a.tobytes(), b.tobytes()
    n_ch = 0
    xs, ys = [], []
    w = a.size[0]
    for i in range(0, len(da), 3):
        if abs(da[i]-db[i]) > t or abs(da[i+1]-db[i+1]) > t or abs(da[i+2]-db[i+2]) > t:
            n_ch += 1
            p = i // 3
            xs.append(p % w)
            ys.append(p // w)
    total += n_ch
    if n_ch:
        print(f"{n}: {n_ch} px changed (t>{t})  bbox x{min(xs)}..{max(xs)} y{min(ys)}..{max(ys)}")
    else:
        print(f"{n}: identical (t>{t})")
print(f"TOTAL: {total} px changed across {len(names)} views")
