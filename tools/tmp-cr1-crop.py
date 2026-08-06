#!/usr/bin/env python3
# TEMP (uk challenger1 no-staircases round): crop+zoom from shots dirs.
# Usage: tmp-cr1-crop.py <dir> <view> <x0> <y0> <x1> <y1> <zoom> <out>
import sys
from PIL import Image
d, view, x0, y0, x1, y1, z, out = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6]), int(sys.argv[7]), sys.argv[8]
im = Image.open(f'{d}/{view}.png').convert('RGB')
im.crop((x0, y0, x1, y1)).resize(((x1-x0)*z, (y1-y0)*z), Image.NEAREST).save(f'{out}.png')
print('ok', out)
