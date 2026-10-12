#!/usr/bin/env python3
"""capeval.py <spec> <view>: the owner's slab (mask: near-black on main that round 3 lifts, from owner3/a and owner3/b) measured on
the cap sweep (caps/f: full = 0.55, cap45, cap35, cap25, noao): slab mean, its ratio to the turf around (ring 12-40 px), the edge
step (3 px out / 3 px in), and the frame's ground darkness rank (share of the frame darker than the slab mean)."""
import sys
import numpy as np
from PIL import Image
spec, view = sys.argv[1:3]
SP = '/private/tmp/claude-501/-Users-kevinliu--codex-worktrees-cot-restore-1049-visuals-20260911/6412983f-6279-4f04-92ea-e3d886747505/scratchpad/costland/wave/r4'
L = lambda p: np.asarray(Image.open(p).convert('RGB'), dtype=np.float32) @ [0.2126, 0.7152, 0.0722]
def shift_or(m, r):
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1): out |= np.roll(np.roll(m, dy, 0), dx, 1)
    return out
def dil(m, r):
    o = m
    while r > 0: k = min(r, 4); o = shift_or(o, k); r -= k
    return o
def ero(m, r): return ~dil(~m, r)
a = L(f'{SP}/owner3/a/{spec}/verdant/{view}-full.png'); b = L(f'{SP}/owner3/b/{spec}/verdant/{view}-full.png')
S = dil(ero((a < 14) & (b > a + 4), 1), 1)
if S.sum() < 20: print(f'{spec} {view}: no slab'); sys.exit()
ring = dil(S, 40) & ~dil(S, 12); inner = S & ~ero(S, 3); outer = dil(S, 3) & ~S
print(f'{spec} {view}: slab {int(S.sum())} px')
rows = [('main', a), ('r3', b)]
for v in ('full', 'cap45', 'cap35', 'cap25', 'noao'):
    try: rows.append((f'r4 {v if v != "full" else "cap55"}', L(f'{SP}/caps/f/{spec}/verdant/{view}-{v}.png')))
    except FileNotFoundError: pass
for name, img in rows:
    turf = img[ring]; turf = turf[turf > np.percentile(turf, 20)]
    m = img[S].mean(); s_in, s_out = img[inner].mean(), img[outer].mean()
    rank = (img < m).mean() * 100
    print(f'  {name:10s} slab {m:5.1f} | turf {np.median(turf):5.1f} ratio {m / max(np.median(turf), 1):.2f} | edge {s_out / max(s_in, 1):.2f}x | {rank:4.1f} % of the frame darker')
