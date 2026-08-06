# TEMP (leo2_revolution r18 re-cert critic): dark-zone + band measurements
# on MY fresh official pairs. ITU-601 luma, rect coordinates printed.
import numpy as np
from PIL import Image

SRC = '/Users/kevinliu/claude-of-tanks/shots/critic-leo2_revolution'

def luma(a):
    return 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]

def rect_stats(img, x0, y0, x1, y1, label):
    a = np.asarray(Image.open(f'{SRC}/{img}').convert('RGB'), dtype=np.float64)
    r = luma(a[y0:y1, x0:x1])
    print(f'{img} [{x0}:{x1}]x[{y0}:{y1}] {label}: med {np.median(r):.1f} '
          f'p10 {np.percentile(r,10):.1f} p90 {np.percentile(r,90):.1f} sd {r.std():.2f}')

def dark_blob(img, x0, y0, x1, y1, thr, label):
    a = np.asarray(Image.open(f'{SRC}/{img}').convert('RGB'), dtype=np.float64)
    zone = a[y0:y1, x0:x1]
    l = luma(zone)
    mask = l < thr
    n = int(mask.sum())
    if n:
        ys, xs = np.where(mask)
        print(f'{img} {label}: {n}px luma<{thr} bbox x[{x0+xs.min()}:{x0+xs.max()}] y[{y0+ys.min()}:{y0+ys.max()}]')
    else:
        print(f'{img} {label}: 0px luma<{thr}')

print('--- close-front proc dark zone (mantlet/ring band) ---')
dark_blob('close-front.png', 640, 240, 1280, 470, 12, 'near-black <12')
rect_stats('close-front.png', 660, 285, 880, 320, 'left fill slab zone')
rect_stats('close-front.png', 780, 300, 1050, 330, 'mantlet recess zone')
print()
print('--- left view ring band (defuse-certified med 7.1 @ [150:390]x[292:315] on proc-local frame) ---')
# proc half starts at x 640; defuse rect was proc-local -> pair x 790:1030
rect_stats('view-left.png', 790, 292, 1030, 315, 'ring band (defuse rect mapped)')
rect_stats('view-left.png', 660, 292, 1250, 318, 'full-length band strip')
print()
print('--- rear black band ---')
dark_blob('view-rear.png', 680, 270, 1240, 380, 12, 'aft ring fill')
rect_stats('view-rear.png', 800, 300, 1080, 335, 'aft fill face')
print()
print('--- front under-wedge pockets ---')
dark_blob('view-front.png', 680, 240, 1240, 340, 12, 'under-wedge')
rect_stats('view-front.png', 750, 260, 890, 310, 'left pocket')
rect_stats('view-front.png', 1010, 260, 1150, 310, 'right pocket')
print()
print('--- ref halves, same zones (parity anchors; ref = WRONG print for turret) ---')
rect_stats('view-left.png', 150, 292, 390, 315, 'REF ring zone')
rect_stats('view-rear.png', 160, 300, 440, 335, 'REF under-turret zone')
