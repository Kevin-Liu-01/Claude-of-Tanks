# recert merkava3b r12: second-pass crops — frontBoard rear-end junction + corner-curtain attachment
from PIL import Image
import os
SRC = '/Users/kevinliu/claude-of-tanks/shots/critic-merkava3b'
OUT = '/Users/kevinliu/claude-of-tanks/shots/critic-merkava3b/crops'
os.makedirs(OUT, exist_ok=True)
def crop(view, box, name, scale=5):
    im = Image.open(f'{SRC}/{view}.png')
    c = im.crop(box)
    c = c.resize((c.width*scale, c.height*scale), Image.NEAREST)
    c.save(f'{OUT}/{name}.png')
    print(name, c.size)

# E context: view-rearright bow corner (board rear end + skirt front edge junction)
crop('view-rearright', (730, 320, 850, 420), 'E2-rearright-bowboard', 5)
# same junction from the front: view-frontright — bow at RIGHT? gun points right in frontright; board at right end
crop('view-frontright', (1080, 300, 1220, 420), 'E3-frontright-bowboard', 5)
# and frontleft mirror
crop('view-frontleft', (700, 300, 840, 420), 'E4-frontleft-bowboard', 5)
# left/right elevations: board-to-skirt junction at the bow (board line y ~1.06 world)
crop('view-left', (1060, 355, 1150, 400), 'E5-left-boardjunction', 6)
crop('view-right', (690, 355, 780, 400), 'E6-right-boardjunction', 6)
# corner curtain attachment closeups (tops must meet hull line)
crop('view-left', (690, 355, 760, 420), 'J1-left-curtaintops', 6)
crop('view-right', (1160, 355, 1230, 420), 'J2-right-curtaintops', 6)
