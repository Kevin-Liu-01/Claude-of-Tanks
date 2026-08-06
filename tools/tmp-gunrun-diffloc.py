# TEMP (gun-run re-cert critic): change-locality pixel diff of fresh
# critic pairs vs the pre-round baseline snapshot, split by pair half
# (REF x<640 must be 0; PROC diffs must localize to the collar zone).
# Threshold >2/255 recorded per §D (threshold alongside banked counts).
import sys
from PIL import Image

views = ['close-front', 'view-front', 'view-frontleft', 'view-frontright',
         'view-left', 'view-right', 'view-top', 'hero-frontleft',
         'hero-toptilt', 'close-roof', 'view-rear', 'view-rearleft',
         'view-rearright', 'hero-rearright']

fresh_dir, base_dir = sys.argv[1], sys.argv[2]
for v in views:
    a = Image.open(f'{fresh_dir}/{v}.png').convert('RGB')
    b = Image.open(f'{base_dir}/{v}.png').convert('RGB')
    pa, pb = a.load(), b.load()
    w, h = a.size
    half = w // 2
    stats = {'ref': [0, 10**9, -1, 10**9, -1], 'proc': [0, 10**9, -1, 10**9, -1]}
    for y in range(h):
        for x in range(w):
            d = max(abs(pa[x, y][i] - pb[x, y][i]) for i in range(3))
            if d > 2:
                s = stats['ref'] if x < half else stats['proc']
                s[0] += 1
                s[1], s[2] = min(s[1], x), max(s[2], x)
                s[3], s[4] = min(s[3], y), max(s[4], y)
    r, p = stats['ref'], stats['proc']
    rtxt = f'ref {r[0]:6d}px' + (f' bbox x{r[1]}-{r[2]} y{r[3]}-{r[4]}' if r[0] else '')
    ptxt = f'proc {p[0]:6d}px' + (f' bbox x{p[1]}-{p[2]} y{p[3]}-{p[4]}' if p[0] else '')
    print(f'{v:16s} {rtxt} | {ptxt}')
