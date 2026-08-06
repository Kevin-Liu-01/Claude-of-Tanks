# centurion5 r6 independent critic — tone/sky measurement script (diagnosis + verdict rects)
# Usage: python3 tools/tmp-cent5r6-tone.py   (reads shots/critic-centurion5/*.png)
# ITU-601 luma; sky = mask-method (|px-0x151b20| maxch<=13) AND blue-signature (B-R>=+8).
from PIL import Image
import numpy as np

BG = np.array([0x15, 0x1B, 0x20], float)

def load(p):
    return np.asarray(Image.open(p).convert('RGB'), float)

def luma(x):
    return 0.299 * x[..., 0] + 0.587 * x[..., 1] + 0.114 * x[..., 2]

def tone(a, r, tag):
    x = a[r[1]:r[3], r[0]:r[2]]
    L = luma(x)
    m = x.reshape(-1, 3).mean(0).round(0)
    print(f'{tag}: luma mean {L.mean():.1f} p5 {np.percentile(L,5):.1f} '
          f'p95 {np.percentile(L,95):.1f} rgb~{tuple(int(v) for v in m)}')

def sky(a, r, tag):
    x = a[r[1]:r[3], r[0]:r[2]]
    d = np.abs(x - BG).max(-1)
    bl = (x[..., 2] - x[..., 0]) >= 8
    n = (d <= 13) & bl
    print(f'{tag}: sky {n.sum()}/{n.size} px ({100*n.mean():.2f}%), maxch-only {(d<=13).sum()}')

L5 = load('shots/critic-centurion5/view-left.png')
tone(L5, (60, 340, 460, 400),   'left REF wheel row')
tone(L5, (700, 340, 1100, 400), 'left PROC same band')
tone(L5, (100, 370, 460, 392),  'left REF track run')
tone(L5, (720, 378, 1080, 396), 'left PROC horn/pad row')
tone(L5, (720, 396, 1080, 408), 'left PROC ground pad strip')
tone(L5, (100, 396, 460, 408),  'left REF ground line')

F5 = load('shots/critic-centurion5/view-front.png')
tone(F5, (985, 235, 1030, 290), 'front PROC TAN hood panel')
tone(F5, (330, 265, 395, 315),  'front REF hood zone (target)')
tone(F5, (700, 150, 1200, 200), 'front PROC deck context')
tone(F5, (940, 290, 985, 330),  'front PROC muzzle face')
tone(F5, (900, 141, 928, 155),  'front PROC blue chip deck L')
tone(F5, (1018, 156, 1031, 172),'front PROC blue chip deck R')
tone(F5, (733, 345, 822, 470),  'front PROC L wrap face')
tone(F5, (68, 345, 175, 470),   'front REF L band (target)')
sky(F5, (733, 345, 822, 470),   'front PROC L wrap SKY check')
sky(F5, (1098, 345, 1188, 470), 'front PROC R wrap SKY check')

CR = load('shots/critic-centurion5/close-roof.png')
tone(CR, (930, 350, 980, 400),  'close-roof PROC tan panel')
tone(CR, (1066, 303, 1078, 316),'close-roof PROC blue chip')
sky(CR, (920, 390, 1000, 425),  'close-roof under-tube void zone SKY check')
