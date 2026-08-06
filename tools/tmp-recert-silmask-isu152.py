# TEMP recert critic (isu152 contain1): silhouette-mask diff per view,
# r6 graduation archive vs contain1 fresh render, PROC pane only.
# Mask = NOT bg-class (|px-0x151b20| maxch<=13). Reports px added/removed
# and their bounding boxes/clusters -> exactly where the outline changed.
# Usage: python3 tools/tmp-recert-silmask-isu152.py
from PIL import Image

BG = (0x15, 0x1b, 0x20)
THR = 13
OLD = 'shots/isu152-r6'
NEW = 'shots/critic-isu152'
VIEWS = ['view-front', 'view-frontleft', 'view-left', 'view-rearleft', 'view-rear',
         'view-rearright', 'view-right', 'view-frontright', 'view-top',
         'close-front', 'close-roof']

def mask(path):
    im = Image.open(path).convert('RGB')
    W, H = im.size
    px = im.load()
    m = set()
    for x in range(W // 2, W):
        for y in range(24, H):  # skip header text rows
            p = px[x, y]
            if not (abs(p[0]-BG[0]) <= THR and abs(p[1]-BG[1]) <= THR and abs(p[2]-BG[2]) <= THR):
                m.add((x, y))
    return m

def clusters(pts, gap=4):
    boxes = []
    for (x, y) in sorted(pts):
        for b in boxes:
            if b[0]-gap <= x <= b[2]+gap and b[1]-gap <= y <= b[3]+gap:
                b[0] = min(b[0], x); b[1] = min(b[1], y)
                b[2] = max(b[2], x); b[3] = max(b[3], y); b[4] += 1
                break
        else:
            boxes.append([x, y, x, y, 1])
    boxes.sort(key=lambda b: -b[4])
    return boxes

for v in VIEWS:
    a = mask(f'{OLD}/{v}.png')
    b = mask(f'{NEW}/{v}.png')
    added = b - a      # solid where r6 had bg
    removed = a - b    # bg where r6 had solid
    print(f'{v}: sil px r6={len(a)} now={len(b)}  added={len(added)} removed={len(removed)}')
    for tag, s in (('added', added), ('removed', removed)):
        for c in clusters(s)[:5]:
            if c[4] >= 4:
                print(f'   {tag}: x{c[0]}-{c[2]} y{c[1]}-{c[3]} n={c[4]}')
