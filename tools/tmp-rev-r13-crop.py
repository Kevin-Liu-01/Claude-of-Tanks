# TEMP r13 critic — crop magnifier on the official critic pairs (DIAGNOSIS ONLY,
# never verdict evidence; §D custom-crop law). Usage:
#   python3 tools/tmp-rev-r13-crop.py <view> <SIDE> <x0> <x1> <y0> <y1> <scale> <outname>
import sys
from PIL import Image

SHOTS = 'shots/critic-leo2_revolution'
view, side, x0, x1, y0, y1, sc, out = sys.argv[1], sys.argv[2], *map(int, sys.argv[3:7]), int(sys.argv[7]), sys.argv[8]
im = Image.open(f'{SHOTS}/{view}.png').convert('RGB')
w, h = im.size
half = w // 2
ox = 0 if side == 'REF' else half
crop = im.crop((ox + x0, y0, ox + x1, y1))
crop = crop.resize((crop.width * sc, crop.height * sc), Image.NEAREST)
crop.save(f'{SHOTS}/crops/{out}.png')
print(f'{SHOTS}/crops/{out}.png {crop.size}')
