#!/usr/bin/env python3
# TEMP (merkava 3d/1b r7): ITU-601 pair-half scanners — the critic's mask
# method (BANK LAW r7: numbers must be re-run on the committed build).
# Halves: ref = x 0..639, proc = x 640..1279 (pass half name).
# Modes:
#   bbox  <pair> <half>                          lit bounding box of the half
#   rect  <pair> <half> x0 x1 y0 y1              L601 stats of non-bg pixels
#   cells <pair> <half> x0 x1 y0 y1 [--cell=20]  per-cell mean map, max cell
#   dark  <pair> <half> x0 x1 y0 y1 <thr>        sub-thr census + p5 patches
#   cols  <pair> <half> x0 x1 [ymin ymax] [--step=1]  first-content per column
#   runs  <pair> <half> x0 x1 [ymin ymax] [--minrun=20]  constant-y edge runs
#   rod   <pair> <half> x0 x1 ymin ymax          topmost content per col + med
#                                                 luma of that block (rod table)
import sys
from PIL import Image

BG = (0x15, 0x1B, 0x20)


def is_bg(p):
    return abs(p[0] - BG[0]) < 12 and abs(p[1] - BG[1]) < 12 and abs(p[2] - BG[2]) < 12


def lum(p):
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]


def main():
    mode, path, half = sys.argv[1], sys.argv[2], sys.argv[3]
    xoff = 0 if half == 'ref' else 640
    im = Image.open(path).convert('RGB')
    px = im.load()
    args = [a for a in sys.argv[4:] if not a.startswith('--')]
    opts = {}
    for a in sys.argv[4:]:
        if a.startswith('--'):
            k, _, v = a[2:].partition('=')
            opts[k] = int(v) if v else 1

    if mode == 'rectbg':
        # rect stats INCLUDING background pixels (the critic's void-class
        # rects count see-through air) + air percentage
        x0, x1, y0, y1 = (int(v) for v in args[:4])
        vals = []
        nbg = 0
        for x in range(x0, x1):
            for y in range(y0, y1):
                p = px[xoff + x, y][:3]
                if is_bg(p):
                    nbg += 1
                vals.append(lum(p))
        vals.sort()
        n = len(vals)
        q = lambda f: vals[min(n - 1, int(n * f))]
        print(f'{half} rectbg [{x0}..{x1}]x[{y0}..{y1}] n={n} air {100*nbg/n:.1f}%: '
              f'p5 {q(0.05):.1f} p25 {q(0.25):.1f} med {q(0.5):.1f} p75 {q(0.75):.1f} p95 {q(0.95):.1f}')

    elif mode == 'bbox':
        x0m = y0m = 10 ** 9
        x1m = y1m = -1
        for x in range(640):
            for y in range(0, 640):
                if not is_bg(px[xoff + x, y][:3]):
                    if y < 30 and x < 200:
                        continue  # skip the pair label text
                    x0m = min(x0m, x); x1m = max(x1m, x)
                    y0m = min(y0m, y); y1m = max(y1m, y)
        print(f'{half} lit bbox: x {x0m}..{x1m} (w {x1m-x0m+1})  y {y0m}..{y1m} (h {y1m-y0m+1})')

    elif mode == 'rect':
        x0, x1, y0, y1 = (int(v) for v in args[:4])
        vals = []
        for x in range(x0, x1):
            for y in range(y0, y1):
                p = px[xoff + x, y][:3]
                if not is_bg(p):
                    vals.append(lum(p))
        if not vals:
            print(f'{half} rect [{x0}..{x1}]x[{y0}..{y1}]: all bg')
            return
        vals.sort()
        n = len(vals)
        q = lambda f: vals[min(n - 1, int(n * f))]
        mean = sum(vals) / n
        sd = (sum((v - mean) ** 2 for v in vals) / n) ** 0.5
        print(f'{half} rect [{x0}..{x1}]x[{y0}..{y1}] n={n} ({100*n/max(1,(x1-x0)*(y1-y0)):.0f}% lit): '
              f'p5 {q(0.05):.1f} p25 {q(0.25):.1f} med {q(0.5):.1f} p75 {q(0.75):.1f} p95 {q(0.95):.1f} '
              f'mean {mean:.1f} sd {sd:.2f}')

    elif mode == 'rowsd':
        # per-row median + SD-of-row-medians (texture richness metric)
        x0, x1, y0, y1 = (int(v) for v in args[:4])
        meds = []
        for y in range(y0, y1):
            vals = [lum(px[xoff + x, y][:3]) for x in range(x0, x1) if not is_bg(px[xoff + x, y][:3])]
            if len(vals) < 8:
                continue
            vals.sort()
            meds.append(vals[len(vals) // 2])
        if not meds:
            print('no rows')
            return
        m = sum(meds) / len(meds)
        sd = (sum((v - m) ** 2 for v in meds) / len(meds)) ** 0.5
        meds.sort()
        print(f'{half} rowsd [{x0}..{x1}]x[{y0}..{y1}]: rows {len(meds)} med-of-meds '
              f'{meds[len(meds)//2]:.1f} mean {m:.1f} row-SD {sd:.2f}')

    elif mode == 'cells':
        x0, x1, y0, y1 = (int(v) for v in args[:4])
        cs = opts.get('cell', 20)
        best = None
        rows = []
        for cy in range(y0, y1, cs):
            row = ''
            for cx in range(x0, x1, cs):
                vals = []
                for x in range(cx, min(cx + cs, x1)):
                    for y in range(cy, min(cy + cs, y1)):
                        p = px[xoff + x, y][:3]
                        if not is_bg(p):
                            vals.append(lum(p))
                if len(vals) < cs * cs * 0.5:
                    row += '  . '
                    continue
                m = sum(vals) / len(vals)
                if best is None or m > best[0]:
                    best = (m, cx, cy)
                row += f'{m:4.0f}'
            rows.append(f'y{cy:3d} {row}')
        print('\n'.join(rows))
        if best:
            print(f'{half} brightest {cs}x{cs} cell: {best[0]:.1f} @ ({best[1]},{best[2]})')

    elif mode == 'dark':
        x0, x1, y0, y1, thr = (int(v) for v in args[:5])
        cnt = 0
        cells = []
        cs = 16
        for cy in range(y0, y1, cs):
            for cx in range(x0, x1, cs):
                vals = []
                sub = 0
                for x in range(cx, min(cx + cs, x1)):
                    for y in range(cy, min(cy + cs, y1)):
                        p = px[xoff + x, y][:3]
                        if is_bg(p):
                            continue
                        L = lum(p)
                        vals.append(L)
                        if L < thr:
                            sub += 1
                cnt += sub
                if len(vals) >= 40:
                    vals.sort()
                    p5 = vals[len(vals) // 20]
                    if p5 < thr + 8:
                        cells.append((cx, cy, round(p5, 1), sub))
        print(f'{half} dark census [{x0}..{x1}]x[{y0}..{y1}] thr {thr}: {cnt} sub-{thr}px')
        for c in cells[:30]:
            print(f'  cell ({c[0]},{c[1]}) p5 {c[2]} sub {c[3]}')

    elif mode == 'cols':
        x0, x1 = int(args[0]), int(args[1])
        ymin = int(args[2]) if len(args) > 2 else 34
        ymax = int(args[3]) if len(args) > 3 else 640
        step = opts.get('step', 1)
        for x in range(x0, x1, step):
            y = ymin
            while y < ymax and is_bg(px[xoff + x, y][:3]):
                y += 1
            if y >= ymax:
                print(f'x {x:3d}: empty')
                continue
            y0b = y
            lums = []
            while y < ymax and not is_bg(px[xoff + x, y][:3]):
                lums.append(lum(px[xoff + x, y][:3]))
                y += 1
            blk = y - y0b
            g = 0
            while y < ymax and is_bg(px[xoff + x, y][:3]):
                g += 1
                y += 1
            lums.sort()
            print(f'x {x:3d}: top {y0b:3d} h {blk:3d} lum {lums[len(lums)//2]:5.1f} gap {g:3d} next {(y if y < ymax else -1):3d}')

    elif mode == 'runs':
        x0, x1 = int(args[0]), int(args[1])
        ymin = int(args[2]) if len(args) > 2 else 34
        ymax = int(args[3]) if len(args) > 3 else 640
        minrun = opts.get('minrun', 20)
        tops = {}
        for x in range(x0, x1):
            y = ymin
            while y < ymax and is_bg(px[xoff + x, y][:3]):
                y += 1
            if y < ymax:
                tops[x] = y
        runs = []
        xs = sorted(tops)
        i = 0
        while i < len(xs):
            j = i
            while j + 1 < len(xs) and xs[j + 1] == xs[j] + 1 and tops[xs[j + 1]] == tops[xs[i]]:
                j += 1
            w = xs[j] - xs[i] + 1
            if w >= minrun:
                runs.append((xs[i], xs[j], w, tops[xs[i]]))
            i = j + 1
        print(f'{half} constant-y edge runs >= {minrun}px in [{x0}..{x1}] y[{ymin}..{ymax}]:')
        for r in sorted(runs, key=lambda r: -r[2]):
            print(f'  x {r[0]:3d}..{r[1]:3d} w={r[2]:3d}px  y={r[3]}')
        if not runs:
            print('  none')

    elif mode == 'runs2':
        # critic-style: a run continues until the edge BREAKS >= brk px from
        # the run's anchor y (sub-brk wobble does not end a run)
        x0, x1 = int(args[0]), int(args[1])
        ymin = int(args[2]) if len(args) > 2 else 34
        ymax = int(args[3]) if len(args) > 3 else 640
        minrun = opts.get('minrun', 20)
        brk = opts.get('brk', 2)
        tops = {}
        for x in range(x0, x1):
            y = ymin
            while y < ymax and is_bg(px[xoff + x, y][:3]):
                y += 1
            if y < ymax:
                tops[x] = y
        xs = sorted(tops)
        runs = []
        i = 0
        while i < len(xs):
            j = i
            anchor = tops[xs[i]]
            while (j + 1 < len(xs) and xs[j + 1] == xs[j] + 1
                   and abs(tops[xs[j + 1]] - anchor) < brk):
                j += 1
            w = xs[j] - xs[i] + 1
            if w >= minrun:
                runs.append((xs[i], xs[j], w, anchor))
            i = j + 1
        print(f'{half} edge runs (brk>={brk}px) >= {minrun}px in [{x0}..{x1}] y[{ymin}..{ymax}]:')
        for r in sorted(runs, key=lambda r: -r[2]):
            print(f'  x {r[0]:3d}..{r[1]:3d} w={r[2]:3d}px  y~{r[3]}')
        if not runs:
            print('  none')

    elif mode == 'rod':
        x0, x1, ymin, ymax = (int(v) for v in args[:4])
        entries = []
        for x in range(x0, x1):
            y = ymin
            while y < ymax and is_bg(px[xoff + x, y][:3]):
                y += 1
            if y >= ymax:
                continue
            y0b = y
            lums = []
            while y < ymax and not is_bg(px[xoff + x, y][:3]):
                lums.append(lum(px[xoff + x, y][:3]))
                y += 1
            lums.sort()
            entries.append((x, y0b, len(lums), lums[len(lums) // 2]))
        if not entries:
            print('empty')
            return
        meds = sorted(e[3] for e in entries)
        tops = sorted(e[1] for e in entries)
        print(f'{half} rod [{x0}..{x1}] y[{ymin}..{ymax}]: cols {len(entries)} '
              f'ytop-med {tops[len(tops)//2]} block-luma med {meds[len(meds)//2]:.1f} '
              f'p25 {meds[len(meds)//4]:.1f} p75 {meds[3*len(meds)//4]:.1f}')

    else:
        print('unknown mode', mode)


main()
