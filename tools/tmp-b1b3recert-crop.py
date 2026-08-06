#!/usr/bin/env python3
# TEMP (b1b3 re-cert critic): crop/zoom helper over shots/critic-<id>/*.png
# pairs. Writes crops to the session scratchpad, never into shots/.
# usage: tmp-b1b3recert-crop.py <id> <view> <half:ref|proc|pair> [x0 y0 x1 y1 [zoom]]
import sys, os
from PIL import Image

SCR = os.environ.get('B1B3_OUT', '/private/tmp/claude-501/-Users-kevinliu-claude-of-tanks/d0226c73-49ae-490e-9a35-39379da35769/scratchpad')
tid, view, half = sys.argv[1], sys.argv[2], sys.argv[3]
im = Image.open(f'shots/critic-{tid}/{view}.png')
w, h = im.size
if half == 'proc':
    im = im.crop((w // 2, 0, w, h))
elif half == 'ref':
    im = im.crop((0, 0, w // 2, h))
if len(sys.argv) > 7:
    x0, y0, x1, y1 = map(int, sys.argv[4:8])
    z = float(sys.argv[8]) if len(sys.argv) > 8 else 2.0
    im = im.crop((x0, y0, x1, y1))
    im = im.resize((int((x1 - x0) * z), int((y1 - y0) * z)), Image.LANCZOS)
    out = f'{SCR}/{tid}-{view}-{half}-{x0}x{y0}-z{z}.png'
else:
    out = f'{SCR}/{tid}-{view}-{half}.png'
im.save(out)
print(out)
