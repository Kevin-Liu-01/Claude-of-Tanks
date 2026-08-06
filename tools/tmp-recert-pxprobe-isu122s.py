#!/usr/bin/env python3
# Sample pixel values + zoomed context crops around flagged enclosed-bg clusters.
from PIL import Image
import os
OUT = 'shots/critic-isu122s/crops'
os.makedirs(OUT, exist_ok=True)

PROBES = [
    # (view, cx0, cy0, cx1, cy1, name) — cluster bbox; crop pads 30px, 8x zoom
    ('view-front',  1209, 232, 1210, 236, 'probe-front-y232-right'),
    ('view-front',  709,  232, 710,  236, 'probe-front-y232-left'),
    ('view-left',   871,  368, 874,  371, 'probe-left-y368'),
    ('view-right',  1045, 368, 1048, 371, 'probe-right-y368'),
    ('view-top',    1030, 155, 1036, 159, 'probe-top-y155'),
    ('view-top',    1005, 389, 1006, 398, 'probe-top-y389'),
    ('close-front', 698,  410, 705,  415, 'probe-closefront-y410'),
    ('close-front', 645,  402, 656,  407, 'probe-closefront-y402'),
    ('hero-toptilt',1004, 492, 1013, 501, 'probe-toptilt-y492'),
    ('hero-toptilt',1149, 393, 1157, 399, 'probe-toptilt-y393'),
    ('hero-toptilt',840,  300, 845,  306, 'probe-toptilt-y300'),
    ('hero-rearright',1067,441,1072, 449, 'probe-herorr-y441'),
]
for view, x0, y0, x1, y1, name in PROBES:
    im = Image.open(f'shots/critic-isu122s/{view}.png').convert('RGB')
    px = im.load()
    vals = []
    for j in range(y0, min(y1 + 1, im.height)):
        for i in range(x0, min(x1 + 1, im.width)):
            vals.append(px[i, j])
    med = sorted(vals)[len(vals) // 2]
    l, t, r, b = max(x0 - 30, 640), max(y0 - 30, 0), min(x1 + 30, 1280), min(y1 + 30, 640)
    c = im.crop((l, t, r, b)).resize(((r - l) * 8, (b - t) * 8), Image.NEAREST)
    c.save(f'{OUT}/{name}.png')
    print(f'{name}: cluster med RGB {med} nvals {len(vals)} crop ({l},{t})-({r},{b})')
