#!/usr/bin/env python3
# TEMP (isu152 r4 independent critic): zoomed ref|proc comparison crops for
# visual adjudication. Saves to scratchpad crops dir. Deleted after round.
import os
from PIL import Image

SHOTS = "/Users/kevinliu/claude-of-tanks/shots/critic-isu152"
OUT = "/private/tmp/claude-501/-Users-kevinliu-claude-of-tanks/d0226c73-49ae-490e-9a35-39379da35769/scratchpad/crops"
os.makedirs(OUT, exist_ok=True)

# (name, view, local rect (x0,y0,x1,y1), zoom)  -> side-by-side ref|proc
CROPS = [
    ("dshk-closeroof",   "close-roof", (250, 200, 480, 400), 3),
    ("cupolas-closeroof","close-roof", (120, 200, 360, 380), 3),
    ("roofline-left",    "view-left",  (220, 235, 420, 300), 4),
    ("dshk-left",        "view-left",  (290, 235, 370, 275), 8),
    ("windows-left",     "view-left",  (60, 340, 500, 400), 2),
    ("groundline-left",  "view-left",  (150, 380, 450, 402), 3),
    ("bow-left",         "view-left",  (420, 280, 600, 400), 3),
    ("stern-left",       "view-left",  (40, 280, 200, 400), 3),
    ("top-casemate",     "view-top",   (220, 230, 420, 460), 2.6),
    ("top-deckcrate",    "view-top",   (220, 40, 420, 240), 2.6),
    ("front-mantlet",    "close-front",(100, 180, 460, 400), 2.2),
    ("front-nose-track", "view-front", (40, 380, 600, 580), 1.6),
    ("rear-whole",       "view-rear",  (40, 90, 600, 500), 1.4),
    ("toptilt-aft",      "hero-toptilt",(300, 300, 640, 620), 2.2),
    ("toptilt-roof",     "hero-toptilt",(150, 150, 500, 420), 2.2),
    ("hero-fl-flank",    "hero-frontleft",(60, 210, 640, 460), 1.6),
]

for name, view, (x0, y0, x1, y1), z in CROPS:
    im = Image.open(f"{SHOTS}/{view}.png").convert("RGB")
    ref = im.crop((x0, y0, x1, y1))
    proc = im.crop((x0+640, y0, x1+640, y1))
    w, h = ref.size
    zw, zh = int(w*z), int(h*z)
    ref = ref.resize((zw, zh), Image.NEAREST)
    proc = proc.resize((zw, zh), Image.NEAREST)
    pair = Image.new("RGB", (zw*2+8, zh), (40, 44, 52))
    pair.paste(ref, (0, 0))
    pair.paste(proc, (zw+8, 0))
    pair.save(f"{OUT}/{name}.png")
    print(f"{name}: {zw*2+8}x{zh}")
print("done ->", OUT)
