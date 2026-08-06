#!/usr/bin/env python3
# TEMP critic MG-hunt crops for challenger1 r7 (deleted after round).
from PIL import Image, ImageOps

SRC = "/Users/kevinliu/claude-of-tanks/shots/critic-challenger1"
OUT = f"{SRC}/crops-r7"

for view, tag, box, z in [
    ("view-top", "mg-top", (880, 100, 1045, 220), 4),          # bustle zone in plan
    ("view-rearleft", "mg-rearleft", (850, 230, 1050, 330), 3),  # bustle from rear-left
    ("hero-toptilt", "mg-toptilt", (950, 260, 1200, 420), 3),   # tilt over the roof
]:
    img = Image.open(f"{SRC}/{view}.png").convert("RGB")
    c = img.crop(box)
    c.resize((c.width * z, c.height * z), Image.NEAREST).save(f"{OUT}/{tag}.png")
    st = ImageOps.autocontrast(c, cutoff=1)
    st.resize((c.width * z, c.height * z), Image.NEAREST).save(f"{OUT}/{tag}-st.png")
    print(f"saved {tag} (+st) {box} z{z}")
