# TEMP (chieftain5 §B6 re-cert critic): crops OF the official critic renders
# (shots/critic-chieftain5/) for zoom verification — bow ramp, belt-loft
# clearance, flap containment. Writes shots/critic-chieftain5/crops-b6recert/.
# Usage: python3 tools/tmp-b6recert-crop.py
import os
from PIL import Image

SRC = 'shots/critic-chieftain5'
DST = os.path.join(SRC, 'crops-b6recert')
os.makedirs(DST, exist_ok=True)

# (file, name, box(l,t,r,b), scale)
CROPS = [
    # proc panel bow region, right view (bow at panel LEFT: x 640+)
    ('view-right.png',  'right-bow-proc',   (830, 280, 1000, 420), 3),
    ('view-right.png',  'right-rear-proc',  (1130, 280, 1260, 420), 3),
    ('view-left.png',   'left-bow-proc',    (960, 280, 1130, 420), 3),
    ('view-left.png',   'left-rear-proc',   (680, 280, 810, 420), 3),
    # ref panels for the same regions (mirror x ranges into 0..640)
    ('view-right.png',  'right-bow-ref',    (190, 280, 360, 420), 3),
    ('view-left.png',   'left-bow-ref',     (320, 280, 490, 420), 3),
    # close-front: wrap vs corner flaps + belt loft clearance
    ('close-front.png', 'closefront-track-proc', (640, 340, 1010, 480), 2),
    ('close-front.png', 'closefront-track-ref',  (0, 340, 460, 480), 2),
    # front view: wrap arc above corner flaps
    ('view-front.png',  'front-trackcorners-proc', (690, 420, 1230, 560), 2),
    # rear view: far wrap through the track channel
    ('view-rear.png',   'rear-channel-proc', (690, 400, 1230, 590), 2),
    # hero front: ramp + wing-shelf interaction
    ('hero-frontleft.png', 'herofl-bow-proc', (680, 300, 1000, 460), 2),
]

for f, name, box, k in CROPS:
    p = os.path.join(SRC, f)
    if not os.path.exists(p):
        print('missing', p)
        continue
    im = Image.open(p).convert('RGB').crop(box)
    im = im.resize((im.width * k, im.height * k), Image.NEAREST)
    out = os.path.join(DST, name + '.png')
    im.save(out)
    print('wrote', out, im.size)
