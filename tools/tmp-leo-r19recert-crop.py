# TEMP (leo2_revolution r19 re-cert critic): before/after crop stacks at 4x
# (r18 pair on top, r19 pair below, thin divider) for the P-R1/P-R2 tells.
# Pair frame: proc half x>=640.
import os
import numpy as np
from PIL import Image

BEFORE = '/private/tmp/claude-501/-Users-kevinliu-claude-of-tanks/d0226c73-49ae-490e-9a35-39379da35769/scratchpad/r18-critic-pairs'
AFTER = '/Users/kevinliu/claude-of-tanks/shots/critic-leo2_revolution'
OUT = '/private/tmp/claude-501/-Users-kevinliu-claude-of-tanks/d0226c73-49ae-490e-9a35-39379da35769/scratchpad/crops-r19'
os.makedirs(OUT, exist_ok=True)

ZONES = [
    ('close-front.png', 640, 250, 940, 345, 4, 'closefront-fillrecess'),
    ('close-front.png', 780, 190, 940, 240, 6, 'closefront-seoss'),
    ('view-frontleft.png', 780, 270, 1040, 315, 5, 'frontleft-forefill'),
    ('view-frontleft.png', 790, 235, 900, 265, 6, 'frontleft-seoss'),
    ('view-rear.png', 770, 250, 1150, 325, 3, 'rear-aftband'),
    ('view-rear.png', 1020, 150, 1120, 185, 6, 'rear-seoss'),
    ('view-left.png', 770, 283, 1050, 315, 4, 'left-band'),
    ('view-right.png', 870, 283, 1150, 315, 4, 'right-band'),
    ('view-top.png', 880, 185, 950, 235, 6, 'top-seoss'),
    ('view-front.png', 800, 105, 900, 160, 6, 'front-seoss'),
    ('view-front.png', 740, 240, 1160, 305, 3, 'front-pockets'),
    ('hero-rearright.png', 880, 320, 1130, 365, 4, 'herorr-underrack'),
    ('hero-frontleft.png', 800, 210, 1050, 250, 5, 'herofl-seoss'),
    ('hero-toptilt.png', 1040, 305, 1130, 375, 5, 'toptilt-band'),
    ('close-roof.png', 850, 165, 1230, 240, 3, 'closeroof-farband'),
    ('close-roof.png', 640, 360, 900, 420, 4, 'closeroof-lowband'),
]

for img, x0, y0, x1, y1, mag, name in ZONES:
    b = Image.open(f'{BEFORE}/{img}').convert('RGB').crop((x0, y0, x1, y1))
    a = Image.open(f'{AFTER}/{img}').convert('RGB').crop((x0, y0, x1, y1))
    w, h = b.size
    b = b.resize((w * mag, h * mag), Image.NEAREST)
    a = a.resize((w * mag, h * mag), Image.NEAREST)
    stack = Image.new('RGB', (w * mag, h * mag * 2 + 6), (255, 200, 40))
    stack.paste(b, (0, 0))
    stack.paste(a, (0, h * mag + 6))
    stack.save(f'{OUT}/{name}.png')
    print(f'{name}.png {w*mag}x{h*mag*2+6} (r18 top / r19 bottom, {mag}x)')
