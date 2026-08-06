# TEMP t84 r31 critic: ITU-601 luma rects + mask-method air censuses on the
# FRESH critic pairs (shots/critic-t84/). Pair layout: REF x [0,640), PROC
# x [640,1280) — same camera, dCentroid <= 0.047 m (evaluator), so ref rect
# maps to proc rect at +640. All numbers re-derived this round (bank law).
from PIL import Image

BASE = 'shots/critic-t84/'
BG = (21, 27, 32)   # 0x151b20
TOL = 13

def load(name):
    return Image.open(BASE + name + '.png').convert('RGB')

def is_bg(p):
    return abs(p[0] - BG[0]) <= TOL and abs(p[1] - BG[1]) <= TOL and abs(p[2] - BG[2]) <= TOL

def luma(p):
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]

def stats(im, rect, skip_bg=False):
    x0, y0, x1, y1 = rect
    d = im.load()
    Ls, rs, gs, bs = [], [], [], []
    nbg = 0
    for y in range(y0, y1):
        for x in range(x0, x1):
            p = d[x, y]
            if is_bg(p):
                nbg += 1
                if skip_bg:
                    continue
            Ls.append(luma(p)); rs.append(p[0]); gs.append(p[1]); bs.append(p[2])
    Ls.sort()
    n = len(Ls)
    if n == 0:
        return None
    def pc(q):
        return Ls[min(n - 1, int(q * n))]
    return dict(n=n, nbg=nbg, p5=pc(0.05), p25=pc(0.25), med=pc(0.5), p75=pc(0.75),
                p95=pc(0.95), mean=sum(Ls) / n, sd=(sum((v - sum(Ls) / n) ** 2 for v in Ls) / n) ** 0.5,
                rm=sum(rs) / n, gm=sum(gs) / n, bm=sum(bs) / n)

def census(im, rect, lo=None, hi=None):
    x0, y0, x1, y1 = rect
    d = im.load()
    c = 0
    for y in range(y0, y1):
        for x in range(x0, x1):
            p = d[x, y]
            if is_bg(p):
                continue
            L = luma(p)
            if (lo is None or L >= lo) and (hi is None or L < hi):
                c += 1
    return c

def edges(im, rect, thr=12):
    x0, y0, x1, y1 = rect
    d = im.load()
    c = 0
    for y in range(y0, y1):
        for x in range(x0, x1 - 1):
            if abs(luma(d[x, y]) - luma(d[x + 1, y])) > thr:
                c += 1
    return c

def pair(imname, rect, label, skip_bg=False):
    im = load(imname)
    rr = stats(im, rect, skip_bg)
    pr = stats(im, (rect[0] + 640, rect[1], rect[2] + 640, rect[3]), skip_bg)
    print(f'{imname} {label}')
    print(f'  rect ref {rect} / proc +640')
    for tag, s in (('REF ', rr), ('PROC', pr)):
        print(f'  {tag}: n{s["n"]:6d} bg{s["nbg"]:5d} p5 {s["p5"]:5.1f} p25 {s["p25"]:5.1f} med {s["med"]:5.1f} '
              f'p75 {s["p75"]:5.1f} p95 {s["p95"]:5.1f} mean {s["mean"]:5.1f} sd {s["sd"]:4.1f} '
              f'rgb ({s["rm"]:.0f},{s["gm"]:.0f},{s["bm"]:.0f})')

print('==== 1. SIDE MASS / GEAR BAND (view-left, view-right) ====')
for v in ('view-left', 'view-right'):
    pair(v, (100, 314, 400, 344), 'skirt band (upper side mass)')
    pair(v, (100, 346, 400, 372), 'wheel row band')
    pair(v, (100, 372, 400, 380), 'track band (ref: skirt bottom)')
    im = load(v)
    for lab, rect in (('whole lower band y346..386', (100, 346, 400, 386)),):
        for side, dx in (('REF ', 0), ('PROC', 640)):
            r = (rect[0] + dx, rect[1], rect[2] + dx, rect[3])
            sub30 = census(im, r, hi=30)
            sub45 = census(im, r, hi=45)
            pale = census(im, r, lo=95)
            print(f'  {v} {lab} {side}: sub-30 {sub30}  sub-45 {sub45}  pale>=95 {pale}')

print()
print('==== 2. RAW-GRAY COLLAR / MANTLET (chroma: camo has g-r >~ 8) ====')
pair('view-rear', (215, 275, 425, 340), 'collar slab between turret and hull')
pair('view-left', (212, 292, 355, 308), 'collar band (side view)')
pair('view-front', (215, 258, 425, 285), 'turret-face letterbox band')
pair('close-front', (240, 255, 420, 300), 'mantlet / gun-root zone')

print()
print('==== 3. TOP/ROOF FURNITURE DENSITY ====')
im = load('view-top')
for lab, rect in (('engine deck', (250, 65, 400, 135)),
                  ('turret roof', (250, 150, 400, 295)),
                  ('glacis/bow deck', (250, 305, 400, 430))):
    for side, dx in (('REF ', 0), ('PROC', 640)):
        r = (rect[0] + dx, rect[1], rect[2] + dx, rect[3])
        s = stats(im, r)
        e = edges(im, r)
        sub55 = census(im, r, hi=55)
        print(f'  view-top {lab} {side}: med {s["med"]:5.1f} sd {s["sd"]:4.1f} edge-px {e:5d} sub-55 {sub55:5d}')
im = load('close-roof')
for lab, rect in (('turret roof plane', (270, 250, 620, 390)),
                  ('engine deck plane', (0, 390, 300, 500))):
    for side, dx in (('REF ', 0), ('PROC', 640)):
        r = (rect[0] + dx, rect[1], rect[2] + dx, rect[3])
        s = stats(im, r)
        e = edges(im, r)
        sub45 = census(im, r, hi=45)
        print(f'  close-roof {lab} {side}: med {s["med"]:5.1f} sd {s["sd"]:4.1f} edge-px {e:5d} sub-45 {sub45:5d}')

print()
print('==== 4. MG / SKYLINE READ (mask-method sky censuses) ====')
# view-left cupola x-range: does anything break the skyline above the roof?
for v in ('view-left', 'view-right'):
    im = load(v)
    for side, dx in (('REF ', 0), ('PROC', 640)):
        nonbg = 0
        for y in range(238, 258):
            for x in range(140 + dx, 360 + dx):
                if not is_bg(im.load()[x, y]):
                    nonbg += 1
        print(f'  {v} skyline zone y238..258 x140..360 {side}: non-bg px {nonbg}')

print()
print('==== 5. AIR / VOID READS (mask-method bg census inside hull zones) ====')
im = load('hero-frontleft')
for lab, rect in (('bow fender under-gap zone', (300, 330, 520, 445)),):
    for side, dx in (('REF ', 0), ('PROC', 640)):
        r = (rect[0] + dx, rect[1], rect[2] + dx, rect[3])
        s = stats(im, r)
        print(f'  hero-frontleft {lab} {side}: bg-px {s["nbg"]:5d} of {s["n"]:6d} med {s["med"]:5.1f} p5 {s["p5"]:5.1f}')
im = load('hero-rearright')
for lab, rect in (('turret canyon zone', (300, 285, 460, 345)),):
    for side, dx in (('REF ', 0), ('PROC', 640)):
        r = (rect[0] + dx, rect[1], rect[2] + dx, rect[3])
        s = stats(im, r)
        print(f'  hero-rearright {lab} {side}: bg-px {s["nbg"]:5d} of {s["n"]:6d} med {s["med"]:5.1f} p5 {s["p5"]:5.1f} p75 {s["p75"]:5.1f}')

print()
print('==== 6. GLACIS ERA TEXTURE (close-front) ====')
im = load('close-front')
for lab, rect in (('glacis field', (80, 330, 330, 420)),):
    for side, dx in (('REF ', 0), ('PROC', 640)):
        r = (rect[0] + dx, rect[1], rect[2] + dx, rect[3])
        s = stats(im, r)
        e = edges(im, r)
        print(f'  close-front {lab} {side}: med {s["med"]:5.1f} sd {s["sd"]:4.1f} edge-px {e:5d}')

print()
print('==== 7. FRONT TRACK SLABS (view-front) ====')
im = load('view-front')
for lab, rect in (('left track face', (85, 425, 170, 500)), ('right track face', (470, 425, 555, 500))):
    for side, dx in (('REF ', 0), ('PROC', 640)):
        r = (rect[0] + dx, rect[1], rect[2] + dx, rect[3])
        s = stats(im, r)
        pale = census(im, r, lo=95)
        print(f'  view-front {lab} {side}: med {s["med"]:5.1f} p5 {s["p5"]:5.1f} p95 {s["p95"]:5.1f} pale>=95 {pale:4d}')
