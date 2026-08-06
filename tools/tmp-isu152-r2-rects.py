# TEMP (isu152 r2): batch ITU-601 on-element rect table off the critic pairs.
# Usage: python3 tools/tmp-isu152-r2-rects.py <set>
import sys
from PIL import Image

SKY = (0x15, 0x1B, 0x20)

def luma(px):
    return 0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2]

def is_sky(px, tol=9):
    return abs(px[0] - SKY[0]) <= tol and abs(px[1] - SKY[1]) <= tol and abs(px[2] - SKY[2]) <= tol

_imgs = {}

def img(path):
    if path not in _imgs:
        _imgs[path] = Image.open(path).convert('RGB')
    return _imgs[path]

def stat(label, path, x0, y0, x1, y1):
    im = img(path)
    vals, gex, warm = [], [], 0
    for y in range(y0, y1):
        for x in range(x0, x1):
            px = im.getpixel((x, y))
            if is_sky(px):
                continue
            vals.append(luma(px))
            gex.append(px[1] - max(px[0], px[2]))
            if px[0] > px[1] + 4:
                warm += 1
    if not vals:
        print(f"{label:42s} EMPTY")
        return
    vals.sort()
    n = len(vals)
    q = lambda p: vals[min(n - 1, int(p * n))]
    print(f"{label:42s} L {sum(vals)/n:6.1f} p05 {q(.05):5.1f} p25 {q(.25):5.1f} p50 {q(.5):5.1f} p75 {q(.75):5.1f} p95 {q(.95):5.1f} iqr {q(.75)-q(.25):5.1f} warm% {100*warm/n:4.1f} Gex {sum(gex)/n:5.1f} n={n}")

S = 'shots/critic-isu152/'
SETS = {
    'gear': [
        ('REF band ground run', S+'view-right.png', 120, 388, 430, 400),
        ('PROC band ground run', S+'view-right.png', 760, 388, 1070, 400),
        ('REF wheel face w3', S+'view-right.png', 264, 352, 296, 372),
        ('PROC wheel face w3', S+'view-right.png', 906, 352, 938, 372),
        ('REF gap w2-w3', S+'view-right.png', 240, 345, 258, 370),
        ('PROC gap w2-w3', S+'view-right.png', 882, 345, 900, 370),
        ('REF band rear face', S+'view-rear.png', 100, 390, 200, 420),
        ('PROC band rear face', S+'view-rear.png', 740, 390, 840, 420),
    ],
    'drum': [
        ('REF drum flank zone', S+'view-right.png', 430, 270, 520, 310),
        ('PROC drum flank zone', S+'view-right.png', 1070, 270, 1160, 310),
        ('REF drum caps rear', S+'view-rear.png', 105, 240, 175, 300),
        ('PROC drum caps rear', S+'view-rear.png', 745, 240, 815, 300),
    ],
    'plates': [
        ('REF wall side', S+'view-right.png', 200, 280, 380, 300),
        ('PROC wall side', S+'view-right.png', 840, 280, 1020, 300),
        ('REF rear plate', S+'view-rear.png', 250, 420, 420, 450),
        ('PROC rear plate', S+'view-rear.png', 890, 420, 1060, 450),
        ('REF tarp top', S+'view-top.png', 250, 95, 390, 145),
        ('PROC tarp top', S+'view-top.png', 890, 95, 1030, 145),
        ('REF bow glacis', S+'view-front.png', 240, 300, 400, 360),
        ('PROC bow glacis', S+'view-front.png', 880, 300, 1040, 360),
    ],
    'mantlet': [
        ('REF mantlet stack', S+'view-right.png', 460, 235, 560, 258),
        ('PROC mantlet stack', S+'view-right.png', 1100, 235, 1200, 258),
    ],
}
for label, path, x0, y0, x1, y1 in SETS.get(sys.argv[1] if len(sys.argv) > 1 else 'gear', []):
    stat(label, path, x0, y0, x1, y1)
