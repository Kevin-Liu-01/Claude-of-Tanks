# TEMP r18: batch turret crops (PROC half) before/after at 2x + 4x
import os
from PIL import Image
BASE = '/Users/kevinliu/claude-of-tanks/shots/leo-r18'
# per-view proc-half turret rects (x0,y0,x1,y1) on the 1280-wide pairs
R = {
  'view-front':      (680, 90, 1200, 340),
  'view-rear':       (680, 130, 1210, 420),
  'view-left':       (660, 220, 1250, 330),
  'view-right':      (660, 220, 1250, 330),
  'view-frontleft':  (680, 210, 1200, 340),
  'view-frontright': (680, 210, 1200, 340),
  'view-rearleft':   (680, 210, 1200, 340),
  'view-rearright':  (680, 210, 1240, 340),
  'view-top':        (700, 150, 1180, 500),
  'hero-frontleft':  (700, 150, 1240, 420),
  'hero-rearright':  (660, 130, 1240, 430),
  'hero-toptilt':    (660, 100, 1240, 450),
  'close-front':     (640, 140, 1280, 470),
  'close-roof':      (640, 0, 1280, 640),
}
os.makedirs(f'{BASE}/crops', exist_ok=True)
for phase in ('before', 'after'):
    for name, (x0, y0, x1, y1) in R.items():
        src = f'{BASE}/{phase}/{name}.png'
        if not os.path.exists(src):
            print('missing', src); continue
        im = Image.open(src).crop((x0, y0, x1, y1))
        for scale in (2, 4):
            if scale == 4 and name not in ('close-front', 'close-roof', 'view-front', 'view-left'):
                continue
            out = f'{BASE}/crops/{name}-{phase}-{scale}x.png'
            im.resize((im.width * scale, im.height * scale), Image.LANCZOS).save(out)
print('crops written:', len(os.listdir(f'{BASE}/crops')))
