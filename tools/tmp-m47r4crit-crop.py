#!/usr/bin/env python3
# TEMP (m47_patton r4 critic): zoom crops from critic pair halves.
# DIAGNOSIS-ONLY (§D: custom crops never count as verdict evidence).
# usage: tmp-m47r4crit-crop.py <pair.png> <half|both> x0 x1 y0 y1 [scale] [out.png]
import sys
from PIL import Image

path, half = sys.argv[1], sys.argv[2]
x0, x1, y0, y1 = (int(v) for v in sys.argv[3:7])
scale = int(sys.argv[7]) if len(sys.argv) > 7 else 3
out = sys.argv[8] if len(sys.argv) > 8 else '/private/tmp/claude-501/-Users-kevinliu-claude-of-tanks/d0226c73-49ae-490e-9a35-39379da35769/scratchpad/crop.png'
im = Image.open(path).convert('RGB')
if half == 'both':
    a = im.crop((x0, y0, x1, y1)).resize(((x1 - x0) * scale, (y1 - y0) * scale), Image.NEAREST)
    b = im.crop((640 + x0, y0, 640 + x1, y1)).resize(((x1 - x0) * scale, (y1 - y0) * scale), Image.NEAREST)
    w, h = a.size
    canvas = Image.new('RGB', (w * 2 + 8, h), (40, 40, 40))
    canvas.paste(a, (0, 0)); canvas.paste(b, (w + 8, 0))
    canvas.save(out)
else:
    xoff = 0 if half == 'ref' else 640
    im.crop((xoff + x0, y0, xoff + x1, y1)).resize(((x1 - x0) * scale, (y1 - y0) * scale), Image.NEAREST).save(out)
print(out)
