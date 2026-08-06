# TEMP t84 r31 critic: pass 2 — corrected view-right rects (hull sits x~+140
# vs view-left), tightened bow-air rect, MG cupola zone stats, plus 4x
# diagnostic crops (diagnosis-only per BUILD-STANDARD D).
from PIL import Image

BASE = 'shots/critic-t84/'
OUT = '/private/tmp/claude-501/-Users-kevinliu-claude-of-tanks/d0226c73-49ae-490e-9a35-39379da35769/scratchpad/'
BG = (21, 27, 32)
TOL = 13

def load(name):
    return Image.open(BASE + name + '.png').convert('RGB')

def is_bg(p):
    return abs(p[0] - BG[0]) <= TOL and abs(p[1] - BG[1]) <= TOL and abs(p[2] - BG[2]) <= TOL

def luma(p):
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]

def stats(im, rect, skip_bg=True):
    x0, y0, x1, y1 = rect
    d = im.load()
    Ls = []
    nbg = 0
    for y in range(y0, y1):
        for x in range(x0, x1):
            p = d[x, y]
            if is_bg(p):
                nbg += 1
                continue
            Ls.append(luma(p))
    Ls.sort()
    n = len(Ls)
    if n == 0:
        return dict(n=0, nbg=nbg)
    def pc(q):
        return Ls[min(n - 1, int(q * n))]
    mean = sum(Ls) / n
    return dict(n=n, nbg=nbg, p5=pc(0.05), med=pc(0.5), p75=pc(0.75), p95=pc(0.95),
                mean=mean, sd=(sum((v - mean) ** 2 for v in Ls) / n) ** 0.5)

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

def show(v, im, rect, label, dx=0):
    r = (rect[0] + dx, rect[1], rect[2] + dx, rect[3])
    s = stats(im, r)
    if s['n'] == 0:
        print(f'  {v} {label}: ALL BG')
        return
    print(f'  {v} {label} rect{r}: n{s["n"]:6d} bg{s["nbg"]:5d} p5 {s["p5"]:5.1f} med {s["med"]:5.1f} '
          f'p75 {s["p75"]:5.1f} p95 {s["p95"]:5.1f} sd {s["sd"]:4.1f}')

print('==== view-right corrected (hull x 195..595 ref / 835..1235 proc; non-bg only) ====')
im = load('view-right')
for lab, rect in (('skirt band', (240, 314, 540, 344)),
                  ('wheel row band', (240, 346, 540, 372)),
                  ('track band', (240, 372, 540, 380))):
    show('view-right', im, rect, 'REF  ' + lab, 0)
    show('view-right', im, rect, 'PROC ' + lab, 640)
for side, dx in (('REF ', 0), ('PROC', 640)):
    r = (240 + dx, 346, 540 + dx, 386)
    print(f'  view-right whole lower band {side}: sub-30 {census(im, r, hi=30)} sub-45 {census(im, r, hi=45)} pale>=95 {census(im, r, lo=95)}')

print()
print('==== bow under-fender air (hero-frontleft, tight band under fender line) ====')
im = load('hero-frontleft')
for side, dx in (('REF ', 0), ('PROC', 640)):
    r = (330 + dx, 355, 480 + dx, 430)
    s = stats(im, r)
    print(f'  {side} rect{r}: bg-px {s["nbg"]:5d} of {(r[2]-r[0])*(r[3]-r[1])} non-bg n{s["n"]}' +
          (f' med {s["med"]:5.1f}' if s['n'] else ''))

print()
print('==== close-roof cupola / Kord zone ====')
im = load('close-roof')
for side, dx in (('REF ', 0), ('PROC', 640)):
    r = (430 + dx, 195, 620 + dx, 290)
    s = stats(im, r)
    e = 0
    d = im.load()
    for y in range(r[1], r[3]):
        for x in range(r[0], r[2] - 1):
            if abs(luma(d[x, y]) - luma(d[x + 1, y])) > 12:
                e += 1
    print(f'  {side} cupola zone rect{r}: med {s["med"]:5.1f} sd {s["sd"]:4.1f} edge-px {e:4d} sub-45 {census(im, r, hi=45):4d}')

print()
print('==== crops (4x nearest) -> scratchpad ====')
CROPS = [
    ('view-left',      (700, 330, 1090, 396), 'crop-left-gear'),
    ('view-left',      (60, 330, 450, 396),   'crop-left-gear-REF'),
    ('view-front',     (830, 240, 1100, 300), 'crop-front-letterbox'),
    ('view-front',     (190, 240, 460, 300),  'crop-front-letterbox-REF'),
    ('view-rear',      (830, 260, 1120, 350), 'crop-rear-collar'),
    ('view-rear',      (190, 260, 480, 350),  'crop-rear-collar-REF'),
    ('close-roof',     (990, 195, 1280, 400), 'crop-roof-cupola'),
    ('close-roof',     (350, 195, 640, 400),  'crop-roof-cupola-REF'),
    ('close-front',    (740, 300, 1060, 450), 'crop-bow-floaters'),
    ('close-front',    (100, 300, 420, 450),  'crop-bow-floaters-REF'),
    ('hero-rearright', (880, 240, 1200, 360), 'crop-canyon'),
    ('hero-rearright', (240, 240, 560, 360),  'crop-canyon-REF'),
    ('hero-toptilt',   (780, 180, 1130, 400), 'crop-toptilt-roof'),
    ('hero-toptilt',   (140, 180, 490, 400),  'crop-toptilt-roof-REF'),
    ('view-top',       (860, 130, 1060, 310), 'crop-top-turret'),
    ('view-top',       (220, 130, 420, 310),  'crop-top-turret-REF'),
]
for name, rect, out in CROPS:
    im = Image.open(BASE + name + '.png').convert('RGB').crop(rect)
    im = im.resize((im.width * 3, im.height * 3), Image.NEAREST)
    im.save(OUT + out + '.png')
    print(f'  wrote {out}.png')
