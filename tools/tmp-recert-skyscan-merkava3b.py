# recert merkava3b r12: MASK-METHOD enclosed-sky scan on the official critic pairs (proc half)
# bg law: |px - 0x151b20| maxch <= 13. Enclosed = bg-class pixels not flood-reachable from the border.
from PIL import Image
from collections import deque
SRC = '/Users/kevinliu/claude-of-tanks/shots/critic-merkava3b'
BR, BGc, BB = 0x15, 0x1b, 0x20

def scan(view, half='proc'):
    im = Image.open(f'{SRC}/{view}.png').convert('RGB')
    w, h = im.size
    x0, x1 = (w // 2, w) if half == 'proc' else (0, w // 2)
    tile = im.crop((x0, 0, x1, h))
    W, H = tile.size
    px = tile.load()
    def isbg(x, y):
        r, g, b = px[x, y]
        return abs(r - BR) <= 13 and abs(g - BGc) <= 13 and abs(b - BB) <= 13
    bg = [[isbg(x, y) for x in range(W)] for y in range(H)]
    seen = [[False] * W for _ in range(H)]
    dq = deque()
    for x in range(W):
        for y in (0, H - 1):
            if bg[y][x] and not seen[y][x]:
                seen[y][x] = True; dq.append((y, x))
    for y in range(H):
        for x in (0, W - 1):
            if bg[y][x] and not seen[y][x]:
                seen[y][x] = True; dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for yy, xx in ((y-1,x),(y+1,x),(y,x-1),(y,x+1)):
            if 0 <= yy < H and 0 <= xx < W and bg[yy][xx] and not seen[yy][xx]:
                seen[yy][xx] = True; dq.append((yy, xx))
    comps = []
    lab = [[False] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            if bg[y][x] and not seen[y][x] and not lab[y][x]:
                q = deque([(y, x)]); lab[y][x] = True
                cnt = 1; mnx = mxx = x; mny = mxy = y
                while q:
                    cy, cx = q.popleft()
                    for yy, xx in ((cy-1,cx),(cy+1,cx),(cy,cx-1),(cy,cx+1)):
                        if 0 <= yy < H and 0 <= xx < W and bg[yy][xx] and not seen[yy][xx] and not lab[yy][xx]:
                            lab[yy][xx] = True; q.append((yy, xx)); cnt += 1
                            mnx = min(mnx, xx); mxx = max(mxx, xx); mny = min(mny, yy); mxy = max(mxy, yy)
                comps.append((cnt, mnx + x0, mny, mxx + x0, mxy))
    comps.sort(reverse=True)
    n = sum(c[0] for c in comps)
    print(f'{view:16s} {half}: enclosed-bg px = {n}' + (f'  rects(top5, cnt/x0/y0/x1/y1): {comps[:5]}' if comps else ''))

for v in ['view-rear', 'view-rearleft', 'view-rearright', 'view-front', 'close-front', 'view-left', 'view-right', 'hero-rearright', 'hero-toptilt', 'view-top']:
    scan(v, 'proc')
