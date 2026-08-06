#!/usr/bin/env python3
# TEMP (independent critic, abrams wave 2026-08-05): crop/zoom regions out of
# the official critic pairs for 2x reads. Reads shots/critic-<id>/<view>.png
# (1280x640: left=REF, right=PROC), writes zoomed crops to the scratchpad.
# Usage: tmp-abramswave-crop.py <pairpath> <half:ref|proc|both> <x0> <y0> <x1> <y1> <zoom> <out>
# Coordinates are in the HALF's own 640x640 space.
import sys
from PIL import Image

pair, half, x0, y0, x1, y1, zoom, out = sys.argv[1:9]
x0, y0, x1, y1, zoom = int(x0), int(y0), int(x1), int(y1), float(zoom)
img = Image.open(pair)
halves = {'ref': 0, 'proc': 640}
if half == 'both':
    crops = []
    for off in (0, 640):
        c = img.crop((x0 + off, y0, x1 + off, y1))
        crops.append(c)
    w, h = crops[0].size
    canvas = Image.new('RGB', (w * 2 + 8, h), (40, 44, 52))
    canvas.paste(crops[0], (0, 0))
    canvas.paste(crops[1], (w + 8, 0))
    c = canvas
else:
    off = halves[half]
    c = img.crop((x0 + off, y0, x1 + off, y1))
if zoom != 1:
    c = c.resize((int(c.width * zoom), int(c.height * zoom)), Image.NEAREST)
c.save(out)
print(out, c.size)
