# TEMP recert critic (isu152 contain1): before/after zoom pairs of the
# changed regions. Top strip = r6 graduation archive, bottom = contain1
# fresh render, same rect, NEAREST upscale. Labels burned in.
# Usage: python3 tools/tmp-recert-crops-isu152.py
import os
from PIL import Image, ImageDraw

OLD = 'shots/isu152-r6'
NEW = 'shots/critic-isu152'
OUT = 'shots/critic-isu152/recert-crops'
os.makedirs(OUT, exist_ok=True)

# (view, rect(x0,y0,x1,y1), zoom, tag)
CROPS = [
    ('view-front',   (700, 255, 1230, 480), 2.4, 'bow-lanes-full'),
    ('view-front',   (700, 300, 860, 470), 4.0, 'bow-lane-L'),
    ('view-front',   (1060, 300, 1220, 470), 4.0, 'bow-lane-R'),
    ('close-front',  (790, 250, 1060, 430), 3.2, 'bow-close'),
    ('close-front',  (940, 300, 1060, 420), 5.0, 'flapfall-wrap'),
    ('view-rear',    (710, 330, 1210, 515), 2.0, 'tail-lanes-full'),
    ('view-rear',    (720, 340, 890, 510), 4.0, 'tail-lane-R'),
    ('view-rear',    (1040, 340, 1210, 510), 4.0, 'tail-lane-L'),
    ('view-rearleft',(690, 245, 1130, 390), 2.2, 'quarter-bow-drop'),
    ('view-rearleft',(940, 300, 1130, 390), 4.0, 'stern-wrap'),
    ('view-rearright',(790, 275, 1225, 390), 2.2, 'quarter'),
    ('view-rearright',(1090, 290, 1225, 390), 4.0, 'bow-far-corner'),
    ('view-left',    (680, 300, 1110, 385), 2.4, 'flank'),
    ('view-left',    (990, 300, 1110, 385), 5.0, 'bow-wrap-bracket'),
    ('view-right',   (815, 260, 1240, 380), 2.4, 'flank'),
    ('view-right',   (815, 290, 940, 380), 5.0, 'bow-wrap-bracket'),
    ('view-top',     (860, 40, 1060, 470), 1.6, 'plan'),
    ('view-top',     (880, 40, 1050, 130), 4.0, 'plan-bow'),
    ('close-roof',   (690, 350, 900, 560), 3.0, 'deck-bow'),
    ('hero-frontleft',(700, 275, 1160, 430), 2.0, 'hero'),
    ('hero-rearright',(770, 295, 1280, 505), 1.8, 'hero'),
    ('hero-toptilt', (780, 255, 1256, 640), 1.6, 'hero'),
]

for view, rect, z, tag in CROPS:
    a = Image.open(f'{OLD}/{view}.png').convert('RGB').crop(rect)
    b = Image.open(f'{NEW}/{view}.png').convert('RGB').crop(rect)
    w, h = int(a.width * z), int(a.height * z)
    a = a.resize((w, h), Image.NEAREST)
    b = b.resize((w, h), Image.NEAREST)
    pad, lab = 6, 18
    sheet = Image.new('RGB', (w + pad * 2, h * 2 + pad * 3 + lab * 2), (11, 15, 18))
    d = ImageDraw.Draw(sheet)
    d.text((pad, 2), f'{view} {tag} r6-GRADUATION rect={rect} z={z}', fill=(220, 220, 220))
    sheet.paste(a, (pad, lab))
    d.text((pad, lab + h + pad), 'contain1 (fresh)', fill=(220, 220, 220))
    sheet.paste(b, (pad, lab * 2 + h + pad))
    sheet.save(f'{OUT}/{view}-{tag}.png')
    print(f'saved {view}-{tag}.png {sheet.size}')
