#!/usr/bin/env python3
# TEMP (m46_patton r5 critic): RGB-channel scanners the banked ITU-601 tool
# lacks — hue-ratio windows (m47-r4 N1 class) + blue-signature void checks
# (§B2/D sky law: bg maxch<=13 AND B-R>=+8). Halves: ref x0..639, proc +640.
# Modes:
#   hue   <pair> <half> x0 x1 y0 y1     mean R/G/B + r/g ratio of non-bg px
#   sky   <pair> <half> x0 x1 y0 y1     mask-method air census: bg-window px
#                                        count, of which blue-signature px
#   band  <pair> <half> x0 x1 y0 y1 thr  sub-thr luma census + largest patch
import sys
from PIL import Image

BG = (0x15, 0x1B, 0x20)


def is_bgwin(p):
    return max(abs(p[0] - BG[0]), abs(p[1] - BG[1]), abs(p[2] - BG[2])) <= 13


def lum(p):
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]


def main():
    mode, path, half = sys.argv[1], sys.argv[2], sys.argv[3]
    xoff = 0 if half == 'ref' else 640
    x0, x1, y0, y1 = (int(v) for v in sys.argv[4:8])
    im = Image.open(path).convert('RGB')
    px = im.load()

    if mode == 'hue':
        rs = gs = bs = n = 0
        for x in range(x0, x1):
            for y in range(y0, y1):
                p = px[xoff + x, y][:3]
                if is_bgwin(p):
                    continue
                rs += p[0]; gs += p[1]; bs += p[2]; n += 1
        if n == 0:
            print(f'{half} hue [{x0}..{x1}]x[{y0}..{y1}]: EMPTY')
            return
        print(f'{half} hue [{x0}..{x1}]x[{y0}..{y1}] n={n}: '
              f'R {rs/n:.1f} G {gs/n:.1f} B {bs/n:.1f}  r/g {rs/gs:.3f}')

    elif mode == 'sky':
        nb = nblue = n = 0
        for x in range(x0, x1):
            for y in range(y0, y1):
                p = px[xoff + x, y][:3]
                n += 1
                if is_bgwin(p):
                    nb += 1
                    if p[2] - p[0] >= 8:
                        nblue += 1
        print(f'{half} sky [{x0}..{x1}]x[{y0}..{y1}] n={n}: bg-window {nb} '
              f'({100*nb/n:.1f}%) blue-signature {nblue} ({100*nblue/n:.1f}%)')

    elif mode == 'band':
        thr = int(sys.argv[8])
        cnt = tot = 0
        for x in range(x0, x1):
            for y in range(y0, y1):
                p = px[xoff + x, y][:3]
                if is_bgwin(p):
                    continue
                tot += 1
                if lum(p) < thr:
                    cnt += 1
        pct = 100 * cnt / tot if tot else 0
        print(f'{half} band<{thr} [{x0}..{x1}]x[{y0}..{y1}]: {cnt}/{tot} ({pct:.1f}%)')


main()
