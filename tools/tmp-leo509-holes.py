# leo-509 round: enclosed-background (see-through) scanner per the mask-method
# + blue-signature law (BUILD-STANDARD sky/air claims: bg |px-0x151b20|
# maxch <= 13 AND B-R >= +8; enclosed = not flood-connected to the border).
# usage: python3 tools/tmp-leo509-holes.py <png> [<png> ...]
import sys
from collections import deque
from PIL import Image

BG = (0x15, 0x1B, 0x20)

def scan(path):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    px = im.load()
    def isbg(x, y):
        r, g, b = px[x, y]
        return (abs(r - BG[0]) <= 13 and abs(g - BG[1]) <= 13 and abs(b - BG[2]) <= 13
                and (b - r) >= 8)
    bg = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            bg[y][x] = isbg(x, y)
    # flood from border
    seen = [[False] * w for _ in range(h)]
    dq = deque()
    for x in range(w):
        for y in (0, h - 1):
            if bg[y][x] and not seen[y][x]:
                seen[y][x] = True; dq.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if bg[y][x] and not seen[y][x]:
                seen[y][x] = True; dq.append((x, y))
    while dq:
        x, y = dq.popleft()
        for nx, ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
            if 0 <= nx < w and 0 <= ny < h and bg[ny][nx] and not seen[ny][nx]:
                seen[ny][nx] = True; dq.append((nx, ny))
    # enclosed components
    comps = []
    cseen = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            if bg[y][x] and not seen[y][x] and not cseen[y][x]:
                n = 0; x0 = x1 = x; y0 = y1 = y
                dq2 = deque([(x, y)]); cseen[y][x] = True
                while dq2:
                    cx, cy = dq2.popleft(); n += 1
                    x0 = min(x0, cx); x1 = max(x1, cx); y0 = min(y0, cy); y1 = max(y1, cy)
                    for nx, ny in ((cx-1,cy),(cx+1,cy),(cx,cy-1),(cx,cy+1)):
                        if 0 <= nx < w and 0 <= ny < h and bg[ny][nx] and not seen[ny][nx] and not cseen[ny][nx]:
                            cseen[ny][nx] = True; dq2.append((nx, ny))
                if n >= 4:
                    comps.append((n, x0, y0, x1, y1))
    comps.sort(reverse=True)
    total = sum(c[0] for c in comps)
    print(f'{path}: enclosed-bg px {total} in {len(comps)} comps (>=4px)')
    for n, x0, y0, x1, y1 in comps[:12]:
        print(f'  {n:6d}px  x{x0}-{x1} y{y0}-{y1}')

for p in sys.argv[1:]:
    scan(p)
