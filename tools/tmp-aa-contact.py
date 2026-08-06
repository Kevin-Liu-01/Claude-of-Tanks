# TEMP (aa-r1): before/after motion-shimmer contact sheet.
# Rows = offender crops; columns = BEFORE frame, BEFORE frame-to-frame diff
# (4x amplified), AFTER frame, AFTER diff. Diffs are |f1-f0| max-channel from
# the 3-frame strafe bursts — bright = pixels that flip between frames.
# Usage: python3 tools/tmp-aa-contact.py
import os
from PIL import Image, ImageChops, ImageDraw

D = 'shots/aa-r1'
CROPS = [
    ('battlefield', 900, 400, 300, 90,  'far treeline 300-500m (lobes+poles)'),
    ('battlefield', 830, 560, 260, 130, 'mid pines ~150-250m'),
    ('battlefield', 380, 700, 260, 130, 'near canopy + grass 30-80m'),
    ('player_view', 1100, 380, 300, 130, 'gameplay cam treeline'),
    # x8 target: sourced from the run-A stacked sheet (ba_sniper_view_target)
    # — the concurrent world-dressing agent changed the sniper lane's props
    # mid-round, so later boots stage a different scene; run A is the
    # stage-matched shipped-post.js evidence pair.
    ('BA:ba_sniper_view_target.png', 0, 0, 300, 130, 'x8 target @300m (run A)'),
    ('urban_glass_mid', 880, 440, 300, 130, 'facades + window trims'),
    ('urban_glass_mid', 60, 660, 300, 130, 'glazed roof specular rims'),
]
SC = 2
PAD = 6
LABEL_W = 210
HDR = 34
cw = 300 * SC


def _ba_rows(name):
    # a ba_* stack: 4 rows (before f0, before f1, after f0, after f1) at 3x
    # NEAREST scale with 8 px gaps; recover the original-resolution frames.
    im = Image.open(f'{D}/{name}')
    rh = (im.height - 8 * 3) // 4
    rows = []
    for i in range(4):
        r = im.crop((0, i * (rh + 8), im.width, i * (rh + 8) + rh))
        rows.append(r.resize((im.width // 3, rh // 3), Image.NEAREST))
    return rows


def crop(state, v, x, y, w, h):
    if v.startswith('BA:'):
        rows = _ba_rows(v[3:])
        base = rows[0] if state == 'before' else rows[2]
        return base.crop((0, 0, min(w, base.width), min(h, base.height)))
    return Image.open(f'{D}/{state}/{v}_f0.png').crop((x, y, x + w, y + h))


def diff(state, v, x, y, w, h):
    if v.startswith('BA:'):
        rows = _ba_rows(v[3:])
        a, b = (rows[0], rows[1]) if state == 'before' else (rows[2], rows[3])
        a = a.convert('RGB')
        b = b.convert('RGB')
    else:
        a = Image.open(f'{D}/{state}/{v}_f0.png').crop((x, y, x + w, y + h)).convert('RGB')
        b = Image.open(f'{D}/{state}/{v}_f1.png').crop((x, y, x + w, y + h)).convert('RGB')
    d = ImageChops.difference(a, b)
    r, g, bl = d.split()
    m = ImageChops.lighter(ImageChops.lighter(r, g), bl)
    m = m.point(lambda t: min(255, t * 4)).convert('RGB')
    if v.startswith('BA:'):
        m = m.crop((0, 0, min(w, m.width), min(h, m.height)))
    return m


rows = []
H = HDR
for v, x, y, w, h, label in CROPS:
    rh = h * SC
    rows.append((v, x, y, w, h, label, rh))
    H += rh + PAD
W = LABEL_W + (cw + PAD) * 4

sheet = Image.new('RGB', (W, H), (13, 16, 20))
d = ImageDraw.Draw(sheet)
cols = ['BEFORE', 'BEFORE frame-diff x4', 'AFTER', 'AFTER frame-diff x4']
for ci, c in enumerate(cols):
    d.text((LABEL_W + ci * (cw + PAD) + 8, 10), c, fill=(235, 235, 235))
yy = HDR
for v, x, y, w, h, label, rh in rows:
    d.text((8, yy + rh // 2 - 12), label, fill=(210, 210, 210))
    d.text((8, yy + rh // 2 + 4), v, fill=(140, 150, 160))
    ims = [
        crop('before', v, x, y, w, h),
        diff('before', v, x, y, w, h),
        crop('after', v, x, y, w, h),
        diff('after', v, x, y, w, h),
    ]
    for ci, im in enumerate(ims):
        sheet.paste(im.resize((w * SC, rh), Image.NEAREST).crop((0, 0, cw, rh)),
                    (LABEL_W + ci * (cw + PAD), yy))
    yy += rh + PAD
out = f'{D}/contact-sheet.png'
sheet.save(out)
print(out, sheet.size)
