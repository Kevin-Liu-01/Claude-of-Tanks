# recert m1a1 r4: forensic probe of the tow-cable band in view-left.
# Cable world: x -1.674 (left wall), y 2.00..2.12, z -1.95..1.07.
# view-left proc half: z0 ~907px (full-pair), ~57 px/m, ground y~393.
# Expected: x 796..968, y ~265..282. Compare CUR vs HEAD per pixel.
from PIL import Image, ImageChops
CUR = '/Users/kevinliu/claude-of-tanks/shots/critic-m1a1'
HEADW = '/private/tmp/claude-501/-Users-kevinliu-claude-of-tanks/d0226c73-49ae-490e-9a35-39379da35769/scratchpad/m1a1-head/shots/critic-m1a1'
a = Image.open(f'{CUR}/view-left.png').convert('RGB')
b = Image.open(f'{HEADW}/view-left.png').convert('RGB')
pa, pb = a.load(), b.load()

# 1) all >1 diffs in the broad turret-wall band
print('exact >1 diff coords in band x 780..1000, y 250..305:')
hits = []
for y in range(250, 305):
    for x in range(780, 1000):
        d = max(abs(pa[x, y][c] - pb[x, y][c]) for c in range(3))
        if d > 1:
            hits.append((x, y, d))
print(f'  {len(hits)} px:', hits[:40])

# 2) max per-column delta along the whole band (any sub-threshold cable shading?)
print('per-row max delta, rows 255..300 (col-range 780..1000):')
for y in range(255, 300, 2):
    md = 0
    for x in range(780, 1000):
        d = max(abs(pa[x, y][c] - pb[x, y][c]) for c in range(3))
        md = max(md, d)
    print(f'  y{y}: maxDelta {md}')
