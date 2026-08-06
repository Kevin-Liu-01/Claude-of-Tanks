#!/usr/bin/env python3
"""Zoom crops for the m1a2_tejas r4 graduate re-cert (critic tool, diagnosis crops).

Reads the OFFICIAL critic pairs (shots/critic-m1a2_tejas/*.png, 1280x640,
ref left half 0..640, proc right half 640..1280) and writes nearest-neighbor
zoom crops to shots/critic-m1a2_tejas/crops/ for the changed-region reads:
bow/fender containment (front, close-front), rear grille doors, side wrap
arcs, rack loadout (top/toptilt/close-roof). Crops are DIAGNOSIS aids —
verdict evidence stays the official pairs + visual-evaluator numbers (§D).
"""
from PIL import Image
import os

SRC = "shots/critic-m1a2_tejas"
OUT = os.path.join(SRC, "crops")
os.makedirs(OUT, exist_ok=True)

# (view, half, box(l,t,r,b) in half-local coords, zoom, tag)
CROPS = [
    # FRONT: full track band + bow line, both sides, proc then ref for parity
    ("view-front", "proc", (40, 300, 600, 560), 2, "bowband"),
    ("view-front", "ref",  (40, 300, 600, 560), 2, "bowband"),
    ("view-front", "proc", (40, 380, 220, 560), 4, "trackL"),
    ("view-front", "proc", (420, 380, 600, 560), 4, "trackR"),
    # CLOSE-FRONT: bow/fender line + idler wrap region (proc half)
    ("close-front", "proc", (0, 300, 320, 500), 3, "bowwrapL"),
    ("close-front", "proc", (120, 280, 500, 480), 3, "bowfender"),
    ("close-front", "ref",  (0, 300, 460, 500), 2, "bowwrap"),
    # REAR: grille doors + stern band
    ("view-rear", "proc", (100, 260, 540, 560), 2, "sternband"),
    ("view-rear", "ref",  (100, 260, 540, 560), 2, "sternband"),
    ("view-rear", "proc", (150, 300, 350, 500), 4, "grilleL"),
    ("view-rear", "proc", (290, 300, 490, 500), 4, "grilleR"),
    # LEFT/RIGHT: bow + stern wrap arcs (wrap-pad migration)
    ("view-left", "proc", (420, 320, 640, 520), 4, "bowwrap"),
    ("view-left", "proc", (0, 320, 220, 520), 4, "sternwrap"),
    ("view-left", "ref",  (420, 320, 640, 520), 4, "bowwrap"),
    ("view-left", "ref",  (0, 320, 220, 520), 4, "sternwrap"),
    ("view-right", "proc", (0, 320, 220, 520), 4, "bowwrap"),
    ("view-right", "proc", (420, 320, 640, 520), 4, "sternwrap"),
    # TOP: bustle rack loadout (MAG + pot) — rack is at -z (image top or bottom?)
    ("view-top", "proc", (0, 0, 640, 640), 1, "full"),
    ("view-top", "proc", (140, 380, 500, 640), 3, "rack"),
    ("view-top", "proc", (140, 0, 500, 260), 3, "bowdeck"),
    ("hero-toptilt", "proc", (0, 0, 640, 640), 1, "full"),
    ("hero-toptilt", "proc", (160, 200, 520, 480), 3, "rack"),
    ("close-roof", "proc", (0, 0, 640, 640), 1, "full"),
    ("close-roof", "ref", (0, 0, 640, 640), 1, "full"),
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
