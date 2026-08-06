#!/usr/bin/env python3
# uk round-5 crop helper: python3 tools/tmp-uk-r5-crop.py <in.png> <out.png> <x> <y> <w> <h> [scale]
import sys
from PIL import Image

inp, outp, x, y, w, h = sys.argv[1:7]
scale = float(sys.argv[7]) if len(sys.argv) > 7 else 2.0
x, y, w, h = int(x), int(y), int(w), int(h)
im = Image.open(inp).convert('RGB')
crop = im.crop((x, y, x + w, y + h))
crop = crop.resize((int(w * scale), int(h * scale)), Image.NEAREST)
crop.save(outp)
print(f'cropped {inp} [{x},{y},{w}x{h}] x{scale} -> {outp}')
