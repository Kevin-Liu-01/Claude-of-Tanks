#!/usr/bin/env python3
# leo2a5 r6 critic — zoom crops from the official pairs (diagnosis-only)
import os
from PIL import Image

SHOTS = '/Users/kevinliu/claude-of-tanks/shots/critic-leo2a5'
OUT = '/private/tmp/claude-501/-Users-kevinliu-claude-of-tanks/d0226c73-49ae-490e-9a35-39379da35769/scratchpad/crops-r6'
os.makedirs(OUT, exist_ok=True)

# name: (view, ref_box, proc_box, zoom)  boxes in FULL-frame coords (1280x640)
CROPS = {
    # MG READ (mandatory order 3a)
    'mg-closeroof':    ('close-roof', (0, 280, 260, 480), (640, 280, 900, 480), 3),
    'mg-top':          ('view-top', (280, 400, 420, 480), (920, 400, 1060, 480), 4),
    'mg-rear-roof':    ('view-rear', (120, 110, 420, 200), (760, 110, 1060, 200), 3),
    'mg-left-turret':  ('view-left', (330, 230, 480, 300), (970, 230, 1120, 300), 3),
    # 1b disc
    'disc-left':       ('view-left', (660, 290, 800, 410), (660, 290, 800, 410), 4),
    'disc-ref-left':   ('view-left', (20, 290, 160, 410), (660, 290, 800, 410), 4),
    # 1a flaps
    'front-trackL':    ('view-front', (50, 370, 190, 550), (690, 370, 830, 550), 3),
    'rear-trackL':     ('view-rear', (50, 460, 180, 570), (690, 460, 820, 570), 3),
    'closefront-bow':  ('close-front', (0, 330, 300, 500), (640, 330, 940, 500), 2),
    # 2a/2b rear plate
    'rear-louvres':    ('view-rear', (120, 290, 520, 480), (760, 290, 1160, 480), 2),
    'rear-guardL':     ('view-rear', (150, 370, 240, 440), (790, 370, 880, 440), 4),
    # 3b/3c roof furniture
    'roof-furniture':  ('close-roof', (380, 170, 640, 420), (1020, 170, 1280, 420), 2),
    'roof-peri':       ('close-roof', (420, 180, 560, 300), (1060, 180, 1200, 300), 3),
    'roof-launcher':   ('close-roof', (540, 300, 640, 480), (1180, 300, 1280, 480), 3),
    'front-launcher':  ('view-front', (380, 170, 520, 280), (1020, 170, 1160, 280), 3),
    # 3d mantlet
    'closefront-mantlet': ('close-front', (240, 200, 500, 380), (880, 200, 1140, 380), 2),
    # 3e glacis
    'front-glacis':    ('view-front', (180, 315, 460, 395), (820, 315, 1100, 395), 2),
    'herofl-glacis':   ('hero-frontleft', (330, 290, 620, 460), (970, 290, 1260, 460), 2),
    # 4a fans / deck
    'herorr-fans':     ('hero-rearright', (380, 250, 640, 400), (1020, 250, 1280, 400), 2),
    'toptilt-deck':    ('hero-toptilt', (240, 330, 500, 500), (880, 330, 1140, 500), 2),
    # 2c under-bustle
    'under-bustle':    ('hero-rearright', (380, 270, 640, 430), (1020, 270, 1280, 430), 2),
    # toptilt void zone (right skirt gap, evaluator 6.3 m2 @ x1.40 z1.34)
    'toptilt-voidzone':('hero-toptilt', (250, 350, 450, 500), (890, 350, 1090, 500), 3),
    # wheels band (1c residual judge)
    'wheels-left':     ('view-left', (100, 330, 320, 410), (740, 330, 960, 410), 2),
}

for name, (view, rb, pb, z) in CROPS.items():
    im = Image.open(f'{SHOTS}/{view}.png').convert('RGB')
    ref = im.crop(rb); proc = im.crop(pb)
    ref = ref.resize((ref.width*z, ref.height*z), Image.NEAREST)
    proc = proc.resize((proc.width*z, proc.height*z), Image.NEAREST)
    w = ref.width + proc.width + 8; h = max(ref.height, proc.height)
    canvas = Image.new('RGB', (w, h), (24, 27, 32))
    canvas.paste(ref, (0, 0)); canvas.paste(proc, (ref.width + 8, 0))
    canvas.save(f'{OUT}/{name}.png')
    print('saved', name, canvas.size)
