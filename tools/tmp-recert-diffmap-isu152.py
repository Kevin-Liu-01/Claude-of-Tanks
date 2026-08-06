# TEMP recert critic (isu152 contain1): map the r6->contain1 pixel-change
# footprint per view. For each of the 14 critic views, diff the graduation
# archive (shots/isu152-r6) against my fresh renders (shots/critic-isu152),
# report changed-pixel count, bbox, and the row/col extent of dense change,
# and save an amplified diff heat PNG for eyeballing.
# Usage: python3 tools/tmp-recert-diffmap-isu152.py
import os
from PIL import Image, ImageChops

OLD = 'shots/isu152-r6'
NEW = 'shots/critic-isu152'
OUT = 'shots/critic-isu152/recert-diff'
os.makedirs(OUT, exist_ok=True)
VIEWS = ['view-front', 'view-frontleft', 'view-left', 'view-rearleft', 'view-rear',
         'view-rearright', 'view-right', 'view-frontright', 'view-top',
         'hero-frontleft', 'hero-rearright', 'hero-toptilt', 'close-front', 'close-roof']
THR = 8  # per-channel delta that counts as "changed" (over AA jitter)

for v in VIEWS:
    a = Image.open(f'{OLD}/{v}.png').convert('RGB')
    b = Image.open(f'{NEW}/{v}.png').convert('RGB')
    if a.size != b.size:
        print(f'{v}: SIZE MISMATCH {a.size} vs {b.size}')
        continue
    d = ImageChops.difference(a, b)
    g = d.convert('L')
    m = g.point(lambda p: 255 if p >= THR else 0)
    bbox = m.getbbox()
    n = sum(1 for p in m.getdata() if p)
    W, H = a.size
    # column/row histograms of changed px (coarse, 16-bin)
    px = m.load()
    colh = [0] * 16
    rowh = [0] * 16
    if bbox:
        for y in range(0, H, 2):
            for x in range(0, W, 2):
                if px[x, y]:
                    colh[x * 16 // W] += 1
                    rowh[y * 16 // H] += 1
    # amplified heat overlay: new render dimmed + changed px in red
    heat = b.point(lambda p: p // 3)
    red = Image.new('RGB', a.size, (255, 48, 48))
    heat.paste(red, (0, 0), m)
    heat.save(f'{OUT}/{v}-diff.png')
    print(f'{v}: changed {n}px ({100.0*n/(W*H):.2f}%) bbox={bbox} size={W}x{H}')
    print(f'   col16={colh}')
    print(f'   row16={rowh}')
