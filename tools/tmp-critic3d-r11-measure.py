#!/usr/bin/env python3
# TEMP (merkava3d r11 INDEPENDENT CRITIC): my own windows, ITU-601, mask method
# per BUILD-STANDARD SD. Fresh pairs in shots/critic-merkava3d/.
import sys
from PIL import Image

D = 'shots/critic-merkava3d'
BG = (0x15, 0x1B, 0x20)


def isbg(p):
    return abs(p[0] - BG[0]) <= 13 and abs(p[1] - BG[1]) <= 13 and abs(p[2] - BG[2]) <= 13


def lum(p):
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]


def rect(px, xo, x0, x1, y0, y1, keepbg=False):
    vals, nbg = [], 0
    for x in range(x0, x1):
        for y in range(y0, y1):
            p = px[xo + x, y][:3]
            if isbg(p):
                nbg += 1
                if not keepbg:
                    continue
            vals.append(lum(p))
    vals.sort()
    n = len(vals)
    if not n:
        return None
    q = lambda f: round(vals[min(n - 1, int(n * f))], 1)
    mean = sum(vals) / n
    sd = (sum((v - mean) ** 2 for v in vals) / n) ** 0.5
    return dict(n=n, air=round(100.0 * nbg / ((x1 - x0) * (y1 - y0)), 1), p5=q(.05), p25=q(.25), med=q(.5), p75=q(.75), p95=q(.95), sd=round(sd, 2))


def darkc(px, xo, x0, x1, y0, y1, thr):
    c = 0
    for x in range(x0, x1):
        for y in range(y0, y1):
            p = px[xo + x, y][:3]
            if not isbg(p) and lum(p) < thr:
                c += 1
    return c


def load(v):
    im = Image.open(f'{D}/{v}.png').convert('RGB')
    return im.load()


def pair(tag, px, x0, x1, y0, y1, keepbg=False):
    r = rect(px, 0, x0, x1, y0, y1, keepbg)
    p = rect(px, 640, x0, x1, y0, y1, keepbg)
    print(f'{tag}: REF {r}')
    print(f'{" " * len(tag)}  PROC {p}')


# --- close-roof: big-plane relief + near-black census (structure, not warm) ---
px = load('close-roof')
pair('CR deck big plane x80..450 y230..330', px, 80, 450, 230, 330)
pair('CR fwd-roof plane x120..350 y360..450', px, 120, 350, 360, 450)
print('CR near-black<45 census x0..640 y240..640: REF', darkc(px, 0, 0, 640, 240, 640, 45), 'PROC', darkc(px, 640, 0, 640, 240, 640, 45))
print('CR sub-60 census: REF', darkc(px, 0, 0, 640, 240, 640, 60), 'PROC', darkc(px, 640, 0, 640, 240, 640, 60))

# --- view-front: ruled pale line across turret rear + warm check zone tone ---
px = load('view-front')
pair('VF turret band row y208..218 x180..460', px, 180, 460, 208, 218)
pair('VF turret zone x150..500 y120..260', px, 150, 500, 120, 260)

# --- view-top: deck texture class (mottle sd) on big field + tail slot band ---
px = load('view-top')
pair('VT mid-deck field x230..410 y330..430', px, 230, 410, 330, 430)
pair('VT tail band x215..425 y47..75', px, 215, 425, 47, 75, True)
print('VT tail-band sky-through cells (bg px): REF', darkc(px, 0, 215, 425, 47, 75, -1), 'PROC', darkc(px, 640, 215, 425, 47, 75, -1))

# --- side orthos: wheel-band reads (my windows, wider than r9 G) ---
px = load('view-left')
pair('VL wheel row x150..450 y392..425', px, 150, 450, 392, 425)
pair('VL hull band x150..450 y330..360', px, 150, 450, 330, 360)
px = load('view-right')
pair('VR wheel row x190..490 y392..425', px, 190, 490, 392, 425)

# --- hero-rr: overall-read metrics (arbitration 1: NOT corner-air alone) ---
px = load('hero-rearright')
pair('HRR rear-kit zone x430..640 y300..420', px, 430, 640, 300, 420)
pair('HRR crate faces x480..610 y430..530', px, 480, 610, 430, 530)

# --- hero-fl: band wall relief ---
px = load('hero-frontleft')
pair('HFL band wall x330..560 y250..300', px, 330, 560, 250, 300)

# --- quarters: under-rim + rack-band reads (B partial verification) ---
px = load('view-rearleft')
pair('VRL under-rim x70..210 y340..354', px, 70, 210, 340, 354)
px = load('view-rearright')
pair('VRR under-rim x430..570 y340..354', px, 430, 570, 340, 354)
