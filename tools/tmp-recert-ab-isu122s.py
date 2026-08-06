#!/usr/bin/env python3
# A/B crops: graduation baseline (top) vs containment (bottom) for a region.
from PIL import Image
import os
BASE = '/private/tmp/claude-501/-Users-kevinliu-claude-of-tanks/d0226c73-49ae-490e-9a35-39379da35769/scratchpad/isu122s-head/shots/critic-isu122s'
CUR = 'shots/critic-isu122s'
OUT = 'shots/critic-isu122s/crops'
os.makedirs(OUT, exist_ok=True)

ABS = [
    # (view, box, scale, name)
    ('view-rear',  (690, 320, 1230, 540), 2,   'ab-rear-lanes'),
    ('view-front', (690, 250, 1230, 500), 2,   'ab-front-lanes'),
    ('view-top',   (840, 30, 1080, 130),  4,   'ab-top-bowtip'),
    ('view-top',   (860, 350, 1050, 430), 4,   'ab-top-midrear'),
    ('close-front',(740, 270, 1010, 430), 3,   'ab-closefront-shelf'),
    ('hero-toptilt',(1020, 440, 1260, 630), 3, 'ab-toptilt-bow'),
    ('hero-rearright',(1100, 330, 1280, 500), 3,'ab-herorr-stern'),
    ('view-left',  (660, 280, 760, 400),  5,   'ab-left-bowtip'),
    ('view-right', (1160, 280, 1260, 400), 5,  'ab-right-bowtip'),
]
for view, box, sc, name in ABS:
    a = Image.open(f'{BASE}/{view}.png').convert('RGB').crop(box)
    b = Image.open(f'{CUR}/{view}.png').convert('RGB').crop(box)
    w, h = int(a.width * sc), int(a.height * sc)
    a = a.resize((w, h), Image.NEAREST); b = b.resize((w, h), Image.NEAREST)
    canvas = Image.new('RGB', (w, h * 2 + 8), (255, 0, 0))
    canvas.paste(a, (0, 0)); canvas.paste(b, (0, h + 8))
    canvas.save(f'{OUT}/{name}.png')
    print(name, canvas.size)
