# TEMP (cheek+gun re-cert critic): zoom strips from MY fresh official pairs
# (shots/critic-<id>-cheekgun). For each (tank, view): [REF | PROC] crop at
# 3x around the change bbox (from tmp-cheekgun-diffloc.py, proc-half coords;
# ref crop mirrors the same window shifted -640), plus a PROC-only 4x.
# Output: scratchpad session-local diagnosis crops; verdicts are reads of
# the official pairs these are cut from.
import json, os, sys
from PIL import Image

SCRATCH = sys.argv[1]
with open(os.path.join(SCRATCH, 'diffloc.json')) as f:
    LOC = json.load(f)

IDS = ['m1a1', 'm1a1ha', 'm1a2', 'm1a2_tejas', 'm1a2_sepv2']
VIEWS = ['view-frontleft', 'view-frontright', 'view-left', 'view-right',
         'close-front', 'hero-frontleft', 'view-top', 'close-roof', 'hero-toptilt',
         'view-front']
PAD = 30
HALF = 640

os.makedirs(os.path.join(SCRATCH, 'crops'), exist_ok=True)
for tid in IDS:
    for view in VIEWS:
        s = LOC.get(tid, {}).get(view)
        if not isinstance(s, dict) or not s['proc']['bbox']:
            continue
        x0, x1, y0, y1 = s['proc']['bbox']
        im = Image.open(f'shots/critic-{tid}-cheekgun/{view}.png').convert('RGB')
        w, h = im.size
        cx0, cy0 = max(HALF, x0 - PAD), max(0, y0 - PAD)
        cx1, cy1 = min(w, x1 + PAD), min(h, y1 + PAD)
        proc = im.crop((cx0, cy0, cx1, cy1))
        ref = im.crop((cx0 - HALF, cy0, cx1 - HALF, cy1))
        cw, ch = proc.size
        strip = Image.new('RGB', (cw * 2 * 3 + 12, ch * 3), (10, 12, 16))
        strip.paste(ref.resize((cw * 3, ch * 3), Image.NEAREST), (0, 0))
        strip.paste(proc.resize((cw * 3, ch * 3), Image.NEAREST), (cw * 3 + 12, 0))
        strip.save(os.path.join(SCRATCH, 'crops', f'{tid}-{view}-3x.png'))
        proc.resize((cw * 4, ch * 4), Image.NEAREST).save(
            os.path.join(SCRATCH, 'crops', f'{tid}-{view}-proc4x.png'))
print('crops done')
