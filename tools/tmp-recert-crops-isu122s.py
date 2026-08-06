#!/usr/bin/env python3
# Re-cert zoom crops for isu122s containment round (critic rig pairs).
# Crops both panes of a critic pair at zoom for changed-region inspection.
import sys
from PIL import Image

SRC = 'shots/critic-isu122s'
OUT = 'shots/critic-isu122s/crops'
import os
os.makedirs(OUT, exist_ok=True)

# (view, name, box(l,t,r,b), scale)
CROPS = [
    # front: bow wing bands + open track channel + furniture (proc pane right half)
    ('view-front', 'front-bow-full',     (652, 300, 1280, 560), 2),
    ('view-front', 'front-bow-left',     (680, 330, 900, 540),  3),
    ('view-front', 'front-bow-right',    (1030, 330, 1250, 540), 3),
    ('view-front', 'front-ref-bow',      (40, 330, 620, 560),   2),
    # close-front: furniture shelf + channel
    ('close-front', 'closefront-proc',   (640, 0, 1280, 640),   1),
    ('close-front', 'closefront-bowdeck',(760, 300, 1180, 560), 2),
    ('close-front', 'closefront-ref',    (0, 0, 640, 640),      1),
    # left/right: flange line + L-splits + lane
    ('view-left',  'left-bowwrap',       (960, 260, 1270, 520), 3),
    ('view-left',  'left-sternwrap',     (660, 260, 960, 520),  3),
    ('view-right', 'right-bowwrap',      (660, 260, 970, 520),  3),
    ('view-right', 'right-sternwrap',    (960, 260, 1270, 520), 3),
    # rear: AO clip zone + stern channel
    ('view-rear',  'rear-full',          (652, 120, 1280, 580), 1.5),
    ('view-rear',  'rear-ref',           (20, 120, 640, 580),   1.5),
    ('view-rear',  'rear-lane-left',     (680, 330, 900, 560),  3),
    ('view-rear',  'rear-lane-right',    (1030, 330, 1250, 560), 3),
    # top: channel plan + AO strip span
    ('view-top',   'top-proc',           (652, 40, 1280, 620),  1.5),
    ('view-top',   'top-bowchannel',     (860, 40, 1120, 260),  3),
    ('view-top',   'top-ref',            (20, 40, 640, 620),    1.5),
]

for view, name, box, sc in CROPS:
    im = Image.open(f'{SRC}/{view}.png').convert('RGB')
    c = im.crop(box)
    c = c.resize((int(c.width * sc), int(c.height * sc)), Image.NEAREST)
    c.save(f'{OUT}/{name}.png')
    print(name, c.size)
