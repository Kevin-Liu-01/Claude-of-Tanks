#!/usr/bin/env python3
"""slab3.py <dir> <map> <spec> <view>: the slab (near-black on a = main, lifted by b = r3; or, when main has none, the darkest
2 % of main inside the AO-reach the r3 lift marks) measured on a / b / c: mean, ratio to the turf ring, edge step, rank."""
import sys, json
import numpy as np
from PIL import Image
D, mp, spec, view = sys.argv[1:5]
L = lambda d: np.asarray(Image.open(f'{D}/{d}/{spec}/{mp}/{view}-full.png').convert('RGB'), dtype=np.float32) @ [0.2126, 0.7152, 0.0722]
def shift_or(m, r):
    o = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1): o |= np.roll(np.roll(m, dy, 0), dx, 1)
    return o
def dil(m, r):
    o = m
    while r > 0: k = min(r, 4); o = shift_or(o, k); r -= k
    return o
def ero(m, r): return ~dil(~m, r)
a, b, c = L('a'), L('b'), L('c')
thr = 14 if (a < 14).sum() > 200 else np.percentile(a, 2)
S = dil(ero((a < thr) & (b > a + 3), 1), 1)
rec = json.load(open(f'{D}/lab4.json')); el = next((f['pose'].get('sunElevDeg') for f in rec['frames'] if f['spec'] == spec and f['view'] == view), None)
if S.sum() < 20: print(f'{mp} {spec} {view} (sun {el:.0f}°): no slab (r3 lifts {int((b > a + 3).sum())} px)'); sys.exit()
ring = dil(S, 40) & ~dil(S, 12); inner = S & ~ero(S, 3); outer = dil(S, 3) & ~S
out = []
for name, img in (('main', a), ('r3', b), ('r4', c)):
    turf = img[ring]; turf = turf[turf > np.percentile(turf, 20)]; m = img[S].mean()
    out.append(f'{name} {m:5.1f} ({m / max(np.median(turf), 1):.2f}, edge {img[outer].mean() / max(img[inner].mean(), 1):.2f}x, {(img < m).mean() * 100:.1f}%)')
print(f'{mp} {spec} {view} (sun {el:.0f}°) [{int(S.sum())} px, thr {thr:.0f}]: ' + ' | '.join(out))
