#!/usr/bin/env python3
"""slabmask.py <dir> <spec> <view>: the slab = pixels near-black (<14) on main (a) that the AO-off variant (a noao, else r3)
lifts, opened to drop specks; per dist its mean luma, the turf around it (a ring 12-40 px out, upper 80 %), the darkness
ratio, and the edge step (mean luma 3 px outside the boundary over 3 px inside). numpy only."""
import sys
import numpy as np
from PIL import Image
D, spec, view = sys.argv[1:4]
L = lambda d, v='full': np.asarray(Image.open(f'{D}/{d}/{spec}/verdant/{view}-{v}.png').convert('RGB'), dtype=np.float32) @ [0.2126, 0.7152, 0.0722]
def shift_or(m, r):
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            out |= np.roll(np.roll(m, dy, 0), dx, 1)
    return out
def dil(m, r):
    o = m
    while r > 0:
        k = min(r, 4); o = shift_or(o, k); r -= k
    return o
def ero(m, r): return ~dil(~m, r)
a, b, c = L('a'), L('b'), L('c')
try: an = L('a', 'noao')
except Exception: an = None
lift = (b > a + 4) if an is None else (an > a + 4)
S = dil(ero((a < 14) & lift, 1), 1)
if S.sum() < 20: print(f'{spec} {view}: no slab ({int(S.sum())} px)'); sys.exit()
ring = dil(S, 40) & ~dil(S, 12)
inner = S & ~ero(S, 3); outer = dil(S, 3) & ~S
print(f'{spec} {view}: slab {int(S.sum())} px')
for name, img in (('main', a), ('r3', b), ('r4', c)) + ((('main noao', an),) if an is not None else ()):
    turf = img[ring]; turf = turf[turf > np.percentile(turf, 20)]
    s_in, s_out = img[inner].mean(), img[outer].mean()
    print(f'  {name:9s} slab mean {img[S].mean():5.1f} p10 {np.percentile(img[S], 10):5.1f} | turf around {np.median(turf):5.1f} | ratio {img[S].mean() / max(np.median(turf), 1):.2f} | edge out/in {s_out:5.1f}/{s_in:5.1f} = {s_out / max(s_in, 1):.2f}x')
