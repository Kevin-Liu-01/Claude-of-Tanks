#!/usr/bin/env python3
"""sheet4.py out.jpg cols scale file... : a grid of frames (row-major), each scaled, labelled with its path tail."""
import sys
from PIL import Image, ImageDraw
out, cols, scale = sys.argv[1], int(sys.argv[2]), float(sys.argv[3]); files = sys.argv[4:]
ims = [Image.open(f).convert('RGB') for f in files]
w, h = int(ims[0].width * scale), int(ims[0].height * scale)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (w * cols, h * rows), (0, 0, 0))
d = ImageDraw.Draw(sheet)
for i, (im, f) in enumerate(zip(ims, files)):
    x, y = (i % cols) * w, (i // cols) * h
    sheet.paste(im.resize((w, h)), (x, y))
    d.text((x + 6, y + 4), '/'.join(f.split('/')[-4:]), fill=(255, 255, 0))
sheet.save(out, quality=86)
print(out, sheet.size)
