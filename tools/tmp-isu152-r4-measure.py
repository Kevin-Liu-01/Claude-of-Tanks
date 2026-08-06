# TEMP (isu152 r4): done-gate measurements on the OFFICIAL critic pairs
# (shots/critic-isu152/*.png). ITU-601 luma; bg discriminator
# max|px-0x151b20| > 13; proc pane = ref pane x + 640.
# view-left mapping (r3-verified): px = 46 + (z+3.407)*60.2, py = 399 - y*60.2.
from PIL import Image
import math

D = 'shots/critic-isu152/'


def luma(p):
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]


def nonbg(p):
    return max(abs(p[0] - 0x15), abs(p[1] - 0x1b), abs(p[2] - 0x20)) > 13


def stats(im, x0, y0, x1, y1, skymask=False):
    px = im.load()
    vals, sky, tot = [], 0, 0
    for X in range(x0, x1):
        for Y in range(y0, y1):
            tot += 1
            if nonbg(px[X, Y]):
                vals.append(luma(px[X, Y]))
            else:
                sky += 1
    vals.sort()
    n = len(vals)
    q = lambda f: vals[min(n - 1, int(n * f))] if n else None
    return {'n': n, 'sky%': round(100 * sky / tot, 1), 'p05': q(.05) and round(q(.05), 1),
            'p25': q(.25) and round(q(.25), 1), 'p50': q(.5) and round(q(.5), 1),
            'p75': q(.75) and round(q(.75), 1), 'p95': q(.95) and round(q(.95), 1),
            'iqr': round(q(.75) - q(.25), 1) if n else None}


def zx(z):  # view-left ref-pane x for proc z
    return int(round(46 + (z + 3.407) * 60.2))


def yy(y):
    return int(round(399 - y * 60.2))


print('=== ORDER 1: DShK (view-left muzzle break, MASK-METHOD) ===')
vl = Image.open(D + 'view-left.png').convert('RGB')
px = vl.load()
# muzzle window: z 1.17..1.32 (booster zone), y band 2.388 (riser line) .. 2.52
x0, x1 = 640 + zx(1.17), 640 + zx(1.32)
yTop, yLine = yy(2.52), yy(2.388)
above = 0
skyUnder = 0
cols = 0
for X in range(min(x0, x1), max(x0, x1)):
    lit = [Y for Y in range(yTop, yLine) if nonbg(px[X, Y])]
    if lit:
        cols += 1
        above += len(lit)
        # sky under the lowest lit px down to the riser line
        skyUnder += sum(1 for Y in range(max(lit) + 1, yLine) if not nonbg(px[X, Y]))
print(f'  muzzle rect x[{min(x0,x1)},{max(x0,x1)}] y[{yTop},{yLine}] (z 1.17..1.32, y 2.388..2.52)')
print(f'  gun px above riser line: {above} over {cols} columns; true-sky px under muzzle: {skyUnder}')
# same columns in the REF pane (should be ~0 gun px)
rx0, rx1 = zx(1.17), zx(1.32)
rabove = sum(1 for X in range(min(rx0, rx1), max(rx0, rx1)) for Y in range(yTop, yLine) if nonbg(vl.load()[X, Y]))
print(f'  ref same rect lit px: {rabove}')

print('=== ORDER 1b: close-roof receiver/barrel (tone) ===')
cr = Image.open(D + 'close-roof.png').convert('RGB')
# projection constants from the close-roof ortho (measured px/m ~120, computed
# earlier: proj((x,y,z)) -> pane px). Use the projection helper:
bmin = (-1.5345, -0.011, -3.407); bmax = (1.5345, 2.5035, 5.72)
c = [(a + b) / 2 for a, b in zip(bmin, bmax)]
size = [b - a for a, b in zip(bmin, bmax)]
c[1] += 0.3 * size[1]; c[2] += 0.05 * size[2]
d = (1, 0.55, 0.35); dl = math.sqrt(sum(v * v for v in d)); d = [v / dl for v in d]
right = [d[2], 0, -d[0]]  # cross((0,1,0), d)
rl = math.sqrt(sum(v * v for v in right)); right = [v / rl for v in right]
up = [d[1] * right[2] - d[2] * right[1], d[2] * right[0] - d[0] * right[2], d[0] * right[1] - d[1] * right[0]]
ext = 0.5
for cx in (bmin[0], bmax[0]):
    for cy in (bmin[1], bmax[1]):
        for cz in (bmin[2], bmax[2]):
            dd = (cx - c[0], cy - c[1], cz - c[2])
            ext = max(ext, abs(sum(a * b for a, b in zip(dd, right))), abs(sum(a * b for a, b in zip(dd, up))))
half = ext * (0.24 / 0.5) * 1.06


def proj(p):
    dd = (p[0] - c[0], p[1] - c[1], p[2] - c[2])
    sx = 320 + sum(a * b for a, b in zip(dd, right)) / half * 320
    sy = 320 - sum(a * b for a, b in zip(dd, up)) / half * 320
    return int(round(sx)) + 640, int(round(sy))


rc = proj((0.53, 2.4637, 1.5225))   # receiver top center
st = proj((0.45, 2.428, 1.53))      # step top
mp = proj((0.61, 2.370, 1.53))      # mound plate right of head
bo = proj((0.53, 2.49, 1.258))      # booster
print(f'  receiver@{rc} step@{st} plate@{mp} booster@{bo}')
r = stats(cr, rc[0] - 6, rc[1] - 4, rc[0] + 6, rc[1] + 4)
s = stats(cr, mp[0] - 6, mp[1] - 3, mp[0] + 6, mp[1] + 3)
print(f'  receiver-top rect p50 {r["p50"]} vs mound-plate p50 {s["p50"]}  (box-mass separation)')
b = stats(cr, bo[0] - 8, bo[1] - 5, bo[0] + 8, bo[1] + 5)
print(f'  booster zone p50 {b["p50"]} sky% {b["sky%"]}')

print('=== ORDER 2: mound walls (view-front tops + close-roof wall band) ===')
vf = Image.open(D + 'view-front.png').convert('RGB')
pxf = vf.load()


def bbox(im, xoff):
    p = im.load()
    minx, maxx, miny, maxy = 10**9, -1, 10**9, -1
    for X in range(xoff, xoff + 640):
        for Y in range(30, 640):
            if nonbg(p[X, Y]):
                minx = min(minx, X); maxx = max(maxx, X)
                miny = min(miny, Y); maxy = max(maxy, Y)
    return minx, maxx, miny, maxy


for name, off in (('ref', 0), ('proc', 640)):
    bb = bbox(vf, off)
    sc = (bb[1] - bb[0] + 1) / 3.069
    gy = bb[3]
    out = []
    for wx in [-0.83, -0.72, -0.62, 0.24, 0.62, 0.66]:
        X = int(round(bb[0] + (wx + 1.5345) * sc))
        top = next((Y for Y in range(30, 640) if nonbg(pxf[X, Y])), None)
        out.append(f'x{wx:+.2f}:{(gy-top)/sc:.3f}' if top else f'x{wx:+.2f}:—')
    print(f'  {name} front tops: ' + '  '.join(out))

print('=== ORDER 3: deck (view-top) ===')
vt = Image.open(D + 'view-top.png').convert('RGB')
# view-top mapping: bbox anchored; z = (py-47)/59.8-3.407 (r3), x = (pX-227)/60.6-1.5345
pxt = vt.load()
# grid cells rect (proc): x +-0.83 band, z -1.0..-0.9 (cell rows on tall board)
gx0 = 640 + int(227 + (-0.90 + 1.5345) * 60.6); gx1 = 640 + int(227 + (-0.76 + 1.5345) * 60.6)
gy0 = int(47 + (-1.05 + 3.407) * 59.8); gy1 = int(47 + (-0.90 + 3.407) * 59.8)
g = stats(vt, gx0, gy0, gx1, gy1)
dk = stats(vt, gx0, int(47 + (-0.40 + 3.407) * 59.8), gx1, int(47 + (-0.20 + 3.407) * 59.8))
print(f'  grid-cell rect ({gx0},{gy0})-({gx1},{gy1}) p05 {g["p05"]} p50 {g["p50"]} vs bare deck p50 {dk["p50"]}')
# donut throat rect: (-0.23, -2.34) r 0.17
dx = 640 + int(227 + (0.23 + 1.5345) * 60.6)  # mirror x? report both
dxm = 640 + int(227 + (-0.23 + 1.5345) * 60.6)
dyy = int(47 + (-2.34 + 3.407) * 59.8)
for tag, DX in (('x+0.23', dx), ('x-0.23', dxm)):
    t = stats(vt, DX - 8, dyy - 8, DX + 8, dyy + 8)
    print(f'  donut throat {tag} rect p50 {t["p50"]} (r3 was near-black)')
# full-width dark rails count across x=0 in deck zone z -1.6..-0.6
zx0 = int(47 + (0.60 + 3.407) * 59.8)
midX = 640 + int(227 + (0 + 1.5345) * 60.6)
rows = []
for Y in range(int(47 + (-1.65 + 3.407) * 59.8), int(47 + (-0.60 + 3.407) * 59.8)):
    v = luma(pxt[midX, Y])
    rows.append(v)
dark_runs = 0
inrun = False
med = sorted(rows)[len(rows) // 2]
for v in rows:
    if v < med - 10:
        if not inrun:
            dark_runs += 1
            inrun = True
    else:
        inrun = False
print(f'  dark full-width bars crossing x=0 in board zone: {dark_runs} (r3 read 5-6)')

print('=== ORDER 4: mantlet (close-front) ===')
cf = Image.open(D + 'close-front.png').convert('RGB')
# proc collar face: count dark dots on the bolted ring zone (was 12 studs)
# collar approx at pane: reuse close-front cam? qualitative: rect over the
# collar ring; count sub-70-luma clusters
print('  (bolt-dot deletion + one-taper are constructional; visual check in pane)')

print('=== ORDER 5: ground row + wrap descents (view-left) ===')
row_y = 398
cnt = 0; dark = 0; vals = []
for X in range(640 + 46, 640 + 600):
    p = px[X, row_y]
    if nonbg(p):
        cnt += 1
        v = luma(p)
        vals.append(v)
        if v < 70:
            dark += 1
vals.sort()
print(f'  y398 row: non-bg {cnt}, %dark(<70L) {round(100*dark/max(1,cnt),1)}, p50 {round(vals[len(vals)//2],1) if vals else None}  (r3: 101 px, 37.6% dark, p50 60.2)')


def bottoms(zA, zB):
    outs = []
    for z in [zA + i * 0.066 for i in range(int((zB - zA) / 0.066) + 1)]:
        X = zx(z)
        br = next((Y for Y in range(vl.size[1] - 1, 0, -1) if nonbg(px[X, Y])), None)
        bp = next((Y for Y in range(vl.size[1] - 1, 0, -1) if nonbg(px[X + 640, Y])), None)
        if br and bp:
            outs.append((round(z, 2), round((399 - br) / 60.2, 3), round((399 - bp) / 60.2, 3)))
    return outs


print('  tail wrap bottoms (z, ref, proc):')
for t in bottoms(-3.37, -2.95):
    print(f'    z {t[0]:+.2f} ref {t[1]:.3f} proc {t[2]:.3f} d {t[2]-t[1]:+.3f}')
