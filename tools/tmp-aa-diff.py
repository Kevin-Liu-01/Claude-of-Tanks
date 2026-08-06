# TEMP (aa-r1): frame-to-frame shimmer analysis for the motion bursts.
# For a 3-frame burst (camera strafing ~0.05 m/frame, everything else frozen)
# computes per-pixel max-channel |f1-f0| and |f2-f1|, combines, and writes:
#   <view>_diffmap.png  — 4x amplified diff heat overview
#   stats to stdout     — per 100x100 grid cell mean diff, top offenders
# Usage: python3 tools/tmp-aa-diff.py <dir> <view> [<view> ...]
import sys, os
from PIL import Image, ImageChops, ImageDraw

d = sys.argv[1]
views = sys.argv[2:]

def load(v, f):
    return Image.open(os.path.join(d, f"{v}_f{f}.png")).convert('RGB')

for v in views:
    f0, f1, f2 = load(v, 0), load(v, 1), load(v, 2)
    d01 = ImageChops.difference(f0, f1)
    d12 = ImageChops.difference(f1, f2)
    comb = ImageChops.lighter(d01, d12)
    # max across channels -> L
    r, g, b = comb.split()
    m = ImageChops.lighter(ImageChops.lighter(r, g), b)
    W, H = m.size
    # grid stats
    CELL = 100
    cells = []
    px = m.load()
    for cy in range(0, H - CELL + 1, CELL):
        for cx in range(0, W - CELL + 1, CELL):
            crop = m.crop((cx, cy, cx + CELL, cy + CELL))
            h = crop.histogram()
            tot = sum(h)
            mean = sum(i * n for i, n in enumerate(h)) / max(tot, 1)
            # % pixels with diff > 40 (hard sparkle)
            hard = sum(h[40:]) * 100.0 / max(tot, 1)
            cells.append((mean, hard, cx, cy))
    cells.sort(reverse=True)
    print(f"== {v}  ({W}x{H})")
    whole_h = m.histogram()
    tot = sum(whole_h)
    wm = sum(i * n for i, n in enumerate(whole_h)) / tot
    hard = sum(whole_h[40:]) * 100.0 / tot
    print(f"   whole-frame: meanDiff {wm:.2f}  hard(>40) {hard:.2f}%")
    for mean, hardc, cx, cy in cells[:10]:
        print(f"   cell ({cx:4},{cy:4}) meanDiff {mean:6.2f}  hard {hardc:5.1f}%")
    amp = m.point(lambda t: min(255, t * 4))
    amp.convert('RGB').save(os.path.join(d, f"{v}_diffmap.png"))
print("done")
