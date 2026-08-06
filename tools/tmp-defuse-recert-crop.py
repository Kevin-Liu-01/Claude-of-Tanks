# TEMP (leo2_revolution defuse re-cert critic): magnified crops from the
# official pairs. DIAGNOSIS-ONLY (never verdict evidence). Usage:
#   python3 tools/tmp-defuse-recert-crop.py <view> <x0> <x1> <y0> <y1> <out> [scale]
# coords are FULL-PAIR pixels (1280x640).
import sys
from PIL import Image

view, x0, x1, y0, y1, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), sys.argv[6]
scale = int(sys.argv[7]) if len(sys.argv) > 7 else 3
im = Image.open(f'shots/critic-leo2_revolution/{view}.png').convert('RGB')
crop = im.crop((x0, y0, x1, y1))
crop = crop.resize((crop.width * scale, crop.height * scale), Image.NEAREST)
crop.save(f'shots/critic-leo2_revolution/crops/{out}.png')
print(f'saved shots/critic-leo2_revolution/crops/{out}.png ({crop.width}x{crop.height})')
