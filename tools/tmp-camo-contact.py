# TEMP: assemble the camo audit shots into one contact sheet PNG.
# Usage: python3 tools/tmp-camo-contact.py <shots_dir> <out.png>
import sys, os
from PIL import Image, ImageDraw

shots = sys.argv[1] if len(sys.argv) > 1 else 'shots/camo_r8_full'
out = sys.argv[2] if len(sys.argv) > 2 else 'shots/camo_r8_full/contact-sheet.png'
TANKS = ['tiger1', 't34_85', 'm1a2', 't90m', 'leo2a7', 'strv103', 'jagdtiger']
PATTERNS = ['auto', 'factory', 'summer', 'desert', 'winter', 'digital', 'merdc', 'tropic',
            'ambushdot', 'splinter', 'pinkdesert', 'autumn', 'urbanblock', 'washworn', 'naval', 'dazzle']
CROP = (360, 130, 990, 480)   # pedestal region of the 1240x720 frame
SCALE = 0.52
cw, ch = int((CROP[2] - CROP[0]) * SCALE), int((CROP[3] - CROP[1]) * SCALE)
LABEL_H = 16
LEFT_W = 92
W = LEFT_W + cw * len(TANKS)
H = (ch + LABEL_H) * len(PATTERNS) + 22
sheet = Image.new('RGB', (W, H), (11, 15, 18))
d = ImageDraw.Draw(sheet)
for ci, t in enumerate(TANKS):
    d.text((LEFT_W + ci * cw + 6, 5), t, fill=(240, 200, 120))
for ri, p in enumerate(PATTERNS):
    y = 22 + ri * (ch + LABEL_H)
    d.text((6, y + ch // 2), p, fill=(240, 200, 120))
    for ci, t in enumerate(TANKS):
        path = os.path.join(shots, f'g_{t}_{p}.png')
        if not os.path.exists(path):
            continue
        im = Image.open(path).crop(CROP).resize((cw, ch))
        sheet.paste(im, (LEFT_W + ci * cw, y))
sheet.save(out)
print(f'wrote {out} ({W}x{H})')
