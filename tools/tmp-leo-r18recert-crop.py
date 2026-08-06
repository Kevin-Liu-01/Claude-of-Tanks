# TEMP (leo2_revolution r18 re-cert critic): turret-region crops from MY
# fresh official pairs (shots/critic-leo2_revolution/), 2x/4x, PROC half
# + matching REF half where useful. Diagnosis-only; outputs to scratchpad.
import os, sys
from PIL import Image

SRC = '/Users/kevinliu/claude-of-tanks/shots/critic-leo2_revolution'
OUT = '/private/tmp/claude-501/-Users-kevinliu-claude-of-tanks/d0226c73-49ae-490e-9a35-39379da35769/scratchpad/crops'
os.makedirs(OUT, exist_ok=True)

# name: (file, (x0,y0,x1,y1), scale)
JOBS = {
    # wedge facet planarity + prow line
    'front-wedge-2x':      ('view-front.png',      (680, 90, 1200, 340), 2),
    'front-wedge-4x':      ('view-front.png',      (740, 150, 1000, 310), 4),
    'closefront-wedge-2x': ('close-front.png',     (640, 140, 1280, 470), 2),
    'closefront-dark-4x':  ('close-front.png',     (640, 260, 960, 400), 4),
    'closeroof-hood-2x':   ('close-roof.png',      (640, 150, 1280, 640), 2),
    'closeroof-hood-4x':   ('close-roof.png',      (850, 250, 1150, 450), 4),
    # SEOSS / RWS / roof set
    'front-roof-4x':       ('view-front.png',      (940, 90, 1200, 200), 4),
    'rear-roof-4x':        ('view-rear.png',       (700, 150, 1200, 290), 2),
    'herofl-roof-4x':      ('hero-frontleft.png',  (780, 190, 1060, 300), 4),
    'toptilt-roof-2x':     ('hero-toptilt.png',    (660, 100, 1240, 460), 2),
    # panels + seams + ROSY
    'left-panel-2x':       ('view-left.png',       (660, 220, 1250, 340), 2),
    'left-panel-4x':       ('view-left.png',       (800, 240, 1080, 330), 4),
    'right-panel-2x':      ('view-right.png',      (660, 220, 1250, 340), 2),
    'herofl-panel-4x':     ('hero-frontleft.png',  (660, 250, 940, 400), 4),
    # bustle rack
    'rear-rack-2x':        ('view-rear.png',       (680, 130, 1240, 430), 2),
    'rearright-rack-4x':   ('view-rearright.png',  (900, 230, 1240, 340), 4),
    'herorr-rack-2x':      ('hero-rearright.png',  (660, 200, 1280, 470), 2),
    'herorr-rack-4x':      ('hero-rearright.png',  (940, 230, 1240, 400), 4),
    # ring band / fore-ring
    'left-ring-4x':        ('view-left.png',       (770, 280, 1050, 330), 4),
    'frontleft-ring-2x':   ('view-frontleft.png',  (680, 250, 1200, 360), 2),
    # top plan wedge
    'top-wedge-2x':        ('view-top.png',        (820, 250, 1100, 500), 2),
    # ref halves for hull-parity spot reads
    'ref-left-1x':         ('view-left.png',       (0, 200, 640, 420), 2),
    'ref-rear-1x':         ('view-rear.png',       (0, 130, 640, 560), 1),
}

for name, (f, box, scale) in JOBS.items():
    src = os.path.join(SRC, f)
    if not os.path.exists(src):
        print('missing', src)
        continue
    im = Image.open(src).crop(box)
    if scale > 1:
        im = im.resize((im.width * scale, im.height * scale), Image.LANCZOS)
    im.save(os.path.join(OUT, name + '.png'))
    print('wrote', name, im.size)
