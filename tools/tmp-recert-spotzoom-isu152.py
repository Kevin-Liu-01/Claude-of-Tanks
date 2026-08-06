# TEMP recert critic (isu152 contain1): 8x spot zooms of the enclosed-bg
# clusters that are new or biggest, straight from the fresh renders, with
# the cluster rect outlined. Usage: python3 tools/tmp-recert-spotzoom-isu152.py
import os
from PIL import Image, ImageDraw

NEW = 'shots/critic-isu152'
OUT = 'shots/critic-isu152/recert-crops'
os.makedirs(OUT, exist_ok=True)
SPOTS = [
    ('close-front',  (783, 415, 807, 426), 'encl-140px'),
    ('close-front',  (756, 433, 771, 441), 'encl-52px'),
    ('hero-toptilt', (1118, 599, 1122, 603), 'encl-8px-a'),
    ('hero-toptilt', (1199, 537, 1204, 543), 'encl-8px-b'),
    ('view-rear',    (866, 146, 887, 147), 'encl-21px-y146'),
    ('view-front',   (722, 446, 726, 449), 'encl-5px'),
]
Z = 8
PAD = 28
for view, r, tag in SPOTS:
    im = Image.open(f'{NEW}/{view}.png').convert('RGB')
    rect = (max(0, r[0]-PAD), max(0, r[1]-PAD), min(im.width, r[2]+PAD), min(im.height, r[3]+PAD))
    c = im.crop(rect).resize(((rect[2]-rect[0])*Z, (rect[3]-rect[1])*Z), Image.NEAREST)
    d = ImageDraw.Draw(c)
    d.rectangle(((r[0]-rect[0])*Z, (r[1]-rect[1])*Z, (r[2]-rect[0])*Z-1, (r[3]-rect[1])*Z-1), outline=(255, 60, 60))
    c.save(f'{OUT}/spot-{view}-{tag}.png')
    print(f'spot-{view}-{tag}.png {c.size}')
