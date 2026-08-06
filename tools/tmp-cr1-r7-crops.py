#!/usr/bin/env python3
# TEMP critic crops for challenger1 r7 adjudication (deleted after round).
# Crops ref|proc regions from shots/critic-challenger1/*.png at 2x-3x zoom.
import os
from PIL import Image

SRC = "/Users/kevinliu/claude-of-tanks/shots/critic-challenger1"
OUT = "/Users/kevinliu/claude-of-tanks/shots/critic-challenger1/crops-r7"
os.makedirs(OUT, exist_ok=True)

# (view, name, ref_box, proc_box, zoom) — boxes are (l, t, r, b) in the 1280x640 pair frame
CROPS = [
    # 1. side running-gear band: wheels below skirt hem (calibration class)
    ("view-left", "gear-left",  (60, 300, 460, 420), (700, 300, 1100, 420), 3),
    ("view-right", "gear-right", (180, 300, 580, 420), (820, 300, 1220, 420), 3),
    # 2. front bottom: flaps vs exposed tracks
    ("view-front", "front-bottom", (60, 380, 600, 580), (700, 380, 1240, 580), 2),
    # 3. rear bottom: flaps vs exposed tracks
    ("view-rear", "rear-bottom", (60, 380, 600, 590), (700, 380, 1240, 590), 2),
    # 4. front turret face + gun mass
    ("view-front", "front-turret", (60, 80, 600, 400), (700, 80, 1240, 400), 2),
    # 5. top bow: the x-0.94 notch (bottom of image = nose)
    ("view-top", "top-bow", (220, 380, 420, 470), (860, 380, 1060, 470), 3),
    # 6. top tail: ladder texture
    ("view-top", "top-tail", (220, 40, 420, 170), (860, 40, 1060, 170), 3),
    # 7. close-roof gun root: void hunt + smoke boxes
    ("close-roof", "roof-gunroot", (0, 330, 400, 560), (640, 330, 1040, 560), 2),
    # 8. close-roof masts: antenna knee
    ("close-roof", "roof-masts", (380, 150, 640, 340), (1000, 150, 1260, 340), 2),
    # 9. bustle MG hunt (rear view top)
    ("view-rear", "rear-bustle", (240, 100, 480, 300), (880, 100, 1120, 300), 2),
    # 10. rearright bustle/TOGS
    ("view-rearright", "rr-bustle", (280, 230, 520, 340), (920, 230, 1160, 340), 3),
    # 11. frontleft TOGS tone
    ("view-frontleft", "fl-togs", (280, 270, 480, 360), (920, 270, 1120, 360), 3),
    # 12. left tail: sprocket/rear ramp + undercut
    ("view-left", "left-tail", (940 - 900, 300, 1140 - 900, 420), (940, 300, 1140, 420), 3),
    # 13. left bow: idler ramp + wing arch
    ("view-left", "left-bow", (330, 280, 470, 420), (970, 280, 1110, 420), 3),
    # 14. hero-frontleft near gear
    ("hero-frontleft", "hero-fl-gear", (80, 300, 480, 470), (720, 300, 1120, 470), 2),
]

for view, name, rbox, pbox, z in CROPS:
    img = Image.open(f"{SRC}/{view}.png").convert("RGB")
    ref = img.crop(rbox)
    proc = img.crop(pbox)
    rw, rh = ref.size
    pw, ph = proc.size
    H = max(rh, ph) * z
    canvas = Image.new("RGB", (rw * z + pw * z + 8, H), (20, 24, 30))
    canvas.paste(ref.resize((rw * z, rh * z), Image.NEAREST), (0, 0))
    canvas.paste(proc.resize((pw * z, ph * z), Image.NEAREST), (rw * z + 8, 0))
    canvas.save(f"{OUT}/{name}.png")
    print(f"saved {name}.png  ref{rbox} proc{pbox} z{z}")
print("done ->", OUT)
