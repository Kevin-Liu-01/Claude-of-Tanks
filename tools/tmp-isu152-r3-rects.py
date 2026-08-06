# TEMP (isu152 r3): batch ITU-601 on-element rect table off the critic pairs.
# Adds B/G hue ratio + sky%% per rect (the r3 appliqué + gear-window metrics).
# Usage: python3 tools/tmp-isu152-r3-rects.py <set> [shotdir]
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
    vals, gex, warm, sky = [], [], 0, 0
    sb = sg = 0.0
    n_all = 0
    for y in range(y0, y1):
        for x in range(x0, x1):
            px = im.getpixel((x, y))
            n_all += 1
            if is_sky(px):
                sky += 1
                continue
            vals.append(luma(px))
            gex.append(px[1] - max(px[0], px[2]))
            sb += px[2]; sg += px[1]
            if px[0] > px[1] + 4:
                warm += 1
    if not vals:
        print(f"{label:40s} EMPTY (sky {100.0 * sky / max(1, n_all):.1f}%)")
        return
    vals.sort()
    n = len(vals)
    q = lambda p: vals[min(n - 1, int(p * n))]
    bg = sb / sg if sg else 0
    print(f"{label:40s} L {sum(vals)/n:6.1f} p05 {q(.05):5.1f} p25 {q(.25):5.1f} p50 {q(.5):5.1f} p75 {q(.75):5.1f} p95 {q(.95):5.1f} iqr {q(.75)-q(.25):5.1f} warm% {100*warm/n:4.1f} Gex {sum(gex)/n:5.1f} B/G {bg:.2f} sky% {100*sky/n_all:4.1f} n={n}")

S = (sys.argv[2].rstrip('/') + '/') if len(sys.argv) > 2 else 'shots/critic-isu152/'
P = 640  # proc pane x offset

def pair(label, view, x0, y0, x1, y1):
    return [
        (f'REF  {label}', S + view + '.png', x0, y0, x1, y1),
        (f'PROC {label}', S + view + '.png', x0 + P, y0, x1 + P, y1),
    ]

SETS = {
    # Pane mapping (verified this round): view-left renders TAIL-LEFT:
    #   px = 46 + (z+3.407)*60.2 ; view-right renders FRONT-LEFT:
    #   px = 46 + (5.72-z)*60.2 ; py = 399 - y*60.2. Proc pane = ref + 640.
    # item 1/2/12: running-gear read (view-left)
    'gear': (
        pair('gap-band run z-2.2..2.15', 'view-left', 119, 340, 380, 392)
        + pair('wheel w3 disc', 'view-left', 328, 365, 357, 389)
        + pair('window w2-w3', 'view-left', 290, 366, 299, 389)
        + pair('window w4-w5', 'view-left', 200, 366, 209, 389)
        + pair('ground run', 'view-left', 119, 390, 380, 400)
        + pair('idler zone', 'view-left', 397, 335, 433, 385)
        + pair('band rear face', 'view-rear', 100, 390, 200, 420)
    ),
    # item 3: pale appliqué family
    'applique': (
        pair('wall skin band', 'view-right', 240, 285, 400, 298)
        + pair('wall chamfer band', 'view-right', 240, 273, 400, 281)
        + pair('glacis skin', 'view-front', 250, 202, 390, 243)
        + pair('bow below skin', 'view-front', 250, 250, 390, 300)
    ),
    # item 6/11: rear composition + drum caps
    'rear': (
        pair('flap slab rear face L', 'view-rear', 95, 455, 185, 490)
        + pair('fall plate', 'view-rear', 250, 420, 420, 450)
        + pair('drum caps', 'view-rear', 105, 240, 175, 300)
        + pair('casemate rear wall', 'view-rear', 230, 160, 410, 220)
        + pair('slope covers band', 'view-rear', 220, 345, 420, 375)
    ),
    # item 8/9: muzzle + casting (view-right)
    'muzzle': (
        pair('muzzle zone z 5.3..5.72', 'view-right', 46, 270, 78, 300)
        + pair('mantlet stack z 2.7..3.45', 'view-right', 183, 233, 228, 262)
    ),
}
for label, path, x0, y0, x1, y1 in SETS.get(sys.argv[1] if len(sys.argv) > 1 else 'gear', []):
    stat(label, path, x0, y0, x1, y1)
