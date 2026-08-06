# recert m1a1 r4: zoom crops of changed regions from the official critic pairs
# (crops are DIAGNOSIS aids per BUILD-STANDARD §D — verdict evidence cites the
# official critic pairs + visual-evaluator numbers; crops never replace them)
from PIL import Image
import os
SRC = '/Users/kevinliu/claude-of-tanks/shots/critic-m1a1'
OUT = '/Users/kevinliu/claude-of-tanks/shots/critic-m1a1/crops'
os.makedirs(OUT, exist_ok=True)
# each pair is 1280x640: ref left half (0..640), proc right half (640..1280)
def crop(view, box, name, scale=3):
    im = Image.open(f'{SRC}/{view}.png')
    c = im.crop(box)
    c = c.resize((c.width*scale, c.height*scale), Image.NEAREST)
    c.save(f'{OUT}/{name}.png')
    print(name, c.size)

# ---- FRONT: laneCarve bow wedge + containment at 1x --------------------------
crop('view-front', (680, 300, 1240, 580), 'front-proc-bow', 2)
crop('view-front', (40, 300, 600, 580), 'front-ref-bow', 2)
# close-front proc bow (wrap + fender underside)
crop('close-front', (640, 260, 1150, 470), 'closefront-proc-bow', 2)
crop('close-front', (0, 260, 510, 470), 'closefront-ref-bow', 2)

# ---- REAR: narrowed grille doors + TIP box + honest wraps --------------------
crop('view-rear', (680, 280, 1240, 570), 'rear-proc-wall', 2)
crop('view-rear', (40, 280, 600, 570), 'rear-ref-wall', 2)
crop('view-rear', (760, 290, 1160, 420), 'rear-proc-doors', 3)

# ---- LEFT: tow-cable run on the wall band + wrap pads ------------------------
# hull spans ~684..1130 (z -3.9..+3.9 approx, bow right), ~57 px/m, z0 ~907
crop('view-left', (690, 280, 1240, 410), 'left-proc-flank', 2)
crop('view-left', (740, 320, 1000, 400), 'left-proc-cable', 4)
crop('view-left', (1020, 310, 1140, 400), 'left-proc-bowwrap', 5)
crop('view-left', (665, 300, 800, 400), 'left-proc-sternwrap', 5)
crop('view-left', (50, 280, 600, 420), 'left-ref-flank', 2)

# ---- RIGHT: wrap pads mirror (bow left, z0 ~1012) ----------------------------
crop('view-right', (770, 310, 900, 400), 'right-proc-bowwrap', 5)
crop('view-right', (1140, 300, 1270, 400), 'right-proc-sternwrap', 5)
crop('view-right', (690, 280, 1240, 410), 'right-proc-flank', 2)

# ---- TOP/ROOF: stowed M2 across the freed rack + roof gun --------------------
crop('view-top', (860, 75, 1090, 150), 'top-proc-rackM2', 5)
crop('view-top', (860, 260, 1060, 350), 'top-proc-roofmg', 5)
crop('close-roof', (880, 150, 1280, 430), 'closeroof-proc', 2)
crop('hero-toptilt', (940, 200, 1130, 330), 'toptilt-proc-rack', 4)

# ---- toptilt enclosed-void flag region (world x1.40 y0.90 z1.29) -------------
crop('hero-toptilt', (1000, 380, 1280, 580), 'toptilt-proc-rightflank', 3)
# hero-rearright void flag region (x -1.13 y 2.20 z 0.20 — under-barrel class)
crop('hero-rearright', (860, 220, 1160, 360), 'rearright-proc-voidzone', 3)
crop('hero-rearright', (1040, 350, 1280, 520), 'rearright-proc-sprocket', 3)
