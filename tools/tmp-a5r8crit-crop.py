#!/usr/bin/env python3
# leo2a5 r8 critic — side-by-side ref|proc zoom crops from the official pairs
# (diagnosis-only per BUILD-STANDARD §D; verdict cites the official windows).
import os
from PIL import Image

base = '/Users/kevinliu/claude-of-tanks/shots/critic-leo2a5/'
out = base + 'crops-r8critic/'
os.makedirs(out, exist_ok=True)

# (view, name, box-on-ref-half (x0,y0,x1,y1 in 640-half coords), scale)
JOBS = [
    # r8 order 1a: stern boxes de-CAD (4 tones at 2x) + 2a camo bleed over louvre band
    ('view-rear',   'r8-rear-plate2x',  (95, 290, 545, 440), 2),
    ('view-rear',   'r8-rear-boxes',    (150, 250, 490, 340), 3),
    ('hero-rearright','r8-hrr-full',    (60, 120, 620, 460), 1),
    ('hero-rearright','r8-hrr-bustle',  (380, 300, 630, 400), 3),
    ('hero-rearright','r8-hrr-rack2x',  (300, 220, 630, 400), 2),
    # r8 order 1c/1d: comb quiet + disc crescent
    ('view-left',   'r8-left-sprocket', (45, 300, 130, 375), 4),
    ('view-left',   'r8-left-gearrun',  (100, 330, 540, 410), 2),
    ('view-rearleft','r8-rl-gear',      (60, 300, 300, 420), 2),
    ('view-rearleft','r8-rl-disc',      (50, 290, 170, 400), 4),
    ('view-front',  'r8-front-trackL',  (55, 380, 185, 545), 3),
    ('view-rear',   'r8-rear-cornerL',  (50, 460, 180, 570), 3),
    # r8 order 2b: cable X sweep
    ('view-rear',   'r8-rear-xcables',  (150, 330, 490, 440), 2),
    # r8 order 3a: MG receiver lump (top + rear at 2x)
    ('view-top',    'r8-top-mg2x',      (230, 220, 420, 470), 2),
    ('view-rear',   'r8-rear-mg2x',     (200, 190, 440, 310), 2),
    ('view-rear',   'r8-rear-mg3x',     (240, 200, 400, 300), 3),
    # r8 order 3b: launcher bristle from the quarters (2x done-gate)
    ('view-frontleft','r8-fl-launcher', (250, 200, 450, 330), 3),
    ('view-frontright','r8-fr-launcher',(190, 200, 390, 330), 3),
    # r8 order 3c: roof-stack shrouds at close-front
    ('close-front', 'r8-cf-roofstack',  (150, 120, 640, 280), 2),
    ('close-front', 'r8-cf-mantlet',    (180, 100, 470, 330), 2),
    ('close-front', 'r8-cf-glacis',     (100, 300, 560, 470), 1),
    ('close-front', 'r8-cf-slitzone',   (200, 170, 340, 260), 4),
    # r8 order 4a: fender chain speckle (top 2x fender zones)
    ('view-top',    'r8-top-fenderL',   (230, 380, 300, 560), 3),
    ('view-top',    'r8-top-fenderR',   (340, 380, 410, 560), 3),
    ('view-top',    'r8-top-deck',      (235, 60, 410, 240), 3),
    # 1b panel tint: flank fields
    ('view-left',   'r8-left-turret2x', (200, 230, 470, 310), 2),
    ('view-left',   'r8-left-hull2x',   (100, 290, 520, 360), 2),
    # overall 1x heros for scoring
    ('close-roof',  'r8-roof-full',     (0, 60, 640, 500), 1),
    ('close-roof',  'r8-roof-mg',       (180, 100, 430, 300), 3),
    ('close-roof',  'r8-roof-peri',     (380, 180, 560, 330), 3),
    ('hero-frontleft','r8-hfl-full',    (40, 100, 620, 480), 1),
    ('hero-toptilt','r8-tilt-deck',     (120, 120, 560, 460), 1),
    ('view-frontleft','r8-vfl-full',    (40, 140, 620, 460), 1),
    ('view-frontright','r8-vfr-full',   (40, 140, 620, 460), 1),
    ('view-rearleft','r8-vrl-full',     (40, 140, 620, 460), 1),
    ('view-rearright','r8-vrr-full',    (40, 140, 620, 460), 1),
    ('view-right',  'r8-vr-full',       (20, 140, 630, 440), 1),
    ('view-left',   'r8-vl-full',       (20, 140, 630, 440), 1),
    ('view-front',  'r8-vf-full',       (60, 150, 600, 560), 1),
    ('view-rear',   'r8-vre-full',      (60, 150, 600, 580), 1),
    ('view-top',    'r8-vt-full',       (170, 30, 470, 610), 1),
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
