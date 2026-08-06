# TEMP t84 r31 critic: probe pass — non-bg extents per half + row/col profiles
# to place measurement rects precisely. bg = (21,27,32) maxch<=13 (mask-method).
from PIL import Image
import sys

BASE = 'shots/critic-t84/'
BG = (21, 27, 32)
TOL = 13

def bgmask(px):
    r, g, b = px
    return abs(r - BG[0]) <= TOL and abs(g - BG[1]) <= TOL and abs(b - BG[2]) <= TOL

def extents(img, x0, x1):
    im = img.convert('RGB')
    w, h = im.size
    data = im.load()
    minx, maxx, miny, maxy = 10 ** 9, -1, 10 ** 9, -1
    for y in range(0, h):
        for x in range(x0, x1):
            if not bgmask(data[x, y]):
                if y < 30 and x < 200 + x0 - (0 if x0 == 0 else 640):
                    continue  # label text
                minx = min(minx, x); maxx = max(maxx, x)
                miny = min(miny, y); maxy = max(maxy, y)
    return minx, miny, maxx, maxy

def rowprofile(img, x0, x1, ys, ye, label):
    im = img.convert('RGB')
    data = im.load()
    print(f'  row-profile {label} (luma mean of non-bg, count):')
    for y in range(ys, ye, 2):
        vals = []
        for x in range(x0, x1):
            p = data[x, y]
            if not bgmask(p):
                vals.append(0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2])
        if vals:
            print(f'    y{y}: n{len(vals):4d} mean {sum(vals)/len(vals):6.1f}')

for name in ['view-left', 'view-right', 'view-front', 'view-rear', 'view-top']:
    img = Image.open(BASE + name + '.png')
    r = extents(img, 0, 640)
    p = extents(img, 640, 1280)
    print(f'{name}: REF box {r}  PROC box {p} (proc-640: {(p[0]-640,p[1],p[2]-640,p[3])})')

# side view row profile through the running gear band
img = Image.open(BASE + 'view-left.png')
rowprofile(img, 60, 440, 300, 396, 'REF left hull band')
rowprofile(img, 700, 1080, 300, 396, 'PROC left hull band')
