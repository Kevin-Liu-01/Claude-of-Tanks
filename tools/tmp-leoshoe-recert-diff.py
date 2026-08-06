# TEMP (leopard shoe-round four-graduate re-cert critic, 2026-08-06).
# Per-view pixel diffs candidate-vs-baseline pair PNGs, split at the frame
# midline (REF half x<W/2, PROC half x>=W/2), threshold recorded per §D
# addendum (t>4 default). Plus enclosed-sky flood per view (bg maxch<=13
# AND B-R>=+8, border flood removed, label band y13-21 excluded) on BOTH
# baseline and candidate for the §B2 flood-delta method.
import sys, os, json
from PIL import Image

BG = (0x15, 0x1B, 0x20)
T = 4  # diff threshold (recorded)

def load(p):
    return Image.open(p).convert('RGB')

def diff_stats(a, b, t=T):
    W, H = a.size
    assert a.size == b.size, f'size mismatch {a.size} vs {b.size}'
    pa, pb = a.load(), b.load()
    halves = {}
    for half, x0, x1 in (('ref', 0, W // 2), ('proc', W // 2, W)):
        n = 0
        bx0, by0, bx1, by1 = W, H, -1, -1
        for y in range(H):
            for x in range(x0, x1):
                ra, ga, ba = pa[x, y]
                rb, gb, bb = pb[x, y]
                if max(abs(ra - rb), abs(ga - gb), abs(ba - bb)) > t:
                    n += 1
                    if x < bx0: bx0 = x
                    if x > bx1: bx1 = x
                    if y < by0: by0 = y
                    if y > by1: by1 = y
        halves[half] = {'px': n, 'bbox': None if n == 0 else [bx0, by0, bx1, by1]}
    return halves

def is_sky(px):
    r, g, b = px
    if max(abs(r - BG[0]), abs(g - BG[1]), abs(b - BG[2])) > 13:
        return False
    return (b - r) >= 8 or (abs(r - BG[0]) <= 13 and abs(g - BG[1]) <= 13 and abs(b - BG[2]) <= 13 and (b - r) >= 8)

def sky_mask(im):
    # strict per banked method: maxch<=13 AND B-R>=+8
    W, H = im.size
    p = im.load()
    m = [[False] * W for _ in range(H)]
    for y in range(H):
        if 13 <= y <= 21:  # label band excluded
            continue
        for x in range(W):
            r, g, b = p[x, y]
            if max(abs(r - BG[0]), abs(g - BG[1]), abs(b - BG[2])) <= 13 and (b - r) >= 8:
                m[y][x] = True
    return m

def enclosed_sky(im, x0, x1):
    # flood from borders within [x0,x1); enclosed = sky px not reached
    W, H = im.size
    m = sky_mask(im)
    seen = [[False] * W for _ in range(H)]
    stack = []
    for y in range(H):
        for x in (x0, x1 - 1):
            if m[y][x] and not seen[y][x]:
                stack.append((x, y))
    for x in range(x0, x1):
        for y in (0, H - 1):
            if m[y][x] and not seen[y][x]:
                stack.append((x, y))
    while stack:
        x, y = stack.pop()
        if x < x0 or x >= x1 or y < 0 or y >= H or seen[y][x] or not m[y][x]:
            continue
        seen[y][x] = True
        stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    n = 0
    for y in range(H):
        for x in range(x0, x1):
            if m[y][x] and not seen[y][x]:
                n += 1
    return n

VIEWS = ['view-front', 'view-frontleft', 'view-left', 'view-rearleft', 'view-rear',
         'view-rearright', 'view-right', 'view-frontright', 'view-top',
         'hero-frontleft', 'hero-rearright', 'hero-toptilt', 'close-front', 'close-roof']

def main():
    base_dir, cand_dir, tank = sys.argv[1], sys.argv[2], sys.argv[3]
    out = {'tank': tank, 'threshold': T, 'views': {}}
    for v in VIEWS:
        bp, cp = os.path.join(base_dir, f'{v}.png'), os.path.join(cand_dir, f'{v}.png')
        if not (os.path.exists(bp) and os.path.exists(cp)):
            out['views'][v] = {'missing': True}
            continue
        a, b = load(bp), load(cp)
        d = diff_stats(a, b)
        W = a.size[0]
        fb = enclosed_sky(a, W // 2, W)
        fc = enclosed_sky(b, W // 2, W)
        out['views'][v] = {'diff': d, 'floodProc': {'base': fb, 'cand': fc, 'delta': fc - fb}}
        print(f"{tank} {v}: ref {d['ref']['px']:6d} proc {d['proc']['px']:6d} bboxP {d['proc']['bbox']} flood {fb}->{fc} (d{fc-fb})", flush=True)
    with open(sys.argv[4], 'w') as f:
        json.dump(out, f, indent=1)

if __name__ == '__main__':
    main()
