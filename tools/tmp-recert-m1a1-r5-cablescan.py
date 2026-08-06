# recert m1a1 r5 (cable relocation): DIRECT footprint measurement of the
# skirt-ledge tow cable on the fresh official critic renders (§D: official-rig
# images; this tool is the r4 acceptance's "cablehunt class of check" run as a
# direct-footprint scan — no baseline tree needed: count the cable's own dark
# tube pixels in the carrying zones, per-column continuity, straightness,
# clamp bumps, contact row, and the mirror-zone null check on view-right).
from PIL import Image
import os

CUR = '/Users/kevinliu/claude-of-tanks/shots/critic-m1a1'
OUT = os.path.join(CUR, 'crops')
os.makedirs(OUT, exist_ok=True)
BG = (21, 27, 32)  # 0x151b20

def luma(p):
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]

def is_bg(p, tol=13):
    return max(abs(p[0] - BG[0]), abs(p[1] - BG[1]), abs(p[2] - BG[2])) <= tol

def scan_band(im, x0, x1, y0, y1, dark=48):
    """Per-column dark-run stats inside [x0,x1)x[y0,y1)."""
    px = im.load()
    cols = {}
    total = 0
    for x in range(x0, x1):
        ys = [y for y in range(y0, y1) if not is_bg(px[x, y]) and luma(px[x, y]) <= dark]
        if ys:
            cols[x] = (min(ys), max(ys), len(ys))
            total += len(ys)
    return cols, total

def runs(cols, x0, x1):
    """Contiguous column runs (allowing 1px holes)."""
    out = []
    run = None
    miss = 0
    for x in range(x0, x1):
        if x in cols:
            if run is None:
                run = [x, x]
            else:
                run[1] = x
            miss = 0
        elif run is not None:
            miss += 1
            if miss > 1:
                out.append(tuple(run)); run = None
    if run is not None:
        out.append(tuple(run))
    return [r for r in out if r[1] - r[0] >= 8]

print('=== view-left: cable carrying view (direct footprint) ===')
im = Image.open(f'{CUR}/view-left.png').convert('RGB')
# generous band around the skirt-top step, proc half: rows 295..332, cols 700..1060
cols, total = scan_band(im, 700, 1060, 295, 332)
rr = runs(cols, 700, 1060)
print(f'dark(luma<=48) px in band (700..1060 x 295..332): {total}')
print(f'column runs >=8px: {rr}')
if rr:
    main = max(rr, key=lambda r: r[1] - r[0])
    xs = [x for x in range(main[0], main[1] + 1) if x in cols]
    ymids = [(cols[x][0] + cols[x][1]) / 2 for x in xs]
    thick = [cols[x][2] for x in xs]
    n = len(xs)
    print(f'main run: x {main[0]}..{main[1]} ({main[1]-main[0]+1} cols, {n} present)')
    print(f'  px in main run: {sum(thick)}')
    print(f'  y-mid range: {min(ymids):.1f}..{max(ymids):.1f} (straightness); thickness min/med/max: '
          f'{min(thick)}/{sorted(thick)[n//2]}/{max(thick)}')
    bumps = [(x, cols[x][2]) for x in xs if cols[x][2] >= sorted(thick)[n // 2] + 2]
    print(f'  thick bumps (clamp candidates, >=med+2): {bumps}')
    # contact check: 3px below cable bottom must be non-bg (hull/skirt), and
    # directly-below tone vs 8px-above tone (open skirt wall)
    gaps = 0
    for x in xs[::4]:
        below = im.getpixel((x, cols[x][1] + 3))
        if is_bg(below):
            gaps += 1
    print(f'  bg-below-cable samples (floating check, want 0): {gaps}/{len(xs[::4])}')

print()
print('=== view-right: mirror zone null check ===')
imr = Image.open(f'{CUR}/view-right.png').convert('RGB')
colsr, totalr = scan_band(imr, 220, 580, 295, 332)   # mirrored band (right view: bow left)
rrr = runs(colsr, 220, 580)
print(f'dark px in mirror band (220..580 x 295..332): {totalr}; runs>=8: {rrr}')
# also scan the same abs coords as left for safety
colsr2, totalr2 = scan_band(imr, 700, 1060, 295, 332)
print(f'dark px in same-coords band (700..1060): {totalr2}; runs>=8: {runs(colsr2, 700, 1060)}')

for view, x0, x1, y0, y1 in [
    ('view-frontleft', 640, 1280, 280, 380),
    ('view-rearleft', 640, 1280, 280, 380),
    ('hero-frontleft', 640, 1280, 260, 420),
    ('view-top', 640, 1280, 150, 500),
]:
    im2 = Image.open(f'{CUR}/{view}.png').convert('RGB')
    c2, t2 = scan_band(im2, x0, x1, y0, y1)
    r2 = runs(c2, x0, x1)
    print(f'\n=== {view}: dark px in band ({x0}..{x1} x {y0}..{y1}): {t2}; runs>=8: {r2[:6]}')

# ---- 4x crops for the read verdicts -------------------------------------
def crop4(view, box, name):
    im3 = Image.open(f'{CUR}/{view}.png').convert('RGB').crop(box)
    im3 = im3.resize((im3.width * 4, im3.height * 4), Image.NEAREST)
    im3.save(f'{OUT}/r5-{name}.png')
    print(f'saved crops/r5-{name}.png  <- {view} {box}')

print()
crop4('view-left', (760, 288, 1000, 336), 'left-cable-full')
crop4('view-left', (770, 296, 850, 330), 'left-cable-rear')
crop4('view-left', (860, 296, 940, 330), 'left-cable-mid')
crop4('view-left', (930, 296, 1010, 330), 'left-cable-front')
