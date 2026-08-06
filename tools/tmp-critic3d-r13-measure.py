#!/usr/bin/env python3
# TEMP (merkava3d r13 GRADUATION CRITIC): verify every r13 headline claim +
# the full r12 protect battery on MY fresh pairs. ITU-601 luma, mask method
# maxch<=13 per BUILD-STANDARD SD. Pairs: shots/critic-merkava3d/ (ref x0,
# proc x640). Windows inherited from tmp-critic3d-r12-measure.py (the r12
# critic's own) + r13-specific lanes.
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


print('================ r13 ORDER-CLAIM VERIFICATION (builder numbers -> my fresh pairs) ================')

# ---- r13 order 1: close-roof census (order-of-record <=6000; claim 5519; ref 4086) ----
px = load('close-roof')
print('O1 CR sub-60 census x0..640 y240..640: REF', darkc(px, 0, 0, 640, 240, 640, 60), 'PROC', darkc(px, 640, 0, 640, 240, 640, 60), '(order <=6000; claim 5519; ref-claim 4086)')
print('O1 CR near-black<45: REF', darkc(px, 0, 0, 640, 240, 640, 45), 'PROC', darkc(px, 640, 0, 640, 240, 640, 45), '(claim proc 626 vs ref 805)')
# decomposition: gear band vs deck (locate residual ink; r12 split gear 4691/deck 2088)
for (tag, y0, y1) in [('deck y240..480', 240, 480), ('gear y480..640', 480, 640)]:
    print(f'O1 CR sub-60 {tag}: REF', darkc(px, 0, 0, 640, y0, y1, 60), 'PROC', darkc(px, 640, 0, 640, y0, y1, 60))
# ---- r13 order 1b: named near-black bars retired ----
print('O1b CR bar rect x495..530 y377..390 sub-45: REF', darkc(px, 0, 495, 530, 377, 390, 45), 'PROC', darkc(px, 640, 495, 530, 377, 390, 45), '(claim rect sub-45 = 2, was ~160)')
r = rect(px, 0, 495, 530, 377, 390); p = rect(px, 640, 495, 530, 377, 390)
print('O1b CR bar rect med: REF', r['med'], 'PROC', p['med'], '(claim deck-blend ~80L soft)')
# ---- r13 order 2: fwd-plane crowns (sd >=6.5; p95 certified ceiling 87.8) ----
pair('O2 CR fwd-roof plane x120..350 y360..450', px, 120, 350, 360, 450)
print('   (claims: sd 6.66 >=6.5, p95 87.8 = certified zero-cost ceiling, n 19993, air 3.4 (was 4.2); ref sd 7.48 p95 98.4)')
# ---- warm cert 2 (floor 626-class; r13 claims 552 as retone side-effect, no deck grinding) ----
print('O7 CR deck warm x240..640 y240..560: REF', warm(px, 0, 240, 640, 240, 560), 'PROC', warm(px, 640, 240, 640, 240, 560), '(claim 552; floor-class 626; side-effect of gear retones)')
pair('PR CR deck big plane x80..450 y230..330', px, 80, 450, 230, 330)

# ---- r13 order 4 (M2 dashes) + order-6 protect: view-top gun windows ----
px = load('view-top')
print('O4 VT .50 window x374..392 y270..330 sub-78: REF', darkc(px, 0, 374, 392, 270, 330, 78), 'PROC', darkc(px, 640, 374, 392, 270, 330, 78), '(claim 44 EXACT; ref 32)')
# M2 crest zone: scan candidate lanes around the crest for the gun-line census
for (tag, x0, x1, y0, y1) in [('M2 crest x392..430 y270..330', 392, 430, 270, 330), ('M2 crest x350..374 y270..330', 350, 374, 270, 330), ('crest wide x340..440 y255..345', 340, 440, 255, 345)]:
    print(f'O4 VT {tag} sub-78: REF', darkc(px, 0, x0, x1, y0, y1, 78), 'PROC', darkc(px, 640, x0, x1, y0, y1, 78), '(builder M2-zone claim 300, ref 21 same window)')

# ---- disclosed new deltas ----
print('D1 VT mid-deck p95 x230..410 y330..430: REF', rect(px, 0, 230, 410, 330, 430)['p95'], 'PROC', rect(px, 640, 230, 410, 330, 430)['p95'], '(claim 90.7 -> 93.6; ref 96.8)')
pair('PR VT mid-deck field x230..410 y330..430', px, 230, 410, 330, 430)
pair('PR VT louvre x325..375 y128..155', px, 325, 375, 128, 155)
r = rect(px, 0, 215, 425, 47, 75, True); p = rect(px, 640, 215, 425, 47, 75, True)
print('PR VT tail band air x215..425 y47..75: REF', r['air'], 'PROC', p['air'], '(watch: 14.7 vs ref 19.1)')
print('PR VT warm full: REF', warm(px, 0, 0, 640, 0, 640), 'PROC', warm(px, 640, 0, 640, 0, 640), '(claim 575)')

px = load('view-front')
pair('D2 VF band row x180..460 y208..218', px, 180, 460, 208, 218)
print('   (disclosed: med 82.0 -> 79.5 ordered grammar trade, ref 91.9)')
print('PR VF turret-zone warm x150..500 y120..260: REF', warm(px, 0, 150, 500, 120, 260), 'PROC', warm(px, 640, 150, 500, 120, 260), '(claim 57 order-edge)')
pair('PR VF turret zone x150..500 y120..260', px, 150, 500, 120, 260)

# ---- r12 PROTECT battery (must reproduce EXACT-class) ----
px = load('view-left')
pair('PR VL wheel row x150..450 y392..425', px, 150, 450, 392, 425)
print('   (protect: p5 52.1 / med 56.0 +-1.5 / p95 93.7 / air ~3.3; ref 52.9/56ish/94.5/3.0)')
pair('PR VL hull band x150..450 y330..360', px, 150, 450, 330, 360)
r = rect(px, 0, 150, 450, 360, 392); p = rect(px, 640, 150, 450, 360, 392)
print('PR VL skirt band y360..392 p5: REF', r["p5"], 'PROC', p["p5"], '(protect 93.7; ref 91.8)')
px = load('view-right')
pair('PR VR wheel row x190..490 y392..425', px, 190, 490, 392, 425)
print('   (protect: p5 47.4 / p95 81.5; med watch 60.1 vs ref 54.5)')
px = load('view-rearleft')
pair('PR VRL under-rim x70..210 y340..354', px, 70, 210, 340, 354)
print('   (protect p5 88.6; ref 102.6)')
px = load('view-rearright')
pair('PR VRR under-rim x430..570 y340..354', px, 430, 570, 340, 354)
print('   (protect p5 76.8; ref 79.0)')
px = load('view-rear')
print('PR rear-face x150..295 y385..480 sub-70: REF', darkc(px, 0, 150, 295, 385, 480, 70), 'PROC', darkc(px, 640, 150, 295, 385, 480, 70), '(protect 343; ref 25-class)')
print('PR rear-face p95: REF', rect(px, 0, 150, 295, 385, 480)['p95'], 'PROC', rect(px, 640, 150, 295, 385, 480)['p95'], '(protect 102.6)')
print('PR center bay med: REF', rect(px, 0, 295, 345, 385, 480)['med'], 'PROC', rect(px, 640, 295, 345, 385, 480)['med'], '(94.4 vs 98.4 class)')
r = rect(px, 0, 160, 480, 195, 232, True); p = rect(px, 640, 160, 480, 195, 232, True)
print('PR crown air y195..232: REF', r['air'], 'PROC', p['air'], '(cert-3 floor 76.2; ref 87.2)')
print('PR skyline steps x170..470: REF', gaps(px, 0, 170, 470), 'PROC', gaps(px, 640, 170, 470), '(protect 24, >=20)')
print('PR under-rim rear x150..295 y382..392 p5: REF', rect(px, 0, 150, 295, 382, 392)['p5'], 'PROC', rect(px, 640, 150, 295, 382, 392)['p5'], '(protect 82.3, >=80)')

px = load('hero-frontleft')
pair('PR HFL band wall x330..560 y250..300', px, 330, 560, 250, 300)
px = load('hero-rearright')
r = rect(px, 0, 545, 625, 285, 395, True); p = rect(px, 640, 545, 625, 285, 395, True)
print('PR HRR corner air x545..625 y285..395: REF', r['air'], 'PROC', p['air'], '(cert-1 corridor, recorded ~27.4; ref 43.7)')
pair('PR HRR rear-kit zone x430..640 y300..420', px, 430, 640, 300, 420)
pair('PR HRR crate faces x480..610 y430..530', px, 480, 610, 430, 530)
