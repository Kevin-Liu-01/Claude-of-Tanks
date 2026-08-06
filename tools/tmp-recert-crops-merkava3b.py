# recert merkava3b r12: zoom crops of changed regions from the official critic pairs
from PIL import Image
import os
SRC = '/Users/kevinliu/claude-of-tanks/shots/critic-merkava3b'
OUT = '/Users/kevinliu/claude-of-tanks/shots/critic-merkava3b/crops'
os.makedirs(OUT, exist_ok=True)
# each pair is 1280x640: ref left half (0..640), proc right half (640..1280)
def crop(view, box, name, scale=3):
    im = Image.open(f'{SRC}/{view}.png')
    c = im.crop(box)
    c = c.resize((c.width*scale, c.height*scale), Image.NEAREST)
    c.save(f'{OUT}/{name}.png')
    print(name, c.size)

# --- STERN (the fixed fleet-worst rear wrap: cornerCurtain tiers, rearFlaps[0], tailRack.frontClear)
# view-rear proc: tank ~720..1185, rear track blocks bottom left ~735..820 / right ~1095..1185
crop('view-rear', (700, 420, 900, 600), 'rear-proc-trackL', 3)
crop('view-rear', (1000, 420, 1200, 600), 'rear-proc-trackR', 3)
crop('view-rear', (60, 420, 260, 600), 'rear-ref-trackL', 3)
crop('view-rear', (380, 420, 580, 600), 'rear-ref-trackR', 3)
# view-rearleft: stern at left end of proc half
crop('view-rearleft', (660, 330, 920, 460), 'rearleft-proc-stern', 3)
crop('view-rearleft', (30, 330, 290, 460), 'rearleft-ref-stern', 3)
# view-rearright: stern at right end of proc half
crop('view-rearright', (1000, 330, 1260, 460), 'rearright-proc-stern', 3)
crop('view-rearright', (360, 330, 620, 460), 'rearright-ref-stern', 3)
# hero-rearright: rear corner perspective
crop('hero-rearright', (1040, 400, 1280, 580), 'herorr-proc-corner', 3)
crop('hero-rearright', (420, 400, 660, 580), 'herorr-ref-corner', 3)

# --- BOW (front wrap: frontBoard z1 2.26, sprocket ring clearance)
# view-front proc: bow tracks bottom left ~725..815 / right ~1100..1190
crop('view-front', (700, 420, 900, 590), 'front-proc-trackL', 3)
crop('view-front', (1010, 420, 1210, 590), 'front-proc-trackR', 3)
crop('view-front', (70, 420, 270, 590), 'front-ref-trackL', 3)
crop('view-front', (390, 420, 590, 590), 'front-ref-trackR', 3)
# close-front proc: sprocket wrap right end + left track
crop('close-front', (940, 340, 1160, 540), 'closefront-proc-wrap', 3)
crop('close-front', (300, 340, 520, 540), 'closefront-ref-wrap', 3)
crop('close-front', (640, 400, 880, 540), 'closefront-proc-trackL', 3)

# --- LANE EDGES (sponson lifts interior; keel.hwClamp belly strips)
# view-left proc: bow right end (wrap ~1050..1150), stern left end (~684..800), belly mid
crop('view-left', (1030, 330, 1160, 445), 'left-proc-bowwrap', 4)
crop('view-left', (400, 330, 530, 445), 'left-ref-bowwrap', 4)
crop('view-left', (670, 330, 800, 445), 'left-proc-sternwrap', 4)
crop('view-left', (30, 330, 160, 445), 'left-ref-sternwrap', 4)
crop('view-left', (800, 390, 1060, 445), 'left-proc-belly', 4)
# view-right proc: bow left end, stern right end
crop('view-right', (670, 330, 800, 445), 'right-proc-bowwrap', 4)
crop('view-right', (30, 330, 160, 445), 'right-ref-bowwrap', 4)
crop('view-right', (1120, 330, 1250, 445), 'right-proc-sternwrap', 4)
crop('view-right', (470, 330, 600, 445), 'right-ref-sternwrap', 4)
