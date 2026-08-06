#!/usr/bin/env python3
"""Re-cert crops pass 2 (corrected windows) — m1a2_tejas r4."""
from PIL import Image
import os

SRC = "shots/critic-m1a2_tejas"
OUT = os.path.join(SRC, "crops")
os.makedirs(OUT, exist_ok=True)

CROPS = [
    # view-left: bow at image RIGHT, stern at LEFT (proc + ref)
    ("view-left", "proc", (430, 290, 630, 415), 4, "bowwrap2"),
    ("view-left", "proc", (30, 290, 230, 415), 4, "sternwrap2"),
    ("view-left", "ref", (400, 290, 620, 415), 4, "bowwrap2"),
    ("view-left", "ref", (20, 290, 220, 415), 4, "sternwrap2"),
    # view-right: bow at image LEFT, stern at RIGHT
    ("view-right", "proc", (110, 290, 310, 415), 4, "bowwrap2"),
    ("view-right", "proc", (440, 290, 640, 415), 4, "sternwrap2"),
    # view-top: rack at image TOP (stern -z up), bow at bottom
    ("view-top", "proc", (140, 30, 500, 290), 3, "rack2"),
    ("view-top", "ref", (140, 30, 500, 290), 3, "rack2"),
    ("view-top", "proc", (140, 380, 500, 640), 3, "bowdeck2"),
    # hero-toptilt: locate rack visually from full view first (already saved)
]

for view, half, box, zoom, tag in CROPS:
    img = Image.open(os.path.join(SRC, f"{view}.png"))
    ox = 0 if half == "ref" else 640
    l, t, r, b = box
    crop = img.crop((ox + l, t, ox + r, b))
    if zoom > 1:
        crop = crop.resize((crop.width * zoom, crop.height * zoom), Image.NEAREST)
    name = f"{view}-{half}-{tag}-{zoom}x.png"
    crop.save(os.path.join(OUT, name))
    print("saved", name, crop.size)
