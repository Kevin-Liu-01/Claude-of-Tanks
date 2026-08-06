# TEMP (isu122s r11): batch ITU-601 on-element rect table off the critic
# pairs. Usage: python3 tools/tmp-isu122s-r11-rects.py <set-name>
# Rect sets are named below; each row: (label, image, x0, y0, x1, y1).
# Prints L / p05 / p25 / p50 / p75 / p95 / iqr(p75-p25) / dark% / Gex.
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
    vals = []
    gex = 0.0
    for y in range(y0, y1):
        for x in range(x0, x1):
            p = im.getpixel((x, y))
            if is_sky(p):
                continue
            vals.append(luma(p))
            gex += p[1] - (p[0] + p[2]) / 2
    if not vals:
        print(f'{label:26s} ALL SKY')
        return
    vals.sort()
    n = len(vals)
    q = lambda f: vals[min(n - 1, int(n * f))]
    mean = sum(vals) / n
    dark = sum(1 for v in vals if v < 45) / n * 100
    print(f'{label:26s} ({x0},{y0})-({x1},{y1}) n={n:6d} L={mean:6.1f} '
          f'p05={q(.05):5.1f} p25={q(.25):5.1f} p50={q(.50):5.1f} p75={q(.75):5.1f} p95={q(.95):5.1f} '
          f'iqr={q(.75)-q(.25):5.1f} dark%={dark:4.1f} Gex={gex/n:5.1f}')


D = 'shots/critic-isu122s'
SETS = {
    # ---- item 1: texture-floor tier surfaces --------------------------------
    # proc pane = probe pane + 640. hullRubber plate band y 216..320 (probe).
    'plates': [
        ('proc PLATE L wing',  f'{D}/view-front.png', 776, 224, 818, 296),
        ('proc PLATE R wing',  f'{D}/view-front.png', 1032, 224, 1145, 296),
        ('proc crest L',       f'{D}/view-front.png', 788, 172, 818, 212),
        ('proc crest R',       f'{D}/view-front.png', 1032, 172, 1140, 212),
        ('proc bowwall L',     f'{D}/view-front.png', 780, 335, 830, 420),
        ('proc bowwall R',     f'{D}/view-front.png', 1060, 335, 1130, 420),
        ('ref lowbow wide',    f'{D}/view-front.png', 100, 335, 560, 380),
        ('ref face-plate L',   f'{D}/view-front.png', 100, 210, 200, 300),
        ('ref face-plate R',   f'{D}/view-front.png', 430, 210, 545, 300),
        ('ref crest band',     f'{D}/view-front.png', 120, 150, 520, 185),
        ('ref crest L half',   f'{D}/view-front.png', 120, 150, 320, 185),
        ('ref crest R half',   f'{D}/view-front.png', 320, 150, 520, 185),
    ],
    # ---- right view: flank skin, wheels, tub, comb (proc pane = ref+640) ---
    # proc: px = 960 - 55.19*(z-1.5127); py = 320 - 55.19*(-0.0499x + 0.9987(y-1.056))
    # ref:  px = 411.5 - 56.2*(z+0.06);  py ~= 389 - 56.2*(y_world - 0.03)
    'right': [
        ('proc flank skin lo',  f'{D}/view-right.png', 950, 280, 1050, 288),
        ('proc flank skin hi',  f'{D}/view-right.png', 950, 267, 1050, 274),
        ('ref flank wall',      f'{D}/view-right.png', 305, 274, 405, 294),
        ('proc tub flare',      f'{D}/view-right.png', 1078, 315, 1140, 326),
        ('ref tub flare',       f'{D}/view-right.png', 440, 316, 505, 327),
        ('proc drum slotX',     f'{D}/view-right.png', 1118, 294, 1128, 310),
        ('ref drum slotX',      f'{D}/view-right.png', 484, 298, 494, 316),
        ('proc brakeX',         f'{D}/view-right.png', 688, 278, 742, 296),
        ('ref brakeX',          f'{D}/view-right.png', 58, 288, 114, 316),
        ('proc wheel2 face',   f'{D}/view-right.png', 972, 352, 994, 373),
        ('proc wheel3 face',   f'{D}/view-right.png', 1018, 352, 1040, 373),
        ('proc wheel4 face',   f'{D}/view-right.png', 1065, 352, 1087, 373),
        ('ref wheel4 face',    f'{D}/view-right.png', 428, 358, 444, 372),
        ('ref wheel5 face',    f'{D}/view-right.png', 468, 358, 484, 372),
        ('ref wheel2 face',    f'{D}/view-right.png', 348, 358, 364, 372),
        ('proc tub gap45',     f'{D}/view-right.png', 1093, 343, 1105, 357),
        ('proc tub gap56',     f'{D}/view-right.png', 1140, 343, 1151, 357),
        ('ref tub gap45',      f'{D}/view-right.png', 448, 344, 462, 358),
        ('ref tub gap56',      f'{D}/view-right.png', 488, 344, 500, 358),
        ('proc ground comb',   f'{D}/view-right.png', 1000, 366, 1170, 380),
        ('ref ground band',    f'{D}/view-right.png', 360, 366, 530, 380),
        ('proc drum slot',     f'{D}/view-right.png', 1080, 292, 1092, 310),
        ('ref drum slot',      f'{D}/view-right.png', 460, 300, 472, 318),
        ('proc muzzle brake',  f'{D}/view-right.png', 690, 292, 736, 316),
        ('ref muzzle brake',   f'{D}/view-right.png', 60, 296, 106, 320),
    ],
    # ---- rear view: cap windows -------------------------------------------
    'rear': [
        ('proc cap R arcs',    f'{D}/view-rear.png', 736, 258, 790, 305),
        ('proc cap L arcs',    f'{D}/view-rear.png', 1130, 258, 1184, 305),
        ('ref cap L disc',     f'{D}/view-rear.png', 520, 260, 600, 350),
        ('ref cap face only',  f'{D}/view-rear.png', 530, 290, 585, 340),
    ],
}

if __name__ == '__main__':
    name = sys.argv[1] if len(sys.argv) > 1 else 'plates'
    for row in SETS[name]:
        stat(*row)
