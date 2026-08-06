#!/usr/bin/env python3
# TEMP (m26 graduation critic): crop + upscale a region of a critic pair for
# close reads. Usage: tmp-m26grad-crop.py <png> <x0> <y0> <x1> <y1> <out> [scale]
# Coordinates are FULL-pair pixels (0..1279). Deleted after round.
import sys
from PIL import Image

p, x0, y0, x1, y1, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), sys.argv[6]
scale = int(sys.argv[7]) if len(sys.argv) > 7 else 3
img = Image.open(p).convert('RGB')
c = img.crop((x0, y0, x1, y1))
c = c.resize((c.width * scale, c.height * scale), Image.NEAREST)
c.save(out)
print(out, c.size)
