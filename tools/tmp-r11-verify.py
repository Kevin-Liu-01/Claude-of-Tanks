#!/usr/bin/env python3
# TEMP (merkava r11): one-shot verification sweep over the critic pairs.
# Usage: tmp-r11-verify.py <shotsdir3d> [shotsdir1b]
import sys
from PIL import Image

BG = (0x15, 0x1B, 0x20)


def isbg(p):
    return abs(p[0] - BG[0]) < 12 and abs(p[1] - BG[1]) < 12 and abs(p[2] - BG[2]) < 12


def lum(p):
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]


def rect(px, xo, x0, x1, y0, y1, with_bg=False):
    vals = []
    nbg = 0
    for x in range(x0, x1):
        for y in range(y0, y1):
            p = px[xo + x, y][:3]
            if isbg(p):
                nbg += 1
                if not with_bg:
                    continue
            vals.append(lum(p))
    vals.sort()
    n = len(vals)
    if not n:
        return None
    q = lambda f: vals[min(n - 1, int(n * f))]
    mean = sum(vals) / n
    sd = (sum((v - mean) ** 2 for v in vals) / n) ** 0.5
    return dict(n=n, air=100 * nbg / ((x1 - x0) * (y1 - y0)), p5=q(.05), p25=q(.25), med=q(.5), p75=q(.75), p95=q(.95), sd=sd)


def warm(px, xo, x0, x1, y0, y1):
    c = 0
    for x in range(x0, x1):
        for y in range(y0, y1):
            p = px[xo + x, y][:3]
            if isbg(p) or (y < 30 and x < 200):
                continue
            if p[0] > p[1] + 3 and p[0] > 55:
                c += 1
    return c


def dark(px, xo, x0, x1, y0, y1, thr):
    c = 0
    for x in range(x0, x1):
        for y in range(y0, y1):
            p = px[xo + x, y][:3]
            if not isbg(p) and lum(p) < thr:
                c += 1
    return c


def gaps(px, xo, x0, x1):
    # sky gaps along the top edge: per-column first-content; count upward
    # steps >= 3px between neighbouring runs
    tops = []
    for x in range(x0, x1):
        t = None
        for y in range(60, 400):
            if not isbg(px[xo + x, y]):
                t = y
                break
        tops.append(t)
    g = 0
    runs = []
    cur = [tops[0]]
    for t in tops[1:]:
        if t is not None and cur[-1] is not None and abs(t - cur[-1]) <= 1:
            cur.append(t)
        else:
            runs.append(cur[0])
            cur = [t]
    runs.append(cur[0])
    for i in range(1, len(runs)):
        if runs[i] is not None and runs[i - 1] is not None:
            d = runs[i] - runs[i - 1]
            if 3 <= abs(d) <= 25:
                g += 1
    return g


d3 = sys.argv[1]
P = lambda v: {k: (round(x, 1) if isinstance(x, float) else x) for k, x in v.items()} if v else v

im = Image.open(f'{d3}/close-roof.png').convert('RGB'); px = im.load()
print('A close-roof deck warm: ref', warm(px, 0, 240, 640, 240, 560), 'proc', warm(px, 640, 240, 640, 240, 560), '(order: proc <= ref+50)')
im = Image.open(f'{d3}/view-top.png').convert('RGB'); px = im.load()
print('A view-top warm: ref', warm(px, 0, 0, 640, 0, 640), 'proc', warm(px, 640, 0, 640, 0, 640))
print('F-iii louvre x325..375 y128..155: ref', P(rect(px, 0, 325, 375, 128, 155)), 'proc', P(rect(px, 640, 325, 375, 128, 155)), '(order: sd >= 6)')
im = Image.open(f'{d3}/view-front.png').convert('RGB'); px = im.load()
print('A view-front turret-zone warm: ref', warm(px, 0, 150, 500, 120, 260), 'proc', warm(px, 640, 150, 500, 120, 260))
im = Image.open(f'{d3}/view-rear.png').convert('RGB'); px = im.load()
r = rect(px, 0, 160, 480, 195, 232, True); p = rect(px, 640, 160, 480, 195, 232, True)
print('C crown air y195..232: ref', round(r['air'], 1), 'proc', round(p['air'], 1), '(order: >= 80)')
print('C sky-gap steps x170..470: ref', gaps(px, 0, 170, 470), 'proc', gaps(px, 640, 170, 470), '(order: >= 6 of 3-10px)')
print('B rear x150..295 y382..392: ref p5', P(rect(px, 0, 150, 295, 382, 392))['p5'], 'proc p5', P(rect(px, 640, 150, 295, 382, 392))['p5'], '(order: >= 72)')
print('D rear-face x150..295 y385..480 sub-70: ref', dark(px, 0, 150, 295, 385, 480, 70), 'proc', dark(px, 640, 150, 295, 385, 480, 70), '(order: <= 300)')
print('D rear-face p95: ref', P(rect(px, 0, 150, 295, 385, 480))['p95'], 'proc', P(rect(px, 640, 150, 295, 385, 480))['p95'], '(order: 104-106 class)')
print('D center bay med: ref', P(rect(px, 0, 295, 345, 385, 480))['med'], 'proc', P(rect(px, 640, 295, 345, 385, 480))['med'], '(target ~98.5)')
im = Image.open(f'{d3}/view-rearleft.png').convert('RGB'); px = im.load()
print('B rearleft x70..210 y340..354 p5: ref', P(rect(px, 0, 70, 210, 340, 354))['p5'], 'proc', P(rect(px, 640, 70, 210, 340, 354))['p5'], '(order: >= 85)')
im = Image.open(f'{d3}/view-rearright.png').convert('RGB'); px = im.load()
print('B rearright x430..570 y340..354 p5: ref', P(rect(px, 0, 430, 570, 340, 354))['p5'], 'proc', P(rect(px, 640, 430, 570, 340, 354))['p5'], '(order: >= 70)')
im = Image.open(f'{d3}/hero-rearright.png').convert('RGB'); px = im.load()
r = rect(px, 0, 545, 625, 285, 395, True); p = rect(px, 640, 545, 625, 285, 395, True)
print('E hero-rr corner air: ref', round(r['air'], 1), 'proc', round(p['air'], 1), '(order: +6pp from 27.5)')
im = Image.open(f'{d3}/view-left.png').convert('RGB'); px = im.load()
r = rect(px, 0, 150, 450, 392, 420); p = rect(px, 640, 150, 450, 392, 420)
print('G arch row x150..450 y392..420: ref p5/p95', r['p5'], '/', round(r['p95'], 1), 'proc p5/p95', p['p5'], '/', round(p['p95'], 1), '(order: p5 >= 45, p95 >= 85)')
r = rect(px, 0, 150, 450, 360, 392); p = rect(px, 640, 150, 450, 360, 392)
print('G skirt band y360..392 p5: ref', r['p5'], 'proc', p['p5'], '(order: >= 75)')

if len(sys.argv) > 2:
    d1 = sys.argv[2]
    im = Image.open(f'{d1}/hero-rearright.png').convert('RGB'); px = im.load()
    r = rect(px, 0, 420, 500, 325, 385); p = rect(px, 640, 420, 500, 325, 385)
    print('1B hero-rr through-zone: ref', P(r), 'proc', P(p))
    im = Image.open(f'{d1}/view-top.png').convert('RGB'); px = im.load()
    print('1B plan sub-55 census (basket zone x220..420 y40..160): ref', dark(px, 0, 220, 420, 40, 160, 55), 'proc', dark(px, 640, 220, 420, 40, 160, 55))
