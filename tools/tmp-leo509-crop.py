# leo-509 round: crop+zoom helper (turret-zone inspection crops)
# usage: python3 tools/tmp-leo509-crop.py <in.png> <out.png> x0 y0 x1 y1 [zoom]
import sys
from PIL import Image

src, dst, x0, y0, x1, y1 = sys.argv[1], sys.argv[2], *map(int, sys.argv[3:7])
zoom = int(sys.argv[7]) if len(sys.argv) > 7 else 3
im = Image.open(src).convert('RGB').crop((x0, y0, x1, y1))
im = im.resize((im.width * zoom, im.height * zoom), Image.NEAREST)
im.save(dst)
print(f'{dst} {im.width}x{im.height}')
