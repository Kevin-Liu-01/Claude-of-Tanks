# TEMP (cheek+gun re-cert critic): my fresh shots/critic-<id>-cheekgun pairs
# vs the builder's shots/abrams-cheek-r1/after-<id> archives — whole-pair
# pixel diff (threshold >2/255 any channel). 0 everywhere = deterministic
# pipeline, builder evidence = shipping truth at my verdict hashes.
import os
from PIL import Image

IDS = ['m1a1', 'm1a1ha', 'm1a2', 'm1a2_tejas', 'm1a2_sepv2']
VIEWS = ['view-front', 'view-frontleft', 'view-left', 'view-rearleft', 'view-rear',
         'view-rearright', 'view-right', 'view-frontright', 'view-top',
         'hero-frontleft', 'hero-rearright', 'hero-toptilt', 'close-front', 'close-roof']
THRESH = 2

for tid in IDS:
    worst = (0, None)
    total = 0
    for view in VIEWS:
        a = f'shots/critic-{tid}-cheekgun/{view}.png'
        b = f'shots/abrams-cheek-r1/after-{tid}/{view}.png'
        if not (os.path.exists(a) and os.path.exists(b)):
            print(f'{tid} {view}: MISSING')
            continue
        ia, ib = Image.open(a).convert('RGB'), Image.open(b).convert('RGB')
        if ia.size != ib.size:
            print(f'{tid} {view}: SIZE {ia.size} vs {ib.size}')
            continue
        pa, pb = ia.load(), ib.load()
        n = 0
        for y in range(ia.size[1]):
            for x in range(ia.size[0]):
                c1, c2 = pa[x, y], pb[x, y]
                if (abs(c1[0]-c2[0]) > THRESH or abs(c1[1]-c2[1]) > THRESH
                        or abs(c1[2]-c2[2]) > THRESH):
                    n += 1
        total += n
        if n > worst[0]:
            worst = (n, view)
    print(f'{tid}: total diff px {total} (worst {worst[1]} {worst[0]})')
