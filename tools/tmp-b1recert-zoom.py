# TEMP (abrams §B1 re-cert critic): compose zoom strips per tank/view:
# [BEFORE proc | AFTER proc | REF print] crops of the turret-front region,
# 3x zoom, labeled. Before = worktree render, After = fresh main render.
import sys, os
from PIL import Image, ImageDraw

WT = '/private/tmp/claude-501/-Users-kevinliu-claude-of-tanks/d0226c73-49ae-490e-9a35-39379da35769/scratchpad/cot-head/shots'
MAIN = '/Users/kevinliu/claude-of-tanks/shots'
OUT = '/private/tmp/claude-501/-Users-kevinliu-claude-of-tanks/d0226c73-49ae-490e-9a35-39379da35769/scratchpad'

# per-view crop regions in PROC-HALF coords (x0,y0,x1,y1), padded from diff bboxes
REGIONS = {
    'close-front':     (40, 160, 360, 400),
    'hero-frontleft':  (220, 190, 480, 380),
    'view-left':       (300, 220, 470, 330),
    'view-right':      (180, 220, 350, 330),
    'view-front':      (100, 150, 540, 300),
    'view-frontleft':  (240, 210, 440, 330),
    'view-frontright': (200, 210, 400, 330),
    'hero-toptilt':    (180, 160, 420, 350),
}
Z = 3

def crop3(tank, view):
    r = REGIONS[view]
    before = Image.open(f'{WT}/critic-{tank}/{view}.png').convert('RGB')
    after = Image.open(f'{MAIN}/critic-{tank}/{view}.png').convert('RGB')
    w, h = after.size
    half = w // 2
    box_proc = (half + r[0], r[1], half + r[2], r[3])
    box_ref = (r[0], r[1], r[2], r[3])
    b = before.crop(box_proc)
    a = after.crop(box_proc)
    ref = after.crop(box_ref)
    cw, ch = a.size
    strip = Image.new('RGB', (cw * 3 * Z + 24, ch * Z + 26), (12, 14, 20))
    d = ImageDraw.Draw(strip)
    for i, (img, lab) in enumerate([(b, 'BEFORE (HEAD)'), (a, 'AFTER (B1)'), (ref, 'REF PRINT')]):
        big = img.resize((cw * Z, ch * Z), Image.NEAREST)
        strip.paste(big, (i * (cw * Z + 12), 26))
        d.text((i * (cw * Z + 12) + 4, 6), f'{lab}  {tank} {view}', fill=(230, 230, 230))
    return strip

tank = sys.argv[1]
views = sys.argv[2].split(',') if len(sys.argv) > 2 else list(REGIONS)
for v in views:
    s = crop3(tank, v)
    p = f'{OUT}/b1z-{tank}-{v}.png'
    s.save(p)
    print(p, s.size)
