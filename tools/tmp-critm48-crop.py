# TEMP (m48 critic round): crop+brighten regions from the critic sheets.
# Usage: python3 tools/tmp-critm48-crop.py <src.png> <x> <y> <w> <h> <gain> <out.png>
import sys
from PIL import Image, ImageEnhance

src, x, y, w, h, gain, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), float(sys.argv[6]), sys.argv[7]
im = Image.open(src).convert('RGB')
im = im.crop((x, y, x + w, y + h))
scale = max(1, int(900 / max(im.width, im.height)))
if scale > 1:
    im = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
im = ImageEnhance.Brightness(im).enhance(gain)
im.save(out)
print(out, im.size)
