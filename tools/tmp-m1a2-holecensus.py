# TEMP (m1a2 r3): internal-background hole census on critic pair PNGs.
# For each pair (1280x640, left=REF right=PROC), classify pixels matching the
# critic clear color #151b20 (tol) as background, flood-fill external bg from
# the border, and report the remaining INTERNAL bg pixels (holes) + the
# bounding rects of the largest connected components.
# Usage: python3 tools/tmp-m1a2-holecensus.py shots/critic-m1a2 view-rear view-front ...
import sys, os
from collections import deque
from PIL import Image

BG = (0x15, 0x1B, 0x20)
TOL = 6          # per-channel discriminator
MIN_REPORT = 12  # only report components >= this many px

def census(img, x0, x1, label):
    w, h = img.size
    px = img.load()
    W = x1 - x0
    isbg = bytearray(W * h)
    for y in range(h):
        for x in range(W):
            r, g, b = px[x0 + x, y][:3]
            if abs(r - BG[0]) <= TOL and abs(g - BG[1]) <= TOL and abs(b - BG[2]) <= TOL:
                isbg[y * W + x] = 1
    # flood external bg from borders (4-conn)
    ext = bytearray(W * h)
    dq = deque()
    for x in range(W):
        for y in (0, h - 1):
            i = y * W + x
            if isbg[i] and not ext[i]:
                ext[i] = 1
                dq.append(i)
    for y in range(h):
        for x in (0, W - 1):
            i = y * W + x
            if isbg[i] and not ext[i]:
                ext[i] = 1
                dq.append(i)
    while dq:
        i = dq.popleft()
        y, x = divmod(i, W)
        for j in ((y - 1) * W + x if y > 0 else -1,
                  (y + 1) * W + x if y < h - 1 else -1,
                  i - 1 if x > 0 else -1,
                  i + 1 if x < W - 1 else -1):
            if j >= 0 and isbg[j] and not ext[j]:
                ext[j] = 1
                dq.append(j)
    # internal components
    seen = bytearray(W * h)
    comps = []
    total = 0
    for i0 in range(W * h):
        if isbg[i0] and not ext[i0] and not seen[i0]:
            n = 0
            minx = miny = 10 ** 9
            maxx = maxy = -1
            dq.append(i0)
            seen[i0] = 1
            while dq:
                i = dq.popleft()
                y, x = divmod(i, W)
                n += 1
                minx = min(minx, x); maxx = max(maxx, x)
                miny = min(miny, y); maxy = max(maxy, y)
                for j in ((y - 1) * W + x if y > 0 else -1,
                          (y + 1) * W + x if y < h - 1 else -1,
                          i - 1 if x > 0 else -1,
                          i + 1 if x < W - 1 else -1):
                    if j >= 0 and isbg[j] and not ext[j] and not seen[j]:
                        seen[j] = 1
                        dq.append(j)
            total += n
            comps.append((n, minx, miny, maxx, maxy))
    comps.sort(reverse=True)
    print(f"  {label}: internal-bg {total}px, {len(comps)} components")
    for n, minx, miny, maxx, maxy in comps[:10]:
        if n >= MIN_REPORT:
            print(f"    {n:6d}px  rect x{minx}-{maxx} y{miny}-{maxy} ({maxx-minx+1}x{maxy-miny+1})")
    return total

def main():
    d = sys.argv[1]
    views = sys.argv[2:] or ['view-rear', 'view-front']
    for v in views:
        p = os.path.join(d, v + '.png')
        img = Image.open(p).convert('RGB')
        w, hh = img.size
        print(f"{v} ({w}x{hh})")
        census(img, 0, w // 2, 'REF ')
        census(img, w // 2, w, 'PROC')

if __name__ == '__main__':
    main()
