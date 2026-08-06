# TEMP t84 r31 critic: pass 3 — stern-left exhaust zone reads + variant
# distinctiveness strips (t84 vs t80 vs t80b PROC halves, view-left + view-front
# + close-roof) + rear-left dark mass stats.
from PIL import Image

OUT = '/private/tmp/claude-501/-Users-kevinliu-claude-of-tanks/d0226c73-49ae-490e-9a35-39379da35769/scratchpad/'
BG = (21, 27, 32)
TOL = 13

def is_bg(p):
    return abs(p[0] - BG[0]) <= TOL and abs(p[1] - BG[1]) <= TOL and abs(p[2] - BG[2]) <= TOL

def luma(p):
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]

def stats(im, rect):
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
    return dict(n=n, nbg=nbg, p5=pc(0.05), med=pc(0.5), p95=pc(0.95), mean=mean)

# stern-left dark mass (view-rearleft: proc stern at image left of the proc half)
im = Image.open('shots/critic-t84/view-rearleft.png').convert('RGB')
for side, rect in (('REF stern-left zone ', (70, 310, 200, 390)),
                   ('PROC stern-left zone', (710, 310, 840, 390))):
    s = stats(im, rect)
    print(f'view-rearleft {side} rect{rect}: n{s["n"]:5d} bg{s["nbg"]:4d} p5 {s.get("p5",0):5.1f} med {s.get("med",0):5.1f} p95 {s.get("p95",0):5.1f}')
im.crop((680, 280, 900, 400)).resize((660, 360), Image.NEAREST).save(OUT + 'crop-sternleft.png')
im.crop((40, 280, 260, 400)).resize((660, 360), Image.NEAREST).save(OUT + 'crop-sternleft-REF.png')

# view-left stern zone (exhaust should sit rear-left above the last wheels)
im = Image.open('shots/critic-t84/view-left.png').convert('RGB')
im.crop((660, 300, 800, 396)).resize((560, 384), Image.NEAREST).save(OUT + 'crop-left-stern.png')
im.crop((20, 300, 160, 396)).resize((560, 384), Image.NEAREST).save(OUT + 'crop-left-stern-REF.png')

# variant strips: PROC halves of t84 / t80 / t80b
for view, ys in (('view-left', (240, 400)), ('view-front', (100, 520)), ('close-roof', (150, 500))):
    cells = []
    for tid in ('t84', 't80', 't80b'):
        im = Image.open(f'shots/critic-{tid}/{view}.png').convert('RGB').crop((640, ys[0], 1280, ys[1]))
        cells.append(im)
    W = max(c.width for c in cells)
    H = sum(c.height for c in cells) + 40 * len(cells)
    sheet = Image.new('RGB', (W, H), (21, 27, 32))
    from PIL import ImageDraw
    d = ImageDraw.Draw(sheet)
    y = 0
    for tid, c in zip(('t84', 't80', 't80b'), cells):
        d.text((8, y + 12), tid + ' PROC ' + view, fill=(240, 200, 120))
        sheet.paste(c, (0, y + 40))
        y += c.height + 40
    sheet.save(OUT + f'strip-{view}.png')
    print(f'wrote strip-{view}.png ({W}x{H})')
