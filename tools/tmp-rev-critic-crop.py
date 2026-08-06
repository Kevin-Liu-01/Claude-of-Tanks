# TEMP (leo2_revolution r7 independent critic): zoom crops of the fresh
# critic pairs — DIAGNOSIS ONLY (§D: custom crops never count as verdict
# evidence; verdicts cite the official pairs + evaluator numbers).
# Usage: python3 tools/tmp-rev-critic-crop.py <view> <x0> <y0> <x1> <y1> <zoom> [out]
#   coordinates in the 1280x640 pair space (REF 0..639, PROC 640..1279)
import sys
from PIL import Image

v, x0, y0, x1, y1, z = sys.argv[1], *map(int, sys.argv[2:7])
out = sys.argv[7] if len(sys.argv) > 7 else f'shots/critic-leo2_revolution/crops/{v}-{x0}x{y0}.png'
im = Image.open(f'shots/critic-leo2_revolution/{v}.png').convert('RGB')
crop = im.crop((x0, y0, x1, y1))
crop = crop.resize((crop.width * z, crop.height * z), Image.NEAREST)
import os
os.makedirs(os.path.dirname(out), exist_ok=True)
crop.save(out)
print('wrote', out, crop.size)
