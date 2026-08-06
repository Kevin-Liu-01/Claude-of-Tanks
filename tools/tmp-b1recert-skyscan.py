#!/usr/bin/env python3
# b1recert TRUE see-through scan per BUILD-STANDARD §D:
# sky pixel = |px - 0x151b20| maxch <= TOL  AND  B - R >= +8 (blue signature).
# Flood from border across sky pixels; report ENCLOSED (non-border-connected)
# sky pixels per pane, with bounding rects of the biggest blobs.
# Usage: tmp-b1recert-skyscan.py <img.png> [tol]   (panes: ref x<640, proc x>=640)
import sys
from collections import deque
from PIL import Image

BG = (0x15, 0x1B, 0x20)
img = Image.open(sys.argv[1]).convert('RGB')
TOL = int(sys.argv[2]) if len(sys.argv) > 2 else 3
W, H = img.size
px = img.load()

def is_sky(x, y):
    r, g, b = px[x, y]
    if max(abs(r - BG[0]), abs(g - BG[1]), abs(b - BG[2])) > TOL:
        return False
    return (b - r) >= 8 or (r, g, b) == BG  # exact bg passes outright

sky = [[False] * H for _ in range(W)]
for x in range(W):
    for y in range(H):
        sky[x][y] = is_sky(x, y)

seen = [[False] * H for _ in range(W)]
dq = deque()
for x in range(W):
    for y in (0, H - 1):
        if sky[x][y] and not seen[x][y]:
            seen[x][y] = True
            dq.append((x, y))
for y in range(H):
    for x in (0, W - 1):
        if sky[x][y] and not seen[x][y]:
            seen[x][y] = True
            dq.append((x, y))
while dq:
    x, y = dq.popleft()
    for nx, ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
        if 0 <= nx < W and 0 <= ny < H and sky[nx][ny] and not seen[nx][ny]:
            seen[nx][ny] = True
            dq.append((nx, ny))

# enclosed = sky and not border-connected; blob-label per pane
blobs = {'ref': [], 'proc': []}
vis = [[False] * H for _ in range(W)]
for x in range(W):
    for y in range(H):
        if sky[x][y] and not seen[x][y] and not vis[x][y]:
            q = deque([(x, y)])
            vis[x][y] = True
            n = 0
            x0, y0, x1, y1 = x, y, x, y
            while q:
                cx, cy = q.popleft()
                n += 1
                x0, y0, x1, y1 = min(x0, cx), min(y0, cy), max(x1, cx), max(y1, cy)
                for nx, ny in ((cx-1,cy),(cx+1,cy),(cx,cy-1),(cx,cy+1)):
                    if 0 <= nx < W and 0 <= ny < H and sky[nx][ny] and not seen[nx][ny] and not vis[nx][ny]:
                        vis[nx][ny] = True
                        q.append((nx, ny))
            pane = 'ref' if x0 < W // 2 else 'proc'
            blobs[pane].append((n, (x0, y0, x1, y1)))

for pane in ('ref', 'proc'):
    bl = sorted(blobs[pane], reverse=True)
    tot = sum(b[0] for b in bl)
    print(f"{sys.argv[1].split('/')[-1]} [{pane}] enclosed-sky {tot}px in {len(bl)} blobs; top: " +
          '; '.join(f"{n}px@{r}" for n, r in bl[:4]))
