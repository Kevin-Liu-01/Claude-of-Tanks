#!/usr/bin/env python3
"""TEMP (isu122s r7): crop + magnify + optional brighten for element reads.
Usage: tmp-isu122s-crop.py <in.png> <out.png> x y w h [scale] [gain]
"""
import sys
from PIL import Image, ImageEnhance

src, dst = sys.argv[1], sys.argv[2]
x, y, w, h = (int(v) for v in sys.argv[3:7])
scale = float(sys.argv[7]) if len(sys.argv) > 7 else 4.0
gain = float(sys.argv[8]) if len(sys.argv) > 8 else 1.0
im = Image.open(src).convert('RGB').crop((x, y, x + w, y + h))
im = im.resize((int(w * scale), int(h * scale)), Image.NEAREST)
if gain != 1.0:
    im = ImageEnhance.Brightness(im).enhance(gain)
im.save(dst)
print(f'{dst} {im.size[0]}x{im.size[1]} from {src} ({x},{y})-{x+w},{y+h} x{scale} gain{gain}')
