# TEMP (abrams density re-cert critic, 2026-08-06): pair-PNG diff decomposition.
# Splits critic pair PNGs into REF|PROC halves, diffs fresh renders against
# (a) builder's b32 evidence (determinism) and (b) my cheekgun-recert baseline
# (change locality -> diff-derived changed-view contract, §J law).
# Label band y<=30 excluded (PAIR-PNG LABEL BAND law). Threshold recorded per
# §D addendum. Usage: python3 tools/tmp-densityrecert-diff.py
import os
import sys
from PIL import Image, ImageChops

ROOT = '/Users/kevinliu/claude-of-tanks/shots'
IDS = ['m1a1', 'm1a1ha', 'm1a2', 'm1a2_tejas', 'm1a2_sepv2']
VIEWS = ['view-front', 'view-frontleft', 'view-left', 'view-rearleft', 'view-rear',
         'view-rearright', 'view-right', 'view-frontright', 'view-top',
         'hero-frontleft', 'hero-rearright', 'hero-toptilt', 'close-front', 'close-roof']
SIZE = 640
BAND = 30  # label band exclusion (y 13-21 letters + margin)


def halves(path):
    im = Image.open(path).convert('RGB')
    ref = im.crop((0, 0, SIZE, SIZE))
    proc = im.crop((SIZE, 0, SIZE * 2, SIZE))
    return ref, proc


def diff_px(a, b, t):
    d = ImageChops.difference(a, b)
    px = d.load()
    w, h = d.size
    n = 0
    minx, miny, maxx, maxy = w, h, -1, -1
    for y in range(BAND, h):
        for x in range(w):
            r, g, bl = px[x, y]
            if max(r, g, bl) > t:
                n += 1
                if x < minx: minx = x
                if y < miny: miny = y
                if x > maxx: maxx = x
                if y > maxy: maxy = y
    bbox = (minx, miny, maxx, maxy) if n else None
    return n, bbox


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'both'
    if mode in ('both', 'determinism'):
        print('== DETERMINISM: fresh densityrecert vs builder critic-<id>-b32 (t>2, both halves) ==')
        for tid in IDS:
            worst = []
            for v in VIEWS:
                mine = f'{ROOT}/critic-{tid}-densityrecert/{v}.png'
                theirs = f'{ROOT}/critic-{tid}-b32/{v}.png'
                if not (os.path.exists(mine) and os.path.exists(theirs)):
                    worst.append((v, 'MISSING', 'MISSING'))
                    continue
                r1, p1 = halves(mine)
                r2, p2 = halves(theirs)
                nr, _ = diff_px(r1, r2, 2)
                np_, _ = diff_px(p1, p2, 2)
                if nr or np_:
                    worst.append((v, nr, np_))
            tag = 'ALL 14 IDENTICAL' if not worst else f'DIFFS {worst}'
            print(f'  {tid}: {tag}')
    if mode in ('both', 'locality'):
        print('== CHANGE LOCALITY: fresh densityrecert vs my cheekgun baseline (t>4, halves split) ==')
        area = (SIZE * (SIZE - BAND))
        for tid in IDS:
            print(f'  -- {tid}')
            rows = []
            for v in VIEWS:
                mine = f'{ROOT}/critic-{tid}-densityrecert/{v}.png'
                base = f'{ROOT}/critic-{tid}-cheekgun/{v}.png'
                if not (os.path.exists(mine) and os.path.exists(base)):
                    print(f'    {v}: MISSING baseline')
                    continue
                r1, p1 = halves(mine)
                r2, p2 = halves(base)
                nr, rb = diff_px(r1, r2, 4)
                np_, pb = diff_px(p1, p2, 4)
                rows.append((np_, v, nr, pb))
            rows.sort(reverse=True)
            for np_, v, nr, pb in rows:
                pct = 100.0 * np_ / area
                print(f'    {v:16s} REF {nr:5d}  PROC {np_:6d} ({pct:.3f}%)  bbox {pb}')


if __name__ == '__main__':
    main()
