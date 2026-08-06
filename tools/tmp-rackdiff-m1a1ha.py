# recert m1a1ha r4: attempted plan-view pixel diff m1a1 vs m1a1ha (proc halves).
# FINDING: NOT usable as tell evidence — the per-id camo seeds differ, so patch
# borders diff across the whole deck (7892 px, spread z +3.8..-3.4). Tells are
# evidenced by same-box crops (tools/tmp-recert-crops-m1a1ha.py) + profile code.
from PIL import Image, ImageChops
import collections
A = Image.open('/Users/kevinliu/claude-of-tanks/shots/critic-m1a1/view-top.png').convert('RGB').crop((640, 0, 1280, 640))
B = Image.open('/Users/kevinliu/claude-of-tanks/shots/critic-m1a1ha/view-top.png').convert('RGB').crop((640, 0, 1280, 640))
px = ImageChops.difference(A, B).load()
cells = collections.Counter()
n = 0
for y in range(640):
    for x in range(640):
        r, g, b = px[x, y]
        if max(r, g, b) > 18:
            n += 1
            cells[(y // 16, x // 16)] += 1
print('changed px:', n)
for (cy, cx), c in sorted(cells.items(), key=lambda kv: -kv[1])[:14]:
    wx = (cx * 16 + 8 - 320) / 55.5
    wz = 3.96 - (cy * 16 + 8 - 47) / 55.5
    print(f'cell y{cy*16} x{cx*16} n{c}  ~world x {wx:+.2f} z {wz:+.2f}')
