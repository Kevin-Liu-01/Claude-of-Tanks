# TEMP (abrams rear round 2026-08-06): §B2 FLOOD-DELTA on critic pair PNGs.
# Counts ENCLOSED sky-class pixels (mask-method bg maxch<=13 AND the
# blue-signature B-R>=+8, per BUILD-STANDARD §D) on the PROCEDURAL half,
# label band excluded (§J PAIR-PNG LABEL BAND). Enclosed = not reachable
# from the image border by 4-flood over sky-class pixels.
# Usage: python3 tools/tmp-abrams-rear-flood.py <before_dir> <after_dir> <view> [...views]
import sys
from PIL import Image
from collections import deque

BG = (0x15, 0x1B, 0x20)

def sky_mask(im):
    W, H = im.size
    px = im.load()
    m = [[False] * W for _ in range(H)]
    for y in range(H):
        if y < 30:                      # label band + margin
            continue
        for x in range(W // 2, W):      # PROC half
            r, g, b = px[x, y][:3]
            if (abs(r - BG[0]) <= 13 and abs(g - BG[1]) <= 13 and abs(b - BG[2]) <= 13
                    and (b - r) >= 8):
                m[y][x] = True
    return m

def enclosed(im):
    W, H = im.size
    m = sky_mask(im)
    seen = [[False] * W for _ in range(H)]
    dq = deque()
    for y in range(H):
        for x in (W // 2, W - 1):
            if m[y][x] and not seen[y][x]:
                seen[y][x] = True
                dq.append((x, y))
    for x in range(W // 2, W):
        for y in (30, H - 1):
            if 0 <= y < H and m[y][x] and not seen[y][x]:
                seen[y][x] = True
                dq.append((x, y))
    while dq:
        x, y = dq.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if W // 2 <= nx < W and 30 <= ny < H and m[ny][nx] and not seen[ny][nx]:
                seen[ny][nx] = True
                dq.append((nx, ny))
    tot = 0
    boxes = []
    for y in range(30, H):
        for x in range(W // 2, W):
            if m[y][x] and not seen[y][x]:
                tot += 1
                boxes.append((x, y))
    bb = None
    if boxes:
        xs = [p[0] for p in boxes]; ys = [p[1] for p in boxes]
        bb = (min(xs), min(ys), max(xs), max(ys))
    return tot, bb

before_dir, after_dir = sys.argv[1], sys.argv[2]
views = sys.argv[3:]
for v in views:
    b, bbb = enclosed(Image.open(f"{before_dir}/{v}.png").convert("RGB"))
    a, abb = enclosed(Image.open(f"{after_dir}/{v}.png").convert("RGB"))
    print(f"{v:18s} before={b:5d}px {bbb or ''}  after={a:5d}px {abb or ''}  delta={a-b:+d}")
