# recert merkava3b r12: probe each enclosed-bg cluster — zoomed crop + pixel stats
from PIL import Image
import os
SRC = '/Users/kevinliu/claude-of-tanks/shots/critic-merkava3b'
OUT = '/Users/kevinliu/claude-of-tanks/shots/critic-merkava3b/crops'
os.makedirs(OUT, exist_ok=True)

CL = [
    ('close-front', (796, 248, 827, 257), 'A-closefront-gun-deck'),
    ('view-left',   (748, 315, 775, 322), 'B-left-rackband'),
    ('view-right',  (1144, 315, 1172, 322), 'C-right-rackband'),
    ('hero-toptilt', (1099, 522, 1221, 618), 'D-toptilt-chain'),
    ('view-rearright', (779, 365, 784, 370), 'E-rearright-midhull'),
    ('view-front',  (735, 410, 742, 430), 'F-front-trackedge'),
    ('view-left',   (882, 274, 919, 278), 'G-left-bustleslot'),
    ('view-top',    (898, 50, 1022, 55), 'H-top-muzzle'),
    ('hero-rearright', (1188, 422, 1274, 470), 'I-herorr-basket'),
]
for view, (x0, y0, x1, y1), name in CL:
    im = Image.open(f'{SRC}/{view}.png').convert('RGB')
    px = im.load()
    vals = [px[x, y] for x in range(x0, x1) for y in range(y0, y1)]
    rs = sorted(v[0] for v in vals); gs = sorted(v[1] for v in vals); bs = sorted(v[2] for v in vals)
    n = len(vals)
    print(f'{name:24s} {view:14s} rect=({x0},{y0},{x1},{y1}) n={n} '
          f'R[{rs[0]}..{rs[-1]}] G[{gs[0]}..{gs[-1]}] B[{bs[0]}..{bs[-1]}] med=({rs[n//2]},{gs[n//2]},{bs[n//2]})')
    # zoomed context crop (margin 30px, 8x)
    m = 30
    c = im.crop((max(0, x0 - m), max(0, y0 - m), min(im.width, x1 + m), min(im.height, y1 + m)))
    s = 8 if (x1 - x0) < 40 else 4
    c = c.resize((c.width * s, c.height * s), Image.NEAREST)
    c.save(f'{OUT}/{name}.png')
