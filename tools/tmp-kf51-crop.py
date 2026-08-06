#!/usr/bin/env python3
# TEMP kf51 visual round: crop a region of a critic shot, upscale, save; print median RGB/HSV of center rect.
# usage: python3 tools/tmp-kf51-crop.py <shot.png> <x0> <y0> <x1> <y1> <out.png> [scale]
import sys, colorsys
from PIL import Image
from statistics import median

src, x0, y0, x1, y1, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), sys.argv[6]
scale = int(sys.argv[7]) if len(sys.argv) > 7 else 4
im = Image.open(src).convert('RGB')
crop = im.crop((x0, y0, x1, y1))
crop.resize((crop.width * scale, crop.height * scale), Image.NEAREST).save(out)
px = list(crop.getdata())
rs = sorted(p[0] for p in px); gs = sorted(p[1] for p in px); bs = sorted(p[2] for p in px)
n = len(px)
mr, mg, mb = rs[n // 2], gs[n // 2], bs[n // 2]
h, s, v = colorsys.rgb_to_hsv(mr / 255, mg / 255, mb / 255)
lum = 0.2126 * mr + 0.7152 * mg + 0.0722 * mb
print(f"median RGB ({mr},{mg},{mb})  hue {h*360:.1f}deg sat {s*100:.1f}% val {v*100:.1f}%  lum {lum:.1f}  n={n}")
