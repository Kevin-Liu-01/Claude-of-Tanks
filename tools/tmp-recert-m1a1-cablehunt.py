# recert m1a1 r4: where does the new tow cable render? thresh-1 diff per view,
# HEAD-worktree vs round tree, proc half only. Diagnosis aid per §D.
from PIL import Image, ImageChops
import os
CUR = '/Users/kevinliu/claude-of-tanks/shots/critic-m1a1'
HEADW = '/private/tmp/claude-501/-Users-kevinliu-claude-of-tanks/d0226c73-49ae-490e-9a35-39379da35769/scratchpad/m1a1-head/shots/critic-m1a1'
OUT = '/Users/kevinliu/claude-of-tanks/shots/critic-m1a1/crops'
VIEWS = ['view-front', 'view-frontleft', 'view-left', 'view-rearleft', 'view-rear',
         'view-rearright', 'view-right', 'view-frontright', 'view-top',
         'hero-frontleft', 'hero-rearright', 'hero-toptilt', 'close-front', 'close-roof']
# turret-wall cable expected zone per view (proc-half px, full-pair coords):
# left ortho: turret wall band y~265..295, z -1.95..1.07 -> x ~796..968
CABLE_L = (796, 258, 985, 300)
for v in VIEWS:
    a = Image.open(f'{CUR}/{v}.png').convert('RGB').crop((640, 0, 1280, 640))
    b = Image.open(f'{HEADW}/{v}.png').convert('RGB').crop((640, 0, 1280, 640))
    d = ImageChops.difference(a, b)
    r, g, bl = d.split()
    m = ImageChops.lighter(ImageChops.lighter(r, g), bl)
    m1 = m.point(lambda q: 255 if q > 1 else 0)
    n = m1.histogram()[255]
    bb = m1.getbbox()
    extra = ''
    if v == 'view-left':
        zc = m1.crop((CABLE_L[0] - 640, CABLE_L[1], CABLE_L[2] - 640, CABLE_L[3])).histogram()[255]
        extra = f' | turret-wall cable zone: {zc}'
    print(f'{v}: thresh1 {n} bbox {None if not bb else (bb[0] + 640, bb[1], bb[2] + 640, bb[3])}{extra}')
    if v in ('view-left', 'view-rearleft', 'hero-frontleft', 'view-frontleft'):
        red = Image.new('RGB', a.size, (255, 40, 40))
        vis = Image.composite(red, a, m1)
        vis.save(f'{OUT}/hunt1-{v}.png')
