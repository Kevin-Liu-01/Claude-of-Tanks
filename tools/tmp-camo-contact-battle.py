# TEMP: battle-distance camo contact sheets (near 30 m + far 85 m).
# Usage: python3 tools/tmp-camo-contact-battle.py <shots_dir>
import sys, os
from PIL import Image, ImageDraw

shots = sys.argv[1] if len(sys.argv) > 1 else 'shots/camo_r8_battle'
PAIRS = [('tiger1', 'verdant'), ('tiger1', 'desert'), ('m1a2', 'verdant'),
         ('m1a2', 'desert'), ('t34_85', 'verdant'), ('t34_85', 'desert')]
PATTERNS = ['auto', 'factory', 'summer', 'desert', 'winter', 'digital', 'merdc', 'tropic',
            'ambushdot', 'splinter', 'pinkdesert', 'autumn', 'urbanblock', 'washworn', 'naval', 'dazzle']
for tag, crop in [('near', (390, 220, 880, 520)), ('far', (460, 260, 790, 460))]:
    SCALE = 0.5
    cw, ch = int((crop[2] - crop[0]) * SCALE), int((crop[3] - crop[1]) * SCALE)
    LABEL_H = 14
    LEFT_W = 88
    W = LEFT_W + cw * len(PAIRS)
    H = (ch + LABEL_H) * len(PATTERNS) + 20
    sheet = Image.new('RGB', (W, H), (11, 15, 18))
    d = ImageDraw.Draw(sheet)
    for ci, (t, m) in enumerate(PAIRS):
        d.text((LEFT_W + ci * cw + 4, 4), f'{t}@{m}', fill=(240, 200, 120))
    for ri, p in enumerate(PATTERNS):
        y = 20 + ri * (ch + LABEL_H)
        d.text((4, y + ch // 2), p, fill=(240, 200, 120))
        for ci, (t, m) in enumerate(PAIRS):
            path = os.path.join(shots, f'b_{t}_{m}_{p}_{tag}.png')
            if not os.path.exists(path):
                continue
            im = Image.open(path).crop(crop).resize((cw, ch))
            sheet.paste(im, (LEFT_W + ci * cw, y))
    out = os.path.join(shots, f'contact-battle-{tag}.png')
    sheet.save(out)
    print(f'wrote {out} ({W}x{H})')
