# TEMP (leo2_revolution r19 re-cert critic): tone measurements, BEFORE
# (preserved r18 critic pairs @ce7f3824+batch43-pre... note: ref half pre-43)
# vs AFTER (my fresh pairs @b53a16f8). ITU-601 luma. Pair frame: proc half
# starts at x 640. Rects reuse tools/tmp-leo-r18recert-measure.py battery.
import sys
import numpy as np
from PIL import Image

BEFORE = sys.argv[1]
AFTER = sys.argv[2]

def luma(a):
    return 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]

def load(src, img):
    return np.asarray(Image.open(f'{src}/{img}').convert('RGB'), dtype=np.float64)

def rect(src, img, x0, y0, x1, y1):
    return luma(load(src, img)[y0:y1, x0:x1])

def stats(r):
    return (f'med {np.median(r):5.1f} p10 {np.percentile(r,10):5.1f} '
            f'p25 {np.percentile(r,25):5.1f} p75 {np.percentile(r,75):5.1f} '
            f'p90 {np.percentile(r,90):5.1f} sd {r.std():5.2f}')

def ba(img, x0, y0, x1, y1, label):
    b = rect(BEFORE, img, x0, y0, x1, y1)
    a = rect(AFTER, img, x0, y0, x1, y1)
    print(f'{img} [{x0}:{x1}]x[{y0}:{y1}] {label}')
    print(f'   r18: {stats(b)}')
    print(f'   r19: {stats(a)}')

def blob(src, img, x0, y0, x1, y1, thr):
    l = luma(load(src, img)[y0:y1, x0:x1])
    m = l < thr
    n = int(m.sum())
    if n:
        ys, xs = np.where(m)
        return f'{n}px<{thr} bbox x[{x0+xs.min()}:{x0+xs.max()}] y[{y0+ys.min()}:{y0+ys.max()}]'
    return f'0px<{thr}'

def bablob(img, x0, y0, x1, y1, thr, label):
    print(f'{img} {label}: r18 {blob(BEFORE, img, x0, y0, x1, y1, thr)} | '
          f'r19 {blob(AFTER, img, x0, y0, x1, y1, thr)}')

print('=== P-R1 ring/recess band zones ===')
ba('close-front.png', 660, 285, 880, 320, 'left fill slab zone (r18 med 40.1 p10 5.5)')
ba('close-front.png', 780, 300, 1050, 330, 'mantlet recess zone (r18 med 53.0)')
bablob('close-front.png', 640, 240, 1280, 470, 12, 'near-black <12')
ba('view-left.png', 790, 292, 1030, 315, 'ring band (defuse rect)')
ba('view-left.png', 660, 292, 1250, 318, 'full-length band strip (r18 med 25.8 p10 5.5)')
ba('view-right.png', 660, 292, 1250, 318, 'full-length band strip (mirror)')
ba('view-rear.png', 800, 300, 1080, 335, 'aft fill face')
bablob('view-rear.png', 680, 270, 1240, 380, 12, 'aft ring fill')
ba('view-front.png', 750, 260, 890, 310, 'left pocket')
ba('view-front.png', 1010, 260, 1150, 310, 'right pocket')
bablob('view-front.png', 680, 240, 1240, 340, 12, 'under-wedge')
print()
print('=== P-R1 vertical grade check (aft fill split top/bottom) ===')
b = rect(BEFORE, 'view-rear.png', 800, 266, 1080, 275)
a = rect(AFTER, 'view-rear.png', 800, 266, 1080, 275)
print(f'aft fill TOP rows y266-275:    r18 med {np.median(b):.1f} -> r19 med {np.median(a):.1f}')
b = rect(BEFORE, 'view-rear.png', 800, 276, 1080, 290)
a = rect(AFTER, 'view-rear.png', 800, 276, 1080, 290)
print(f'aft fill MID rows y276-290:    r18 med {np.median(b):.1f} -> r19 med {np.median(a):.1f}')
b = rect(BEFORE, 'view-rear.png', 800, 291, 1080, 305)
a = rect(AFTER, 'view-rear.png', 800, 291, 1080, 305)
print(f'aft fill LOW rows y291-305:    r18 med {np.median(b):.1f} -> r19 med {np.median(a):.1f}')
print()
print('=== P-R2 SEOSS head zones ===')
ba('view-front.png', 819, 117, 882, 150, 'SEOSS head (diff bbox)')
ba('view-top.png', 900, 196, 932, 222, 'SEOSS planform')
ba('view-rear.png', 1036, 158, 1102, 177, 'SEOSS head from rear')
ba('close-roof.png', 864, 180, 1210, 226, 'SEOSS/roof band (close-roof diff band)')
ba('hero-frontleft.png', 817, 221, 1031, 242, 'SEOSS band hero-fl')
