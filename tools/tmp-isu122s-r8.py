#!/usr/bin/env python3
"""TEMP (isu122s r8): ITU-601 ON-ELEMENT rect stats + Gex + bright-bbox aspect.
Modes:
  rect  <png> x0,y0,x1,y1 label [...]     -> n, rgb, L601, p25/50/75, spread, dark%, warm%, Gex
  strip <png> x0,y0,x1,y1,axis label      -> per-column (axis=x) or per-row (axis=y) L601 means
  aspect <png> x0,y0,x1,y1 loBright label -> bbox of pixels with L601 >= loBright inside the search rect
Background pixels (~#151a22 harness field) always excluded.
Gex = mean(G - (R+B)/2) over element pixels (the r8 green-excess class measure).
"""
import sys
from PIL import Image

def stats(px, x0, y0, x1, y1):
    Ls, rs, gs, bs, warm, gex = [], 0, 0, 0, 0, 0.0
    for yy in range(y0, y1):
        for xx in range(x0, x1):
            R, G, B = px[xx, yy]
            if abs(R - 21) < 11 and abs(G - 27) < 11 and abs(B - 32) < 11:
                continue
            L = 0.299 * R + 0.587 * G + 0.114 * B
            Ls.append(L); rs += R; gs += G; bs += B
            gex += G - (R + B) / 2
            if R > G + 4:
                warm += 1
    return Ls, rs, gs, bs, warm, gex

def main():
    mode = sys.argv[1]
    src = sys.argv[2]
    im = Image.open(src).convert('RGB')
    px = im.load()
    args = sys.argv[3:]
    if mode == 'rect':
        for i in range(0, len(args), 2):
            x0, y0, x1, y1 = (int(v) for v in args[i].split(','))
            label = args[i + 1]
            Ls, rs, gs, bs, warm, gex = stats(px, x0, y0, x1, y1)
            if not Ls:
                print(f'{label}: EMPTY'); continue
            Ls.sort(); n = len(Ls)
            p = lambda q: Ls[min(n - 1, int(q * n))]
            mean = sum(Ls) / n
            dark = sum(1 for v in Ls if v < mean - 18)
            print(f'{label} [{x0},{y0}-{x1},{y1}]: n={n} rgb=({rs/n:.1f},{gs/n:.1f},{bs/n:.1f}) '
                  f'L601={mean:.1f} p25/50/75={p(.25):.1f}/{p(.5):.1f}/{p(.75):.1f} '
                  f'spread={p(.75)-p(.25):.1f} dark%={100*dark/n:.1f} warm%={100*warm/n:.1f} Gex={gex/n:.1f}')
    elif mode == 'strip':
        for i in range(0, len(args), 2):
            parts = args[i].split(',')
            x0, y0, x1, y1 = (int(v) for v in parts[:4])
            axis = parts[4]
            label = args[i + 1]
            out = []
            rng = range(x0, x1) if axis == 'x' else range(y0, y1)
            for k in rng:
                if axis == 'x':
                    Ls, *_ = stats(px, k, y0, k + 1, y1)
                else:
                    Ls, *_ = stats(px, x0, k, x1, k + 1)
                out.append(f'{sum(Ls)/len(Ls):.0f}' if Ls else '--')
            print(f'{label} [{x0},{y0}-{x1},{y1} axis={axis}]: ' + ' '.join(out))
    elif mode == 'aspect':
        for i in range(0, len(args), 2):
            parts = args[i].split(',')
            x0, y0, x1, y1, lo = (int(v) for v in parts[:5])
            label = args[i + 1]
            bx0, by0, bx1, by1, n = 10**9, 10**9, -1, -1, 0
            for yy in range(y0, y1):
                for xx in range(x0, x1):
                    R, G, B = px[xx, yy]
                    if abs(R - 21) < 11 and abs(G - 27) < 11 and abs(B - 32) < 11:
                        continue
                    L = 0.299 * R + 0.587 * G + 0.114 * B
                    if L >= lo:
                        n += 1
                        bx0 = min(bx0, xx); by0 = min(by0, yy)
                        bx1 = max(bx1, xx); by1 = max(by1, yy)
            if n == 0:
                print(f'{label}: no pixels >= {lo}'); continue
            w, h = bx1 - bx0 + 1, by1 - by0 + 1
            print(f'{label} [search {x0},{y0}-{x1},{y1} L>={lo}]: bbox=({bx0},{by0})-({bx1},{by1}) '
                  f'w={w} h={h} aspect={h/w:.3f} n={n}')

main()

# appended r8b: ellipse-bounded bright-disc aspect (mode was added after main()
# ran; invoked via 'discaspect' by re-exec)
