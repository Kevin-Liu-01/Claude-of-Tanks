# TEMP (leo2_revolution r7 independent critic): measurement helpers on the
# fresh critic pairs at shots/critic-leo2_revolution/.
#  - pairs are 1280x640 (REF left half, PROC right half), bg 0x151b20
#  - MASK-METHOD sky claims: |px - (0x15,0x1b,0x20)| maxch <= 13
#  - border-flood (B2): flood the sky from the border of the PROC half in
#    the top + hero-toptilt views; report enclosed sky cells (holes)
#  - ITU-601 luma rects for tone claims, with coordinates
# Usage: python3 tools/tmp-rev-critic-measure.py [shotdir]
import sys, json
from PIL import Image
import numpy as np

SHOTS = sys.argv[1] if len(sys.argv) > 1 else 'shots/critic-leo2_revolution'
BG = np.array([0x15, 0x1b, 0x20], dtype=np.int16)

def halves(name):
    im = np.asarray(Image.open(f'{SHOTS}/{name}.png').convert('RGB'), dtype=np.int16)
    h, w, _ = im.shape
    return im[:, :w // 2], im[:, w // 2:]

def skymask(img):
    return (np.abs(img - BG).max(axis=2) <= 13)

def flood_border(sky):
    # BFS flood from every border sky pixel; return enclosed sky (holes)
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
    holes = sky & ~seen
    return holes

def hole_report(name):
    for side, img in zip(('REF', 'PROC'), halves(name)):
        sky = skymask(img)
        holes = flood_border(sky)
        n = int(holes.sum())
        out = f'{name} {side}: enclosed-sky px {n}'
        if n:
            ys, xs = np.nonzero(holes)
            out += f' bbox y{ys.min()}..{ys.max()} x{xs.min()}..{xs.max()}'
            # blob census (4-connected)
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

if __name__ == '__main__':
    for v in ('view-top', 'hero-toptilt', 'view-front', 'view-left', 'view-rear'):
        try:
            hole_report(v)
        except FileNotFoundError:
            print(f'{v}: MISSING')
