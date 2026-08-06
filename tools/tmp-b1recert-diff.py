# TEMP (abrams §B1 re-cert critic): pixel-diff fresh critic renders against
# the builder's before/after archives. For each view: count differing pixels
# (any channel delta > 2) and the diff bbox, fresh-vs-before and fresh-vs-after.
import sys, os
from PIL import Image, ImageChops

ROOT = '/Users/kevinliu/claude-of-tanks/shots'
tank = sys.argv[1]
fresh_dir = f'{ROOT}/critic-{tank}'
before_dir = f'{ROOT}/abrams-b1/before-{tank}'
after_dir = f'{ROOT}/abrams-b1/after-{tank}'

def diffstats(a_path, b_path):
    a = Image.open(a_path).convert('RGB')
    b = Image.open(b_path).convert('RGB')
    if a.size != b.size:
        return ('SIZE', a.size, b.size)
    d = ImageChops.difference(a, b)
    # threshold: any channel > 2
    g = d.convert('L').point(lambda p: 255 if p > 2 else 0)
    bbox = g.getbbox()
    n = sum(1 for p in g.getdata() if p)
    return (n, bbox)

views = sorted(os.listdir(fresh_dir))
print(f'== {tank}: fresh-vs-BEFORE | fresh-vs-AFTER (px>2, bbox)')
for v in views:
    if not v.endswith('.png'):
        continue
    row = [v]
    for other in (before_dir, after_dir):
        p = os.path.join(other, v)
        if not os.path.exists(p):
            row.append('missing')
            continue
        row.append(str(diffstats(os.path.join(fresh_dir, v), p)))
    print(f'  {row[0]:22s} B: {row[1]:44s} A: {row[2]}')
