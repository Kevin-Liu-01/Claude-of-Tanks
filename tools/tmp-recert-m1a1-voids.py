# recert m1a1 r4: enclosed-void finder (§B2 render-truth check).
# BG-colored px (|px-0x151b20| maxch<=13) flood-filled from the border of the
# PROC half; any bg cluster NOT border-connected = enclosed void (sky reading
# through the model). Mirrors the evaluator's void metric at render scale.
from PIL import Image
from collections import deque
BG = (0x15, 0x1b, 0x20)
SRC = '/Users/kevinliu/claude-of-tanks/shots/critic-m1a1'
VIEWS = ['view-front', 'view-frontleft', 'view-left', 'view-rearleft', 'view-rear',
         'view-rearright', 'view-right', 'view-frontright', 'view-top',
         'hero-frontleft', 'hero-rearright', 'hero-toptilt', 'close-front', 'close-roof']

def isbg(p):
    return max(abs(p[0] - BG[0]), abs(p[1] - BG[1]), abs(p[2] - BG[2])) <= 13

for view in VIEWS:
    im = Image.open(f'{SRC}/{view}.png').convert('RGB').crop((640, 0, 1280, 640))
    W, H = im.size
    px = im.load()
    bg = [[isbg(px[x, y]) for x in range(W)] for y in range(H)]
    seen = [[False] * W for _ in range(H)]
    q = deque()
    for x in range(W):
        for y in (0, H - 1):
            if bg[y][x] and not seen[y][x]:
                seen[y][x] = True; q.append((x, y))
    for y in range(H):
        for x in (0, W - 1):
            if bg[y][x] and not seen[y][x]:
                seen[y][x] = True; q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and bg[ny][nx] and not seen[ny][nx]:
                seen[ny][nx] = True; q.append((nx, ny))
    # enclosed = bg not seen; cluster them
    clusters = []
    vis = [[False] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            if bg[y][x] and not seen[y][x] and not vis[y][x]:
                cq = deque([(x, y)]); vis[y][x] = True
                cells = []
                while cq:
                    cx, cy = cq.popleft(); cells.append((cx, cy))
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < W and 0 <= ny < H and bg[ny][nx] and not seen[ny][nx] and not vis[ny][nx]:
                            vis[ny][nx] = True; cq.append((nx, ny))
                xs = [c[0] for c in cells]; ys = [c[1] for c in cells]
                clusters.append((len(cells), min(xs) + 640, min(ys), max(xs) + 640, max(ys)))
    clusters.sort(reverse=True)
    big = [c for c in clusters if c[0] >= 4]
    print(f'{view}: enclosed-bg clusters>=4px: {len(big)} ' +
          ' '.join(f'[{n}px bbox({a},{b})-({c},{d})]' for n, a, b, c, d in big[:6]))
