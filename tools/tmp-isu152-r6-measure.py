# TEMP (isu152 r6): done-gate measurements on the OFFICIAL critic pairs
# (shots/critic-isu152/*.png), one block per r6 order (critic r5 verdict).
# ITU-601 luma; bg discriminator max|px-0x151b20| > 13; proc pane = ref
# pane x + 640. view-left mapping: px = 46 + (z+3.407)*60.2, py = 399 -
# y*60.2. view-right: px = 46 + (5.72-z)*60.2. view-top: px = 333.5 -
# (x+0.23)*59.7, py = 111 + (z+2.34)*59.7 (vent-circle anchor, r2).
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
    return {'n': n, 'sky%': round(100 * sky / tot, 1),
            'dark%': round(100 * dark / tot, 1),
            'p05': q(.05), 'p25': q(.25), 'p50': q(.5), 'p75': q(.75),
            'p95': q(.95), 'iqr': round(q(.75) - q(.25), 1)}


def show(tag, s):
    print(f'  {tag}: ' + ' '.join(f'{k} {v}' for k, v in s.items()))


ZX = lambda z: 46 + (z + 3.407) * 60.2          # view-left px(z)
ZY = lambda y: 399 - y * 60.2                   # view-left py(y)
RX = lambda z: 46 + (5.72 - z) * 60.2           # view-right px(z)
TX = lambda x: 333.5 - (x + 0.23) * 59.7        # view-top px(x)
TY = lambda z: 111 + (z + 2.34) * 59.7          # view-top py(z)

fl = Image.open(D + 'view-frontleft.png').convert('RGB')
fr = Image.open(D + 'view-frontright.png').convert('RGB')
vl = Image.open(D + 'view-left.png').convert('RGB')
vr = Image.open(D + 'view-right.png').convert('RGB')
vt = Image.open(D + 'view-top.png').convert('RGB')
hf = Image.open(D + 'hero-frontleft.png').convert('RGB')

# ---------------------------------------------------------------------------
print('=== ORDER 1a: fender shadow run (both front quarters; 55-65L '
      'class ordered). col-min in the run band y283-325 ===')
for im, name, xr in ((fl, 'frontleft ', (100, 460)), (fr, 'frontright', (180, 540))):
    for tag, off in (('ref ', 0), ('proc', 640)):
        p = im.load()
        mins = []
        for X in range(xr[0] + off, xr[1] + off, 4):
            vals = [luma(p[X, Y]) for Y in range(283, 326) if nonbg(p[X, Y])]
            if vals:
                mins.append(min(vals))
        mins.sort()
        n = len(mins)
        if n:
            print(f'  {name} {tag} col-min: n {n} p25 {mins[n // 4]:.1f} '
                  f'p50 {mins[n // 2]:.1f} p75 {mins[3 * n // 4]:.1f}')

# ---------------------------------------------------------------------------
print('=== ORDER 1b: wall vs skirt tone split (view-left/right on-element '
      'bands: wall = sponson band y1.462-1.542 BELOW the run; skirt = '
      'curtain band y0.62-1.10) ===')
for im, name, XF in ((vl, 'left ', ZX), (vr, 'right', RX)):
    for tag, off in (('ref ', 0), ('proc', 640)):
        x0 = int(min(XF(-2.2), XF(2.6))) + off
        x1 = int(max(XF(-2.2), XF(2.6))) + off
        show(f'{name} {tag} wall ', stats(im, x0, int(ZY(1.542)), x1, int(ZY(1.462))))
        show(f'{name} {tag} skirt', stats(im, x0, int(ZY(1.10)), x1, int(ZY(0.62))))
print('  strip rows dead-side (proc, y 1.548-1.600):')
for im, name, XF in ((vl, 'left ', ZX), (vr, 'right', RX)):
    x0 = int(min(XF(-2.2), XF(2.6))) + 640
    x1 = int(max(XF(-2.2), XF(2.6))) + 640
    show(f'{name} strip', stats(im, x0, int(ZY(1.600)), x1, int(ZY(1.548))))
print('  frontleft quarter split (strip-anchored rows per column, x 130-340):')
p = fl.load()
for tag, off in (('ref ', 0), ('proc', 640)):
    wall, skirt = [], []
    for X in range(130 + off, 340 + off, 2):
        best, by = 999, -1
        for Y in range(283, 326):
            if nonbg(p[X, Y]):
                v = luma(p[X, Y])
                if v < best:
                    best, by = v, Y
        if by < 0:
            continue
        for Y in range(by + 2, by + 8):
            if nonbg(p[X, Y]):
                wall.append(luma(p[X, Y]))
        for Y in range(by + 12, by + 32):
            if nonbg(p[X, Y]):
                skirt.append(luma(p[X, Y]))
    wall.sort(); skirt.sort()
    if wall and skirt:
        print(f'  fl {tag} wall p50 {wall[len(wall) // 2]:.1f} | '
              f'skirt p50 {skirt[len(skirt) // 2]:.1f} | split '
              f'{wall[len(wall) // 2] - skirt[len(skirt) // 2]:+.1f}')

# ---------------------------------------------------------------------------
print('=== ORDER 1c: wheel-rim crescents (view-left/right: rim annulus '
      'rho 0.74-1.02 in the VISIBLE upper-lateral band y 0.40-0.58 vs '
      'inner face rho<0.6) ===')
for im, name, XF in ((vl, 'left ', ZX), (vr, 'right', RX)):
    for tag, off in (('ref ', 0), ('proc', 640)):
        p = im.load()
        rims, faces = [], []
        for wz in (1.85, 1.10, 0.35, -0.40, -1.15, -1.90):
            cx, cy = XF(wz) + off, ZY(0.36)
            for dx in range(-19, 20):
                for dy in range(-19, 20):
                    X, Y = int(cx + dx), int(cy + dy)
                    wy = 0.36 + (cy - Y) / 60.2
                    if not (0.40 <= wy <= 0.58) or not nonbg(p[X, Y]):
                        continue
                    rho = math.hypot(dx, dy) / 17.1          # r 0.285*60.2
                    if 0.74 <= rho <= 1.02:
                        rims.append(luma(p[X, Y]))
                    elif rho < 0.60:
                        faces.append(luma(p[X, Y]))
        rims.sort(); faces.sort()
        if rims and faces:
            print(f'  {name} {tag} rim-annulus p50 {rims[len(rims) // 2]:.1f} '
                  f'p90 {rims[9 * len(rims) // 10]:.1f} | face p50 '
                  f'{faces[len(faces) // 2]:.1f} p90 {faces[9 * len(faces) // 10]:.1f}')

# ---------------------------------------------------------------------------
print('=== ORDER 2: bow flap-pocket (frontleft (330-450,340-410) + '
      'frontright (190-310,340-410); 6-28L checkers -> 48-55L ordered) ===')
for tag, off in (('ref ', 0), ('proc', 640)):
    show(f'frontleft  {tag}', stats(fl, 330 + off, 340, 450 + off, 410))
for tag, off in (('ref ', 0), ('proc', 640)):
    show(f'frontright {tag}', stats(fr, 190 + off, 340, 310 + off, 410))
print('  sub-45L px count in pocket rects (the checker mass):')
for im, name, x0, x1 in ((fl, 'frontleft ', 330, 450), (fr, 'frontright', 190, 310)):
    p = im.load()
    for tag, off in (('ref ', 0), ('proc', 640)):
        n = sum(1 for X in range(x0 + off, x1 + off) for Y in range(340, 410)
                if nonbg(p[X, Y]) and luma(p[X, Y]) < 45)
        n28 = sum(1 for X in range(x0 + off, x1 + off) for Y in range(340, 410)
                  if nonbg(p[X, Y]) and luma(p[X, Y]) < 29)
        print(f'  {name} {tag}: <45L {n}px | <29L {n28}px')

# ---------------------------------------------------------------------------
print('=== ORDER 3a: view-top gun-root housing (ref block x -0.64..+0.16 '
      '= 48px; interior tone + edge dips) ===')
show('ref  housing interior', stats(vt, 312, 412, 356, 424))
show('proc housing interior', stats(vt, 952, 412, 996, 424))
# edge-line dips: row minima at the outer-edge px bands
p = vt.load()
for tag, off in (('ref ', 0), ('proc', 640)):
    for ename, px0, px1 in (('right-edge', 308, 313), ('left-edge', 355, 360)):
        dips = []
        for Y in range(413, 425):
            vals = [luma(p[X, Y]) for X in range(px0 + off, px1 + off) if nonbg(p[X, Y])]
            if vals:
                dips.append(min(vals))
        if dips:
            dips.sort()
            print(f'  {tag} {ename} row-min p50 {dips[len(dips) // 2]:.1f}')
# housing width: contiguous non-glacis band (edge-to-edge) at py 418
for tag, off in (('ref ', 0), ('proc', 640)):
    Y = 418
    print(f'  {tag} py418 profile 300-370:',
          ' '.join(f'{luma(p[X + off, Y]):3.0f}' if nonbg(p[X + off, Y]) else ' --'
                   for X in range(300, 370, 3)))

# ---------------------------------------------------------------------------
print('=== ORDER 3b: louver band ends at dome rim (view-top) ===')
for tag, off in (('ref ', 0), ('proc', 640)):
    cx, cy = int(TX(0.10)) + off, int(TY(-0.98))
    inside, outside = [], []
    p = vt.load()
    for X in range(cx - 26, cx + 27):
        for Y in range(cy - 26, cy + 27):
            if not nonbg(p[X, Y]):
                continue
            if (X - cx) ** 2 + (Y - cy) ** 2 <= 15 ** 2:
                inside.append(luma(p[X, Y]))
    for X in range(int(TX(-0.275)) + off, int(TX(-0.33)) + off):
        for Y in range(int(TY(-1.25)), int(TY(-0.65))):
            if nonbg(p[X, Y]):
                outside.append(luma(p[X, Y]))
    inside.sort(); outside.sort()
    ni, no = len(inside), len(outside)
    if ni:
        print(f'  {tag} inside-dome  p05 {inside[int(ni * .05)]:.1f} '
              f'p25 {inside[ni // 4]:.1f} p50 {inside[ni // 2]:.1f} '
              f'p95 {inside[int(ni * .95)]:.1f}')
    if no:
        print(f'  {tag} left-band    p05 {outside[int(no * .05)]:.1f} '
              f'p25 {outside[no // 4]:.1f} p50 {outside[no // 2]:.1f}')
    dips = []
    for k in range(16):
        a = k / 16 * 2 * math.pi
        best = 999
        for r in range(15, 23):
            X, Y = int(cx + r * math.cos(a)), int(cy + r * math.sin(a))
            if nonbg(p[X, Y]):
                best = min(best, luma(p[X, Y]))
        dips.append(best)
    dips.sort()
    print(f'  {tag} rim-ring radial dips p25 {dips[4]:.1f} p50 {dips[8]:.1f}')

# ---------------------------------------------------------------------------
print('=== hero-frontleft flank echo (strip-anchored split, x 200-420) ===')
p = hf.load()
for tag, off in (('ref ', 0), ('proc', 640)):
    wall, skirt, runm = [], [], []
    for X in range(200 + off, 420 + off, 2):
        best, by = 999, -1
        for Y in range(275, 330):
            if nonbg(p[X, Y]):
                v = luma(p[X, Y])
                if v < best:
                    best, by = v, Y
        if by < 0:
            continue
        runm.append(best)
        for Y in range(by + 2, by + 8):
            if nonbg(p[X, Y]):
                wall.append(luma(p[X, Y]))
        for Y in range(by + 12, by + 30):
            if nonbg(p[X, Y]):
                skirt.append(luma(p[X, Y]))
    for nm, arr in (('run col-min', runm), ('wall', wall), ('skirt', skirt)):
        if arr:
            arr.sort()
            print(f'  {tag} {nm} p50 {arr[len(arr) // 2]:.1f}')
