#!/usr/bin/env python3
# tmp-ru-loftgen.py — generate loftHull breakpoint arrays from the measured
# reference curves (worldtrace dump + docs/references/profiles stations).
# Deck = rolling-median of side_hull tops (spike-robust), belly = side_hull
# bottoms where they leave the track line, widths from the stations table.
# Prints JS-ready arrays; the builder pastes and trims.
# Usage: python3 tools/tmp-ru-loftgen.py t62mv1
import json, sys, os

WT = '/private/tmp/claude-501/-Users-kevinliu/1f4a2c2a-8139-4172-b5ea-dd578fb917a3/scratchpad/worldtrace'

def med(v):
    v = sorted(v)
    return v[len(v) // 2]

def main(tid):
    if not tid or not all(c.isalnum() or c in '-_' for c in tid):
        raise ValueError(f'Invalid tank id: {tid!r}')
    d = json.load(open(os.path.join(WT, f'{tid}.json')))
    prof = json.load(open(f'docs/references/profiles/{tid}.json'))
    cols = []
    for p in d['side']['ref_hull']:
        if p: cols.append((p[0][2], p[0][1], p[1][1]))   # worldZ, top, bot
    cols.sort()
    zs = [c[0] for c in cols]
    tops = [c[1] for c in cols]
    bots = [c[2] for c in cols]
    # rolling median (window 5) of tops -> deck line
    deck = []
    for i in range(len(cols)):
        w = tops[max(0, i - 2):i + 3]
        deck.append(med(w))
    # downsample deck to breakpoints where slope changes materially
    bp = [(zs[0], deck[0])]
    for i in range(1, len(cols) - 1):
        a = (deck[i] - bp[-1][1])
        nxt = deck[i + 1] - deck[i]
        if abs(a) > 0.035 or (abs(nxt) > 0.05):
            bp.append((zs[i], deck[i]))
    bp.append((zs[-1], deck[-1]))
    # merge close breakpoints
    merged = [bp[0]]
    for z, y in bp[1:]:
        if z - merged[-1][0] < 0.25 and abs(y - merged[-1][1]) < 0.04: continue
        merged.append((z, y))
    print(f'// {tid} deck (ref side_hull tops, median-filtered):')
    print('deck: [' + ', '.join(f'[{z:.2f}, {y:.2f}]' for z, y in merged) + '],')
    # belly: bottoms above the track line (>0.16) = rakes; else hidden 0.30
    print('// belly rake points (ref bottoms where > 0.16):')
    rk = [(z, b) for z, b, in zip(zs, bots) if b > 0.16]
    print('//   ' + '  '.join(f'[{z:.2f},{b:.2f}]' for z, b in rk))
    # widths from stations
    st = prof.get('stations', [])
    print('// stations (z, w/2, roofY=y1):')
    for r in st:
        print(f"//   z {r['z']:+6.2f}  halfW {r['w']/2:.3f}  x0 {r['x0']:.2f} x1 {r['x1']:.2f}  y0 {r['y0']:.2f} y1 {r['y1']:.2f}")
    # bottom arcs: local minima of bots (wheel centers) — just print raw bottom line
    print('// bottom line (z, bot) every 2nd col:')
    row = [f'[{z:.2f},{b:.2f}]' for z, b in list(zip(zs, bots))[::2]]
    print('//   ' + '  '.join(row))

main(sys.argv[1])
