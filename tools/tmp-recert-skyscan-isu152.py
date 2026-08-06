# TEMP recert critic (isu152 contain1): mask-method enclosed-background scan
# (§D sky/air claims: bg |px-0x151b20| maxch <= 13) on the PROC pane
# (x 640..1280) of each fresh critic view, PLUS color-class dumps of named
# suspect rects (the r6 law: color-class/raycast before crying void).
# Flood-fills bg-class px from the pane border; any bg-class px NOT reached
# is "enclosed". Reports counts, cluster boxes, and per-rect pixel stats.
# Usage: python3 tools/tmp-recert-skyscan-isu152.py
import sys
from collections import deque
from PIL import Image

BG = (0x15, 0x1b, 0x20)
THR = 13
NEW = 'shots/critic-isu152'
VIEWS = ['view-front', 'view-frontleft', 'view-left', 'view-rearleft', 'view-rear',
         'view-rearright', 'view-right', 'view-frontright', 'view-top',
         'hero-frontleft', 'hero-rearright', 'hero-toptilt', 'close-front', 'close-roof']

def bg_class(p):
    return abs(p[0] - BG[0]) <= THR and abs(p[1] - BG[1]) <= THR and abs(p[2] - BG[2]) <= THR

def scan(view):
    im = Image.open(f'{NEW}/{view}.png').convert('RGB')
    W, H = im.size
    x0 = W // 2  # proc pane
    px = im.load()
    mask = [[False] * H for _ in range(W)]  # bg-class
    for x in range(x0, W):
        for y in range(H):
            if bg_class(px[x, y]):
                mask[x][y] = True
    seen = [[False] * H for _ in range(W)]
    dq = deque()
    for x in range(x0, W):
        for y in (0, H - 1):
            if mask[x][y] and not seen[x][y]:
                seen[x][y] = True; dq.append((x, y))
    for y in range(H):
        for x in (x0, W - 1):
            if mask[x][y] and not seen[x][y]:
                seen[x][y] = True; dq.append((x, y))
    while dq:
        x, y = dq.popleft()
        for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
            if x0 <= nx < W and 0 <= ny < H and mask[nx][ny] and not seen[nx][ny]:
                seen[nx][ny] = True; dq.append((nx, ny))
    enc = [(x, y) for x in range(x0, W) for y in range(H) if mask[x][y] and not seen[x][y]]
    # cluster into boxes (greedy union by proximity 3px)
    boxes = []
    for (x, y) in enc:
        for b in boxes:
            if b[0]-3 <= x <= b[2]+3 and b[1]-3 <= y <= b[3]+3:
                b[0] = min(b[0], x); b[1] = min(b[1], y)
                b[2] = max(b[2], x); b[3] = max(b[3], y); b[4] += 1
                break
        else:
            boxes.append([x, y, x, y, 1])
    boxes.sort(key=lambda b: -b[4])
    print(f'{view}: enclosed-bg {len(enc)}px, clusters {len(boxes)}')
    for b in boxes[:8]:
        print(f'   box x{b[0]}-{b[2]} y{b[1]}-{b[3]} n={b[4]}')

def rect_stats(view, rect, tag):
    im = Image.open(f'{NEW}/{view}.png').convert('RGB')
    px = im.load()
    n = bgn = 0
    lum = []
    warm = 0
    for x in range(rect[0], rect[2]):
        for y in range(rect[1], rect[3]):
            p = px[x, y]
            n += 1
            if bg_class(p): bgn += 1
            if p[0] >= p[2]: warm += 1
            lum.append(0.299*p[0] + 0.587*p[1] + 0.114*p[2])
    lum.sort()
    q = lambda f: lum[int(f * (len(lum) - 1))]
    print(f'{view} {tag} rect={rect}: {n}px bg-class {bgn} ({100.0*bgn/n:.1f}%) warm(R>=B) {100.0*warm/n:.1f}% luma p05/p50/p95 {q(.05):.1f}/{q(.5):.1f}/{q(.95):.1f}')

if len(sys.argv) > 1 and sys.argv[1] == 'rects':
    # suspect rects in FULL-FRAME coords (proc pane)
    rect_stats('view-rear', (1085, 354, 1130, 370), 'new-wedge-L-lane')
    rect_stats('view-rear', (788, 354, 830, 370), 'new-wedge-R-lane')
    rect_stats('view-rear', (730, 485, 880, 510), 'under-flap-shoes-R')
    rect_stats('view-front', (815, 390, 842, 460), 'front-lane-L-interior')
    rect_stats('view-front', (1040, 390, 1067, 460), 'front-lane-R-interior')
    rect_stats('close-front', (880, 380, 1000, 420), 'bow-shadow-pocket')
else:
    for v in VIEWS:
        scan(v)
