# recert m1a1 r4: pixel-diff official critic pairs across trees (pure PIL).
# A = current tree fresh render (shots/critic-m1a1)
# B = pristine-HEAD worktree render (scratchpad/m1a1-head/shots/critic-m1a1)
# C = builder's archived same-tree render (scratchpad/prev-critic-m1a1) — determinism baseline
# Diffs only the PROC half (x 640..1280). Reports per-zone changed-pixel counts
# and writes red-overlay diff maps. Diagnosis aid per §D.
from PIL import Image, ImageChops
import os

CUR = '/Users/kevinliu/claude-of-tanks/shots/critic-m1a1'
HEADW = '/private/tmp/claude-501/-Users-kevinliu-claude-of-tanks/d0226c73-49ae-490e-9a35-39379da35769/scratchpad/m1a1-head/shots/critic-m1a1'
PREV = '/private/tmp/claude-501/-Users-kevinliu-claude-of-tanks/d0226c73-49ae-490e-9a35-39379da35769/scratchpad/prev-critic-m1a1'
OUT = '/Users/kevinliu/claude-of-tanks/shots/critic-m1a1/crops'
os.makedirs(OUT, exist_ok=True)
THRESH = 8  # per-channel tolerance (AA jitter)

def diffmask(pa, pb, view):
    a = Image.open(f'{pa}/{view}.png').convert('RGB').crop((640, 0, 1280, 640))
    b = Image.open(f'{pb}/{view}.png').convert('RGB').crop((640, 0, 1280, 640))
    d = ImageChops.difference(a, b)
    r, g, bl = d.split()
    m = ImageChops.lighter(ImageChops.lighter(r, g), bl)  # per-px max channel
    mask = m.point(lambda v: 255 if v > THRESH else 0)
    return a, mask

def count(mask, box=None):
    im = mask.crop(box) if box else mask
    return im.histogram()[255]

def diffmap(pa, pb, view, tag, zones=None, save=True):
    a, mask = diffmask(pa, pb, view)
    n = count(mask)
    print(f'{tag} {view}: changed px {n}')
    if n and zones:
        for zn, (x0, y0, x1, y1) in zones.items():
            print(f'    zone {zn}: {count(mask, (x0 - 640, y0, x1 - 640, y1))}')
    if n:
        bb = mask.getbbox()
        print(f'    bbox x {bb[0]+640}..{bb[2]+640} y {bb[1]}..{bb[3]}')
    if save and n:
        red = Image.new('RGB', a.size, (255, 40, 40))
        vis = Image.composite(red, a, mask)
        vis.save(f'{OUT}/diff-{tag}-{view}.png')
    return n

# zones in FULL-pair px (proc half): view-left — bow right (z+ right), z0~907, 57px/m
L_ZONES = {
    'bow-wrap-window(z2.60..3.49)': (1050, 300, 1110, 400),
    'stern-wrap-window(z-3.61..-2.90)': (695, 300, 750, 400),
    'gear-band(y<track-top)': (660, 330, 1240, 410),
    'cable-run(z-2.30..0.72)': (770, 340, 960, 400),
    'bustle-rack(top rear)': (660, 240, 800, 310),
}
R_ZONES = {
    'bow-wrap-window': (810, 300, 870, 400),
    'stern-wrap-window': (1170, 300, 1225, 400),
    'gear-band': (680, 330, 1260, 410),
    'bustle-rack(top rear)': (1120, 240, 1260, 310),
}

print('=== determinism baseline: fresh vs builder-archived (SAME tree) ===')
for v in ['view-left', 'view-right', 'view-front', 'view-rear', 'view-top']:
    diffmap(CUR, PREV, v, 'same-tree', save=False)

print('=== HEAD -> round: view-left ===')
diffmap(CUR, HEADW, 'view-left', 'head2round', L_ZONES)
print('=== HEAD -> round: view-right ===')
diffmap(CUR, HEADW, 'view-right', 'head2round', R_ZONES)
print('=== HEAD -> round: other views (context) ===')
for v in ['view-front', 'view-rear', 'view-top', 'close-front']:
    diffmap(CUR, HEADW, v, 'head2round')

# ---- cable hunt: thresh-1 diff on every view, report bbox --------------------
def hunt(view):
    a = Image.open(f'{CUR}/{view}.png').convert('RGB').crop((640, 0, 1280, 640))
    b = Image.open(f'{HEADW}/{view}.png').convert('RGB').crop((640, 0, 1280, 640))
    d = ImageChops.difference(a, b)
    r, g, bl = d.split()
    m = ImageChops.lighter(ImageChops.lighter(r, g), bl)
    m1 = m.point(lambda v: 255 if v > 1 else 0)
    n = m1.histogram()[255]
    bb = m1.getbbox()
    print(f'hunt {view}: thresh1 px {n} bbox {None if not bb else (bb[0]+640, bb[1], bb[2]+640, bb[3])}')

if __name__ == '__hunt__':
    pass
