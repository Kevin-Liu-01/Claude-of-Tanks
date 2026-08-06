# TEMP (leo2_revolution r15 graduation critic): crop + upscale windows from
# the fresh critic pairs for magnified adjudication. DIAGNOSIS ONLY.
# Usage: python3 tools/tmp-rev-r15-crop.py <view> <x0> <x1> <y0> <y1> <scale> <out>
#   coords are per-half (REF left half drawn first, PROC right half second,
#   stacked vertically in the output board REF over PROC).
import sys
from PIL import Image

view, x0, x1, y0, y1, scale, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6]), sys.argv[7]
im = Image.open(f'shots/critic-leo2_revolution/{view}.png').convert('RGB')
w, h = im.size
half = w // 2
ref = im.crop((x0, y0, x1, y1))
proc = im.crop((half + x0, y0, half + x1, y1))
cw, ch = (x1 - x0) * scale, (y1 - y0) * scale
ref = ref.resize((cw, ch), Image.NEAREST)
proc = proc.resize((cw, ch), Image.NEAREST)
board = Image.new('RGB', (cw, ch * 2 + 8), (21, 27, 32))
board.paste(ref, (0, 0))
board.paste(proc, (0, ch + 8))
board.save(out)
print(f'{out}: {view} [{x0}:{x1}]x[{y0}:{y1}] @{scale}x (REF top, PROC bottom)')
