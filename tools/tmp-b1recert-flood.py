# TEMP (abrams §B1 re-cert critic): §B2 flood check with the BLUE-SIGNATURE
# term (BUILD-STANDARD §D). Sky pixel = maxch |px - 0x151b20| <= 13 AND
# (B - R) >= 8. Flood-fill sky from image borders; any sky pixel NOT reachable
# from the border (enclosed) inside the PROC half is a §B2 hole. Scans the
# PROC half of view-top and hero-toptilt for each tank.
import sys
from collections import deque
from PIL import Image

BG = (0x15, 0x1B, 0x20)

def flood(img):
    w, h = img.size
    px = img.load()
    def is_sky(x, y):
        r, g, b = px[x, y][:3]
        return max(abs(r-BG[0]), abs(g-BG[1]), abs(b-BG[2])) <= 13 and (b - r) >= 8
    seen = [[False]*w for _ in range(h)]
    dq = deque()
    for x in range(w):
        for y in (0, h-1):
            if is_sky(x, y) and not seen[y][x]:
                seen[y][x] = True; dq.append((x, y))
    for y in range(h):
        for x in (0, w-1):
            if is_sky(x, y) and not seen[y][x]:
                seen[y][x] = True; dq.append((x, y))
    while dq:
        x, y = dq.popleft()
        for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
            nx, ny = x+dx, y+dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and is_sky(nx, ny):
                seen[ny][nx] = True; dq.append((nx, ny))
    holes = []
    for y in range(h):
        for x in range(w):
            if not seen[y][x] and is_sky(x, y):
                holes.append((x, y))
    return holes

for tank in ('m1a2', 'm1a1', 'm1a1ha', 'm1a2_tejas'):
    for view in ('view-top', 'hero-toptilt', 'view-front'):
        img = Image.open(f'/Users/kevinliu/claude-of-tanks/shots/critic-{tank}/{view}.png').convert('RGB')
        w, h = img.size
        proc = img.crop((w//2, 0, w, h))
        holes = flood(proc)
        summ = f'{len(holes)} enclosed sky px'
        if holes:
            xs = [p[0] for p in holes]; ys = [p[1] for p in holes]
            summ += f' bbox ({min(xs)},{min(ys)})-({max(xs)},{max(ys)})'
        print(f'{tank:12s} {view:14s} {summ}')
