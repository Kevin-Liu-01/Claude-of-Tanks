#!/usr/bin/env python3
# leo2a5 r6 critic — side-by-side ref|proc zoom crops from the official pairs
# (diagnosis-only per BUILD-STANDARD §D; verdict cites the official windows).
import os
from PIL import Image

base = '/Users/kevinliu/claude-of-tanks/shots/critic-leo2a5/'
out = base + 'crops-r6critic/'
os.makedirs(out, exist_ok=True)

# (view, name, box-on-ref-half (x0,y0,x1,y1 in 640-half coords), scale)
JOBS = [
    # driver A: gear grammar — flaps front/rear, disc, comb
    ('view-front',  'a-front-trackL',  (55, 380, 185, 545), 3),
    ('view-front',  'a-front-trackR',  (455, 380, 585, 545), 3),
    ('view-rear',   'a-rear-trackL',   (50, 460, 180, 570), 3),
    ('view-left',   'a-left-sprocket', (45, 300, 130, 375), 4),
    ('view-left',   'a-left-gearrun',  (100, 330, 540, 410), 2),
    ('view-rearleft','a-rl-gear',      (60, 300, 300, 420), 2),
    # driver B: rear plate — louvres, guard rings, MG diagonal from rear
    ('view-rear',   'b-rear-plate',    (95, 290, 545, 440), 2),
    ('view-rear',   'b-rear-lightL',   (150, 370, 240, 440), 4),
    ('view-rear',   'b-rear-lightR',   (400, 370, 490, 440), 4),
    ('view-rear',   'b-rear-bustle',   (150, 150, 490, 300), 2),
    ('hero-rearright','b-hrr-full',    (60, 120, 620, 460), 1),
    ('hero-rearright','b-hrr-bustle',  (380, 300, 630, 400), 3),
    # driver C: furniture — MG reads, PERI, launchers, mantlet, glacis
    ('close-roof',  'c-roof-full',     (0, 60, 640, 500), 1),
    ('close-roof',  'c-roof-mg',       (180, 100, 430, 300), 3),
    ('close-roof',  'c-roof-peri',     (380, 180, 560, 330), 3),
    ('view-top',    'c-top-turret',    (230, 220, 420, 470), 2),
    ('view-top',    'c-top-deckfans',  (235, 60, 410, 240), 3),
    ('view-front',  'c-front-turret',  (170, 170, 480, 330), 2),
    ('close-front', 'c-cf-mantlet',    (180, 100, 470, 330), 2),
    ('close-front', 'c-cf-glacis',     (100, 300, 560, 470), 1),
    ('view-left',   'c-left-mgzone',   (200, 190, 460, 300), 3),
    ('view-rear',   'c-rear-mgzone',   (200, 190, 440, 310), 3),
    # driver D/E: deck + stern frame
    ('hero-toptilt','e-tilt-deck',     (120, 120, 560, 460), 1),
    ('view-rearleft','d-rl-frame',     (40, 280, 200, 400), 3),
    # overall heros
    ('hero-frontleft','h-fl-full',     (40, 100, 620, 480), 1),
    ('view-frontleft','h-vfl-full',    (40, 140, 620, 460), 1),
    ('view-frontright','h-vfr-full',   (40, 140, 620, 460), 1),
    ('view-rearright','h-vrr-full',    (40, 140, 620, 460), 1),
    ('view-right',  'h-vr-full',       (20, 140, 630, 440), 1),
    ('view-left',   'h-vl-full',       (20, 140, 630, 440), 1),
    ('view-front',  'h-vf-full',       (60, 150, 600, 560), 1),
    ('view-rear',   'h-vre-full',      (60, 150, 600, 580), 1),
    ('view-top',    'h-vt-full',       (170, 30, 470, 610), 1),
]

for view, name, (x0, y0, x1, y1), s in JOBS:
    im = Image.open(base + view + '.png').convert('RGB')
    ref = im.crop((x0, y0, x1, y1))
    proc = im.crop((x0 + 640, y0, x1 + 640, y1))
    w, h = ref.size
    if s > 1:
        ref = ref.resize((w * s, h * s), Image.NEAREST)
        proc = proc.resize((w * s, h * s), Image.NEAREST)
        w, h = ref.size
    pair = Image.new('RGB', (w * 2 + 8, h), (40, 40, 40))
    pair.paste(ref, (0, 0)); pair.paste(proc, (w + 8, 0))
    pair.save(out + f'{name}.png')
    print(name, pair.size)
