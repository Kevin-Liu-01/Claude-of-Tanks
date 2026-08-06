#!/usr/bin/env python3
# leo2a5 r9 diagnosis crops (diagnosis-only, never verdict evidence)
import sys
from PIL import Image

SHOTS = '/Users/kevinliu/claude-of-tanks/shots/critic-leo2a5'
OUT = '/Users/kevinliu/claude-of-tanks/shots/leopard-r10/crops'
import os
os.makedirs(OUT, exist_ok=True)

# name, view, half(ref|proc|both), x0,y0,x1,y1 (half coords), zoom
CROPS = [
    ('left-turret',   'view-left', 'both', 230, 220, 480, 310, 3),
    ('right-turret',  'view-right','both', 160, 220, 410, 310, 3),
    ('hero-rr-crown', 'hero-rearright', 'both', 400, 270, 640, 400, 3),
    ('close-tiers',   'close-front', 'both', 150, 100, 520, 310, 2),
    ('close-roof-shroud', 'close-roof', 'both', 150, 150, 560, 420, 2),
    ('glacis',        'view-front', 'both', 200, 320, 440, 380, 3),
    ('louvre',        'view-rear', 'both', 100, 300, 540, 380, 2),
    ('wheels-left',   'view-left', 'both', 90, 330, 560, 410, 3),
    ('launcher-fl',   'view-frontleft', 'both', 240, 200, 460, 320, 3),
    ('launcher-fr',   'view-frontright', 'both', 180, 200, 400, 320, 3),
]

only = sys.argv[1:] if len(sys.argv) > 1 else None
for name, view, which, x0, y0, x1, y1, z in CROPS:
    if only and name not in only: continue
    img = Image.open(f'{SHOTS}/{view}.png').convert('RGB')
    for half, dx in (('ref', 0), ('proc', 640)):
        if which != 'both' and which != half: continue
        c = img.crop((x0 + dx, y0, x1 + dx, y1))
        c = c.resize((c.width * z, c.height * z), Image.NEAREST)
        c.save(f'{OUT}/{name}-{half}.png')
        print(f'saved {name}-{half}.png ({c.width}x{c.height})')

# appended r9-b: shroud + right-side winding checks
EXTRA = [
    ('right-turret2', 'view-right', 'both', 160, 215, 420, 300, 3),
    ('close-roof-emes', 'close-roof', 'both', 240, 210, 500, 380, 2),
]
for name, view, which, x0, y0, x1, y1, z in EXTRA:
    if only and name not in only: continue
    img = Image.open(f'{SHOTS}/{view}.png').convert('RGB')
    for half, dx in (('ref', 0), ('proc', 640)):
        c = img.crop((x0 + dx, y0, x1 + dx, y1))
        c = c.resize((c.width * z, c.height * z), Image.NEAREST)
        c.save(f'{OUT}/{name}-{half}.png')
        print(f'saved {name}-{half}.png')
