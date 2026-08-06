# TEMP (chieftain5 §B6 re-cert critic): §B2 flood spot-check — for each of
# the 14 official views, count BACKGROUND-colored pixels (bg 0x151b20,
# maxch<=13) INSIDE the procedural silhouette bounding box, before
# (shots/uk-b6/before-critic) vs after (shots/critic-chieftain5). A big
# increase localized at the bow/track region = new sky (wrap-air) suspect.
# Prints per-view counts + the bbox of the largest new-bg cluster delta.
import os
import numpy as np
from PIL import Image

BG = np.array([0x15, 0x1B, 0x20], dtype=np.int16)
BEFORE = 'shots/uk-b6/before-critic'
AFTER = 'shots/critic-chieftain5'
VIEWS = ['view-front','view-frontleft','view-left','view-rearleft','view-rear',
         'view-rearright','view-right','view-frontright','view-top',
         'hero-frontleft','hero-rearright','hero-toptilt','close-front','close-roof']

def bgmask(path):
    a = np.asarray(Image.open(path).convert('RGB'), dtype=np.int16)
    h, w, _ = a.shape
    x0 = w // 2  # proc panel
    p = a[:, x0:, :]
    bg = (np.abs(p - BG).max(axis=2) <= 13)
    fg = ~bg
    ys, xs = np.nonzero(fg)
    keep = ys > 30  # drop header text
    ys, xs = ys[keep], xs[keep]
    if ys.size == 0:
        return None, None, (x0, 0)
    bb = (ys.min(), ys.max(), xs.min(), xs.max())
    inbb = bg[bb[0]:bb[1]+1, bb[2]:bb[3]+1]
    return inbb, bb, (x0, 0)

for v in VIEWS:
    pb, pa = os.path.join(BEFORE, v + '.png'), os.path.join(AFTER, v + '.png')
    if not (os.path.exists(pb) and os.path.exists(pa)):
        print(f'{v:16s} MISSING'); continue
    mb, bbb, _ = bgmask(pb)
    ma, bba, off = bgmask(pa)
    cb = int(mb.sum()) if mb is not None else -1
    ca = int(ma.sum()) if ma is not None else -1
    note = ''
    if ma is not None and mb is not None and ca > cb:
        # locate the growth: diff on the intersected bbox in absolute coords
        y0 = max(bbb[0], bba[0]); y1 = min(bbb[1], bba[1])
        x0 = max(bbb[2], bba[2]); x1 = min(bbb[3], bba[3])
        A = ma[y0-bba[0]:y1-bba[0]+1, x0-bba[2]:x1-bba[2]+1]
        B = mb[y0-bbb[0]:y1-bbb[0]+1, x0-bbb[2]:x1-bbb[2]+1]
        grow = A & ~B
        if grow.any():
            ys, xs = np.nonzero(grow)
            note = (f' new-bg cluster bbox proc-panel x {x0+xs.min()+off[0]}..{x0+xs.max()+off[0]}'
                    f' y {y0+ys.min()}..{y0+ys.max()} ({int(grow.sum())} px)')
    print(f'{v:16s} bg-in-bbox before {cb:6d} after {ca:6d} delta {ca-cb:+6d}{note}')
