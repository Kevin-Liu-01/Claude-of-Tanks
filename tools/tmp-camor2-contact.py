# TEMP (camo r2 expansion): assemble this round's camo cycle shots into one
# grid sheet PNG — rows = all 29 patterns, cols = leo2a6 (GLB composite) +
# tiger1 (procedural boxUV). Deleted after the round.
# Usage: python3 tools/tmp-camor2-contact.py <shots_dir> <out.png>
import sys, os
from PIL import Image, ImageDraw

shots = sys.argv[1] if len(sys.argv) > 1 else 'shots/camo-r2'
out = sys.argv[2] if len(sys.argv) > 2 else 'shots/camo-r2/grid-sheet.png'
TANKS = ['leo2a6', 'tiger1']
PATTERNS = ['auto', 'factory', 'summer', 'desert', 'winter', 'digital', 'merdc', 'tropic',
            'ambushdot', 'splinter', 'pinkdesert', 'autumn', 'urbanblock', 'washworn',
            'naval', 'dazzle',
            'flecktarn', 'amoeba', 'dpm', 'tigerstripe', 'm90', 'chocchip', 'digitaldesert',
            'merdcwinter', 'winterbands', 'berlin', 'oakleaf', 'hexfield', 'midnight']
CROP = (360, 130, 990, 480)   # pedestal region of the 1240x720 frame
SCALE = 0.62
cw, ch = int((CROP[2] - CROP[0]) * SCALE), int((CROP[3] - CROP[1]) * SCALE)
LABEL_H = 16
LEFT_W = 100
COLS = 2                      # pattern columns (29 rows would be too tall)
rows = (len(PATTERNS) + COLS - 1) // COLS
W = (LEFT_W + cw * len(TANKS)) * COLS + 8 * (COLS - 1)
H = (ch + LABEL_H) * rows + 22
sheet = Image.new('RGB', (W, H), (11, 15, 18))
d = ImageDraw.Draw(sheet)
for pi, p in enumerate(PATTERNS):
    col = pi // rows
    ri = pi % rows
    x0 = col * (LEFT_W + cw * len(TANKS) + 8)
    y = 22 + ri * (ch + LABEL_H)
    d.text((x0 + 6, y + ch // 2), p, fill=(240, 200, 120))
    for ci, t in enumerate(TANKS):
        if pi == 0:
            d.text((x0 + LEFT_W + ci * cw + 6, 5), t, fill=(240, 200, 120))
        path = os.path.join(shots, f'g_{t}_{p}.png')
        if not os.path.exists(path):
            continue
        im = Image.open(path).crop(CROP).resize((cw, ch))
        sheet.paste(im, (x0 + LEFT_W + ci * cw, y))
sheet.save(out)
print(f'wrote {out} ({W}x{H})')
