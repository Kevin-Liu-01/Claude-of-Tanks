#!/usr/bin/env python3
# TEMP r5 critic: zoomed crops of critic pair renders for eyeball verification
from PIL import Image
import sys, os

base = 'shots/critic-chieftain5/'
out = 'shots/critic-chieftain5/crops/'
os.makedirs(out, exist_ok=True)

# (file, name, box, scale) — box in source px
JOBS = [
    # O1: left running gear, ref vs proc
    ('view-left.png', 'left-gear-ref', (40, 280, 460, 420), 3),
    ('view-left.png', 'left-gear-proc', (660, 280, 1080, 420), 3),
    # O3a: front turret crown, ref vs proc (tan plate zone)
    ('view-front.png', 'front-crown-ref', (240, 180, 420, 300), 4),
    ('view-front.png', 'front-crown-proc', (880, 180, 1060, 300), 4),
    # front full lower (belly V + corners)
    ('view-front.png', 'front-belly-ref', (180, 300, 480, 420), 3),
    ('view-front.png', 'front-belly-proc', (820, 300, 1120, 420), 3),
    # O2: rear corners
    ('view-rear.png', 'rear-ref', (100, 150, 480, 600), 2),
    ('view-rear.png', 'rear-proc', (740, 150, 1120, 600), 2),
    # rearleft sprocket
    ('view-rearleft.png', 'rearleft-sprocket-ref', (330, 300, 500, 440), 3),
    ('view-rearleft.png', 'rearleft-sprocket-proc', (970, 300, 1140, 440), 3),
    # close-front bow bay corners
    ('close-front.png', 'closefront-ref', (0, 100, 640, 640), 1.4),
    ('close-front.png', 'closefront-proc', (640, 100, 1280, 640), 1.4),
    # close-roof MG zone
    ('close-roof.png', 'closeroof-ref', (0, 60, 640, 640), 1.4),
    ('close-roof.png', 'closeroof-proc', (640, 60, 1280, 640), 1.4),
    # left chin / needle nose zone
    ('view-left.png', 'left-nose-ref', (300, 230, 620, 340), 3),
    ('view-left.png', 'left-nose-proc', (940, 230, 1260, 340), 3),
    # right gun sleeve
    ('view-right.png', 'right-gun-ref', (20, 250, 400, 330), 3),
    ('view-right.png', 'right-gun-proc', (660, 250, 1040, 330), 3),
    # top plan gun + deck
    ('view-top.png', 'top-ref', (100, 40, 540, 760), 1.2),
    ('view-top.png', 'top-proc', (740, 40, 1180, 760), 1.2),
]

for f, name, box, scale in JOBS:
    img = Image.open(base + f).convert('RGB')
    c = img.crop(box)
    c = c.resize((int(c.width * scale), int(c.height * scale)), Image.LANCZOS)
    c.save(out + name + '.png')
    print('saved', out + name + '.png', c.size)
