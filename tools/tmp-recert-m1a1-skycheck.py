# recert m1a1 r4: MASK-METHOD sky/air checks (§D: bg |px-0x151b20| maxch<=13)
# on the carve-adjacent dark regions. Rect coords are FULL-PAIR px.
from PIL import Image
BG = (0x15, 0x1b, 0x20)
SRC = '/Users/kevinliu/claude-of-tanks/shots/critic-m1a1'

def isbg(p):
    return max(abs(p[0] - BG[0]), abs(p[1] - BG[1]), abs(p[2] - BG[2])) <= 13

def check(view, rect, name):
    im = Image.open(f'{SRC}/{view}.png').convert('RGB')
    px = im.load()
    x0, y0, x1, y1 = rect
    tot = (x1 - x0) * (y1 - y0)
    n = sum(1 for y in range(y0, y1) for x in range(x0, x1) if isbg(px[x, y]))
    print(f'{view} {name} rect{rect}: bg-px {n}/{tot} ({100.0*n/tot:.1f}%)')

# view-right stern: slit between skirt rear edge and rear wall block
# crop was (1140,300,1270,400)x5; slit at crop x375-395 y0-105 -> full 1215..1219, 300..321
check('view-right', (1213, 298, 1222, 325), 'stern skirt/wall slit')
# under-shelf bay over the sprocket wrap (vacated shelf span)
check('view-right', (1180, 325, 1235, 360), 'stern under-shelf bay')
# view-left mirrors
check('view-left', (698, 298, 710, 325), 'stern skirt/wall slit')
check('view-left', (688, 325, 740, 360), 'stern under-shelf bay')
# view-front: under-wing slots (carve-exposed)
check('view-front', (708, 320, 800, 340), 'left under-wing slot')
check('view-front', (1120, 320, 1212, 340), 'right under-wing slot')
# view-rear: vacated outboard spans (should be wrap/track, not sky)
check('view-rear', (714, 290, 810, 420), 'left vacated span')
check('view-rear', (1110, 290, 1206, 420), 'right vacated span')
# hero-toptilt evaluator void flag zone (world x1.40 y0.90 z1.29 -> right flank)
check('hero-toptilt', (1050, 420, 1240, 560), 'toptilt right-flank void zone')
# hero-rearright evaluator void flag (x-1.13 y2.20 z0.20 -> under-barrel/deck)
check('hero-rearright', (900, 240, 1100, 330), 'rearright under-barrel zone')
