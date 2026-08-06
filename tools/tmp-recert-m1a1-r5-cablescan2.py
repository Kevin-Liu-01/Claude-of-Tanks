# recert m1a1 r5: corrected footprint scan. Lesson (banked in r4 + confirmed
# here): the dark cable core tone (23,24,21) sits INSIDE the bg MASK-METHOD
# tolerance of 0x151b20 — tone-based bg exclusion eats the cable. These scan
# zones are strictly interior to the silhouette (§B2 machine scan 0 holes), so
# cable px = luma <= 50, no bg exclusion. Mirror-zone (view-right) comparison
# uses the LONGEST CONTIGUOUS RUN at a single row-band (the cable signature:
# ~190 cols continuous), not raw dark counts.
from PIL import Image

CUR = '/Users/kevinliu/claude-of-tanks/shots/critic-m1a1'

def luma(p):
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]

def line_signature(im, x0, x1, y0, y1, dark=50):
    """Cable-line stats: per-column dark rows in band; contiguous run."""
    cols = {}
    total = 0
    for x in range(x0, x1):
        ys = [y for y in range(y0, y1) if luma(im.getpixel((x, y))) <= dark]
        if ys:
            cols[x] = ys
            total += len(ys)
    # contiguous columns (allow 2px hole)
    best, run, miss = None, None, 0
    for x in range(x0, x1):
        if x in cols:
            if run is None:
                run = [x, x]
            run[1] = x
            miss = 0
        elif run:
            miss += 1
            if miss > 2:
                if best is None or run[1] - run[0] > best[1] - best[0]:
                    best = tuple(run)
                run = None
    if run and (best is None or run[1] - run[0] > best[1] - best[0]):
        best = tuple(run)
    return cols, total, best

print('== view-left cable band (tight: rows 311..317, cols 770..990) ==')
im = Image.open(f'{CUR}/view-left.png').convert('RGB')
cols, total, best = line_signature(im, 770, 990, 311, 318)
xs = sorted(cols)
print(f'footprint px: {total}; cols present: {len(xs)}; span {xs[0]}..{xs[-1]}; longest contiguous run {best} = {best[1]-best[0]+1} cols')
ymids = [sum(cols[x]) / len(cols[x]) for x in xs]
print(f'y-mid min/max: {min(ymids):.1f}/{max(ymids):.1f}; thickness histo:',
      {t: [len(cols[x]) for x in xs].count(t) for t in sorted(set(len(cols[x]) for x in xs))})
# clamp ticks: dark px in rows 316..319 BELOW the line (clamp bodies)
clamp_cols = [x for x in range(770, 990)
              if any(luma(im.getpixel((x, y))) <= 52 for y in range(316, 320))]
print('clamp-tick columns (dark below line):', clamp_cols)

print()
print('== view-right mirror band: longest dark contiguous run rows 311..317 ==')
imr = Image.open(f'{CUR}/view-right.png').convert('RGB')
colsr, totalr, bestr = line_signature(imr, 290, 510, 311, 318)  # mirrored cable zone (bow left)
print(f'mirror-zone footprint {totalr}px; longest run {bestr}',
      f'= {0 if not bestr else bestr[1]-bestr[0]+1} cols')

print()
print('== view-top: cable plan strip ==')
imt = Image.open(f'{CUR}/view-top.png').convert('RGB')
# find left mask edge (non-bg) around cable rows; bg = 0x151b20 within 13
def is_bg(p, tol=13):
    return max(abs(p[0] - 21), abs(p[1] - 27), abs(p[2] - 32)) <= tol
edges = []
for y in range(200, 480, 20):
    for x in range(830, 1000):
        if not is_bg(imt.getpixel((x, y))):
            edges.append((y, x)); break
print('left plan mask edge samples (y, x):', edges)
xe = min(x for _, x in edges)
# scale: use bow/stern extents? use skirt width: right edge
redges = []
for y in range(200, 480, 20):
    for x in range(1150, 980, -1):
        if not is_bg(imt.getpixel((x, y))):
            redges.append(x); break
xr = max(redges)
pxm = (xr - xe + 1) / 3.624  # skirt plane span ±1.812
print(f'plan width cols {xe}..{xr} -> {pxm:.1f} px/m')
# cable strip: world x -1.809..-1.755 => img x xe+ (1.812-1.809)*pxm .. xe+(1.812-1.755)*pxm
cx0, cx1 = xe, xe + int(round((1.812 - 1.750) * pxm)) + 1
# z range: need z->row mapping; stern bumper (z -3.94?) find top mask row at x mid
topr = None
for y in range(120, 300):
    if not is_bg(imt.getpixel((960, y))):
        topr = y; break
print(f'cable plan strip cols {cx0}..{cx1}; mask top row (stern) {topr}')
tot = 0
rows_present = []
for y in range(topr, topr + 460):
    n = sum(1 for x in range(cx0, cx1 + 1) if luma(imt.getpixel((x, y))) <= 50)
    if n:
        tot += n
        rows_present.append(y)
if rows_present:
    print(f'top-strip dark px total {tot}; rows {min(rows_present)}..{max(rows_present)} ({len(rows_present)} rows)')

print()
print('== quarters + hero: tight cable-line zones ==')
for view, x0, x1, y0, y1 in [
    ('view-frontleft', 755, 905, 300, 318),
    ('view-rearleft', 900, 1050, 305, 325),
    ('hero-frontleft', 740, 960, 320, 360),
]:
    im2 = Image.open(f'{CUR}/{view}.png').convert('RGB')
    c2, t2, b2 = line_signature(im2, x0, x1, y0, y1)
    print(f'{view}: footprint {t2}px; longest run {b2} = {0 if not b2 else b2[1]-b2[0]+1} cols')
