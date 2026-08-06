#!/usr/bin/env python3
# TEMP (merkava 3B/3C shaded-parity r8): measure the dead-rear CROWN profile
# the r7 critic's way — per-column top silhouette of the tank in the rear
# view, median-filtered to drop whip/mast spikes, then report:
#   - max EXACTLY-FLAT run (consecutive columns with identical ytop)
#   - reversal count (direction changes of the filtered profile)
#   - amplitude stats over the crown window
# Usage: python3 tools/tmp-crownprofile.py <pair.png> [x0 x1 ymin ymax] [--half=ref|proc|both]
# The window defaults to the turret band; both halves measured (ref x<640,
# proc x>=640, same window per half).
import sys
from PIL import Image

BG = (0x15, 0x1B, 0x20)


def is_bg(r, g, b):
    return abs(r - BG[0]) < 12 and abs(g - BG[1]) < 12 and abs(b - BG[2]) < 12


def profile(im, xoff, x0, x1, ymin, ymax):
    px = im.load()
    prof = {}
    for x in range(x0, x1):
        for y in range(ymin, ymax):
            if not is_bg(*px[xoff + x, y][:3]):
                prof[x] = y
                break
    return prof


def medfilt(vals, w=5):
    out = []
    h = w // 2
    for i in range(len(vals)):
        seg = vals[max(0, i - h):i + h + 1]
        out.append(sorted(seg)[len(seg) // 2])
    return out


def revs(f):
    rev = 0
    last = 0
    for i in range(1, len(f)):
        d = f[i] - f[i - 1]
        if d == 0:
            continue
        s = 1 if d > 0 else -1
        if last != 0 and s != last:
            rev += 1
        last = s
    return rev


def stats(prof, label):
    # CALIBRATION (r8, on the r7 baseline pairs, window 200..450/150..400):
    # RAW maxflat reproduces the critic exactly (ref 14/24, proc 42/39);
    # w3-filtered reversal count reads ref ~20/20 (critic target 20/17).
    xs = sorted(prof)
    if not xs:
        print(f'{label}: EMPTY')
        return
    # use the longest contiguous x stretch
    runs = []
    st = xs[0]
    for a, b in zip(xs, xs[1:]):
        if b - a > 1:
            runs.append((st, a))
            st = b
    runs.append((st, xs[-1]))
    st, en = max(runs, key=lambda r: r[1] - r[0])
    vals = [prof[x] for x in range(st, en + 1)]
    # max exactly-flat run on the RAW profile (critic parity)
    mf, cur, mfx = 1, 1, st
    for i in range(1, len(vals)):
        if vals[i] == vals[i - 1]:
            cur += 1
            if cur > mf:
                mf, mfx = cur, st + i - cur + 1
        else:
            cur = 1
    f = medfilt(vals, 3)
    amp = max(f) - min(f)
    print(f'{label}: x {st}..{en} maxflat={mf}px @x{mfx} rev(w3)={revs(f)} rev(raw)={revs(vals)} amp={amp}px ymin={min(f)} ymax={max(f)}')
    line = ' '.join(str(v) for v in f[::8])
    print(f'  prof/8: {line}')


def main():
    im = Image.open(sys.argv[1]).convert('RGB')
    args = [a for a in sys.argv[2:] if not a.startswith('--')]
    if len(args) >= 4:
        x0, x1, ymin, ymax = (int(v) for v in args[:4])
    else:
        x0, x1, ymin, ymax = 140, 520, 150, 400
    stats(profile(im, 0, x0, x1, ymin, ymax), 'REF ')
    stats(profile(im, 640, x0, x1, ymin, ymax), 'PROC')


main()
