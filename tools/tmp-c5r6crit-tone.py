#!/usr/bin/env python3
# TEMP r6 INDEPENDENT CRITIC: ITU-601 luma stats on named rects of the FRESH
# critic renders (pure PIL). Re-derives every banked tone number per §D.
from PIL import Image

def luma_stats(img, x0, y0, x1, y1):
    px = list(img.convert('RGB').crop((x0, y0, x1, y1)).getdata())
    Ls = sorted(0.299 * r + 0.587 * g + 0.114 * b for (r, g, b) in px)
    n = len(Ls)
    rm = sum(p[0] for p in px) / n
    gm = sum(p[1] for p in px) / n
    bm = sum(p[2] for p in px) / n
    return dict(p5=Ls[int(0.05 * n)], mean=sum(Ls) / n, p95=Ls[int(0.95 * n) - 1],
                rmean=rm, gmean=gm, bmean=bm)

def show(name, img, rect, label):
    s = luma_stats(img, *rect)
    print(f"{name} {label} rect{rect}: p5 {s['p5']:.1f} mean {s['mean']:.1f} p95 {s['p95']:.1f} "
          f"rgb ({s['rmean']:.0f},{s['gmean']:.0f},{s['bmean']:.0f}) g-r {s['gmean']-s['rmean']:+.1f}")

base = 'shots/critic-chieftain5/'

# O2 window: left gear zone (r5/r6 cited rect)
img = Image.open(base + 'view-left.png')
show('view-left', img, (700, 345, 1065, 395), 'PROC gear zone')
show('view-left', img, (60, 345, 425, 395), 'REF gear zone')

# r4/r5 holds re-verify: rear corner columns + sprocket C
img = Image.open(base + 'view-rear.png')
show('view-rear', img, (745, 395, 800, 575), 'PROC left rear corner')
show('view-rear', img, (105, 395, 160, 575), 'REF left rear corner')
# O3b wood lump rect (was L~135 pre-r6)
show('view-rear', img, (745, 335, 763, 350), 'PROC ex-wood lump')

img = Image.open(base + 'view-rearleft.png')
show('view-rearleft', img, (1010, 340, 1105, 420), 'PROC sprocket C')
show('view-rearleft', img, (370, 340, 465, 420), 'REF sprocket C mirror')

# O3c under-collar band (front): p95 was 90.7, ordered toward ref 68.1
img = Image.open(base + 'view-front.png')
show('view-front', img, (925, 225, 995, 250), 'PROC under-collar band')
show('view-front', img, (285, 225, 355, 250), 'REF same-zone mirror')

# O3a mauve ring at sleeve root (close-front) — ordered green-family g>r
img = Image.open(base + 'close-front.png')
show('close-front', img, (880, 300, 930, 340), 'PROC sleeve-root ring band')
show('close-front', img, (240, 300, 290, 340), 'REF same-zone mirror')

# warm census: any r>g+8 & L>55 cells left on proc half (front + rear + top)
for view in ('view-front', 'view-rear', 'view-top', 'hero-toptilt'):
    img = Image.open(base + view + '.png').convert('RGB')
    w, h = img.size
    data = list(img.getdata())
    warm_proc = warm_ref = 0
    for i, (r, g, b) in enumerate(data):
        L = 0.299 * r + 0.587 * g + 0.114 * b
        if r > g + 8 and L > 55:
            if (i % w) >= 640: warm_proc += 1
            else: warm_ref += 1
    print(f"{view} warm census (r>g+8 & L>55): PROC {warm_proc} px REF {warm_ref} px")
