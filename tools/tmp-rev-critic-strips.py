# TEMP (leo2_revolution r7 independent critic): §H.4 variant-variety strips.
# Composes 2-up PROC-half strips (tank A over tank B) from critic pairs for
# the named views, so the family read is judged same-rig, same-scale.
# Usage: python3 tools/tmp-rev-critic-strips.py <dirA> <dirB> <out> v1,v2,...
import sys
from PIL import Image, ImageDraw

dirA, dirB, out, views = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4].split(',')

def proc_half(d, v):
    im = Image.open(f'{d}/{v}.png').convert('RGB')
    w, h = im.size
    return im.crop((w // 2, 0, w, h))

cols = []
for v in views:
    a = proc_half(dirA, v)
    b = proc_half(dirB, v)
    col = Image.new('RGB', (a.width, a.height + b.height + 26), (21, 27, 32))
    col.paste(a, (0, 22))
    col.paste(b, (0, a.height + 26))
    d = ImageDraw.Draw(col)
    d.text((8, 4), v, fill=(231, 237, 240))
    cols.append(col)

W = sum(c.width for c in cols)
H = max(c.height for c in cols)
strip = Image.new('RGB', (W, H), (21, 27, 32))
x = 0
for c in cols:
    strip.paste(c, (x, 0)); x += c.width
strip.save(out)
print('wrote', out, strip.size)
