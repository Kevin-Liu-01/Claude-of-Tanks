#!/usr/bin/env python3
# TEMP r5 critic: ITU-601 luma stats on named rects of the fresh critic renders (pure PIL)
from PIL import Image

def luma_stats(img, x0, y0, x1, y1):
    px = img.convert('RGB').crop((x0, y0, x1, y1)).getdata()
    Ls = sorted(0.299 * r + 0.587 * g + 0.114 * b for (r, g, b) in px)
    n = len(Ls)
    rm = sum(p[0] for p in px) / n
    gm = sum(p[1] for p in px) / n
    bm = sum(p[2] for p in px) / n
    return dict(p5=Ls[int(0.05 * n)], mean=sum(Ls) / n, p95=Ls[int(0.95 * n) - 1],
                rmean=rm, gmean=gm, bmean=bm)

def show(name, img, rect, label):
    s = luma_stats(img, *rect)
    print(f"{name} {label} rect{rect}: p5 {s['p5']:.1f} mean {s['mean']:.1f} p95 {s['p95']:.1f} rgb ({s['rmean']:.0f},{s['gmean']:.0f},{s['bmean']:.0f})")

base = 'shots/critic-chieftain5/'

img = Image.open(base + 'view-left.png')
show('view-left', img, (700, 345, 1065, 395), 'PROC gear zone')
show('view-left', img, (60, 345, 425, 395), 'REF gear zone')

img = Image.open(base + 'view-rear.png')
show('view-rear', img, (745, 395, 800, 575), 'PROC left rear corner')
show('view-rear', img, (105, 395, 160, 575), 'REF left rear corner')

img = Image.open(base + 'view-rearleft.png')
show('view-rearleft', img, (1010, 340, 1105, 420), 'PROC sprocket C')
show('view-rearleft', img, (370, 340, 465, 420), 'REF sprocket C mirror')

img = Image.open(base + 'view-front.png')
show('view-front', img, (925, 225, 995, 250), 'PROC ex-tan plate')
show('view-front', img, (820, 215, 880, 260), 'PROC searchlight zone')
show('view-front', img, (285, 225, 355, 250), 'REF same-zone mirror')

px = img.convert('RGB')
w, h = px.size
data = px.getdata()
cnt_proc = cnt_ref = 0
for i, (r, g, b) in enumerate(data):
    if b > r + 8 and b > 60:
        if (i % w) >= 640: cnt_proc += 1
        else: cnt_ref += 1
print(f"view-front blue-pixel count (b>r+8 & b>60): PROC {cnt_proc} REF {cnt_ref}")
