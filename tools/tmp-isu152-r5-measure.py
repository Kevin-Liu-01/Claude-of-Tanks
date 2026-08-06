# TEMP (isu152 r5): done-gate measurements on the OFFICIAL critic pairs
# (shots/critic-isu152/*.png), one block per r5 order. ITU-601 luma; bg
# discriminator max|px-0x151b20| > 13; proc pane = ref pane x + 640.
# view-left mapping: px = 46 + (z+3.407)*60.2, py = 399 - y*60.2.
# view-right mapping: px = 46 + (5.72-z)*60.2.
from PIL import Image
import math

D = 'shots/critic-isu152/'


def luma(p):
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]


def nonbg(p):
    return max(abs(p[0] - 0x15), abs(p[1] - 0x1b), abs(p[2] - 0x20)) > 13


def stats(im, x0, y0, x1, y1, dk=45):
    p = im.load()
    vals, sky, tot, dark = [], 0, 0, 0
    for X in range(x0, x1):
        for Y in range(y0, y1):
            tot += 1
            if nonbg(p[X, Y]):
                v = luma(p[X, Y])
                vals.append(v)
                if v < dk:
                    dark += 1
            else:
                sky += 1
    vals.sort()
    n = len(vals)
    if not n:
        return {'n': 0, 'sky%': round(100 * sky / tot, 1)}
    q = lambda f: round(vals[min(n - 1, int(n * f))], 1)
    return {'n': n, 'sky%': round(100 * sky / tot, 1), 'dark%': round(100 * dark / tot, 1),
            'p05': q(.05), 'p25': q(.25), 'p50': q(.5), 'p75': q(.75), 'p95': q(.95),
            'iqr': round(q(.75) - q(.25), 1)}


print('=== ORDER 1a: view-rear crest rows 124-136 (ratio <= 1.2 ordered) ===')
vr = Image.open(D + 'view-rear.png').convert('RGB')
pxr = vr.load()


def rowspan(y, x0, x1):
    xs = [X for X in range(x0, x1) if nonbg(pxr[X, y])]
    return (min(xs), max(xs)) if xs else None


worst = 0
for y in range(124, 137):
    r = rowspan(y, 0, 640)
    p = rowspan(y, 640, 1280)
    rw, pw = r[1] - r[0] + 1, p[1] - p[0] + 1
    worst = max(worst, pw / rw)
    if y % 2 == 0:
        print(f'  row {y}: ref {rw} proc {pw} ratio {pw/rw:.3f}')
print(f'  WORST ratio rows 124-136: {worst:.3f}  (order bound 1.2; r4 was 1.24-1.39)')

print('=== ORDER 1b: one drum circle per shoulder (view-rear) ===')
# scribe-ring crossings on a vertical line through the drum center: the r4
# diagonal stack put TWO cap circles on the shoulder (scribe rings at y-bands
# ~1.74-2.04 and ~1.44-1.74); a single drum shows one ring pair around 1.59.
for tag, xc in (('ref ', 135), ('proc', 640 + 138)):
    dips = []
    prev_dark = False
    for Y in range(180, 380):
        v = luma(pxr[xc, Y]) if nonbg(pxr[xc, Y]) else 999
        d = v < 78
        if d and not prev_dark:
            dips.append(Y)
        prev_dark = d
    print(f'  {tag} col: ring-class crossings at rows {dips} (single circle = one tight pair band)')

print('=== ORDER 1c: crate dressing (view-rear rear faces) ===')
# handrail (y 1.910, z -2.6335) -> row ~256; C-hook (x -0.35, y 1.752) -> rows
# ~272-292 at sx ~1019
rail = stats(vr, 640 + 220, 250, 640 + 420, 262)
plain = stats(vr, 640 + 220, 236, 640 + 420, 248)
print(f'  handrail band rect (rows 250-262): iqr {rail["iqr"]} p95 {rail["p95"]} vs plain band above: iqr {plain["iqr"]} p95 {plain["p95"]}')
ring = stats(vr, 640 + 368, 272, 640 + 392, 294, dk=78)
print(f'  C-hook zone rect (rows 272-294): dark%(<78) {ring["dark%"]} p05 {ring["p05"]} iqr {ring["iqr"]}')

print('=== ORDER 2a: mound relief (hero-toptilt rim shadows + crowns) ===')
ht = Image.open(D + 'hero-toptilt.png').convert('RGB')
# the two mound under-shadow ring clusters (sub-50L scan): L ~ (240,260),
# R ~ (340,220) pane-local
lm = stats(ht, 640 + 225, 245, 640 + 300, 315, dk=50)
rm = stats(ht, 640 + 320, 200, 640 + 395, 270, dk=50)
print(f'  L-mound ring zone: dark%(<50) {lm["dark%"]} p05 {lm["p05"]} p95 {lm["p95"]}')
print(f'  R-mound ring zone: dark%(<50) {rm["dark%"]} p05 {rm["p05"]} p95 {rm["p95"]}')
print('  (r4: mounds read flat-painted rings — no sub-50 rim shadow anywhere; deep rings are floor-free now)')

print('=== ORDER 2b: intake cells (view-top proc rects, order: cell luma 55-65 + bright rims) ===')
vt = Image.open(D + 'view-top.png').convert('RGB')
for tag, x0, x1 in (('procL', 640 + 250, 640 + 290), ('procR', 640 + 350, 640 + 385)):
    s = stats(vt, x0, 160, x1, 225, dk=70)
    print(f'  {tag}: p05 {s["p05"]} (cell floor; order band 55-65) p25 {s["p25"]} (rim web) dark%(<70) {s["dark%"]}')

print('=== ORDER 2c: louver slat band (view-top center deck) ===')
ref_l = stats(vt, 300, 150, 340, 230)
proc_l = stats(vt, 640 + 300, 150, 640 + 340, 230)
print(f'  ref : {ref_l}')
print(f'  proc: {proc_l}')
pxt = vt.load()
mins = []
for y in range(158, 218, 2):
    vals = [luma(pxt[640 + X, y]) for X in range(302, 338) if nonbg(pxt[640 + X, y])]
    if vals:
        mins.append(round(min(vals)))
print(f'  proc row minima across the band: {mins[:15]} (ref class 65-88)')

print('=== ORDER 3a: window band (view-left rect x150-262 y366-384) ===')
vl = Image.open(D + 'view-left.png').convert('RGB')
r = stats(vl, 150, 366, 262, 384)
p = stats(vl, 790, 366, 902, 384)
print(f'  ref : sky {r["sky%"]} + dark(<45) {r["dark%"]} = {r["sky%"]+r["dark%"]:.1f}%')
print(f'  proc: sky {p["sky%"]} + dark(<45) {p["dark%"]} = {p["sky%"]+p["dark%"]:.1f}%  (r4: 7.9%)')
print(f'  proc panel tone p05 {p["p05"]} p25 {p["p25"]} (order: interiors <= 45L)')

print('=== ORDER 3d: y393-398 rows (view-left proc; order: y396 <= 21% dark) ===')
pxl = vl.load()
for row_y in (393, 394, 395, 396, 397, 398):
    for tag, off in (('ref ', 0), ('proc', 640)):
        seg = [luma(pxl[X, row_y]) for X in range(off + 46, off + 600) if nonbg(pxl[X, row_y])]
        if seg:
            seg.sort()
            dkn = sum(1 for v in seg if v < 70)
            print(f'  {tag} y{row_y}: dark(<70) {100*dkn/len(seg):5.1f}%  p50 {seg[len(seg)//2]:.1f}')

print('=== ORDER 3b: mantlet ball (close-front) ===')
cf = Image.open(D + 'close-front.png').convert('RGB')
# projection for the close-front camera (dir (-1,0.22,1), off (0,0.12,0.28), hs 0.26)
bmin = (-1.5345, -0.011, -3.407)
bmax = (1.5345, 2.5035, 5.72)
c = [(a + b) / 2 for a, b in zip(bmin, bmax)]
size = [b - a for a, b in zip(bmin, bmax)]
c[1] += 0.12 * size[1]
c[2] += 0.28 * size[2]
d = (-1, 0.22, 1)
dl = math.sqrt(sum(v * v for v in d))
d = [v / dl for v in d]
right = [d[2], 0, -d[0]]
rl = math.sqrt(sum(v * v for v in right))
right = [v / rl for v in right]
up = [d[1] * right[2] - d[2] * right[1], d[2] * right[0] - d[0] * right[2], d[0] * right[1] - d[1] * right[0]]
ext = 0.5
for cx in (bmin[0], bmax[0]):
    for cy in (bmin[1], bmax[1]):
        for cz in (bmin[2], bmax[2]):
            dd = (cx - c[0], cy - c[1], cz - c[2])
            ext = max(ext, abs(sum(a * b for a, b in zip(dd, right))), abs(sum(a * b for a, b in zip(dd, up))))
half = ext * (0.26 / 0.5) * 1.06


def proj(p):
    dd = (p[0] - c[0], p[1] - c[1], p[2] - c[2])
    sx = 320 + sum(a * b for a, b in zip(dd, right)) / half * 320
    sy = 320 - sum(a * b for a, b in zip(dd, up)) / half * 320
    return int(round(sx)) + 640, int(round(sy))


crest = proj((-0.24, 2.274, 2.645))
ball_top = proj((-0.24, 2.10, 2.79))
ball_bot = proj((-0.24, 1.72, 2.95))
print(f'  crest px {crest}, ball visible top edge {ball_top}, ball bottom {ball_bot}')
print(f'  ball silhouette drop below crest: {2.274-2.10:.3f} m (order band 0.15-0.2); ball r 0.335 vs r4 sph 0.20 (+68% radius)')
bz = stats(cf, ball_top[0] - 45, ball_top[1], ball_top[0] + 45, ball_bot[1])
print(f'  ball zone rect: p50 {bz["p50"]} p95 {bz["p95"]} iqr {bz["iqr"]} (ref ball rect: p50 104.0 iqr 12.1)')

print('=== ORDER 3c: rear-fender curl horn (view-right, ref rect (560-595, 320-355)) ===')
vrt = Image.open(D + 'view-right.png').convert('RGB')
r = stats(vrt, 560, 320, 595, 355)
p = stats(vrt, 640 + 560, 320, 640 + 595, 355)
print(f'  ref : sky {r["sky%"]} p50 {r["p50"]}')
print(f'  proc: sky {p["sky%"]} p50 {p["p50"]}  (r4: sky 6.7, no horn)')
# curl top line measured on view-left (the r3-VERIFIED z mapping; view-right
# panes carry a ±4px registration slop that reads as false y-deltas on the
# steep curl fall)
pxl0 = Image.open(D + 'view-left.png').convert('RGB').load()
print('  curl top line (view-left mapping, z -> y_top) vs ref:')
for z in (-2.90, -3.00, -3.10, -3.20, -3.28, -3.34):
    X = int(round(46 + (z + 3.407) * 60.2))
    tp = next((Y for Y in range(200, 420) if nonbg(pxl0[X + 640, Y])), None)
    tr = next((Y for Y in range(200, 420) if nonbg(pxl0[X, Y])), None)
    print(f'    z {z:+.2f}: proc {(399-tp)/60.2:.3f} ref {(399-tr)/60.2:.3f} d {(tr-tp)/60.2:+.3f}')

print('=== ORDER 3e: R-cupola pale top + studs (close-roof) ===')
cr = Image.open(D + 'close-roof.png').convert('RGB')
# close-roof projection (dir (1,0.55,0.35), off (0,0.3,0.05), hs 0.24) — the
# r4 measure tool's own block
c2 = [(a + b) / 2 for a, b in zip(bmin, bmax)]
c2[1] += 0.3 * size[1]
c2[2] += 0.05 * size[2]
d2 = (1, 0.55, 0.35)
dl2 = math.sqrt(sum(v * v for v in d2))
d2 = [v / dl2 for v in d2]
right2 = [d2[2], 0, -d2[0]]
rl2 = math.sqrt(sum(v * v for v in right2))
right2 = [v / rl2 for v in right2]
up2 = [d2[1] * right2[2] - d2[2] * right2[1], d2[2] * right2[0] - d2[0] * right2[2], d2[0] * right2[1] - d2[1] * right2[0]]
ext2 = 0.5
for cx in (bmin[0], bmax[0]):
    for cy in (bmin[1], bmax[1]):
        for cz in (bmin[2], bmax[2]):
            dd = (cx - c2[0], cy - c2[1], cz - c2[2])
            ext2 = max(ext2, abs(sum(a * b for a, b in zip(dd, right2))), abs(sum(a * b for a, b in zip(dd, up2))))
half2 = ext2 * (0.24 / 0.5) * 1.06


def proj2(p):
    dd = (p[0] - c2[0], p[1] - c2[1], p[2] - c2[2])
    sx = 320 + sum(a * b for a, b in zip(dd, right2)) / half2 * 320
    sy = 320 - sum(a * b for a, b in zip(dd, up2)) / half2 * 320
    return int(round(sx)) + 640, int(round(sy))


lid_c = proj2((0.45, 2.492, 1.53))
plate_c = proj2((0.62, 2.370, 1.53))
lid = stats(cr, lid_c[0] - 9, lid_c[1] - 6, lid_c[0] + 9, lid_c[1] + 6)
plate = stats(cr, plate_c[0] - 9, plate_c[1] - 5, plate_c[0] + 9, plate_c[1] + 5)
print(f'  R-head lid rect @{lid_c}: p50 {lid["p50"]} vs mound plate @{plate_c}: p50 {plate["p50"]}')
print('  (r4: the lid was a DARK top face — top-lit physics breach; order: pale top, slit stays on the flank)')
stud = proj2((-0.44, 2.2685, 1.05))
sb = stats(cr, stud[0] - 30, stud[1] - 8, stud[0] + 30, stud[1] + 8)
print(f'  stud row zone @{stud}: p95 {sb["p95"]} iqr {sb["iqr"]} (raised top-lit studs vs r4 painted dots)')

print('=== ORDER 3f: stern descent (view-left tail bottoms) ===')
pxl2 = vl.load()


def zx(z):
    return int(round(46 + (z + 3.407) * 60.2))


outs = []
for i in range(9):
    z = -3.35 + i * 0.05
    Xr = zx(z)
    Xp = Xr + 640
    br = next((Y for Y in range(vl.size[1] - 1, 300, -1) if nonbg(pxl2[Xr, Y])), None)
    bp = next((Y for Y in range(vl.size[1] - 1, 300, -1) if nonbg(pxl2[Xp, Y])), None)
    outs.append(f'{z:+.2f}: ref {(399-br)/60.2:.2f} proc {(399-bp)/60.2:.2f}')
print('  ' + '\n  '.join(outs))
