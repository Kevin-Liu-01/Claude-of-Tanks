# recert leo2a6 r4: zoom crops of changed regions from the official critic pairs
from PIL import Image
import os
SRC = '/Users/kevinliu/claude-of-tanks/shots/critic-leo2a6'
OUT = '/Users/kevinliu/claude-of-tanks/shots/critic-leo2a6/crops'
os.makedirs(OUT, exist_ok=True)
# each pair is 1280x640: ref left half (0..640), proc right half (640..1280)
def crop(view, box, name, scale=3):
    im = Image.open(f'{SRC}/{view}.png')
    c = im.crop(box)
    c = c.resize((c.width*scale, c.height*scale), Image.NEAREST)
    c.save(f'{OUT}/{name}.png')
    print(name, c.size)

# close-front proc bow (right half, bow occupies lower-center)
crop('close-front', (640, 280, 1120, 470), 'closefront-proc-bow', 2)
crop('close-front', (0, 280, 480, 470), 'closefront-ref-bow', 2)
# view-front proc bow bottom (tracks + planks)
crop('view-front', (680, 320, 1240, 560), 'front-proc-bow', 2)
crop('view-front', (40, 320, 600, 560), 'front-ref-bow', 2)
# frontleft quarter proc bow
crop('view-frontleft', (940, 300, 1140, 420), 'frontleft-proc-bow', 3)
crop('view-frontleft', (300, 300, 500, 420), 'frontleft-ref-bow', 3)
# frontright quarter proc bow
crop('view-frontright', (760, 300, 990, 420), 'frontright-proc-bow', 3)
crop('view-frontright', (120, 300, 350, 420), 'frontright-ref-bow', 3)

# left view: proc half x 640..1280. Tank spans ~684..1236, wheels y~350..395.
# front (idler) is right end ~1000..1080; rear (sprocket) left end ~684..790
crop('view-left', (990, 330, 1090, 400), 'left-proc-idlerdrum', 5)
crop('view-left', (684, 330, 790, 400), 'left-proc-sprocketdrum', 5)
crop('view-left', (350, 330, 450, 400), 'left-ref-idlerdrum', 5)   # ref front right end ~360..430
crop('view-left', (40, 330, 140, 400), 'left-ref-sprocketdrum', 5)
# left view bow tip profile (plank + nose band): proc front ~1000..1075, y 300..400
crop('view-left', (1000, 290, 1080, 400), 'left-proc-bowtip', 5)
crop('view-left', (360, 290, 440, 400), 'left-ref-bowtip', 5)
# right view (front is LEFT end): proc half; tank ~810..1240
crop('view-right', (810, 330, 910, 400), 'right-proc-idlerdrum', 5)
crop('view-right', (1140, 330, 1240, 400), 'right-proc-sprocketdrum', 5)
