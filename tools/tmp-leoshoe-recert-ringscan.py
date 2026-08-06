# TEMP (leopard shoe re-cert, revolution ring hunt): list enclosed-sky
# blob locations in the PROC half of candidate renders (bg maxch<=13 AND
# B-R>=+8, border flood removed, label band excluded), so each residual
# can be adjudicated at the ring band vs elsewhere.
# Usage: python3 tools/tmp-leoshoe-recert-ringscan.py <dir> <view> [<view>...]
import sys
from PIL import Image

BG = (0x15, 0x1b, 0x20)

def enclosed(im, x0, x1):
    W, H = im.size
    p = im.load()
    m = [[False] * W for _ in range(H)]
    for y in range(H):
        if 13 <= y <= 21:
            continue
        for x in range(W):
            r, g, b = p[x, y]
            if max(abs(r - BG[0]), abs(g - BG[1]), abs(b - BG[2])) <= 13 and (b - r) >= 8:
                m[y][x] = True
    seen = [[False] * W for _ in range(H)]
    st = []
    for y in range(H):
        for x in (x0, x1 - 1):
            if m[y][x]:
                st.append((x, y))
    for x in range(x0, x1):
        for y in (0, H - 1):
            if m[y][x]:
                st.append((x, y))
    while st:
        x, y = st.pop()
        if x < x0 or x >= x1 or y < 0 or y >= H or seen[y][x] or not m[y][x]:
            continue
        seen[y][x] = True
        st.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    pts = [(x, y) for y in range(H) for x in range(x0, x1) if m[y][x] and not seen[y][x]]
    return pts

def blobs(pts):
    s = set(pts)
    seen = set()
    out = []
    for p in pts:
        if p in seen:
            continue
        stack = [p]
        seen.add(p)
        bl = []
        while stack:
            q = stack.pop()
            bl.append(q)
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    n = (q[0] + dx, q[1] + dy)
                    if n in s and n not in seen:
                        seen.add(n)
                        stack.append(n)
        out.append(bl)
    out.sort(key=len, reverse=True)
    return out

d = sys.argv[1]
for v in sys.argv[2:]:
    im = Image.open(f'{d}/{v}.png').convert('RGB')
    W = im.size[0]
    pts = enclosed(im, W // 2, W)
    print(f'{v}: enclosed {len(pts)}')
    for bl in blobs(pts)[:8]:
        if len(bl) < 3:
            break
        xs = [q[0] - W // 2 for q in bl]
        ys = [q[1] for q in bl]
        print(f'  blob {len(bl):4d}px procX {min(xs)}..{max(xs)} y {min(ys)}..{max(ys)}')
