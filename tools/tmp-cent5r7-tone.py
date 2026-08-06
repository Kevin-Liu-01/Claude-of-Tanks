# centurion5 r7 independent critic — tone/sky measurement (regression rects from r6 + new classes)
# Usage: python3 tools/tmp-cent5r7-tone.py   (reads shots/critic-centurion5/*.png)
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
    print(f'{tag} rect{r}: luma mean {L.mean():.1f} med {np.median(L):.1f} sd {L.std():.1f} '
          f'p5 {np.percentile(L,5):.1f} p95 {np.percentile(L,95):.1f} rgb~{tuple(int(v) for v in m)} '
          f'(r-g {m[0]-m[1]:+.0f}, b-r {m[2]-m[0]:+.0f})')

def sky(a, r, tag):
    x = a[r[1]:r[3], r[0]:r[2]]
    d = np.abs(x - BG).max(-1)
    bl = (x[..., 2] - x[..., 0]) >= 8
    n = (d <= 13) & bl
    print(f'{tag} rect{r}: sky {n.sum()}/{n.size} px ({100*n.mean():.2f}%), maxch-only {(d<=13).sum()}')

def warm(a, half, tag, lo=25):
    # off-palette warm audit: r-g >= +8 at luma > lo, excluding background
    x = a[:, half[0]:half[1]]
    L = luma(x)
    d = np.abs(x - BG).max(-1)
    w = (x[..., 0] - x[..., 1] >= 8) & (L > lo) & (d > 13)
    ys, xs = np.nonzero(w)
    print(f'{tag}: warm px {w.sum()} ({100*w.mean():.3f}% of half)', end='')
    if w.sum() > 40:
        print(f' | bbox x {xs.min()+half[0]}..{xs.max()+half[0]} y {ys.min()}..{ys.max()}'
              f' rgb~{tuple(int(v) for v in x[w].reshape(-1,3).mean(0))}')
    else:
        print()

print('== LEFT VIEW: gear band (r6 O1/O2 regression + articulation) ==')
L5 = load('shots/critic-centurion5/view-left.png')
tone(L5, (60, 340, 460, 400),   'REF wheel row')
tone(L5, (700, 340, 1100, 400), 'PROC same band')
tone(L5, (720, 378, 1080, 396), 'PROC horn/pad row')
tone(L5, (100, 370, 460, 392),  'REF track run')
tone(L5, (720, 396, 1080, 408), 'PROC ground pad strip')
tone(L5, (100, 396, 460, 408),  'REF ground line')
# NEW: single-disc interior articulation — ref disc face carries rim+hub rings (high interior sd
# + ring dips); proc disc face flat. Ref disc ~x 245-295 y 340-395; proc disc ~x 800-860 y 372-404.
tone(L5, (247, 341, 293, 387),  'REF one disc interior')
tone(L5, (802, 374, 858, 402),  'PROC one disc interior')
# NEW: bay-window row (raised-hem openings) vs ref same zone (wheel upper arcs in shadow)
tone(L5, (700, 344, 1100, 372), 'PROC bay-window strip')
tone(L5, (60, 320, 460, 344),   'REF above-wheel zone')

print()
print('== per-column crossing structure through the disc row (identity read) ==')
def crossings(a, r, thr, tag):
    x = luma(a[r[1]:r[3], r[0]:r[2]])
    col = x.mean(0)
    b = col > thr
    c = int(np.count_nonzero(b[1:] != b[:-1]))
    print(f'{tag}: {c} light/dark column transitions (thr {thr})')
crossings(L5, (95, 345, 445, 390), 38, 'REF disc row')
crossings(L5, (720, 374, 1085, 402), 38, 'PROC disc row')

print()
print('== FRONT VIEW: r6 O2/O4 regression rects ==')
F5 = load('shots/critic-centurion5/view-front.png')
tone(F5, (985, 235, 1030, 290), 'PROC ex-TAN hood rect')
tone(F5, (330, 265, 395, 315),  'REF hood zone (target)')
tone(F5, (940, 290, 985, 330),  'PROC muzzle face')
tone(F5, (900, 141, 928, 155),  'PROC ex-blue chip deck L')
tone(F5, (1018, 156, 1031, 172),'PROC ex-blue chip deck R')
tone(F5, (733, 345, 822, 470),  'PROC L wrap face')
tone(F5, (68, 345, 175, 470),   'REF L band (target)')
sky(F5, (733, 345, 822, 470),   'PROC L wrap SKY')
sky(F5, (1098, 345, 1188, 470), 'PROC R wrap SKY')

print()
print('== DRUM (O6b tell) warmth — close-roof + right ==')
CR = load('shots/critic-centurion5/close-roof.png')
tone(CR, (735, 378, 800, 402),  'PROC drum band (close-roof)')
tone(CR, (640, 395, 720, 415),  'PROC tube fwd of drum (close-roof)')
R5 = load('shots/critic-centurion5/view-right.png')
tone(R5, (860, 286, 902, 300),  'PROC drum band (right)')
tone(R5, (140, 270, 190, 285),  'REF drum band (right, its fat drum)')
tone(R5, (930, 288, 1010, 299), 'PROC tube rear of drum (right)')

print()
print('== warm-family audit (off-palette r>g objects) per view, PROC half vs REF half ==')
for name, path in [('right', 'shots/critic-centurion5/view-right.png'),
                   ('top', 'shots/critic-centurion5/view-top.png'),
                   ('hero-toptilt', 'shots/critic-centurion5/hero-toptilt.png'),
                   ('close-roof', 'shots/critic-centurion5/close-roof.png')]:
    a = load(path)
    warm(a, (0, 640), f'{name} REF')
    warm(a, (640, 1280), f'{name} PROC')

print()
print('== TOP: basket walls in plan + track runs (r6 regression) ==')
T5 = load('shots/critic-centurion5/view-top.png')
tone(T5, (872, 300, 890, 385),  'PROC L basket strip (plan)')
tone(T5, (1032, 300, 1050, 385),'PROC R basket strip (plan)')
tone(T5, (245, 300, 268, 385),  'REF L deck edge same zone')
tone(T5, (869, 398, 908, 455),  'PROC L track rear quarter')
tone(T5, (1012, 398, 1051, 455),'PROC R track rear quarter')
tone(T5, (228, 398, 262, 455),  'REF L track rear quarter')

print()
print('== CLOSE-ROOF: periscope lids, M2 zone, void sky (r6 regression) ==')
tone(CR, (1035, 248, 1062, 260),'PROC pale deck lid A')
tone(CR, (1076, 252, 1103, 264),'PROC pale deck lid B')
tone(CR, (940, 230, 1010, 250), 'PROC deck context around lids')
tone(CR, (1078, 226, 1120, 244),'PROC M2 receiver zone')
tone(CR, (1090, 250, 1140, 268),'PROC crown behind M2')
sky(CR, (920, 390, 1000, 425),  'close-roof under-tube void SKY')

print()
print('== REAR: basket panels + tail cable zone ==')
RE = load('shots/critic-centurion5/view-rear.png')
tone(RE, (856, 218, 890, 290),  'PROC L basket panel (rear)')
tone(RE, (390, 225, 425, 290),  'REF R basket panel (rear)')
tone(RE, (855, 300, 1050, 330), 'PROC tail plate + cable zone')
tone(RE, (170, 300, 400, 330),  'REF tail plate + cable zone')
sky(RE, (711, 290, 760, 430),   'PROC L wrap SKY (rear)')
sky(RE, (1150, 290, 1200, 430), 'PROC R wrap SKY (rear)')
