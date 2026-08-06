#!/usr/bin/env python3
# b1recert diagnosis crops: turret-front region, before vs after, side by side.
# Usage: python3 tools/tmp-b1recert-crop.py <before.png> <after.png> <x0> <y0> <x1> <y1> <scale> <out.png>
# Crops the SAME box from both, scales, stacks left(before)/right(after) with a divider.
import sys
from PIL import Image

b, a, x0, y0, x1, y1, s, out = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6]), int(sys.argv[7]), sys.argv[8]
ib = Image.open(b).crop((x0, y0, x1, y1))
ia = Image.open(a).crop((x0, y0, x1, y1))
w, h = ib.size
ib = ib.resize((w * s, h * s), Image.NEAREST)
ia = ia.resize((w * s, h * s), Image.NEAREST)
canvas = Image.new('RGB', (w * s * 2 + 8, h * s), (255, 200, 0))
canvas.paste(ib, (0, 0))
canvas.paste(ia, (w * s + 8, 0))
canvas.save(out)
print(f"saved {out} ({canvas.size[0]}x{canvas.size[1]}) box=({x0},{y0},{x1},{y1}) x{s}")
