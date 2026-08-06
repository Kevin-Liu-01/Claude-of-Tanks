#!/usr/bin/env python3
# TEMP r6 INDEPENDENT CRITIC: zoom-verification crops of the FRESH official
# critic renders (no re-rendering — reads shots/critic-chieftain5/*.png only).
# Each output is a side-by-side ref|proc crop at 2x nearest for eyeball reads.
import sys
from PIL import Image

base = 'shots/critic-chieftain5/'
out = 'shots/critic-chieftain5/crops-r6critic/'
import os
os.makedirs(out, exist_ok=True)

# (view, name, ref box, proc box, scale) — boxes are (x0,y0,x1,y1) on the 1280x640 pair
JOBS = [
    # front: turret cheek band + collar + corners
    ('view-front', 'front-turret',   (60, 140, 620, 340),  (700, 140, 1260, 340), 2),
    # frontleft: cheek facets + crown + hem/wheels
    ('view-frontleft', 'fl-turret',  (100, 220, 460, 340), (740, 220, 1100, 340), 3),
    ('view-frontleft', 'fl-gear',    (40, 330, 480, 420),  (680, 330, 1120, 420), 3),
    # left: full run — hem + wheels + gun line
    ('view-left', 'left-gear',      (40, 320, 500, 420),  (680, 320, 1140, 420), 3),
    ('view-left', 'left-gunline',   (280, 240, 640, 300), (920, 240, 1280, 300), 3),
    ('view-left', 'left-turret',    (140, 150, 470, 290), (780, 150, 1110, 290), 3),
    # rearleft: ex-tab zone + sprocket
    ('view-rearleft', 'rl-gear',    (120, 320, 520, 430), (760, 320, 1160, 430), 3),
    ('view-rearleft', 'rl-turret',  (100, 150, 460, 320), (740, 150, 1100, 320), 3),
    # rear: bustle + duffels + corners
    ('view-rear', 'rear-bustle',    (100, 140, 580, 320), (740, 140, 1220, 320), 2),
    # rearright: bins wall + tier end
    ('view-rearright', 'rr-turret', (150, 140, 540, 330), (790, 140, 1180, 330), 2),
    # right: sleeve step + flank
    ('view-right', 'right-gun',     (0, 230, 400, 310),   (640, 230, 1040, 310), 3),
    ('view-right', 'right-flank',   (100, 280, 600, 420), (740, 280, 1240, 420), 2),
    # frontright: cheek + collar
    ('view-frontright', 'fr-turret',(160, 210, 540, 350), (800, 210, 1180, 350), 3),
    # top: saucer + trays + moat
    ('view-top', 'top-turret',      (200, 180, 500, 480), (840, 180, 1140, 480), 2),
    # heroes
    ('hero-frontleft', 'hfl-turret',(120, 180, 520, 380), (760, 180, 1160, 380), 2),
    ('hero-rearright', 'hrr-turret',(120, 140, 560, 380), (760, 140, 1200, 380), 2),
    ('hero-toptilt', 'htt-crown',   (100, 120, 560, 420), (740, 120, 1200, 420), 2),
    # closes
    ('close-front', 'cf-collar',    (140, 120, 620, 420), (780, 120, 1260, 420), 1),
    ('close-roof', 'cr-crown',      (60, 100, 620, 460),  (700, 100, 1260, 460), 1),
    ('close-roof', 'cr-mg',         (240, 90, 500, 300),  (880, 90, 1140, 300), 2),
]

for view, name, rbox, pbox, s in JOBS:
    im = Image.open(base + view + '.png').convert('RGB')
    ref = im.crop(rbox)
    proc = im.crop(pbox)
    W = ref.width + proc.width + 8
    H = max(ref.height, proc.height)
    canvas = Image.new('RGB', (W, H), (20, 24, 30))
    canvas.paste(ref, (0, 0))
    canvas.paste(proc, (ref.width + 8, 0))
    canvas = canvas.resize((W * s, H * s), Image.NEAREST)
    canvas.save(out + f'{name}.png')
    print('saved', name, canvas.size)
