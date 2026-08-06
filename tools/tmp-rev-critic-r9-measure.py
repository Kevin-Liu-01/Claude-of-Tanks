# TEMP (leo2_revolution r9 independent critic): refined measurement rig on
# the fresh critic pairs at shots/critic-leo2_revolution/.
#  - pairs are 1280x640 (REF left half, PROC right half), bg 0x151b20
#  - REFINED MASK (BUILD-STANDARD §D, revolution-r7 law): sky pixel =
#    |px - (0x15,0x1b,0x20)| maxch <= 13  AND  (B - R) >= +8
#    (warm near-black track shadow passes the maxch window alone)
#  - border-flood (§B2): flood sky from the border of each half; report
#    enclosed sky (holes) with blob census
#  - ITU-601 luma rects for tone claims, with coordinates
#  - rowmean-sd: sd of per-row means inside a rect (relief/dressing read)
# Usage:
#   python3 tools/tmp-rev-critic-r9-measure.py flood <view> [<view>...]
#   python3 tools/tmp-rev-critic-r9-measure.py rect <view> <REF|PROC> <x0> <x1> <y0> <y1> [label]
#   python3 tools/tmp-rev-critic-r9-measure.py rowsd <view> <REF|PROC> <x0> <x1> <y0> <y1> [label]
import sys
from PIL import Image
import numpy as np

SHOTS = 'shots/critic-leo2_revolution'
BG = np.array([0x15, 0x1b, 0x20], dtype=np.int16)

def halves(name):
    im = np.asarray(Image.open(f'{SHOTS}/{name}.png').convert('RGB'), dtype=np.int16)
    h, w, _ = im.shape
    return im[:, :w // 2], im[:, w // 2:]

def skymask(img):
    near = (np.abs(img - BG).max(axis=2) <= 13)
    blue = (img[..., 2] - img[..., 0]) >= 8
    return near & blue

def flood_border(sky):
    from collections import deque
    h, w = sky.shape
    seen = np.zeros_like(sky, dtype=bool)
    dq = deque()
    for x in range(w):
        for y in (0, h - 1):
            if sky[y, x] and not seen[y, x]: seen[y, x] = True; dq.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if sky[y, x] and not seen[y, x]: seen[y, x] = True; dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and sky[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True; dq.append((ny, nx))
    return sky & ~seen

def hole_report(name):
    for side, img in zip(('REF', 'PROC'), halves(name)):
        holes = flood_border(skymask(img))
        n = int(holes.sum())
        out = f'{name} {side}: enclosed-sky px {n}'
        if n:
            ys, xs = np.nonzero(holes)
            out += f' bbox y{ys.min()}..{ys.max()} x{xs.min()}..{xs.max()}'
            from collections import deque
            lab = np.zeros_like(holes, dtype=np.int32)
            nxt = 0
            blobs = []
            for (yy, xx) in zip(ys, xs):
                if lab[yy, xx]: continue
                nxt += 1
                dq2 = deque([(yy, xx)]); lab[yy, xx] = nxt; c = 0
                y0b, y1b, x0b, x1b = yy, yy, xx, xx
                while dq2:
                    cy, cx = dq2.popleft(); c += 1
                    y0b, y1b = min(y0b, cy), max(y1b, cy)
                    x0b, x1b = min(x0b, cx), max(x1b, cx)
                    for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
                        ny2, nx2 = cy + dy, cx + dx
                        if 0 <= ny2 < holes.shape[0] and 0 <= nx2 < holes.shape[1] \
                           and holes[ny2, nx2] and not lab[ny2, nx2]:
                            lab[ny2, nx2] = nxt; dq2.append((ny2, nx2))
                blobs.append((c, y0b, y1b, x0b, x1b))
            blobs.sort(reverse=True)
            for c, y0b, y1b, x0b, x1b in blobs[:8]:
                out += f'\n    blob {c}px y{y0b}..{y1b} x{x0b}..{x1b}'
        print(out)

def luma(img):
    f = img.astype(np.float32)
    return 0.299 * f[..., 0] + 0.587 * f[..., 1] + 0.114 * f[..., 2]

def rect_stats(name, side, x0, x1, y0, y1, label=''):
    ref, proc = halves(name)
    img = ref if side == 'REF' else proc
    L = luma(img[y0:y1, x0:x1])
    m = skymask(img[y0:y1, x0:x1])
    body = L[~m]
    if body.size == 0:
        print(f'{name} {side} [{x0}:{x1}]x[{y0}:{y1}] {label}: ALL SKY'); return
    print(f'{name} {side} [{x0}:{x1}]x[{y0}:{y1}] {label}: med {np.median(body):.1f} '
          f'p5 {np.percentile(body, 5):.1f} p95 {np.percentile(body, 95):.1f} '
          f'sd {body.std():.2f} skypx {int(m.sum())}')

def rowsd_stats(name, side, x0, x1, y0, y1, label=''):
    ref, proc = halves(name)
    img = ref if side == 'REF' else proc
    L = luma(img[y0:y1, x0:x1])
    m = skymask(img[y0:y1, x0:x1])
    Lm = np.where(m, np.nan, L)
    rows = np.nanmean(Lm, axis=1)
    rows = rows[~np.isnan(rows)]
    if rows.size < 3:
        print(f'{name} {side} [{x0}:{x1}]x[{y0}:{y1}] {label}: too few rows'); return
    print(f'{name} {side} [{x0}:{x1}]x[{y0}:{y1}] {label}: rowmean-sd {rows.std():.2f} '
          f'med {np.nanmedian(Lm):.1f} rows {rows.size}')

if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'flood':
        for v in sys.argv[2:]:
            try: hole_report(v)
            except FileNotFoundError: print(f'{v}: MISSING')
    elif mode == 'rect':
        v, side = sys.argv[2], sys.argv[3]
        x0, x1, y0, y1 = map(int, sys.argv[4:8])
        rect_stats(v, side, x0, x1, y0, y1, ' '.join(sys.argv[8:]))
    elif mode == 'rowsd':
        v, side = sys.argv[2], sys.argv[3]
        x0, x1, y0, y1 = map(int, sys.argv[4:8])
        rowsd_stats(v, side, x0, x1, y0, y1, ' '.join(sys.argv[8:]))
