# TEMP r18: crop turret regions from critic PNGs for 2x/4x self-read
import sys
from PIL import Image
src, out, x0, y0, x1, y1, scale = sys.argv[1], sys.argv[2], *map(int, sys.argv[3:7]), int(sys.argv[7])
im = Image.open(src).crop((x0, y0, x1, y1))
im = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
im.save(out)
print(out, im.size)
