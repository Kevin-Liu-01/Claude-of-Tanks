# leo-509: compose the §5.16 family strip (type90 basis + proto + a4)
# usage: python3 tools/tmp-leo509-strip.py <out.png> <view> <dir1> <dir2> <dir3>
import sys
from PIL import Image

out, view = sys.argv[1], sys.argv[2]
dirs = sys.argv[3:]
ims = [Image.open(f'{d}/{view}.png').convert('RGB') for d in dirs]
w = max(im.width for im in ims)
strip = Image.new('RGB', (w, sum(im.height for im in ims)), (21, 27, 32))
y = 0
for im in ims:
    strip.paste(im, ((w - im.width) // 2, y))
    y += im.height
strip.save(out)
print(f'{out} {strip.width}x{strip.height}')
