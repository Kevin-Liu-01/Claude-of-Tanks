# recert m1a1ha r4: zoom crops of changed regions from the official critic pairs
# (§D: crops are diagnosis aids pointing INTO official renders — verdicts cite the pairs)
from PIL import Image
import os
SRC = '/Users/kevinliu/claude-of-tanks/shots/critic-m1a1ha'
OUT = '/Users/kevinliu/claude-of-tanks/shots/critic-m1a1ha/crops'
os.makedirs(OUT, exist_ok=True)
# each pair is 1280x640: ref left half (0..640), proc right half (640..1280)
def crop(view, box, name, scale=3, src=SRC):
    im = Image.open(f'{src}/{view}.png')
    c = im.crop(box)
    c = c.resize((c.width*scale, c.height*scale), Image.NEAREST)
    c.save(f'{OUT}/{name}.png')
    print(name, c.size)

# --- containment: bow (laneCarve bow window z 2.60..3.49 at |x|<=1.08) ---
crop('close-front', (640, 260, 1160, 470), 'closefront-proc-bow', 2)
crop('close-front', (0, 260, 520, 470), 'closefront-ref-bow', 2)
# front view lower band: carve walls at +-1.08 -> image x ~ 796/1114 (147.5px/m)
crop('view-front', (680, 400, 1240, 540), 'front-proc-lowband', 2)
crop('view-front', (40, 380, 600, 560), 'front-ref-lowband', 2)
# --- containment: stern (carve z -3.61..-2.90, grille doors, sprocket wraps) ---
crop('view-rear', (680, 290, 1240, 550), 'rear-proc-lowband', 2)
crop('view-rear', (40, 270, 600, 560), 'rear-ref-lowband', 2)
# the dark box on the left track top / TIP re-mount check
crop('view-rear', (770, 290, 900, 380), 'rear-proc-tipbox', 5)
# --- wrap pads (left/right, render-identical claim): idler + sprocket wraps ---
crop('view-left', (1040, 320, 1160, 400), 'left-proc-idlerwrap', 5)
crop('view-left', (670, 320, 790, 400), 'left-proc-sprocketwrap', 5)
crop('view-left', (400, 320, 520, 400), 'left-ref-idlerwrap', 5)
crop('view-left', (30, 320, 150, 400), 'left-ref-sprocketwrap', 5)
crop('view-right', (760, 320, 880, 400), 'right-proc-idlerwrap', 5)
crop('view-right', (1130, 320, 1250, 400), 'right-proc-sprocketwrap', 5)
# --- H.4 loadout: rack strip (top view stern is image-top) ---
crop('view-top', (850, 40, 1070, 130), 'top-proc-rack', 5)
crop('view-top', (210, 40, 430, 130), 'top-ref-rack', 5)
crop('hero-toptilt', (1040, 400, 1270, 560), 'toptilt-proc-rack', 4)
crop('hero-rearright', (1060, 250, 1280, 420), 'rearright-proc-rack', 4)
# roof gun (certified silhouette pintle, context for census read)
crop('close-roof', (900, 170, 1120, 320), 'closeroof-proc-roofgun', 3)
# --- H.4 tells: sibling rack strips from the fresh family pairs ---
crop('view-top', (850, 40, 1070, 130), 'top-m1a1-rack', 5,
     src='/Users/kevinliu/claude-of-tanks/shots/critic-m1a1')
crop('view-top', (850, 40, 1070, 130), 'top-tejas-rack', 5,
     src='/Users/kevinliu/claude-of-tanks/shots/critic-m1a2_tejas')
