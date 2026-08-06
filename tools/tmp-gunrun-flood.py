# TEMP (merkava3b/3c gun-run re-cert critic): §B2 enclosed-sky flood on
# critic pair PNGs — mask-method (|px-0x151b20| maxch<=13) PLUS the
# blue-signature term (B-R >= +8, revolution-r7 law) on the PROCEDURAL
# half, excluding the y13-21 label band (§J PAIR-PNG LABEL BAND law).
# Border flood; enclosed clusters reported with bboxes. Compares a fresh
# render dir against the pre-round baseline snapshot.
import sys
from collections import deque
from PIL import Image

BG = (21, 27, 32)
TOL = 13
LABEL_Y = (13, 21)  # inclusive exclusion band

def sky_mask(im, x0, x1):
    px = im.load()
    w, h = im.size
    m = [[False] * (x1 - x0) for _ in range(h)]
    for y in range(h):
        for x in range(x0, x1):
            r, g, b = px[x, y][:3]
            if (abs(r - BG[0]) <= TOL and abs(g - BG[1]) <= TOL and
                    abs(b - BG[2]) <= TOL and (b - r) >= 8):
                m[y][x - x0] = True
    return m

def flood_enclosed(m, h, w):
    seen = [[False] * w for _ in range(h)]
    dq = deque()
    for x in range(w):
        for y in (0, h - 1):
            if m[y][x] and not seen[y][x]:
                seen[y][x] = True
                dq.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if m[y][x] and not seen[y][x]:
                seen[y][x] = True
                dq.append((x, y))
    while dq:
        x, y = dq.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and m[ny][nx] and not seen[ny][nx]:
                seen[ny][nx] = True
                dq.append((nx, ny))
    clusters = []
    cseen = [[False] * w for _ in range(h)]
    for y in range(h):
        if LABEL_Y[0] <= y <= LABEL_Y[1]:
            continue
        for x in range(w):
            if m[y][x] and not seen[y][x] and not cseen[y][x]:
                n = 0
                bx0, bx1, by0, by1 = x, x, y, y
                dq2 = deque([(x, y)])
                cseen[y][x] = True
                while dq2:
                    cx, cy = dq2.popleft()
                    if LABEL_Y[0] <= cy <= LABEL_Y[1]:
                        continue
                    n += 1
                    bx0, bx1 = min(bx0, cx), max(bx1, cx)
                    by0, by1 = min(by0, cy), max(by1, cy)
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = cx + dx, cy + dy
                        if (0 <= nx < w and 0 <= ny < h and m[ny][nx]
                                and not seen[ny][nx] and not cseen[ny][nx]):
                            cseen[ny][nx] = True
                            dq2.append((nx, ny))
                if n > 0:
                    clusters.append((n, bx0, bx1, by0, by1))
    clusters.sort(reverse=True)
    return clusters

def scan(path):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    x0 = w // 2  # PROCEDURAL half
    m = sky_mask(im, x0, w)
    cl = flood_enclosed(m, h, w - x0)
    tot = sum(c[0] for c in cl)
    return tot, [(n, bx0 + x0, bx1 + x0, by0, by1) for n, bx0, bx1, by0, by1 in cl[:6]]

if __name__ == '__main__':
    views = sys.argv[3].split(',') if len(sys.argv) > 3 else [
        'close-front', 'view-front', 'view-frontleft', 'view-frontright',
        'view-left', 'view-right', 'view-top', 'hero-frontleft',
        'hero-toptilt', 'close-roof']
    fresh_dir, base_dir = sys.argv[1], sys.argv[2]
    for v in views:
        ft, fc = scan(f'{fresh_dir}/{v}.png')
        bt, bc = scan(f'{base_dir}/{v}.png')
        delta = ft - bt
        flag = '  <-- NEW' if delta > 4 else ''
        print(f'{v:16s} fresh {ft:5d}px (base {bt:5d}, d{delta:+5d}){flag}')
        if delta > 4:
            print('   fresh clusters:', fc)
            print('   base  clusters:', bc)
