#!/usr/bin/env python3
# Second batch of A/B crops (baseline top / containment bottom).
from PIL import Image
import os
BASE = '/private/tmp/claude-501/-Users-kevinliu-claude-of-tanks/d0226c73-49ae-490e-9a35-39379da35769/scratchpad/isu122s-head/shots/critic-isu122s'
CUR = 'shots/critic-isu122s'
OUT = 'shots/critic-isu122s/crops'
os.makedirs(OUT, exist_ok=True)
ABS = [
    ('view-rear',  (690, 330, 900, 560), 4, 'ab2-rear-lane-left'),
    ('view-rear',  (1030, 330, 1240, 560), 4, 'ab2-rear-lane-right'),
    ('view-front', (700, 260, 920, 490), 4, 'ab2-front-lane-left'),
    ('view-front', (1010, 260, 1230, 490), 4, 'ab2-front-lane-right'),
    ('view-frontright', (1180, 290, 1240, 380), 8, 'ab2-fr-flange'),
    ('view-rearright', (1060, 300, 1240, 400), 5, 'ab2-rr-lane'),
    ('close-roof', (830, 300, 1000, 560), 3, 'ab2-closeroof-bow'),
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
