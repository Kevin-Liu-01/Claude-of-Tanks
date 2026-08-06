#!/usr/bin/env python3
# leo2a5 r5 critic — zoom crops from the official pairs (diagnosis-only)
import sys, os
from PIL import Image

SHOTS = '/Users/kevinliu/claude-of-tanks/shots/critic-leo2a5'
OUT = '/private/tmp/claude-501/-Users-kevinliu-claude-of-tanks/d0226c73-49ae-490e-9a35-39379da35769/scratchpad/crops'
os.makedirs(OUT, exist_ok=True)

# name: (view, ref_box, proc_box, zoom)  boxes in FULL-frame coords (1280x640)
CROPS = {
    'stern-left':      ('view-left', (40, 270, 175, 410), (680, 270, 815, 410), 3),
    'rear-louvres':    ('view-rear', (120, 290, 520, 480), (760, 290, 1160, 480), 2),
    'front-trackL':    ('view-front', (50, 370, 190, 550), (690, 370, 830, 550), 2),
    'front-glacis':    ('view-front', (180, 315, 460, 385), (820, 315, 1100, 385), 2),
    'roof-furniture':  ('close-roof', (380, 170, 640, 420), (1020, 170, 1280, 420), 2),
    'roof-launcher':   ('close-roof', (540, 300, 640, 420), (660, 300, 760, 420), 3),
    'under-bustle':    ('hero-rearright', (380, 270, 640, 430), (1020, 270, 1280, 430), 2),
    'wheels-left':     ('view-left', (100, 330, 320, 410), (740, 330, 960, 410), 2),
    'hero-fl-glacis':  ('hero-frontleft', (330, 290, 620, 440), (970, 290, 1260, 440), 2),
    'rear-roofmg':     ('view-rear', (120, 115, 320, 185), (760, 115, 960, 185), 3),
    'hero-rr-voidzone':('hero-rearright', (700, 200, 900, 320), (700, 200, 900, 320), 3),
    'front-mantlet':   ('view-front', (240, 200, 440, 330), (880, 200, 1080, 330), 2),
}

for name, (view, rb, pb, z) in CROPS.items():
    im = Image.open(f'{SHOTS}/{view}.png').convert('RGB')
    ref = im.crop(rb); proc = im.crop(pb)
    rw, rh = ref.size; pw, ph = proc.size
    ref = ref.resize((rw*z, rh*z), Image.NEAREST)
    proc = proc.resize((pw*z, ph*z), Image.NEAREST)
    w = ref.width + proc.width + 8; h = max(ref.height, proc.height)
    canvas = Image.new('RGB', (w, h), (24, 27, 32))
    canvas.paste(ref, (0, 0)); canvas.paste(proc, (ref.width + 8, 0))
    canvas.save(f'{OUT}/{name}.png')
    print('saved', name, canvas.size)
