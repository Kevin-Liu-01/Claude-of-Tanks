#!/usr/bin/env python3
# TEMP critic crops for challenger1 r8 adjudication (deleted after round).
# Crops ref|proc regions from shots/critic-challenger1/*.png at 2x-4x zoom.
import os
from PIL import Image

SRC = "/Users/kevinliu/claude-of-tanks/shots/critic-challenger1"
OUT = "/Users/kevinliu/claude-of-tanks/shots/critic-challenger1/crops-r8"
os.makedirs(OUT, exist_ok=True)

# (view, name, ref_box, proc_box, zoom) — boxes are (l, t, r, b) in the 1280x640 pair frame
CROPS = [
    # O1 verification: side running-gear band, both sides
    ("view-left", "gear-left",  (40, 300, 460, 420), (680, 300, 1100, 420), 3),
    ("view-right", "gear-right", (180, 300, 600, 420), (820, 300, 1240, 420), 3),
    # O3: front bottom flaps
    ("view-front", "front-bottom", (60, 380, 600, 580), (700, 380, 1240, 580), 2),
    # O2/O3: rear bottom flaps + corners
    ("view-rear", "rear-bottom", (60, 380, 600, 590), (700, 380, 1240, 590), 2),
    # O4: front turret face (TOGS, chips, smoke banks)
    ("view-front", "front-turret", (60, 80, 600, 400), (700, 80, 1240, 400), 2),
    # O5a: MG hunt, roof region left side + rear
    ("view-rear", "rear-bustle", (240, 100, 480, 300), (880, 100, 1120, 300), 2),
    ("close-roof", "roof-full", (0, 80, 640, 560), (640, 80, 1280, 560), 1),
    ("close-roof", "roof-gunroot", (0, 330, 400, 560), (640, 330, 1040, 560), 2),
    # O5c smoke banks close
    ("close-front", "cf-smoke", (0, 250, 640, 640), (640, 250, 1280, 640), 1),
    # O6: top rear quarters
    ("view-top", "top-tail", (200, 30, 440, 190), (840, 30, 1080, 190), 3),
    # top bow: the x-0.94 dark glacis class
    ("view-top", "top-bow", (200, 380, 440, 480), (840, 380, 1080, 480), 3),
    # heroes: near gear + overall
    ("hero-frontleft", "hero-fl-gear", (0, 300, 640, 640), (640, 300, 1280, 640), 1),
    ("hero-rearright", "hero-rr-full", (0, 60, 640, 640), (640, 60, 1280, 640), 1),
    # left tail sprocket + rear ramp
    ("view-left", "left-tail", (40, 300, 240, 420), (680, 300, 880, 420), 3),
    # left bow idler + flap thread
    ("view-left", "left-bow", (330, 280, 470, 420), (970, 280, 1110, 420), 3),
    # rearleft quarter (was the skeletal read)
    ("view-rearleft", "rl-quarter", (60, 280, 360, 430), (700, 280, 1000, 430), 2),
    # rearright TOGS + plank check
    ("view-rearright", "rr-bustle", (280, 230, 520, 340), (920, 230, 1160, 340), 3),
    # frontleft TOGS/gun-root tone
    ("view-frontleft", "fl-togs", (280, 270, 480, 360), (920, 270, 1120, 360), 3),
    # close-front full for §B1/§B3 read
    ("close-front", "cf-full", (0, 60, 640, 640), (640, 60, 1280, 640), 1),
    # frontleft whole
    ("view-frontleft", "fl-full", (40, 200, 620, 460), (680, 200, 1260, 460), 1),
]

for view, name, rb, pb, z in CROPS:
    img = Image.open(os.path.join(SRC, f"{view}.png")).convert("RGB")
    for tag, box in (("ref", rb), ("proc", pb)):
        c = img.crop(box)
        c = c.resize((c.width * z, c.height * z), Image.NEAREST)
        c.save(os.path.join(OUT, f"{name}-{tag}.png"))
    # side-by-side
    r = img.crop(rb); p = img.crop(pb)
    h = max(r.height, p.height)
    combo = Image.new("RGB", (r.width + p.width + 8, h), (20, 24, 30))
    combo.paste(r, (0, 0)); combo.paste(p, (r.width + 8, 0))
    combo = combo.resize((combo.width * z, combo.height * z), Image.NEAREST)
    combo.save(os.path.join(OUT, f"{name}-pair.png"))

print("crops written to", OUT)
