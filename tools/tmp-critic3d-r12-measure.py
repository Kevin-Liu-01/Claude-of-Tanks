#!/usr/bin/env python3
# TEMP (merkava3d r12 INDEPENDENT CRITIC): verify every r12 headline claim on
# MY fresh pairs + my own windows. ITU-601 luma, mask method maxch<=13 per
# BUILD-STANDARD SD. Pairs: shots/critic-merkava3d/ (ref at x0, proc at x640).
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


def warm(px, xo, x0, x1, y0, y1):
    # builder's warm scanner (r11 family): R > G+3 and R > 55, skip bg + HUD corner
    c = 0
    for x in range(x0, x1):
        for y in range(y0, y1):
            p = px[xo + x, y][:3]
            if isbg(p) or (y < 30 and x < 200):
                continue
            if p[0] > p[1] + 3 and p[0] > 55:
                c += 1
    return c


def gaps(px, xo, x0, x1):
    # skyline steps 3-25px between neighbouring top-content runs (builder's scanner)
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


def load(v):
    im = Image.open(f'{D}/{v}.png').convert('RGB')
    return im.load()


def pair(tag, px, x0, x1, y0, y1, keepbg=False):
    r = rect(px, 0, x0, x1, y0, y1, keepbg)
    p = rect(px, 640, x0, x1, y0, y1, keepbg)
    print(f'{tag}: REF {r}')
    print(f'{" " * len(tag)}  PROC {p}')


print('================ r12 ORDER-CLAIM VERIFICATION (builder numbers -> my fresh pairs) ================')

# ---- order 2: wheel-row polarity, four gates ----
px = load('view-left')
pair('O2 VL wheel row x150..450 y392..425', px, 150, 450, 392, 425)
pair('O2 VL hull band x150..450 y330..360', px, 150, 450, 330, 360)
r = rect(px, 0, 150, 450, 360, 392); p = rect(px, 640, 150, 450, 360, 392)
print(f'O5-G VL skirt band y360..392 p5: REF {r["p5"]} PROC {p["p5"]}  (r11 order >=75; claim 93.7 / ref 91.8)')
px = load('view-right')
pair('O2 VR wheel row x190..490 y392..425', px, 190, 490, 392, 425)

# ---- order 3: under-rim chocks + rear-face census bonus ----
px = load('view-rearleft')
pair('O3 VRL under-rim x70..210 y340..354', px, 70, 210, 340, 354)
px = load('view-rearright')
pair('O3 VRR under-rim x430..570 y340..354', px, 430, 570, 340, 354)
px = load('view-rear')
print('O3 rear-face x150..295 y385..480 sub-70: REF', darkc(px, 0, 150, 295, 385, 480, 70), 'PROC', darkc(px, 640, 150, 295, 385, 480, 70), '(r11 order <=300; claim 343)')
print('O3 rear-face p95: REF', rect(px, 0, 150, 295, 385, 480)['p95'], 'PROC', rect(px, 640, 150, 295, 385, 480)['p95'], '(claim 102.6, class 104-106)')
print('O3 center bay med: REF', rect(px, 0, 295, 345, 385, 480)['med'], 'PROC', rect(px, 640, 295, 345, 385, 480)['med'], '(r11 94.4 vs 98.4)')

# ---- order 4: crown air (CERTIFIED carrier floor) + steps + under-rim protect ----
r = rect(px, 0, 160, 480, 195, 232, True); p = rect(px, 640, 160, 480, 195, 232, True)
print('O4 crown air y195..232: REF', r['air'], 'PROC', p['air'], '(claim 76.2; certified carrier floor; ref 87.2)')
print('O4 skyline steps x170..470: REF', gaps(px, 0, 170, 470), 'PROC', gaps(px, 640, 170, 470), '(claim 24, order >=20)')
print('O4 under-rim rear x150..295 y382..392 p5: REF', rect(px, 0, 150, 295, 382, 392)['p5'], 'PROC', rect(px, 640, 150, 295, 382, 392)['p5'], '(claim 82.3, order >=80)')

# ---- order 5: deck ink->shade, relief, warm certs ----
px = load('close-roof')
print('O5 CR sub-60 census x0..640 y240..640: REF', darkc(px, 0, 0, 640, 240, 640, 60), 'PROC', darkc(px, 640, 0, 640, 240, 640, 60), '(order <=6000; claim 6824; ref 4086)')
print('O5 CR near-black<45: REF', darkc(px, 0, 0, 640, 240, 640, 45), 'PROC', darkc(px, 640, 0, 640, 240, 640, 45))
print('O5 CR deck warm x240..640 y240..560: REF', warm(px, 0, 240, 640, 240, 560), 'PROC', warm(px, 640, 240, 640, 240, 560), '(cert floor 626; claim 652)')
pair('O5 CR fwd-roof plane x120..350 y360..450', px, 120, 350, 360, 450)
pair('O5 CR deck big plane x80..450 y230..330', px, 80, 450, 230, 330)
px = load('hero-frontleft')
pair('O5 HFL band wall x330..560 y250..300', px, 330, 560, 250, 300)
px = load('view-front')
print('O5 VF turret-zone warm x150..500 y120..260: REF', warm(px, 0, 150, 500, 120, 260), 'PROC', warm(px, 640, 150, 500, 120, 260), '(claim 57, order-edge ~57)')
pair('VF band row x180..460 y208..218', px, 180, 460, 208, 218)
pair('VF turret zone x150..500 y120..260', px, 150, 500, 120, 260)
px = load('view-top')
print('O5 VT warm full: REF', warm(px, 0, 0, 640, 0, 640), 'PROC', warm(px, 640, 0, 640, 0, 640), '(claim 581)')

# ---- order 6: gun-FORM footprints (official .50 window; my M2/loader zones) ----
print('O6 VT .50 window x374..392 y270..330 sub-78: REF', darkc(px, 0, 374, 392, 270, 330, 78), 'PROC', darkc(px, 640, 374, 392, 270, 330, 78), '(claim 44; ref 32)')

# ---- PROTECT set ----
pair('PR VT louvre x325..375 y128..155', px, 325, 375, 128, 155)
pair('PR VT mid-deck field x230..410 y330..430', px, 230, 410, 330, 430)
pair('PR VT tail band x215..425 y47..75 (keepbg)', px, 215, 425, 47, 75, True)
print('PR VT tail-band sky cells: REF', darkc(px, 0, 215, 425, 47, 75, -1), 'PROC', darkc(px, 640, 215, 425, 47, 75, -1))
px = load('hero-rearright')
r = rect(px, 0, 545, 625, 285, 395, True); p = rect(px, 640, 545, 625, 285, 395, True)
print('PR HRR corner air x545..625 y285..395: REF', r['air'], 'PROC', p['air'], '(certified ~27.4/27.5 class; ref 43.7)')
pair('PR HRR rear-kit zone x430..640 y300..420', px, 430, 640, 300, 420)
pair('PR HRR crate faces x480..610 y430..530', px, 480, 610, 430, 530)
