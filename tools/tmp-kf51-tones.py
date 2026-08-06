#!/usr/bin/env python3
# TEMP kf51 tone probe: cluster-ish stats over a rect — deciles by luminance
# and by R-G (brownness), so blotch tones can be compared ref vs proc.
# usage: python3 tools/tmp-kf51-tones.py <shot.png> <x0> <y0> <x1> <y1>
import sys, colorsys
from PIL import Image

src, x0, y0, x1, y1 = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
im = Image.open(src).convert('RGB')
px = [p for p in im.crop((x0, y0, x1, y1)).getdata()]
px = [p for p in px if 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2] > 12]  # drop background/shadow


def med(sub):
    if not sub:
        return None
    rs = sorted(p[0] for p in sub)
    gs = sorted(p[1] for p in sub)
    bs = sorted(p[2] for p in sub)
    n = len(sub)
    return (rs[n // 2], gs[n // 2], bs[n // 2])


def show(tag, sub):
    m = med(sub)
    if not m:
        print(f"{tag}: (empty)")
        return
    h, s, v = colorsys.rgb_to_hsv(m[0] / 255, m[1] / 255, m[2] / 255)
    lum = 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]
    print(f"{tag}: RGB {m} hue {h*360:.1f} sat {s*100:.1f}% lum {lum:.1f} (n {len(sub)})")


bylum = sorted(px, key=lambda p: 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2])
n = len(bylum)
show('darkest 8%', bylum[: max(1, n * 8 // 100)])
show('median band', bylum[n * 45 // 100: n * 55 // 100])
show('brightest 5%', bylum[n * 95 // 100:])
bybrown = sorted(px, key=lambda p: p[0] - p[1])
show('brownest 10%', bybrown[n * 90 // 100:])
