# TEMP (cheek+gun re-cert critic): BEFORE vs AFTER strips from the builder
# archives (diagnosis context only; verdicts are my fresh official pairs).
# Usage: tmp-cheekgun-ba.py <scratch> <tid> <view> [zoom]
import sys, json, os
from PIL import Image

SCRATCH, tid, view = sys.argv[1], sys.argv[2], sys.argv[3]
zoom = int(sys.argv[4]) if len(sys.argv) > 4 else 3
with open(os.path.join(SCRATCH, 'diffloc.json')) as f:
    LOC = json.load(f)
x0, x1, y0, y1 = LOC[tid][view]['proc']['bbox']
PAD = 30
b = Image.open(f'shots/abrams-cheek-r1/before-{tid}/{view}.png').convert('RGB')
a = Image.open(f'shots/abrams-cheek-r1/after-{tid}/{view}.png').convert('RGB')
w, h = b.size
cx0, cy0 = max(640, x0 - PAD), max(0, y0 - PAD)
cx1, cy1 = min(w, x1 + PAD), min(h, y1 + PAD)
cb = b.crop((cx0, cy0, cx1, cy1))
ca = a.crop((cx0, cy0, cx1, cy1))
cw, ch = cb.size
strip = Image.new('RGB', (cw * 2 * zoom + 12, ch * zoom), (30, 10, 10))
strip.paste(cb.resize((cw * zoom, ch * zoom), Image.NEAREST), (0, 0))
strip.paste(ca.resize((cw * zoom, ch * zoom), Image.NEAREST), (cw * zoom + 12, 0))
out = os.path.join(SCRATCH, 'crops', f'BA-{tid}-{view}-{zoom}x.png')
strip.save(out)
print(out)
