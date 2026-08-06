# recert merkava3c r12: zoom crops of the CHANGED regions from the official critic pairs
# (track containment round: rear idler wrap + corner curtains/flaps/rack-front,
#  sprocket wrap + frontBoard tail, skirt lane edges)
from PIL import Image
import os
SRC = '/Users/kevinliu/claude-of-tanks/shots/critic-merkava3c'
OUT = '/Users/kevinliu/claude-of-tanks/shots/critic-merkava3c/crops'
os.makedirs(OUT, exist_ok=True)
# each pair is 1280x640: ref left half (0..640), proc right half (640..1280)
def crop(view, box, name, scale=3):
    im = Image.open(f'{SRC}/{view}.png')
    c = im.crop(box)
    c = c.resize((c.width*scale, c.height*scale), Image.NEAREST)
    c.save(f'{OUT}/{name}.png')
    print(name, c.size)

# view-rear: proc tank ~x740..1165, corner flaps/curtains y~460..600
crop('view-rear', (720, 430, 900, 610), 'rear-proc-cornerL', 3)
crop('view-rear', (1010, 430, 1190, 610), 'rear-proc-cornerR', 3)
crop('view-rear', (80, 430, 260, 610), 'rear-ref-cornerL', 3)
crop('view-rear', (370, 430, 550, 610), 'rear-ref-cornerR', 3)

# view-rearleft: near rear corner is the LEFT/lower-left of the proc tank (~x690..840, y360..470)
crop('view-rearleft', (670, 340, 890, 480), 'rearleft-proc-corner', 3)
crop('view-rearleft', (30, 340, 250, 480), 'rearleft-ref-corner', 3)
# view-rearright: near rear corner is the RIGHT end of proc (~x1080..1230)
crop('view-rearright', (1030, 340, 1250, 480), 'rearright-proc-corner', 3)
crop('view-rearright', (390, 340, 610, 480), 'rearright-ref-corner', 3)

# view-left: front is RIGHT end. sprocket wrap zone (z 1.74..2.26) ~x1040..1150;
# idler wrap zone (z -3.37..-3.95) ~x685..800. wheels/track y~380..450
crop('view-left', (1030, 330, 1150, 455), 'left-proc-sprocketlane', 4)
crop('view-left', (680, 330, 810, 455), 'left-proc-idlerlane', 4)
crop('view-left', (395, 330, 515, 455), 'left-ref-sprocketlane', 4)
crop('view-left', (45, 330, 175, 455), 'left-ref-idlerlane', 4)
# view-right: mirrored — front is LEFT end of the tank in frame
crop('view-right', (770, 330, 890, 455), 'right-proc-sprocketlane', 4)
crop('view-right', (1110, 330, 1240, 455), 'right-proc-idlerlane', 4)
crop('view-right', (135, 330, 255, 455), 'right-ref-sprocketlane', 4)
crop('view-right', (475, 330, 605, 455), 'right-ref-idlerlane', 4)

# view-front: lane edges / bottom corners (track + skirt flare + board ends)
crop('view-front', (700, 420, 900, 600), 'front-proc-laneL', 3)
crop('view-front', (1010, 420, 1210, 600), 'front-proc-laneR', 3)
crop('view-front', (60, 420, 260, 600), 'front-ref-laneL', 3)
crop('view-front', (370, 420, 570, 600), 'front-ref-laneR', 3)

# close-front: sprocket wrap + frontBoard tail (bottom half of the crop frame)
crop('close-front', (640, 300, 1280, 640), 'closefront-proc-bow', 2)
crop('close-front', (0, 300, 640, 640), 'closefront-ref-bow', 2)

# hero-rearright: rear wrap + rack-front + curtain in perspective
crop('hero-rearright', (640, 280, 1120, 560), 'herorr-proc-rear', 2)
crop('hero-rearright', (0, 280, 480, 560), 'herorr-ref-rear', 2)
