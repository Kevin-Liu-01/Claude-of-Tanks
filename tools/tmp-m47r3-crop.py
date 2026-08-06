#!/usr/bin/env python3
# TEMP (m47_patton r3 critic): crop+zoom regions from fresh critic pairs.
# Usage: tmp-m47r3-crop.py <dir> <view> <x0> <y0> <x1> <y1> <zoom> <outname> [--pair]
# --pair crops the same window from both halves (ref x, proc x+640) side by side.
import sys
from PIL import Image

d, view = sys.argv[1], sys.argv[2]
x0, y0, x1, y1, z = (int(v) for v in sys.argv[3:8])
out = sys.argv[8]
pair = '--pair' in sys.argv
OUTDIR = '/private/tmp/claude-501/-Users-kevinliu-claude-of-tanks/d0226c73-49ae-490e-9a35-39379da35769/scratchpad'
im = Image.open(f'{d}/{view}.png').convert('RGB')
if pair:
    a = im.crop((x0, y0, x1, y1)).resize(((x1 - x0) * z, (y1 - y0) * z), Image.NEAREST)
    b = im.crop((x0 + 640, y0, x1 + 640, y1)).resize(((x1 - x0) * z, (y1 - y0) * z), Image.NEAREST)
    w, h = a.size
    canvas = Image.new('RGB', (w * 2 + 8, h), (40, 40, 48))
    canvas.paste(a, (0, 0))
    canvas.paste(b, (w + 8, 0))
    canvas.save(f'{OUTDIR}/{out}.png')
else:
    im.crop((x0, y0, x1, y1)).resize(((x1 - x0) * z, (y1 - y0) * z), Image.NEAREST).save(f'{OUTDIR}/{out}.png')
print('ok', out)
