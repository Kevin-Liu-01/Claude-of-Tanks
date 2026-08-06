#!/usr/bin/env python3
# leo2a5 r10 CRITIC crops — zoom adjudication (diagnosis-only, never verdict
# evidence on their own). Writes shots/critic-leo2a5/crops-r10critic/.
import os
import numpy as np
from PIL import Image

SHOTS = '/Users/kevinliu/claude-of-tanks/shots/critic-leo2a5'
OUT = f'{SHOTS}/crops-r10critic'
os.makedirs(OUT, exist_ok=True)
BG = np.array([0x15, 0x1b, 0x20], dtype=np.int16)

def halves(view):
    a = np.asarray(Image.open(f'{SHOTS}/{view}.png').convert('RGB'), dtype=np.int16)
    return a[:, :640], a[:, 640:1280]

def luma(rgb):
    return 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]

def air(rgb):
    return (np.abs(rgb - BG).max(axis=-1) <= 13) & ((rgb[..., 2] - rgb[..., 0]) >= 8)

def crop(view, x0, x1, y0, y1, scale, name, mark=None):
    ref, proc = halves(view)
    tiles = []
    for h in (ref, proc):
        c = h[y0:y1, x0:x1].astype(np.uint8).copy()
        if mark:
            L = luma(h[y0:y1, x0:x1]); A = air(h[y0:y1, x0:x1])
            m = (L > mark) & ~A
            c[m] = [255, 0, 255]
        im = Image.fromarray(c).resize(((x1-x0)*scale, (y1-y0)*scale), Image.NEAREST)
        tiles.append(im)
    w = tiles[0].width
    board = Image.new('RGB', (w*2 + 8, tiles[0].height), (21, 27, 32))
    board.paste(tiles[0], (0, 0)); board.paste(tiles[1], (w + 8, 0))
    board.save(f'{OUT}/{name}.png')
    print(f'{name}: [{x0}..{x1}]x[{y0}..{y1}] x{scale}' + (f' marked>{mark}' if mark else ''))

# 1. crown window hero-rr with over92 and over100 marked (ref|proc)
crop('hero-rearright', 420, 610, 320, 390, 3, 'crown-hero-rr-3x')
crop('hero-rearright', 420, 610, 320, 390, 3, 'crown-hero-rr-3x-mark92', mark=92)
crop('hero-rearright', 420, 610, 320, 390, 3, 'crown-hero-rr-3x-mark100', mark=100)
crop('hero-rearright', 540, 615, 355, 390, 6, 'crown-blob327-6x')
crop('hero-rearright', 540, 615, 355, 390, 6, 'crown-blob327-6x-mark100', mark=100)
# 2. hero-rr at 1x full for the game-scale read
crop('hero-rearright', 100, 640, 150, 550, 1, 'hero-rr-1x')
# 3. deck knob: the 52px patch + line rows marked
crop('view-top', 235, 405, 95, 230, 3, 'deck-top-3x')
crop('view-top', 235, 405, 95, 230, 3, 'deck-top-3x-mark92', mark=92)
crop('view-top', 240, 285, 180, 220, 8, 'deck-patch52-8x')
crop('view-top', 280, 380, 125, 155, 6, 'deck-lines139-6x')
crop('view-top', 280, 380, 200, 225, 6, 'deck-lines213-6x')
# 4. view-left roofline strip 2x (the dead layer-cake read)
crop('view-left', 240, 470, 240, 300, 3, 'roofline-left-3x')
# 5. launcher quarters at 2x (2d done-gate: tube rows from BOTH quarters)
crop('view-frontleft', 300, 420, 240, 300, 4, 'launcher-frontleft-4x')
crop('view-frontright', 220, 340, 240, 300, 4, 'launcher-frontright-4x')
# 6. wheels 2x-4x (2c rings read)
crop('view-left', 130, 330, 350, 400, 4, 'wheels-left-4x')
# 7. rear slats/patches 3x (2b de-CAD)
crop('view-rear', 100, 540, 300, 380, 2, 'rear-louvre-2x')
crop('view-rear', 180, 380, 305, 375, 4, 'rear-slats-4x')
# 8. glacis 3x (2a residual read)
crop('view-front', 200, 440, 320, 380, 3, 'glacis-front-3x')
# 9. close-front tier rims 2x (1a rim bands)
crop('close-front', 0, 320, 150, 400, 2, 'closefront-tiers-2x')
# 10. close-roof shroud faces (1b tint) + hatch rings
crop('close-roof', 280, 640, 180, 420, 2, 'closeroof-plateau-2x')
# 11. turret roofline on view-right (mirror check)
crop('view-right', 170, 400, 240, 300, 3, 'roofline-right-3x')
# 12. rear corner warm check 4x
crop('view-rear', 68, 160, 480, 555, 4, 'rearcorner-L-4x')
print('done ->', OUT)
