# TEMP (isu152 r5): baseline measurements for the six r5 orders on the
# OFFICIAL critic pairs (shots/critic-isu152/*.png). ITU-601 luma; bg
# discriminator max|px-0x151b20| > 13; proc pane = ref pane x + 640.
from PIL import Image

D = 'shots/critic-isu152/'


def luma(p):
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]


def nonbg(p):
    return max(abs(p[0] - 0x15), abs(p[1] - 0x1b), abs(p[2] - 0x20)) > 13


def rowspan(px, y, x0, x1):
    xs = [X for X in range(x0, x1) if nonbg(px[X, y])]
    return (min(xs), max(xs), len(xs)) if xs else None


print('=== ORDER 1a: view-rear crest rows (ref vs proc widths) ===')
vr = Image.open(D + 'view-rear.png').convert('RGB')
px = vr.load()
for y in range(118, 165, 2):
    r = rowspan(px, y, 0, 640)
    p = rowspan(px, y, 640, 1280)
    rw = (r[1] - r[0] + 1) if r else 0
    pw = (p[1] - p[0] + 1) if p else 0
    print(f'  row {y}: ref w {rw:3d} [{r[0] if r else 0:3d},{r[1] if r else 0:3d}]  '
          f'proc w {pw:3d} [{(p[0]-640) if p else 0:3d},{(p[1]-640) if p else 0:3d}]  ratio {pw/max(1,rw):.2f}')

print('=== ORDER 1a2: view-rear casemate wall rows (the trapezoid) ===')
for y in range(170, 330, 10):
    r = rowspan(px, y, 0, 640)
    p = rowspan(px, y, 640, 1280)
    rw = (r[1] - r[0] + 1) if r else 0
    pw = (p[1] - p[0] + 1) if p else 0
    print(f'  row {y}: ref w {rw:3d} [{r[0] if r else 0:3d},{r[1] if r else 0:3d}]  '
          f'proc w {pw:3d} [{(p[0]-640) if p else 0:3d},{(p[1]-640) if p else 0:3d}]  ratio {pw/max(1,rw):.2f}')

print('=== ORDER 1b: view-rear ref drum circle zone (95-170, 215-330) ===')
# characterize the ref circle: dark ring / bright center rows
for y in range(215, 335, 10):
    seg = [X for X in range(80, 190) if nonbg(px[X, y])]
    if seg:
        vals = sorted(luma(px[X, y]) for X in seg)
        print(f'  row {y}: x [{min(seg)},{max(seg)}] n {len(seg)} p50 {vals[len(vals)//2]:.0f}')

print('=== view-rear pane bboxes (mapping anchors) ===')


def bbox(im, xoff):
    p = im.load()
    minx, maxx, miny, maxy = 10**9, -1, 10**9, -1
    for X in range(xoff, xoff + 640):
        for Y in range(30, 640):
            if nonbg(p[X, Y]):
                minx = min(minx, X)
                maxx = max(maxx, X)
                miny = min(miny, Y)
                maxy = max(maxy, Y)
    return minx, maxx, miny, maxy


rb = bbox(vr, 0)
pb = bbox(vr, 640)
print(f'  ref bbox x[{rb[0]},{rb[1]}] y[{rb[2]},{rb[3]}]  proc x[{pb[0]-640},{pb[1]-640}] y[{pb[2]},{pb[3]}]')

print('=== ORDER 2b: view-top intake cells (proc x250-290/x350-385, y160-225 pane-local) ===')
vt = Image.open(D + 'view-top.png').convert('RGB')


def stats(im, x0, y0, x1, y1, dk=70):
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
    q = lambda f: vals[min(n - 1, int(n * f))]
    return {'n': n, 'sky%': round(100 * sky / tot, 1), 'dark%': round(100 * dark / tot, 1),
            'p05': round(q(.05), 1), 'p25': round(q(.25), 1), 'p50': round(q(.5), 1),
            'p75': round(q(.75), 1), 'p95': round(q(.95), 1), 'iqr': round(q(.75) - q(.25), 1)}


for tag, x0, x1 in (('procL', 640 + 250, 640 + 290), ('procR', 640 + 350, 640 + 385)):
    print(f'  {tag} cells rect: {stats(vt, x0, 160, x1, 225)}')
# ref same zone: ref pane cells at?? measure both candidate bands
for tag, x0, x1 in (('refL', 250, 290), ('refR', 350, 385)):
    print(f'  {tag} rect: {stats(vt, x0, 160, x1, 225)}')

print('=== ORDER 2c: ref louver band view-top (300-340, 150-230) ===')
print(f'  ref louver rect: {stats(vt, 300, 150, 340, 230)}')
print(f'  proc same rect: {stats(vt, 640 + 300, 150, 640 + 340, 230)}')
# row profile of the ref louver band (see the slat pitch)
pxt = vt.load()
for y in range(150, 232, 3):
    vals = [luma(pxt[X, y]) for X in range(302, 338) if nonbg(pxt[X, y])]
    if vals:
        vals.sort()
        print(f'    ref row {y}: p50 {vals[len(vals)//2]:.0f} min {vals[0]:.0f}')

print('=== ORDER 3a: view-left window band rect x150-262 y366-384 ===')
vl = Image.open(D + 'view-left.png').convert('RGB')
r = stats(vl, 150, 366, 262, 384, dk=45)
p = stats(vl, 640 + 150, 366, 640 + 262, 384, dk=45)
print(f'  ref : {r}')
print(f'  proc: {p}')
print(f'  ref dark+sky {r["sky%"] + r.get("dark%", 0):.1f}%  proc {p["sky%"] + p.get("dark%", 0):.1f}%')

print('=== ORDER 3d: y396 row dark fraction (view-left) ===')
pxl = vl.load()
for row_y in (394, 395, 396, 397, 398):
    for tag, off in (('ref', 0), ('proc', 640)):
        seg = [luma(pxl[X, row_y]) for X in range(off + 46, off + 600) if nonbg(pxl[X, row_y])]
        if seg:
            dk_n = sum(1 for v in seg if v < 70)
            seg.sort()
            print(f'  {tag} y{row_y}: n {len(seg)} dark(<70) {100*dk_n/len(seg):.1f}% p50 {seg[len(seg)//2]:.1f}')

print('=== ORDER 3b: close-front ball zone ===')
cf = Image.open(D + 'close-front.png').convert('RGB')
print(f'  ref ball rect (180-260,240-330):  {stats(cf, 180, 240, 260, 330)}')
print(f'  proc collar rect (230-320,255-310): {stats(cf, 640 + 230, 255, 640 + 320, 310)}')
print(f'  proc ball-target rect (230-320,255-345): {stats(cf, 640 + 230, 255, 640 + 320, 345)}')

print('=== ORDER 3c: view-right curl horn ref (560-595, 320-355) ===')
vrt = Image.open(D + 'view-right.png').convert('RGB')
print(f'  ref horn rect : {stats(vrt, 560, 320, 595, 355)}')
print(f'  proc same rect: {stats(vrt, 640 + 560, 320, 640 + 595, 355)}')
pxr = vrt.load()
for y in range(316, 360, 4):
    seg = [X for X in range(548, 610) if nonbg(pxr[X, y])]
    if seg:
        print(f'    ref row {y}: x[{min(seg)},{max(seg)}]')

print('=== ORDER 3e: close-roof R-cupola top (proc 920-955, 85-115) ===')
cr = Image.open(D + 'close-roof.png').convert('RGB')
print(f'  proc cupola-top rect: {stats(cr, 640 + 280, 85, 640 + 315, 115)}')
print(f'  ref same rect      : {stats(cr, 280, 85, 315, 115)}')

print('=== ORDER 3f: stern descent teeth (view-left tail wrap) ===')


def zx(z):
    return int(round(46 + (z + 3.407) * 60.2))


for tag, off in (('ref', 0), ('proc', 640)):
    outs = []
    for i in range(9):
        z = -3.35 + i * 0.05
        X = off + zx(z)
        br = next((Y for Y in range(vl.size[1] - 1, 300, -1) if nonbg(pxl[X, Y])), None)
        outs.append(f'{z:+.2f}:{(399-br)/60.2:.2f}' if br else f'{z:+.2f}:-')
    print(f'  {tag} tail bottoms: ' + ' '.join(outs))
