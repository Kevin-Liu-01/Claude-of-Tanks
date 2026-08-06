#!/usr/bin/env python3
# TEMP r8 critic follow-up crops (deleted after round): MG plan hunt at the
# correct rear-crown band, toptilt MG, close-front turret band, void zoom.
import os
from PIL import Image

SRC = "/Users/kevinliu/claude-of-tanks/shots/critic-challenger1"
OUT = "/Users/kevinliu/claude-of-tanks/shots/critic-challenger1/crops-r8"

CROPS = [
    ("view-top", "mg-top2", (890, 100, 1060, 230), 5),      # MAG plan read: dark bar frame ~(924..996,154..166)
    ("hero-toptilt", "mg-toptilt", (850, 260, 1080, 400), 3),
    ("close-front", "cf-turretband", (640, 200, 1280, 400), 2),
    ("close-roof", "void-closeroof", (830, 460, 1010, 580), 4),  # the 141-px ramp-bay sky pocket
]
for view, name, box, z in CROPS:
    img = Image.open(os.path.join(SRC, f"{view}.png")).convert("RGB")
    c = img.crop(box)
    c = c.resize((c.width * z, c.height * z), Image.NEAREST)
    c.save(os.path.join(OUT, f"{name}.png"))
print("ok")
