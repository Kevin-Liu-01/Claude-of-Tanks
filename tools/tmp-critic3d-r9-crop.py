#!/usr/bin/env python3
# TEMP (merkava3d r9 independent critic): crop a rect from one half of a
# critic pair (ref = x 0..639, proc = x 640..1279) and upscale for zoom
# inspection, or side-by-side the SAME rect from both halves.
# usage: crop.py <pair.png> <ref|proc|both> x0 x1 y0 y1 <out.png> [scale]
import sys
from PIL import Image

path, half, x0, x1, y0, y1, out = sys.argv[1:8]
scale = int(sys.argv[8]) if len(sys.argv) > 8 else 3
x0, x1, y0, y1 = int(x0), int(x1), int(y0), int(y1)
im = Image.open(path).convert('RGB')
if half == 'both':
    ref = im.crop((x0, y0, x1, y1))
    proc = im.crop((640 + x0, y0, 640 + x1, y1))
    w, h = ref.size
    canvas = Image.new('RGB', (w * 2 + 8, h), (255, 0, 255))
    canvas.paste(ref, (0, 0))
    canvas.paste(proc, (w + 8, 0))
    canvas = canvas.resize(((w * 2 + 8) * scale, h * scale), Image.NEAREST)
    canvas.save(out)
else:
    xoff = 0 if half == 'ref' else 640
    crop = im.crop((xoff + x0, y0, xoff + x1, y1))
    crop = crop.resize(((x1 - x0) * scale, (y1 - y0) * scale), Image.NEAREST)
    crop.save(out)
print('saved', out)
